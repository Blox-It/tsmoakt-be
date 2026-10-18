const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {saveContact}=require('../contact');
const {createMailStore,deliverMail}=require('../delivery');
const enabled=Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let db,FieldValue;
if(enabled){
  const {initializeApp}=require('firebase-admin/app');
  ({FieldValue}=require('firebase-admin/firestore'));
  db=require('firebase-admin/firestore').getFirestore(initializeApp({projectId:'demo-tsmoakt'}));
}
const timestamp=()=>FieldValue.serverTimestamp();
const input=()=>({requestId:randomUUID(),name:'Test aanvraag',email:'test@example.com',phone:'',guests:'30',date:'',location:'',message:'Test zonder echte mails',website:''});

test('Firestore: concurrent/retried submission creates one admin dossier and one limit count',{skip:!enabled},async()=>{
  const value=input(),ip=randomUUID();
  const results=await Promise.all([saveContact(db,value,ip,timestamp),saveContact(db,value,ip,timestamp)]);
  assert.equal(results[0].id,results[1].id);
  const saved=(await db.collection('tsmoakt_requests').doc(results[0].id).get()).data();
  assert.equal(saved.status,'todo');assert.equal(saved.customerName,value.name);assert.ok(saved.createdAt);
  assert.equal(saved.mail_klant,'in wachtrij');
  await assert.rejects(saveContact(db,{...value,message:'Different request'},ip,timestamp),{code:'already-exists'});
  for(let i=0;i<4;i++)await saveContact(db,input(),ip,timestamp);
  await assert.rejects(saveContact(db,input(),ip,timestamp),{code:'resource-exhausted'});
});
test('Firestore: public clients cannot read contact requests or mark mail as sent',{skip:!enabled},async()=>{
  const result=await saveContact(db,input(),randomUUID(),timestamp);
  const endpoint=`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-tsmoakt/databases/(default)/documents/tsmoakt_requests/${result.id}`;
  assert.equal((await fetch(endpoint)).status,403);
  assert.equal((await fetch(endpoint,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({fields:{mail_klant:{stringValue:'verstuurd'}}})})).status,403);
});
test('Firestore: atomic mail lease, SMTP retry, sent marker and manual recovery',{skip:!enabled},async()=>{
  const {id}=await saveContact(db,input(),randomUUID(),timestamp),store=createMailStore(db,timestamp);
  const decisions=await Promise.all([store.claim(id,'klant','one',Date.now()),store.claim(id,'klant','two',Date.now())]);
  assert.deepEqual(decisions.sort(),['busy','claim']);
  const marker=db.collection('tsmoakt_mails').doc(id+'-klant');
  const owner=(await marker.get()).data().owner;
  await store.fail(id,'klant',owner,'ETIMEDOUT');
  let count=0;
  assert.equal(await deliverMail({id,kind:'klant',mail:{},store,send:async()=>count++}),'sent');
  assert.equal(await deliverMail({id,kind:'klant',mail:{},store,send:async()=>count++}),'sent');
  assert.equal(count,1);
  assert.equal((await db.collection('tsmoakt_requests').doc(id).get()).data().mail_klant,'verstuurd');
  const failed=db.collection('tsmoakt_mails').doc(id+'-info');
  await failed.set({state:'exhausted',attempts:8});
  assert.equal(await store.claim(id,'info','three',Date.now()),'exhausted');
  await store.resetFailed(id);
  assert.equal((await marker.get()).data().state,'sent');
  assert.equal(await deliverMail({id,kind:'info',mail:{},store,send:async()=>count++}),'sent');
  assert.equal(count,2);
});
test.after(async()=>{if(db)await db.terminate();});
