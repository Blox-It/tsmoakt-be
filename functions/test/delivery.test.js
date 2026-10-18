const test=require('node:test');
const assert=require('node:assert/strict');
const {deliverMail,claimDecision}=require('../delivery');
const mail={to:['customer@example.com'],replyTo:'info@tsmoakt.be',message:{subject:'test',text:'test',html:'test'}};
function memoryStore(){
  const records=new Map();
  return {records,
    async claim(id,kind,owner,now){const key=id+'-'+kind,m=records.get(key);const state=claimDecision(m,now);if(state==='claim')records.set(key,{state:'sending',owner,attempts:(m?.attempts||0)+1,leaseUntil:now+180000});return state;},
    async complete(id,kind,owner){const m=records.get(id+'-'+kind);assert.equal(m.owner,owner);m.state='sent';m.sentAt=true;},
    async fail(id,kind,owner){const m=records.get(id+'-'+kind);assert.equal(m.owner,owner);m.state=m.attempts>=8?'exhausted':'pending';return m.state;}
  };
}
test('sent messages and active leases are not claimed again; expired work can resume',()=>{
  assert.equal(claimDecision({sentAt:true},100),'sent');
  assert.equal(claimDecision({state:'sending',leaseUntil:200},100),'busy');
  assert.equal(claimDecision({state:'sending',leaseUntil:50,attempts:1},100),'claim');
  assert.equal(claimDecision({attempts:8},100),'exhausted');
});
test('retry sends only the failed recipient',async()=>{
  const store=memoryStore();const sent=[];let fail=true;
  const send=async(kind)=>{if(kind==='info'&&fail)throw Object.assign(Error('SMTP unavailable'),{code:'ETIMEDOUT'});sent.push(kind);};
  for(const kind of ['klant','info']) await deliverMail({id:'a',kind,mail,store,send:()=>send(kind)});
  fail=false;
  for(const kind of ['klant','info']) await deliverMail({id:'a',kind,mail,store,send:()=>send(kind)});
  assert.deepEqual(sent,['klant','info']);
});
test('concurrent invocation does not send while another worker owns the lease',async()=>{
  const store=memoryStore();let release;let calls=0;
  const first=deliverMail({id:'a',kind:'klant',mail,store,send:async()=>{calls++;await new Promise(r=>release=r);}});
  for(let i=0;i<100&&!release;i++)await new Promise(r=>setTimeout(r,1));
  assert.ok(release,"first worker must attempt delivery");
  const duplicate=await deliverMail({id:'a',kind:'klant',mail,store,send:async()=>calls++});
  release();await first;assert.equal(duplicate,'retry');assert.equal(calls,1);
});
test('database failure is propagated, not treated as a duplicate',async()=>{
  await assert.rejects(deliverMail({id:'a',kind:'klant',mail,store:{claim:async()=>{throw Error('DB unavailable')}},send:async()=>{throw Error('Must not send')}}),/DB unavailable/);
});
