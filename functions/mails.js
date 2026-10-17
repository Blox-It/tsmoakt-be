const menu = require('./kerst-2026.json');

const INFO = 'info@tsmoakt.be';
// github.io stuurt na de domeinwissel vanzelf door naar www.tsmoakt.be.
const ADMIN_URL = 'https://blox-it.github.io/tsmoakt-be/admin/';

const prices = new Map(menu.sections.flatMap((s) => s.items.map((i) => [i.id, i])));
const euro = (n) => '€ ' + Number(n).toFixed(2).replace('.', ',');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unitLabel = (unit, qty) => (unit === 'liter' ? 'liter' : qty === 1 ? 'persoon' : 'personen');

// Prijzen uit de eigen menulijst, niet uit wat de browser doorstuurt.
function priceLines(orderLines) {
  const problems = [];
  const lines = (orderLines || []).map((l) => {
    const item = prices.get(l.id);
    const qty = Math.max(0, Math.floor(Number(l.qty) || 0));
    if (!item) { problems.push(`Onbekend gerecht: ${l.id}`); return null; }
    if (Number(l.price) !== item.price) problems.push(`Prijs ${item.name} gewijzigd in de browser (${l.price} i.p.v. ${item.price})`);
    return { name: item.desc ? `${item.name} – ${item.desc}` : item.name, unit: item.unit, qty, total: item.price * qty };
  }).filter((l) => l && l.qty > 0);
  return { lines, total: lines.reduce((s, l) => s + l.total, 0), problems };
}

function linesTable(lines, total) {
  const rows = lines.map((l) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee5d3">${l.qty} ${unitLabel(l.unit, l.qty)} × ${esc(l.name)}</td>` +
    `<td style="padding:6px 0;border-bottom:1px solid #eee5d3;text-align:right;white-space:nowrap">${euro(l.total)}</td></tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:15px">${rows}` +
    `<tr><td style="padding:10px 0 0;font-weight:700">Totaal</td><td style="padding:10px 0 0;text-align:right;font-weight:700;color:#24533a;font-size:18px;white-space:nowrap">${euro(total)}</td></tr></table>`;
}

function linesText(lines, total) {
  return lines.map((l) => `- ${l.qty} ${unitLabel(l.unit, l.qty)} × ${l.name}: ${euro(l.total)}`).join('\n') + `\nTotaal: ${euro(total)}`;
}

function wrap(title, body) {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#fbf6ec;font-family:Arial,Helvetica,sans-serif;color:#2a2a26">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<p style="margin:0;font-size:22px;font-weight:800;color:#24533a">‘t SMOAKT</p>
<p style="margin:0 0 18px;font-size:13px;font-weight:700;letter-spacing:2px;color:#b3262c">KERSTBESTELLING 2026</p>
<div style="background:#fffdf8;border:1px solid #e4d8c2;border-radius:14px;padding:22px 20px">
<h1 style="margin:0 0 12px;font-size:20px;color:#24533a">${title}</h1>${body}</div>
<p style="font-size:12px;color:#6b6b62;margin:16px 0 0">'t Smoakt catering · 9180 Moerbeke Waas · <a href="https://www.tsmoakt.be" style="color:#24533a">www.tsmoakt.be</a></p>
</div></body></html>`;
}

function customerMail(order, ref, priced) {
  const body = `<p style="margin:0 0 14px">Dag ${esc(order.customerName)},</p>
<p style="margin:0 0 14px">Bedankt voor je bestelling! We hebben ze goed ontvangen.</p>
${linesTable(priced.lines, priced.total)}
<p style="margin:16px 0 4px"><strong>Afhalen:</strong> ${esc(order.pickupSlot)}</p>
<p style="margin:0 0 4px"><strong>Bestelnummer:</strong> ${esc(ref)}</p>
${order.customerNotes ? `<p style="margin:0 0 4px"><strong>Je opmerking:</strong> ${esc(order.customerNotes)}</p>` : ''}
<p style="margin:16px 0 0;font-size:13px;color:#6b6b62">Je betaalt bij afhaling. Het vispannetje geven we mee met een waarborg voor het pannetje.
Wil je iets wijzigen? Antwoord gewoon op deze mail.</p>
<p style="margin:18px 0 0;font-size:20px;color:#b3262c;font-style:italic">Fijne kerstdagen!</p>`;
  const text = `Dag ${order.customerName},\n\nBedankt voor je bestelling! We hebben ze goed ontvangen.\n\n${linesText(priced.lines, priced.total)}\n\n` +
    `Afhalen: ${order.pickupSlot}\nBestelnummer: ${ref}\n${order.customerNotes ? `Je opmerking: ${order.customerNotes}\n` : ''}\n` +
    `Je betaalt bij afhaling. Wil je iets wijzigen? Antwoord gewoon op deze mail.\n\nFijne kerstdagen!\n't Smoakt`;
  return {
    to: [order.email],
    replyTo: INFO,
    message: { subject: `Je kerstbestelling bij 't Smoakt (${ref})`, html: wrap('Bedankt voor je bestelling!', body), text }
  };
}

function infoMail(order, ref, priced) {
  const warn = priced.problems.length
    ? `<p style="margin:0 0 14px;padding:10px 12px;background:#fdecea;border-radius:8px;color:#861b20"><strong>Let op:</strong> ${priced.problems.map(esc).join('<br>')}</p>`
    : '';
  const body = `${warn}
<p style="margin:0 0 4px"><strong>Klant:</strong> ${esc(order.customerName)}</p>
<p style="margin:0 0 4px"><strong>E-mail:</strong> <a href="mailto:${esc(order.email)}">${esc(order.email)}</a></p>
<p style="margin:0 0 4px"><strong>Telefoon:</strong> <a href="tel:${esc(order.phone)}">${esc(order.phone)}</a></p>
<p style="margin:0 0 14px"><strong>Afhalen:</strong> ${esc(order.pickupSlot)}</p>
${linesTable(priced.lines, priced.total)}
${order.customerNotes ? `<p style="margin:16px 0 0"><strong>Opmerking klant:</strong> ${esc(order.customerNotes)}</p>` : ''}
<p style="margin:18px 0 0"><a href="${ADMIN_URL}" style="color:#24533a;font-weight:700">Open in de admin</a> · bestelnummer ${esc(ref)}</p>`;
  const text = `${priced.problems.length ? `LET OP: ${priced.problems.join('; ')}\n\n` : ''}Klant: ${order.customerName}\nE-mail: ${order.email}\n` +
    `Telefoon: ${order.phone}\nAfhalen: ${order.pickupSlot}\n\n${linesText(priced.lines, priced.total)}\n` +
    `${order.customerNotes ? `\nOpmerking klant: ${order.customerNotes}\n` : ''}\nBestelnummer: ${ref}\nAdmin: ${ADMIN_URL}`;
  return {
    to: [INFO],
    replyTo: order.email,
    message: { subject: `Nieuwe kerstbestelling: ${order.customerName} – ${order.pickupSlot} (${ref})`, html: wrap('Nieuwe kerstbestelling', body), text }
  };
}

module.exports = { priceLines, customerMail, infoMail };
