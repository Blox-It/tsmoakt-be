import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteRejectedRequests} from '../admin/delete-rejected.js';
function database(records,failAt=0){
  const data=new Map(Object.entries(records));let calls=0;
  return {data,api:{doc:(_db,_collection,id)=>id,runTransaction:async(_db,work)=>{
    if(++calls===failAt)throw Error('Geen verbinding');
    const pending=[];
    const result=await work({get:async id=>({exists:()=>data.has(id),data:()=>data.get(id)}),delete:id=>pending.push(id)});
    pending.forEach(id=>data.delete(id));return result;
  }}};
}
test('delete only confirmed IDs still rejected, preserving changed and unconfirmed dossiers',async()=>{
  const {data,api}=database({a:{status:'afgewezen'},b:{status:'aanvaard'},c:{status:'afgewezen'}});
  const result=await deleteRejectedRequests({},['a','b','missing','a'],api);
  assert.deepEqual(result.deletedIds,['a']);
  assert.deepEqual(result.skippedIds,['b','missing']);
  assert.deepEqual([...data.keys()],['b','c']);assert.equal(result.error,null);
});
test('large selection is split into bounded atomic transactions',async()=>{
  const records=Object.fromEntries(Array.from({length:501},(_,i)=>['id'+i,{status:'afgewezen'}]));
  const {data,api}=database(records);const progress=[];
  const result=await deleteRejectedRequests({},Object.keys(records),api,n=>progress.push(n));
  assert.equal(result.deletedIds.length,501);assert.equal(data.size,0);
  assert.deepEqual(progress,[200,400,501]);
});
test('partial failure reports only committed deletions and leaves remainder retryable',async()=>{
  const records=Object.fromEntries(Array.from({length:201},(_,i)=>['id'+i,{status:'afgewezen'}]));
  const {data,api}=database(records,2);
  const result=await deleteRejectedRequests({},Object.keys(records),api);
  assert.equal(result.deletedIds.length,200);assert.equal(data.size,1);
  assert.match(result.error.message,/verbinding/);
  const retried=await deleteRejectedRequests({},Object.keys(records),api);
  assert.equal(retried.deletedIds.length,1);assert.equal(data.size,0);
});

test('Firestore emulator: deletion persists and public deletion is denied',{skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
  const {createRequire}=await import('node:module');
  const require=createRequire(new URL('../functions/package.json',import.meta.url));
  const {initializeApp,deleteApp}=require('firebase-admin/app');
  const {getFirestore}=require('firebase-admin/firestore');
  const app=initializeApp({projectId:'demo-tsmoakt'},'delete-test');const db=getFirestore(app);
  const prefix=crypto.randomUUID(),a=prefix+'-rejected',b=prefix+'-accepted';
  try{
    await db.collection('tsmoakt_requests').doc(a).set({status:'afgewezen'});
    await db.collection('tsmoakt_requests').doc(b).set({status:'aanvaard'});
    const url=`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-tsmoakt/databases/(default)/documents/tsmoakt_requests/${a}`;
    assert.equal((await fetch(url,{method:'DELETE'})).status,403);
    const api={doc:(database,collection,id)=>database.collection(collection).doc(id),runTransaction:(database,work)=>database.runTransaction(t=>work({
      get:async ref=>{const s=await t.get(ref);return {exists:()=>s.exists,data:()=>s.data()};},delete:ref=>t.delete(ref)
    }))};
    const result=await deleteRejectedRequests(db,[a,b],api);
    assert.equal(result.error,null);assert.deepEqual(result.deletedIds,[a]);assert.deepEqual(result.skippedIds,[b]);
    assert.equal((await db.collection('tsmoakt_requests').doc(a).get()).exists,false);
    assert.equal((await db.collection('tsmoakt_requests').doc(b).get()).data().status,'aanvaard');
  }finally{await db.terminate();await deleteApp(app);}
});
