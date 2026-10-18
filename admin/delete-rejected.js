// Re-read status in the same transaction as deletion: a moved dossier is retained.
// Capture IDs before confirmation; newly rejected dossiers need a new confirmation.
export async function deleteRejectedRequests(db,ids,{doc,runTransaction},onProgress=()=>{}) {
  const selected=[...new Set(ids)],result={deletedIds:[],skippedIds:[],error:null};
  for(let offset=0;offset<selected.length;offset+=200){
    const batch=selected.slice(offset,offset+200);
    try{
      const committed=await runTransaction(db,async transaction=>{
        const refs=batch.map(id=>doc(db,'tsmoakt_requests',id));
        const snapshots=await Promise.all(refs.map(ref=>transaction.get(ref)));
        const deletedIds=[],skippedIds=[];
        snapshots.forEach((snapshot,index)=>{
          if(snapshot.exists()&&snapshot.data().status==='afgewezen'){
            transaction.delete(refs[index]);deletedIds.push(batch[index]);
          }else skippedIds.push(batch[index]);
        });
        return {deletedIds,skippedIds};
      });
      result.deletedIds.push(...committed.deletedIds);result.skippedIds.push(...committed.skippedIds);
    }catch(error){result.error=error;break;}
    onProgress(result.deletedIds.length+result.skippedIds.length);
  }
  return result;
}
