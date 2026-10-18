const DATA_URL = '../data/kerst-2026.json';
const SOURCE = 'bestelformulier-kerst-2026';
const MAX_QTY = 200;

const firebaseConfig = {
  apiKey: 'AIzaSyDj5g9at9UQnpgTD0Q45O6AkaqycvTU6mo',
  authDomain: 'tsmoakt-432c8.firebaseapp.com',
  projectId: 'tsmoakt-432c8',
  storageBucket: 'tsmoakt-432c8.firebasestorage.app',
  messagingSenderId: '866651532666',
  appId: '1:866651532666:web:fd6693ffa8027b2cbafac3'
};

const $ = (sel) => document.querySelector(sel);
const euro = (cents) => '€ ' + (cents / 100).toFixed(2).replace('.', ',');
const priceLabel = (price) => '€ ' + (Number.isInteger(price) ? String(price) : price.toFixed(2).replace('.', ','));
const unitLabel = (unit, qty) => unit === 'liter' ? 'liter' : (qty === 1 ? 'persoon' : 'personen');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { data: null, items: new Map(), qty: new Map() };

function lineName(item) {
  return item.desc ? `${item.name} – ${item.desc}` : item.name;
}

function renderMenu(data) {
  $('#menu').innerHTML = data.sections.map((sec) => `
    <section class="sec">
      <h2>${esc(sec.title)}</h2>
      <p class="sub">${esc(sec.sub)}</p>
      ${sec.items.map((item) => `
        <div class="item" data-id="${item.id}">
          <div>
            <div class="n">${esc(item.name)}${item.desc ? ` <em>– ${esc(item.desc)}</em>` : ''}</div>
            <div class="pr">${priceLabel(item.price)} <small>${item.unit === 'liter' ? '/ liter' : 'p.p.'}</small></div>
          </div>
          <div class="step" role="group" aria-label="Aantal ${esc(lineName(item))}">
            <button type="button" data-d="-1" aria-label="Minder ${esc(lineName(item))}">−</button>
            <input type="number" min="0" max="${MAX_QTY}" value="0" inputmode="numeric" aria-label="${item.unit === 'liter' ? 'Aantal liter' : 'Aantal personen'} ${esc(lineName(item))}">
            <button type="button" data-d="1" aria-label="Meer ${esc(lineName(item))}">+</button>
          </div>
          <div class="unit">${item.unit === 'liter' ? 'liter' : 'personen'}</div>
        </div>`).join('')}
    </section>`).join('');
}

function renderPickup(data) {
  $('#pickup-list').innerHTML = data.pickupSlots
    .map((s) => `<li><b>${esc(s.label.split(' ')[0].slice(0, 2))} ${esc(s.label.split(' ').slice(1).join(' '))}</b> · ${esc(s.time)}</li>`).join('');
  $('#slot-options').innerHTML = data.pickupSlots
    .map((s) => `<label class="slot"><input type="radio" name="slot" value="${s.id}" required> <span><b>${esc(s.label)}</b> · ${esc(s.time)}</span></label>`).join('');
}

function setQty(id, value) {
  const q = Math.max(0, Math.min(MAX_QTY, Math.floor(Number(value) || 0)));
  state.qty.set(id, q);
  const row = document.querySelector(`.item[data-id="${id}"]`);
  row.querySelector('input').value = q;
  row.querySelector('[data-d="-1"]').disabled = q === 0;
  row.querySelector('[data-d="1"]').disabled = q === MAX_QTY;
  row.classList.toggle('on', q > 0);
  update();
}

function chosenLines() {
  return [...state.qty].filter(([, q]) => q > 0).map(([id, qty]) => {
    const item = state.items.get(id);
    const cents = Math.round(item.price * 100);
    return { id, name: item.name, desc: item.desc, unit: item.unit, qty, price: item.price, lineCents: cents * qty };
  });
}

function linesHtml(lines) {
  return lines.map((l) => `<div class="line"><span>${l.qty} ${unitLabel(l.unit, l.qty)} × ${esc(l.name)}${l.desc ? ` <em>– ${esc(l.desc)}</em>` : ''}</span><span>${euro(l.lineCents)}</span></div>`).join('');
}

function update() {
  const lines = chosenLines();
  const total = lines.reduce((s, l) => s + l.lineCents, 0);
  $('#summary-lines').innerHTML = lines.length ? linesHtml(lines) : '<p class="empty">Nog niets gekozen.</p>';
  $('#summary-total').textContent = euro(total);
  $('#bar-total').textContent = euro(total);
  $('#bar-count').textContent = lines.length === 1 ? '1 gerecht' : `${lines.length} gerechten`;
}

function showError(msg) {
  const el = $('#form-error');
  el.textContent = msg;
  el.hidden = !msg;
}

function validate(form) {
  form.querySelectorAll('.invalid').forEach((el) => {el.classList.remove('invalid');el.removeAttribute('aria-invalid');el.removeAttribute('aria-describedby')});
  const bad = [];
  for (const name of ['name', 'email', 'phone']) {
    const el = form.elements[name];
    if (!el.value.trim() || !el.checkValidity()) bad.push(el);
  }
  if (bad.length) {
    bad.forEach((el) => {el.classList.add('invalid');el.setAttribute('aria-invalid','true');el.setAttribute('aria-describedby','form-error')});
    bad[0].focus();
    return 'Vul je naam, een geldig e-mailadres en je telefoonnummer in.';
  }
  if (!chosenLines().length) return 'Kies minstens één gerecht.';
  if (!form.elements.slot.value) { form.querySelector('.slot input').focus(); return 'Kies een afhaalmoment.'; }
  if (!form.elements.privacy.checked) { form.elements.privacy.focus(); return 'Vink het akkoord voor je gegevens aan.'; }
  return '';
}

function buildOrder(form) {
  const lines = chosenLines();
  const totalCents = lines.reduce((s, l) => s + l.lineCents, 0);
  const slot = state.data.pickupSlots.find((s) => s.id === form.elements.slot.value);
  const customerNotes = form.elements.notes.value.trim();
  const summary = lines.map((l) => `${l.qty} ${unitLabel(l.unit, l.qty)} × ${lineName(l)} = ${euro(l.lineCents)}`).join('\n');
  return {
    source: SOURCE,
    status: 'todo',
    service: state.data.title,
    customerName: form.elements.name.value.trim(),
    email: form.elements.email.value.trim(),
    phone: form.elements.phone.value.trim(),
    // Geen aparte vraag meer: het grootste aantal personen bij een p.p.-gerecht geeft de omvang aan.
    adults: Math.max(1, ...lines.filter((l) => l.unit === 'pp').map((l) => l.qty)),
    children: 0,
    location: 'Afhalen',
    eventDate: slot.date,
    eventTime: `${slot.from}–${slot.to}`,
    pickupSlot: `${slot.label} · ${slot.time}`,
    orderLines: lines.map(({ id, name, desc, unit, qty, price, lineCents }) => ({ id, name, desc, unit, qty, price, lineTotal: lineCents / 100 })),
    orderTotal: totalCents / 100,
    calculatedTotal: totalCents / 100,
    customerNotes,
    notes: `Kerstbestelling – afhalen ${slot.label} ${slot.time}\n${summary}\nTotaal: ${euro(totalCents)}` + (customerNotes ? `\n\nOpmerking klant: ${customerNotes}` : ''),
    formulaSelections: [],
    productSelections: []
  };
}

async function saveOrder(order) {
  if (typeof window.tsmoaktSaveOrder === 'function') return window.tsmoaktSaveOrder(order);
  const [{ initializeApp }, { getFirestore, collection, addDoc, serverTimestamp }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js')
  ]);
  const db = getFirestore(initializeApp(firebaseConfig));
  const ref = await addDoc(collection(db, 'tsmoakt_requests'), { ...order, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  showError('');
  if (form.elements.website.value) return; // honeypot
  const problem = validate(form);
  if (problem) { showError(problem); return; }

  const order = buildOrder(form);
  const button = $('#submit');
  button.disabled = true;
  button.textContent = 'Bezig met versturen…';
  try {
    const id = await saveOrder(order);
    $('#done-ref').textContent = String(id).slice(0, 6).toUpperCase();
    $('#done-lines').innerHTML = linesHtml(chosenLines()) +
      `<div class="total-row"><span>Totaal</span><strong>${euro(Math.round(order.orderTotal * 100))}</strong></div>` +
      `<p class="fine">Afhalen: ${esc(order.pickupSlot)}</p>`;
    form.hidden = true;
    $('#bar').hidden = true;
    document.querySelector('.intro').hidden = true;
    const done = $('#done');
    done.hidden = false;
    done.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    done.focus({ preventScroll: true });
  } catch (err) {
    console.error(err);
    showError('Versturen lukte niet. Probeer het opnieuw, of mail je bestelling naar info@tsmoakt.be.');
    button.disabled = false;
    button.textContent = 'Bestelling versturen';
  }
}

async function init() {
  const data = await fetch(DATA_URL, { cache: 'no-cache' }).then((r) => r.json());
  state.data = data;
  data.sections.forEach((sec) => sec.items.forEach((item) => { state.items.set(item.id, item); state.qty.set(item.id, 0); }));
  renderMenu(data);
  renderPickup(data);

  if (data.orderDeadline && new Date() > new Date(data.orderDeadline)) {
    $('#order-form').hidden = true;
    $('#bar').hidden = true;
    $('#closed').hidden = false;
    return;
  }

  const menu = $('#menu');
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-d]');
    if (!btn) return;
    const id = btn.closest('.item').dataset.id;
    setQty(id, state.qty.get(id) + Number(btn.dataset.d));
  });
  menu.addEventListener('change', (e) => {
    if (e.target.matches('.step input')) setQty(e.target.closest('.item').dataset.id, e.target.value);
  });
  state.items.forEach((_, id) => setQty(id, 0));
  $('#order-form').addEventListener('submit', onSubmit);
  $('#submit').disabled = false;
  $('#order-form').addEventListener('input', (e) => {e.target.classList.remove('invalid');e.target.removeAttribute('aria-invalid');e.target.removeAttribute('aria-describedby')});
}

init().catch((err) => {
  console.error(err);
  $('#submit').disabled = true;
  $('#form-error').hidden = false;
  $('#form-error').textContent = 'Online bestellen is momenteel niet beschikbaar. Herlaad de pagina, of mail je bestelling naar info@tsmoakt.be. Het menu hieronder blijft beschikbaar.';
});
