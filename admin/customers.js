const statusLabels={todo:'Nieuw',in_behandeling:'In behandeling',wacht_op_klant:'Wacht op klant',aanvaard:'Aanvaard',in_uitvoering:'In uitvoering',uitgevoerd:'Uitgevoerd',afgewezen:'Afgewezen'};
const money=amount=>new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(amount||0);
const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
let requests=[],search='',selectedKey=null;

function customerKey(request){
  if(request.email)return `e:${request.email.trim().toLowerCase()}`;
  if(request.phone)return `p:${request.phone.replace(/\D/g,'')}`;
  return `n:${(request.customerName||'onbekend').trim().toLowerCase()}`;
}

function buildCustomers(){
  const map=new Map();
  requests.forEach(request=>{
    const key=customerKey(request),existing=map.get(key)||{key,name:'',email:'',phone:'',locations:new Set(),dossiers:[]};
    existing.name=request.customerName||existing.name;existing.email=request.email||existing.email;existing.phone=request.phone||existing.phone;
    if(request.location)existing.locations.add(request.location);existing.dossiers.push(request);map.set(key,existing);
  });
  return [...map.values()].map(customer=>({...customer,locations:[...customer.locations],total:customer.dossiers.reduce((sum,dossier)=>sum+Number(dossier.calculatedTotal||0),0)})).sort((a,b)=>a.name.localeCompare(b.name));
}

function renderDetail(customer){
  if(!customer)return '<div class="customer-empty"><strong>Kies een klant</strong><p>Open een klant om alle gekoppelde dossiers te bekijken.</p></div>';
  const dossiers=[...customer.dossiers].sort((a,b)=>(b.eventDate||'').localeCompare(a.eventDate||''));
  return `<div class="customer-detail-head"><div><span>Klantendossier</span><h2>${esc(customer.name||'Naam ontbreekt')}</h2><p>${esc(customer.email||'Geen e-mail')} · ${esc(customer.phone||'Geen telefoon')}</p></div><strong>${money(customer.total)}</strong></div><div class="customer-facts"><div><small>Dossiers</small><strong>${dossiers.length}</strong></div><div><small>Locaties</small><strong>${customer.locations.length}</strong></div><div><small>Actief</small><strong>${dossiers.filter(item=>!['uitgevoerd','afgewezen'].includes(item.status)).length}</strong></div></div><h3>Dossierhistoriek</h3><div class="customer-history">${dossiers.map(dossier=>`<button data-id="${dossier.id}"><span><strong>${esc(dossier.eventDate||'Geen datum')} ${esc(dossier.eventTime||'')}</strong><small>${esc(dossier.location||'Geen locatie')} · ${Number(dossier.adults||0)+Number(dossier.children||0)} personen</small></span><span class="customer-status status-${esc(dossier.status||'todo')}">${esc(statusLabels[dossier.status]||dossier.status||'Nieuw')}</span><strong>${money(dossier.calculatedTotal||0)}</strong></button>`).join('')}</div>`;
}

function render(){
  const all=buildCustomers(),visible=all.filter(customer=>JSON.stringify({...customer,locations:customer.locations,dossiers:customer.dossiers}).toLowerCase().includes(search));
  const selected=all.find(customer=>customer.key===selectedKey);
  document.querySelector('#customers-view').innerHTML=`<div class="view-head"><div><h1>Klanten</h1><p>Automatisch opgebouwd uit de contactgegevens van dossiers.</p></div><label class="search">Zoeken<input id="customer-search" type="search" value="${esc(search)}" placeholder="Naam, e-mail, telefoon of inhoud"></label></div><div class="customers-layout"><div class="customer-list">${visible.map(customer=>`<button class="customer-card ${customer.key===selectedKey?'active':''}" data-key="${esc(customer.key)}"><span class="customer-avatar">${esc((customer.name||'?').split(/\s/).map(part=>part[0]).join('').slice(0,2).toUpperCase())}</span><span><strong>${esc(customer.name||'Naam ontbreekt')}</strong><small>${esc(customer.email||customer.phone||'Geen contactgegevens')}</small></span><span><strong>${customer.dossiers.length}</strong><small>dossiers</small></span></button>`).join('')||'<p class="empty-note">Geen klanten gevonden.</p>'}</div><article class="customer-detail">${renderDetail(selected)}</article></div>`;
  document.querySelector('#customer-search').oninput=event=>{search=event.target.value.toLowerCase();render()};
  document.querySelectorAll('.customer-card').forEach(button=>button.onclick=()=>{selectedKey=button.dataset.key;render()});
  document.querySelectorAll('.customer-history button').forEach(button=>button.onclick=()=>window.dispatchEvent(new CustomEvent('tsmoakt:open-request',{detail:button.dataset.id})));
}

window.addEventListener('tsmoakt:requests',event=>{requests=event.detail||[];render()});
render();
