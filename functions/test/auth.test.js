const test=require('node:test');
const assert=require('node:assert/strict');
const {herneemAanvraagMails}=require('../index');
test('manual mail recovery is denied without a verified authorized admin',async()=>{
  for(const auth of [undefined,{token:{email:'other@example.com',email_verified:true}},{token:{email:'kevin@bloxit.be',email_verified:false}}])
    await assert.rejects(herneemAanvraagMails.run({data:{id:'test'},auth}),{code:'permission-denied'});
});
