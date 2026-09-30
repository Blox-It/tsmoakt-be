import { auth, db } from './admin.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { collection, addDoc, updateDoc, doc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
const money = amount => Number.isFinite(amount) ? new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(amount) : 'Niet ingesteld';
let staff = [], suppliers = [], products = [], editing = null, started = false;

const dialog = document.createElement('dialog');
dialog.id = 'entity-dialog';
document.body.append(dialog);

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(String(value).replace(',','.'));
  return Number.isFinite(number) ? number : null;
}

function dispatchData() {
  window.dispatchEvent(new CustomEvent('tsmoakt:directory',{detail:{staff,suppliers,products}}));
}

function viewHeader(title,description,type,label) {
  return `<div class="view-head"><div><h1>${title}</h1><p>${description}</p></div><button class="primary add-entity" data-type="${type}">+ ${label}</button></div>`;
}

function renderStaff() {
  document.querySelector('#staff-view').innerHTML = `${viewHeader('Medewerkers','Medewerkers die aan dossiers en kalenderitems kunnen worden toegewezen.','staff','Medewerker')}<div class="entity-grid">${staff.map(person=>`<article class="entity-card"><div class="entity-icon">${esc(person.name).split(/\s/).map(part=>part[0]).join('').slice(0,2).toUpperCase()}</div><div><h3>${esc(person.name)}</h3><p>${esc(person.email||'Geen e-mail')}<br>${esc(person.phone||'Geen telefoon')}</p></div><button class="edit-entity" data-type="staff" data-id="${person.id}">Bewerken</button></article>`).join('')||'<p>Nog geen medewerkers.</p>'}</div>`;
  bindEntityButtons();
}

function renderSuppliers() {
  document.querySelector('#suppliers-view').innerHTML = `${viewHeader('Leveranciers','Contactgegevens voor bestellingen en afhalingen.','supplier','Leverancier')}<div class="entity-grid">${suppliers.map(supplier=>`<article class="entity-card"><div class="entity-icon supplier-icon">L</div><div><h3>${esc(supplier.name)}</h3><p>${esc(supplier.contactName||'Geen contactpersoon')}<br>${esc(supplier.email||supplier.phone||'Geen contactgegevens')}</p></div><button class="edit-entity" data-type="supplier" data-id="${supplier.id}">Bewerken</button></article>`).join('')||'<p>Nog geen leveranciers.</p>'}</div>`;
  bindEntityButtons();
}

function renderProducts() {
  document.querySelector('#products-view').innerHTML = `${viewHeader('Producten','Ingrediënten, materiaal en losse verkoopproducten.','product','Product')}<div class="product-table"><div class="product-head"><span>Product</span><span>Leverancier</span><span>Aankoop</span><span>Verkoop</span><span></span></div>${products.map(product=>{const supplier=suppliers.find(item=>item.id===product.supplierId);return`<div class="product-row"><span><strong>${esc(product.name)}</strong><small>${esc(product.category||'Algemeen')} · ${esc(product.unit||'stuk')}</small></span><span>${esc(supplier?.name||'Niet ingesteld')}</span><span>${money(product.purchasePrice)}</span><span>${money(product.salePrice)}</span><button class="edit-entity" data-type="product" data-id="${product.id}">Bewerken</button></div>`}).join('')||'<p>Nog geen producten.</p>'}</div>`;
  bindEntityButtons();
}

function renderAll() {renderStaff();renderSuppliers();renderProducts();dispatchData()}

function fieldsFor(type,item={}) {
  if (type==='staff') return `<label class="full">Naam<input name="name" value="${esc(item.name)}" required></label><label>E-mail<input name="email" type="email" value="${esc(item.email)}"></label><label>Telefoon<input name="phone" value="${esc(item.phone)}"></label>`;
  if (type==='supplier') return `<label class="full">Naam leverancier<input name="name" value="${esc(item.name)}" required></label><label>Contactpersoon<input name="contactName" value="${esc(item.contactName)}"></label><label>E-mail<input name="email" type="email" value="${esc(item.email)}"></label><label>Telefoon<input name="phone" value="${esc(item.phone)}"></label><label class="full">Notities<textarea name="notes" rows="3">${esc(item.notes)}</textarea></label>`;
  return `<label class="full">Productnaam<input name="name" value="${esc(item.name)}" required></label><label>Categorie<input name="category" value="${esc(item.category)}" placeholder="Voeding, materiaal…"></label><label>Eenheid<input name="unit" value="${esc(item.unit||'stuk')}" placeholder="kg, liter, stuk…"></label><label>Leverancier<select name="supplierId"><option value="">Niet ingesteld</option>${suppliers.map(supplier=>`<option value="${supplier.id}" ${item.supplierId===supplier.id?'selected':''}>${esc(supplier.name)}</option>`).join('')}</select></label><label>Aankoopprijs (optioneel)<input name="purchasePrice" type="number" min="0" step="0.01" value="${Number.isFinite(item.purchasePrice)?item.purchasePrice:''}"></label><label>Verkoopprijs (optioneel)<input name="salePrice" type="number" min="0" step="0.01" value="${Number.isFinite(item.salePrice)?item.salePrice:''}"></label>`;
}

function openEditor(type,id=null) {
  const list=type==='staff'?staff:type==='supplier'?suppliers:products;
  const item=id?list.find(entry=>entry.id===id):{};
  editing={type,id,item};
  const title=type==='staff'?'medewerker':type==='supplier'?'leverancier':'product';
  dialog.innerHTML=`<form method="dialog" id="entity-form"><header><h2>${id?'Bewerk':'Nieuw'} ${title}</h2><button value="cancel">×</button></header><div class="form-grid">${fieldsFor(type,item)}</div><footer>${id?'<button id="deactivate-entity" type="button">Deactiveren</button>':''}<span></span><button value="cancel">Annuleren</button><button class="primary" value="save">Opslaan</button></footer></form>`;
  dialog.querySelector('form').onsubmit=saveEntity;
  dialog.querySelector('#deactivate-entity')?.addEventListener('click',deactivateEntity);
  dialog.showModal();
}

async function saveEntity(event) {
  if(event.submitter?.value!=='save')return;
  event.preventDefault();
  const data=Object.fromEntries(new FormData(event.currentTarget));
  if(editing.type==='product'){data.purchasePrice=optionalNumber(data.purchasePrice);data.salePrice=optionalNumber(data.salePrice)}
  data.active=true;data.updatedAt=serverTimestamp();
  const collectionName=editing.type==='staff'?'tsmoakt_staff':editing.type==='supplier'?'tsmoakt_suppliers':'tsmoakt_products';
  if(editing.id)await updateDoc(doc(db,collectionName,editing.id),data);else await addDoc(collection(db,collectionName),{...data,createdAt:serverTimestamp()});
  dialog.close();
}

async function deactivateEntity() {
  const collectionName=editing.type==='staff'?'tsmoakt_staff':editing.type==='supplier'?'tsmoakt_suppliers':'tsmoakt_products';
  await updateDoc(doc(db,collectionName,editing.id),{active:false,updatedAt:serverTimestamp()});dialog.close();
}

function bindEntityButtons() {
  document.querySelectorAll('.add-entity').forEach(button=>button.onclick=()=>openEditor(button.dataset.type));
  document.querySelectorAll('.edit-entity').forEach(button=>button.onclick=()=>openEditor(button.dataset.type,button.dataset.id));
}

onAuthStateChanged(auth,user=>{
  if(!user||started)return;started=true;
  onSnapshot(collection(db,'tsmoakt_staff'),snapshot=>{staff=snapshot.docs.map(item=>({id:item.id,...item.data()})).filter(item=>item.active!==false).sort((a,b)=>a.name.localeCompare(b.name));renderAll()});
  onSnapshot(collection(db,'tsmoakt_suppliers'),snapshot=>{suppliers=snapshot.docs.map(item=>({id:item.id,...item.data()})).filter(item=>item.active!==false).sort((a,b)=>a.name.localeCompare(b.name));renderAll()});
  onSnapshot(collection(db,'tsmoakt_products'),snapshot=>{products=snapshot.docs.map(item=>({id:item.id,...item.data()})).filter(item=>item.active!==false).sort((a,b)=>a.name.localeCompare(b.name));renderAll()});
});
