const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');
const { priceLines, customerMail, infoMail, contactMails } = require('./mails');
const { saveContact, reference, ContactError } = require('./contact');
const { deliverMail, createMailStore } = require('./delivery');

initializeApp();
const db = getFirestore();
const store=createMailStore(db,()=>FieldValue.serverTimestamp());
const SOURCES=['bestelformulier-kerst-2026','website-contact'];
const cors=['https://tsmoakt.be','https://www.tsmoakt.be'];
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');

exports.cateringAanvraag=onCall({region:'europe-west1',cors,maxInstances:3,timeoutSeconds:30},async request=>{
  try { return await saveContact(db,request.data,request.rawRequest.ip,()=>FieldValue.serverTimestamp()); }
  catch(error){
    if(error instanceof ContactError)throw new HttpsError(error.code,error.message);
    logger.error('Cateringaanvraag opslaan mislukt',{code:error.code||'DATABASE_ERROR'});
    throw new HttpsError('unavailable','Opslaan lukte niet. Probeer opnieuw; dezelfde aanvraag wordt niet dubbel opgeslagen.');
  }
});

async function sendRequestMails(snapshot,id) {
  const order=snapshot.data();
  if(!order || !SOURCES.includes(order.source))return;
  const ref=reference(id);
  let mails;
  if(order.source==='website-contact')mails=contactMails(order,ref);
  else {
    const priced=priceLines(order.orderLines);
    if(!priced.lines.length){
      await snapshot.ref.update({mail_klant:'mislukt — ongeldige bestelling',mail_info:'mislukt — ongeldige bestelling'});
      logger.error('Kerstbestelling zonder geldige lijnen',{id});return;
    }
    mails=[['klant',customerMail(order,ref,priced)],['info',infoMail(order,ref,priced)]];
    await snapshot.ref.update({verifiedTotal:priced.total,priceWarnings:priced.problems});
  }
  const transport=nodemailer.createTransport({
    host:'mail.tsmoakt.be',port:465,secure:true,
    auth:{user:'lesley@tsmoakt.be',pass:SMTP_PASSWORD.value()},
    connectionTimeout:15000,greetingTimeout:10000,socketTimeout:45000
  });
  const results=[];
  try {
    for(const [kind,mail] of mails){
      const result=await deliverMail({id,kind,mail,store,send:async outgoing=>{
        const receipt=await transport.sendMail({from:"T'Smoakt <lesley@tsmoakt.be>",to:outgoing.to,replyTo:outgoing.replyTo,
          messageId:outgoing.messageId,subject:outgoing.message.subject,html:outgoing.message.html,text:outgoing.message.text});
        if(!receipt.accepted?.length)throw Object.assign(Error('SMTP recipient not accepted'),{code:'RECIPIENT_REJECTED'});
      }});
      results.push(result);
      if(result==='exhausted')logger.error('Mail vereist handmatige opvolging',{id,kind});
    }
  } finally { transport.close(); }
  if(results.includes('retry'))throw Error('Een mail wacht op een nieuwe verzendpoging');
}

// Keep the deployed name so existing Christmas orders continue using this trigger.
exports.kerstbestellingMails=onDocumentCreated({document:'tsmoakt_requests/{id}',region:'europe-west1',
  secrets:[SMTP_PASSWORD],retry:true,timeoutSeconds:120,maxInstances:3},async event=>{
    if(!event.data)return;
    const latest=await event.data.ref.get();
    if(latest.exists)await sendRequestMails(latest,event.params.id);
  });

exports.herneemAanvraagMails=onCall({region:'europe-west1',cors,secrets:[SMTP_PASSWORD],timeoutSeconds:120,maxInstances:2},async request=>{
  if(request.auth?.token.email!=='kevin@bloxit.be' || !request.auth.token.email_verified)
    throw new HttpsError('permission-denied','Alleen een beheerder kan de mails opnieuw versturen.');
  const id=request.data?.id;
  if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(id))throw new HttpsError('invalid-argument','Ongeldig dossier.');
  const snapshot=await db.collection('tsmoakt_requests').doc(id).get();
  if(!snapshot.exists || !SOURCES.includes(snapshot.data().source))throw new HttpsError('not-found','Geen websiteaanvraag gevonden.');
  await store.resetFailed(id);
  try{await sendRequestMails(snapshot,id);}catch{throw new HttpsError('unavailable','Nog niet alle mails konden worden verstuurd. Controleer de mailstatus en probeer later opnieuw.');}
  const updated=(await snapshot.ref.get()).data();
  return {klant:updated.mail_klant,info:updated.mail_info};
});
