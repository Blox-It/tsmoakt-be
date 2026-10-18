const { createHash } = require('node:crypto');

class ContactError extends Error {
  constructor(code, message) { super(message); this.code=code; }
}
const invalid = () => { throw new ContactError('invalid-argument','Controleer je naam, e-mailadres en aanvraaggegevens.'); };

function normalizeContact(input) {
  const keys=['requestId','name','email','phone','guests','date','location','message','website'];
  if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!keys.includes(k))) invalid();
  for (const key of keys) if (typeof input[key]!=='string') invalid();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId) || input.website) invalid();
  const name=input.name.trim(), email=input.email.trim(), phone=input.phone.trim(), location=input.location.trim(), notes=input.message.trim();
  if(name.length<2 || name.length>100 || /[\r\n\x00-\x1f]/.test(name)) invalid();
  if(email.length>120 || !/^[^\s@<>,;:"\\]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email)) invalid();
  if(phone.length>30 || (phone && (phone.length<6 || !/^[\d+().\s/-]+$/.test(phone))) || location.length>200 || /[\r\n\x00-\x1f]/.test(location)) invalid();
  if(notes.length<1 || notes.length>3000) invalid();
  if(input.guests && !/^\d{1,4}$/.test(input.guests)) invalid();
  const adults=Number(input.guests||0);
  if(adults>5000 || (input.guests && adults<1)) invalid();
  const date=input.date;
  if(date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date)) invalid();
  return { source:'website-contact', status:'todo', customerName:name, email, phone, adults, children:0,
    location, eventDate:date, eventTime:'', service:'', notes, formulaSelections:[], productSelections:[],
    mail_klant:'in wachtrij', mail_info:'in wachtrij' };
}

function reference(id) { return (id.startsWith('web_')?id.slice(4,12):id.slice(0,6)).toUpperCase(); }

async function saveContact(db, input, ip, serverTimestamp, now=Date.now()) {
  const data=normalizeContact(input);
  const fingerprint=createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const id='web_'+input.requestId.toLowerCase().replaceAll('-','');
  const ref=db.collection('tsmoakt_requests').doc(id);
  const bucket=Math.floor(now/(15*60*1000));
  const limitId=createHash('sha256').update(`${bucket}:${ip || 'unknown'}`).digest('hex');
  const limit=db.collection('tsmoakt_contact_limits').doc(limitId);
  await db.runTransaction(async tx=>{
    const existing=await tx.get(ref);
    if(existing.exists) {
      if(existing.data().submissionFingerprint!==fingerprint) throw new ContactError('already-exists','Deze aanvraagcode werd al gebruikt. Herlaad de pagina voor een nieuwe aanvraag.');
      return;
    }
    const counter=await tx.get(limit);
    if((counter.data()?.count||0)>=5) throw new ContactError('resource-exhausted','Er zijn te veel aanvragen kort na elkaar. Probeer over een kwartier opnieuw of mail info@tsmoakt.be.');
    tx.set(limit,{count:(counter.data()?.count||0)+1,window:bucket});
    tx.create(ref,{...data,submissionFingerprint:fingerprint,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  });
  return {id,reference:reference(id)};
}
module.exports={normalizeContact,saveContact,reference,ContactError};
