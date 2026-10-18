const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeContact } = require('../contact');
const { contactMails } = require('../mails');
const valid = { requestId:'167abb29-ec66-449e-9371-0123456789ab', name:'  Jan Peeters ',email:'jan@example.com',phone:'',guests:'35',date:'2026-12-20',location:'Moerbeke',message:'Graag BBQ voor ons feest.',website:'' };

test('contact request normalizes to admin fields with optional details',()=>{
  const d=normalizeContact(valid);
  assert.equal(d.customerName,'Jan Peeters');assert.equal(d.adults,35);assert.equal(d.eventDate,'2026-12-20');
  assert.equal(d.source,'website-contact');assert.equal(d.status,'todo');assert.equal(d.notes,valid.message);
  const optional=normalizeContact({...valid,guests:'',date:'',location:''});
  assert.equal(optional.adults,0);assert.equal(optional.eventDate,'');
});
test('invalid and injected fields cannot become requests or mail recipients',()=>{
  for(const patch of [{email:'bad'},{email:'a@b.be,other@example.com'},{email:'x@y.be\nBcc: x@z.be'},{name:' '},{message:''},{message:'x'.repeat(3001)},{guests:'1.5'},{guests:'-2'},{date:'2026-02-30'},{requestId:'../anything'},{website:'spam'},{status:'aanvaard'},{mail_info:'verstuurd'}])
    assert.throws(()=>normalizeContact({...valid,...patch}),undefined,JSON.stringify(patch));
});
test('each catering enquiry gets customer and info mail with escaped HTML and a request reference',()=>{
  const order=normalizeContact({...valid,name:'Jan <img src=x>',message:'BBQ <script>alert(1)</script>'});
  const mails=contactMails(order,'ABC123');
  assert.equal(mails.length,2);assert.deepEqual(mails[0][1].to,['jan@example.com']);assert.deepEqual(mails[1][1].to,['info@tsmoakt.be']);
  assert.equal(mails[0][1].replyTo,'info@tsmoakt.be');assert.equal(mails[1][1].replyTo,'jan@example.com');
  for(const [,mail] of mails){assert.match(mail.message.text,/ABC123/);assert.ok(!mail.message.html.includes('<script>'));assert.ok(!mail.message.html.includes('<img src=x>'));}
  assert.match(mails[0][1].message.text,/nog geen definitieve reservatie/);
});
