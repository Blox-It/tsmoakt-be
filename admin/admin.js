import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { getFirestore, collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

const firebaseConfig = {apiKey:'AIzaSyDj5g9at9UQnpgTD0Q45O6AkaqycvTU6mo',authDomain:'tsmoakt-432c8.firebaseapp.com',projectId:'tsmoakt-432c8',storageBucket:'tsmoakt-432c8.firebasestorage.app',messagingSenderId:'866651532666',appId:'1:866651532666:web:fd6693ffa8027b2cbafac3'};
const allowed = ['kevin@bloxit.be'];
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const statuses = [
  ['todo','Nieuw'],['in_behandeling','In behandeling'],['wacht_op_klant','Wacht op klant'],
  ['aanvaard','Aanvaard'],['in_uitvoering','In uitvoering'],['uitgevoerd','Uitgevoerd'],['afgewezen','Afgewezen']
];

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[character]));
const money = amount => new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(amount);
let requests = [], staff = [], products = [], catalog = [], filter = '', unsubscribeRequests;

function isFilled(value) {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== '' && value !== 0;
}

export function completeness(request) {
  const fields = ['customerName','email','phone','eventDate','eventTime','location','adults','service'];
  const missing = fields.filter(field => !isFilled(request[field]));
  return {score:Math.round((fields.length-missing.length)/fields.length*100),missing};
}

function personCount(request) {
  return Number(request.adults || 0) + Number(request.children || 0);
}

function allFormulas() {
  return catalog.flatMap(item => (item.formulas || []).map(formula => ({...formula,categorySlug:item.category?.slug || item.id,categoryTitle:item.category?.title || item.id})));
}

function calculateTotal(formulaSelections = [], productSelections = []) {
  const formulas = allFormulas();
  let total = 0, onRequest = false;
  formulaSelections.forEach(line => {
    const formula = formulas.find(item => item.id === line.formulaId);
    if (!formula || formula.priceOnRequest || !Number.isFinite(formula.priceAmount)) onRequest = true;
    else total += formula.priceAmount * Number(line.quantity || 0);
  });
  productSelections.forEach(line => {
    const product = products.find(item => item.id === line.productId);
    if (!product || !Number.isFinite(product.salePrice)) onRequest = true;
    else total += product.salePrice * Number(line.quantity || 0);
  });
  return {total,onRequest};
}

function staffNames(ids = []) {
  return ids.map(id => staff.find(person => person.id === id)?.name).filter(Boolean);
}

function card(request) {
  const complete = completeness(request);
  const assigned = staffNames(request.assignedTo);
  const barClass = complete.score === 100 ? 'bar-complete' : complete.score >= 60 ? 'bar-progress' : 'bar-low';
  const total = calculateTotal(request.formulaSelections,request.productSelections);
  return `<article class="card" draggable="true" data-id="${request.id}">
    <div class="card-top"><h3>${esc(request.customerName || 'Naam ontbreekt')}</h3><time>${esc(request.eventDate || 'Geen datum')}${request.eventTime ? ` · ${esc(request.eventTime)}` : ''}</time></div>
    <p>${esc(request.location || 'Locatie ontbreekt')} · ${personCount(request) || '?'} personen</p>
    <div class="chips">${request.service?`<span class="chip">${esc(request.service)}</span>`:''}${assigned.map(name=>`<span class="chip staff-chip">${esc(name)}</span>`).join('')}${total.total?`<span class="chip">${money(total.total)}${total.onRequest?' + aanvraag':''}</span>`:''}</div>
    <div class="complete">${complete.score}% volledig<div class="bar"><i class="${barClass}" style="width:${complete.score}%"></i></div></div>
  </article>`;
}

export function renderBoard() {
  const visible = requests.filter(request => JSON.stringify(request).toLowerCase().includes(filter));
  $('#stats').innerHTML = [
    ['Totaal',visible.length],['Nieuw',visible.filter(item=>item.status==='todo').length],
    ['Actief',visible.filter(item=>['in_behandeling','wacht_op_klant','aanvaard','in_uitvoering'].includes(item.status)).length],
    ['Onvolledig',visible.filter(item=>completeness(item).score<100).length]
  ].map(([label,count])=>`<div class="stat"><strong>${count}</strong><span>${label}</span></div>`).join('');
  $('#board').innerHTML = statuses.map(([key,label]) => {
    const list = visible.filter(item => (item.status || 'todo') === key);
    return `<section class="column" data-status="${key}"><div class="column-head">${label}<span>${list.length}</span></div><div class="cards">${list.map(card).join('')}</div></section>`;
  }).join('');
  document.querySelectorAll('.card').forEach(element => {
    element.onclick = () => openRequest(element.dataset.id);
    element.ondragstart = event => event.dataTransfer.setData('text/plain',element.dataset.id);
  });
  document.querySelectorAll('.column').forEach(column => {
    column.ondragover = event => {event.preventDefault();column.classList.add('dragover')};
    column.ondragleave = () => column.classList.remove('dragover');
    column.ondrop = async event => {
      event.preventDefault();column.classList.remove('dragover');
      await updateDoc(doc(db,'tsmoakt_requests',event.dataTransfer.getData('text/plain')),{status:column.dataset.status,updatedAt:serverTimestamp()});
    };
  });
  window.dispatchEvent(new CustomEvent('tsmoakt:requests',{detail:requests}));
}

function optionList(values,selected = []) {
  return values.map(value => `<option value="${value.id}" ${selected.includes(value.id)?'selected':''}>${esc(value.name)}</option>`).join('');
}

function lineSummary(formulaSelections,productSelections) {
  const formulas = allFormulas();
  const formulaRows = formulaSelections.map((line,index) => {
    const formula = formulas.find(item=>item.id===line.formulaId);
    return `<div class="order-line"><span>${esc(formula?.title || 'Onbekende formule')}</span><strong>${line.quantity} pers.</strong><button data-type="formula" data-index="${index}" type="button">×</button></div>`;
  }).join('');
  const productRows = productSelections.map((line,index) => {
    const product = products.find(item=>item.id===line.productId);
    return `<div class="order-line"><span>${esc(product?.name || 'Onbekend product')}</span><strong>${line.quantity} ${esc(product?.unit || 'st.')}</strong><button data-type="product" data-index="${index}" type="button">×</button></div>`;
  }).join('');
  return formulaRows + productRows || '<p class="empty-note">Nog geen formules of losse producten gekozen.</p>';
}

export function openRequest(id) {
  const request = requests.find(item=>item.id===id);
  if (!request) return;
  const complete = completeness(request);
  const labels = {phone:'telefoon',eventDate:'datum',eventTime:'uur',location:'locatie',adults:'aantal volwassenen',service:'bediening'};
  let formulaSelections = structuredClone(request.formulaSelections || []);
  let productSelections = structuredClone(request.productSelections || []);
  const formulas = allFormulas();
  $('#drawer-content').innerHTML = `<form id="dossier-form" class="dossier-form">
    <div class="drawer-title"><div><h2>${esc(request.customerName || 'Dossier')}</h2><div class="drawer-meta">Laatst bijgewerkt dossier</div></div><button class="primary" type="submit">Opslaan</button></div>
    ${complete.missing.length?`<div class="missing"><strong>Dossier ${complete.score}% volledig</strong><br>Ontbreekt: ${complete.missing.map(field=>labels[field]||field).join(', ')}</div>`:''}
    <h3>Klant en evenement</h3><div class="detail-form-grid">
      <label>Naam<input name="customerName" value="${esc(request.customerName)}" required></label><label>E-mail<input name="email" type="email" value="${esc(request.email)}" required></label>
      <label>Telefoon<input name="phone" value="${esc(request.phone)}"></label><label>Locatie<input name="location" value="${esc(request.location)}"></label>
      <label>Datum<input name="eventDate" type="date" value="${esc(request.eventDate)}"></label><label>Uur<input name="eventTime" type="time" value="${esc(request.eventTime)}"></label>
      <label>Volwassenen<input name="adults" type="number" min="0" value="${Number(request.adults||0)}"></label><label>Kinderen<input name="children" type="number" min="0" value="${Number(request.children||0)}"></label>
      <label>Bediening<select name="service"><option value="">Nog te bepalen</option><option ${request.service==='Met bediening'?'selected':''}>Met bediening</option><option ${request.service==='Zonder bediening'?'selected':''}>Zonder bediening</option></select></label>
      <label>Status<select name="status">${statuses.map(([key,label])=>`<option value="${key}" ${request.status===key?'selected':''}>${label}</option>`).join('')}</select></label>
      <label class="full">Medewerkers<select name="assignedTo" multiple size="4">${optionList(staff,request.assignedTo||[])}</select></label>
      <label class="full">Opmerkingen<textarea name="notes" rows="4">${esc(request.notes)}</textarea></label>
    </div>
    <h3>Formules en losse producten</h3>
    <div id="order-lines" class="order-lines">${lineSummary(formulaSelections,productSelections)}</div>
    <div class="add-line"><select id="formula-select"><option value="">Kies een formule</option>${formulas.map(item=>`<option value="${item.id}">${esc(item.categoryTitle)} · ${esc(item.title)}</option>`).join('')}</select><input id="formula-qty" type="number" min="1" value="${Math.max(personCount(request),1)}"><button id="add-formula-line" type="button">Toevoegen</button></div>
    <div class="add-line"><select id="product-select"><option value="">Kies een los product</option>${products.filter(item=>item.active!==false).map(item=>`<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select><input id="product-qty" type="number" min="0.01" step="0.01" value="1"><button id="add-product-line" type="button">Toevoegen</button></div>
    <div id="request-total" class="request-total"></div>
  </form>`;

  const refreshLines = () => {
    $('#order-lines').innerHTML = lineSummary(formulaSelections,productSelections);
    $('#order-lines').querySelectorAll('button').forEach(button => button.onclick = () => {
      (button.dataset.type==='formula'?formulaSelections:productSelections).splice(Number(button.dataset.index),1);refreshLines();
    });
    const total = calculateTotal(formulaSelections,productSelections);
    $('#request-total').innerHTML = `<span>Voorlopig berekend totaal</span><strong>${money(total.total)}${total.onRequest?' + onderdelen op aanvraag':''}</strong>`;
  };
  $('#add-formula-line').onclick = () => {if($('#formula-select').value){formulaSelections.push({formulaId:$('#formula-select').value,quantity:Number($('#formula-qty').value||1)});refreshLines()}};
  $('#add-product-line').onclick = () => {if($('#product-select').value){productSelections.push({productId:$('#product-select').value,quantity:Number($('#product-qty').value||1)});refreshLines()}};
  refreshLines();

  $('#dossier-form').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget, data = Object.fromEntries(new FormData(form));
    data.adults = Number(data.adults||0);data.children = Number(data.children||0);
    data.assignedTo = [...form.elements.assignedTo.selectedOptions].map(option=>option.value);
    data.formulaSelections = formulaSelections;data.productSelections = productSelections;
    data.calculatedTotal = calculateTotal(formulaSelections,productSelections).total;
    data.updatedAt = serverTimestamp();
    await updateDoc(doc(db,'tsmoakt_requests',id),data);
    const button = form.querySelector('[type=submit]');button.textContent='Opgeslagen';setTimeout(()=>button.textContent='Opslaan',1200);
  };
  $('#drawer').classList.add('open');$('#drawer').setAttribute('aria-hidden','false');$('#backdrop').hidden=false;
}

function closeDrawer() {$('#drawer').classList.remove('open');$('#drawer').setAttribute('aria-hidden','true');$('#backdrop').hidden=true}

function updateStaffSelects() {
  const select = $('#request-form').elements.assignedTo;
  select.innerHTML = optionList(staff);
}

window.addEventListener('tsmoakt:directory',event => {
  staff = event.detail.staff || [];products = event.detail.products || [];
  updateStaffSelects();renderBoard();
});
window.addEventListener('tsmoakt:catalog',event => {catalog = event.detail || [];renderBoard()});
window.addEventListener('tsmoakt:open-request',event => openRequest(event.detail));

$('#login-btn').onclick = async () => {
  try {
    const result = await signInWithPopup(auth,new GoogleAuthProvider());
    if (!allowed.includes(result.user.email.toLowerCase())) {await signOut(auth);throw Error('Dit Google-account heeft geen toegang.')}
  } catch(error) {$('#login-error').textContent=error.message}
};
$('#logout-btn').onclick = () => signOut(auth);
$('#drawer-close').onclick = $('#backdrop').onclick = closeDrawer;
$('#new-btn').onclick = () => $('#request-dialog').showModal();
$('#search').oninput = event => {filter=event.target.value.toLowerCase();renderBoard()};

$('#request-form').onsubmit = async event => {
  if (event.submitter?.value==='cancel') return;
  event.preventDefault();
  const form=event.currentTarget,data=Object.fromEntries(new FormData(form));
  data.adults=Number(data.adults||0);data.children=Number(data.children||0);
  data.assignedTo=[...form.elements.assignedTo.selectedOptions].map(option=>option.value);
  await addDoc(collection(db,'tsmoakt_requests'),{...data,status:'todo',formulaSelections:[],productSelections:[],createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  form.reset();$('#request-dialog').close();
};

document.querySelectorAll('.nav').forEach(button => button.onclick = () => {
  document.querySelectorAll('.nav').forEach(item=>item.classList.remove('active'));button.classList.add('active');
  document.querySelectorAll('.app-view').forEach(view=>view.hidden=true);
  const target=document.querySelector(`#${button.dataset.view}-view`);if(target)target.hidden=false;
  $('#stats').hidden=button.dataset.view!=='board';
});

onAuthStateChanged(auth,user => {
  const ok=user&&allowed.includes((user.email||'').toLowerCase());$('#login').hidden=ok;$('#app').hidden=!ok;
  if (!ok) {if(unsubscribeRequests)unsubscribeRequests();return}
  $('#logout-btn').textContent=(user.displayName||user.email).split(/\s|@/).map(part=>part[0]).join('').slice(0,2).toUpperCase();
  unsubscribeRequests=onSnapshot(query(collection(db,'tsmoakt_requests'),orderBy('updatedAt','desc')),snapshot=>{requests=snapshot.docs.map(item=>({id:item.id,...item.data()}));renderBoard()},error=>{$('#board').innerHTML=`<p>Firestore-toegang ontbreekt nog: ${esc(error.message)}</p>`});
});
