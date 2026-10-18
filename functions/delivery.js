const { randomUUID } = require('node:crypto');
const MAX_ATTEMPTS=8;
const LEASE_MS=180000;
function claimDecision(marker,now) {
  if(marker?.sentAt || marker?.state==='sent')return 'sent';
  if(marker?.state==='sending' && marker.leaseUntil>now)return 'busy';
  if((marker?.attempts||0)>=MAX_ATTEMPTS)return 'exhausted';
  return 'claim';
}
async function deliverMail({id,kind,mail,store,send,now=Date.now}) {
  const owner=randomUUID();
  const decision=await store.claim(id,kind,owner,now());
  if(decision==='busy')return 'retry';
  if(decision!=='claim')return decision;
  try {
    await send({...mail,messageId:`<tsmoakt-${id}-${kind}@tsmoakt.be>`});
  } catch(error) {
    const code=String(error.code||error.responseCode||'SMTP_ERROR').slice(0,60);
    const state=await store.fail(id,kind,owner,code);
    return state==='exhausted'?'exhausted':'retry';
  }
  // A failed marker write must retry. SMTP cannot guarantee exactly-once delivery
  // if it accepted a message just before this process loses its connection.
  await store.complete(id,kind,owner);
  return 'sent';
}

function createMailStore(db,serverTimestamp) {
  const refs=(id,kind)=>({marker:db.collection('tsmoakt_mails').doc(`${id}-${kind}`),request:db.collection('tsmoakt_requests').doc(id)});
  return {
    claim(id,kind,owner,now){
      const {marker,request}=refs(id,kind);
      return db.runTransaction(async tx=>{
        const [m,r]=await Promise.all([tx.get(marker),tx.get(request)]);
        if(!r.exists)return 'deleted';
        const data=m.data(),state=claimDecision(data,now);
        if(state==='sent')tx.update(request,{[`mail_${kind}`]:'verstuurd'});
        if(state==='exhausted')tx.update(request,{[`mail_${kind}`]:'mislukt — opnieuw versturen nodig'});
        if(state==='claim'){
          tx.set(marker,{order:id,kind,state:'sending',owner,leaseUntil:now+LEASE_MS,attempts:(data?.attempts||0)+1,updatedAt:serverTimestamp()},{merge:true});
          tx.update(request,{[`mail_${kind}`]:'bezig met versturen'});
        }
        return state;
      });
    },
    complete(id,kind,owner){return this.finish(id,kind,owner,true);},
    fail(id,kind,owner,code){return this.finish(id,kind,owner,false,code);},
    finish(id,kind,owner,sent,code=''){
      const {marker,request}=refs(id,kind);
      return db.runTransaction(async tx=>{
        const [m,r]=await Promise.all([tx.get(marker),tx.get(request)]);
        if(m.data()?.owner!==owner)throw Error('Mail lease changed before completion');
        const state=sent?'sent':m.data().attempts>=MAX_ATTEMPTS?'exhausted':'pending';
        tx.update(marker,{state,leaseUntil:0,errorCode:code,updatedAt:serverTimestamp(),...(sent?{sentAt:serverTimestamp()}:{})});
        if(r.exists)tx.update(request,{[`mail_${kind}`]:sent?'verstuurd':state==='exhausted'?'mislukt — opnieuw versturen nodig':'tijdelijk mislukt — wordt opnieuw geprobeerd'});
        return state;
      });
    },
    async resetFailed(id){
      await db.runTransaction(async tx=>{
        const refsList=['klant','info'].map(kind=>refs(id,kind));
        const snapshots=await Promise.all(refsList.map(x=>tx.get(x.marker)));
        snapshots.forEach((snapshot,index)=>{
          const m=snapshot.data();
          if(m && !m.sentAt && m.state!=='sent' && !(m.state==='sending'&&m.leaseUntil>Date.now()))
            tx.update(refsList[index].marker,{attempts:0,state:'pending',leaseUntil:0});
        });
      });
    }
  };
}
module.exports={deliverMail,claimDecision,createMailStore};
