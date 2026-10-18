import { websiteCatalog } from './product-catalog.js';
import { auth, db } from './admin.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

const view = document.createElement('section');
view.id = 'catalog-view';
view.className = 'app-view';
view.hidden = true;
view.innerHTML = `<div class="catalog-heading"><div><h1>Formules en prijzen</h1><p>Beheer formules en productkoppelingen. Websiteprijzen worden apart gepubliceerd.</p></div><div class="catalog-actions"><span id="catalog-status"></span><button id="save-catalog" class="primary" disabled>Wijzigingen opslaan</button></div></div><div id="catalog-grid" class="catalog-grid"><p>Formules laden…</p></div>`;
document.querySelector('main').append(view);

const dialog = document.createElement('dialog');
dialog.id = 'formula-dialog';
dialog.innerHTML = `<form method="dialog" id="formula-form"><header><h2>Formule bewerken</h2><button value="cancel" formnovalidate aria-label="Sluiten">×</button></header><div class="form-grid"><label class="full">Naam formule<input name="title" required></label><label class="full">Beschrijving<textarea name="description" rows="3" required></textarea></label><label>Groep<input name="group" placeholder="Bijv. Kinderen of Optie"></label><label>Eenheid<input name="unit" placeholder="p.p."></label><label>Prijs in euro<input name="priceAmount" type="number" min="0" step="0.01" inputmode="decimal"></label><label class="check-field"><input name="priceOnRequest" type="checkbox"> Prijs op aanvraag</label><label class="check-field full"><input name="homepagePrice" type="checkbox"> Gebruik deze formule als vanafprijs op de homepage</label><div class="full formula-products-editor"><h3>Gekoppelde producten</h3><p class="empty-note">Hoeveel product is nodig per persoon of besteleenheid (bijvoorbeeld één liter soep)?</p><div id="formula-product-lines"></div><div class="add-line"><select id="formula-product-select" aria-label="Product om te koppelen"><option value="">Kies product</option></select><input id="formula-product-quantity" aria-label="Hoeveelheid per besteleenheid" type="number" min="0.001" step="0.001" value="1"><button id="add-formula-product" type="button">Toevoegen</button></div></div></div><footer><button id="remove-formula" type="button" class="danger">Verwijderen</button><span></span><button value="cancel" formnovalidate>Annuleren</button><button class="primary" value="save">Overnemen</button></footer></form>`;
document.body.append(dialog);

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
const money = amount => new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(amount);
const parseLegacyPrice = price => {
  if (!price || !/\d/.test(price)) return null;
  const number = Number(price.replace(/[^\d,.-]/g,'').replace(',','.'));
  return Number.isFinite(number) ? number : null;
};

let catalog = [], editing = null, loaded = false, products = [], editingProductLines = [];

function normalizeFormula(formula, index) {
  const amount = formula.priceAmount ?? parseLegacyPrice(formula.price);
  return {...formula,id:formula.id || crypto.randomUUID(),order:formula.order ?? (index+1)*10,priceAmount:amount,priceOnRequest:formula.priceOnRequest ?? amount === null,unit:formula.unit || '',productLines:formula.productLines || [],active:formula.active !== false};
}

function startingPrice(formulas) {
  const numeric = formulas.filter(formula => formula.active !== false && !formula.priceOnRequest && Number.isFinite(formula.priceAmount));
  if (!numeric.length) return 'Prijs op aanvraag';
  const selected = numeric.find(formula => formula.homepagePrice) || numeric.reduce((lowest, formula) => formula.priceAmount < lowest.priceAmount ? formula : lowest);
  return `Vanaf ${money(selected.priceAmount)} p.p.`;
}

function render() {
  document.querySelector('#catalog-grid').innerHTML = catalog.map(({category,formulas}) => `<article class="catalog-category" data-slug="${esc(category.slug)}"><header><div><span class="catalog-count">${formulas.length} ${formulas.length===1?'formule':'formules'}</span><h2>${esc(category.title)}</h2><p>${esc(category.description || category.summary)}</p></div><strong>${esc(startingPrice(formulas))}</strong></header><div class="formula-list">${formulas.sort((a,b)=>a.order-b.order).map((formula,index)=>`<div class="formula-row"><div class="formula-copy"><div class="formula-title"><h3>${esc(formula.title)}</h3>${formula.group?`<span>${esc(formula.group)}</span>`:''}${formula.homepagePrice?'<span class="homepage-price">Vanafprijs website</span>':''}</div><p>${esc(formula.description)}</p>${formula.productLines?.length?`<small>${formula.productLines.length} gekoppelde producten</small>`:''}</div><div class="formula-price"><strong>${formula.priceOnRequest || !Number.isFinite(formula.priceAmount)?'Prijs op aanvraag':esc(money(formula.priceAmount))}</strong>${formula.unit?`<small>${esc(formula.unit)}</small>`:''}<button class="edit-formula" data-index="${index}">Bewerken</button></div></div>`).join('')}<button class="add-formula" type="button">+ Formule toevoegen</button></div></article>`).join('');
  document.querySelectorAll('.catalog-category').forEach(card => {
    const item = catalog.find(entry => entry.category.slug === card.dataset.slug);
    card.querySelectorAll('.edit-formula').forEach(button => button.onclick = () => openEditor(item, Number(button.dataset.index)));
    card.querySelector('.add-formula').onclick = () => openEditor(item, -1);
  });
  window.dispatchEvent(new CustomEvent('tsmoakt:catalog',{detail:catalog}));
}

async function loadCatalog() {
  const response = await fetch('../data/categories.json',{cache:'no-cache'});
  const {items:categories} = await response.json();
  const files = Object.fromEntries(await Promise.all(categories.filter(c=>c.active!==false).map(async c=>{
    const response=await fetch(`../data/formulas-${c.slug}.json`,{cache:'no-cache'});
    return [c.slug,(await response.json()).items];
  })));
  const christmas = await (await fetch('../data/kerst-2026.json',{cache:'no-cache'})).json();
  catalog = await Promise.all(websiteCatalog(categories,files,christmas).map(async item=>{
    const stored=await getDoc(doc(db,'tsmoakt_catalog',item.id));
    return stored.exists()
      ? {category:{...item.category,...stored.data().category},formulas:(stored.data().formulas||[]).map(normalizeFormula)}
      : {category:item.category,formulas:item.formulas.map(normalizeFormula)};
  }));
  loaded = true;
  render();
}

function openEditor(item,index) {
  const formula = index < 0 ? normalizeFormula({title:'',description:'',unit:'p.p.',priceAmount:null,priceOnRequest:true,active:true},item.formulas.length) : item.formulas[index];
  editing = {item,index,formula};
  editingProductLines = structuredClone(formula.productLines || []);
  const form = document.querySelector('#formula-form');
  const fields = form.elements;
  fields.title.value = formula.title;
  fields.description.value = formula.description;
  fields.group.value = formula.group || '';
  fields.unit.value = formula.unit || '';
  fields.priceAmount.value = Number.isFinite(formula.priceAmount) ? formula.priceAmount : '';
  fields.priceOnRequest.checked = formula.priceOnRequest;
  fields.homepagePrice.checked = Boolean(formula.homepagePrice);
  fields.priceAmount.disabled = fields.priceOnRequest.checked;
  document.querySelector('#remove-formula').hidden = index < 0;
  renderFormulaProducts();
  dialog.showModal();
}

function renderFormulaProducts() {
  document.querySelector('#formula-product-select').innerHTML = `<option value="">Kies product</option>${products.map(product=>`<option value="${product.id}">${esc(product.name)} (${esc(product.unit||'stuk')})</option>`).join('')}`;
  document.querySelector('#formula-product-lines').innerHTML = editingProductLines.map((line,index)=>{const product=products.find(item=>item.id===line.productId);return`<div class="order-line"><span>${esc(product?.name||'Onbekend product')}</span><strong>${line.quantityPerPerson} ${esc(product?.unit||'')} per eenheid</strong><button type="button" data-index="${index}">×</button></div>`}).join('') || '<p class="empty-note">Nog geen producten gekoppeld.</p>';
  document.querySelectorAll('#formula-product-lines button').forEach(button=>button.onclick=()=>{editingProductLines.splice(Number(button.dataset.index),1);renderFormulaProducts()});
}

document.querySelector('#add-formula-product').onclick = () => {
  const productId=document.querySelector('#formula-product-select').value,quantityPerPerson=Number(document.querySelector('#formula-product-quantity').value||0);
  if(productId&&quantityPerPerson>0){editingProductLines.push({productId,quantityPerPerson});renderFormulaProducts()}
};

document.querySelector('#formula-form').elements.priceOnRequest.onchange = event => {
  const price = document.querySelector('#formula-form').elements.priceAmount;
  price.disabled = event.target.checked;
  if (event.target.checked) price.value = '';
};

document.querySelector('#formula-form').onsubmit = event => {
  if (event.submitter?.value !== 'save') return;
  event.preventDefault();
  const form = event.currentTarget;
  const fields = form.elements;
  const rawAmount = fields.priceAmount.value.trim();
  const amount = rawAmount === '' ? null : Number(rawAmount.replace(',','.'));
  const formula = {...editing.formula,title:fields.title.value.trim(),description:fields.description.value.trim(),group:fields.group.value.trim(),unit:fields.unit.value.trim(),priceAmount:Number.isFinite(amount)?amount:null,priceOnRequest:fields.priceOnRequest.checked || !Number.isFinite(amount),homepagePrice:fields.homepagePrice.checked,productLines:editingProductLines};
  if (formula.homepagePrice) editing.item.formulas.forEach(other => other.homepagePrice = false);
  if (editing.index < 0) editing.item.formulas.push(formula); else editing.item.formulas[editing.index] = formula;
  document.querySelector('#save-catalog').disabled = false;
  dialog.close();
  render();
};

document.querySelector('#remove-formula').onclick = () => {
  if (!confirm('Deze formule verwijderen?')) return;
  editing.item.formulas.splice(editing.index,1);
  document.querySelector('#save-catalog').disabled = false;
  dialog.close();
  render();
};

document.querySelector('#save-catalog').onclick = async event => {
  const button = event.currentTarget;
  button.disabled = true;
  document.querySelector('#catalog-status').textContent = 'Opslaan…';
  try {
    await Promise.all(catalog.map(item => setDoc(doc(db,'tsmoakt_catalog',item.category.slug),{category:item.category,formulas:item.formulas,updatedAt:serverTimestamp()})));
    document.querySelector('#catalog-status').textContent = 'Opgeslagen in Firestore';
  } catch(error) {
    button.disabled = false;
    document.querySelector('#catalog-status').textContent = `Opslaan mislukt: ${error.message}`;
  }
};

onAuthStateChanged(auth,user => {
  if (user && !loaded) loadCatalog().catch(error => document.querySelector('#catalog-grid').innerHTML = `<p class="catalog-error">${esc(error.message)}</p>`);
});

window.addEventListener('tsmoakt:directory',event=>{products=event.detail.products||[];if(editing)renderFormulaProducts()});
