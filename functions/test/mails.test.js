const test = require('node:test');
const assert = require('node:assert');
const { priceLines, customerMail, infoMail } = require('../mails');

const order = {
  customerName: 'Jan <b>Peeters</b>', email: 'jan@example.com', phone: '0470123456',
  pickupSlot: 'Vrijdag 25 december · 10u – 12u', customerNotes: '',
  orderLines: [
    { id: 'hg-tong-madeira', qty: 2, price: 24 },
    { id: 'soep-witloof', qty: 1, price: 1 }
  ]
};

test('prijzen komen uit de menulijst, niet uit de browser', () => {
  const p = priceLines(order.orderLines);
  assert.strictEqual(p.total, 59);
  assert.strictEqual(p.problems.length, 1);
});

test('klant en info krijgen elk een mail, met veilige html', () => {
  const p = priceLines(order.orderLines);
  const k = customerMail(order, 'ABC123', p);
  const i = infoMail(order, 'ABC123', p);
  assert.deepStrictEqual(k.to, ['jan@example.com']);
  assert.deepStrictEqual(i.to, ['info@tsmoakt.be']);
  assert.strictEqual(i.replyTo, 'jan@example.com');
  assert.ok(!k.message.html.includes('<b>Peeters'));
  assert.ok(i.message.html.includes('Let op'));
});
