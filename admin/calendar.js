const monthNames=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const dayNames=['ma','di','wo','do','vr','za','zo'];
let cursor=new Date(),requests=[],staff=[],selectedStaff=new Set();
cursor.setDate(1);

const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[character]));
const dateKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

function visibleRequests(){
  return requests.filter(request=>request.status!=='afgewezen'&&request.eventDate&&(!selectedStaff.size||(request.assignedTo||[]).some(id=>selectedStaff.has(id))));
}

function render(){
  const view=document.querySelector('#calendar-view');
  const year=cursor.getFullYear(),month=cursor.getMonth();
  const first=new Date(year,month,1),offset=(first.getDay()+6)%7,lastDay=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let index=0;index<42;index++){
    const number=index-offset+1,inMonth=number>=1&&number<=lastDay,date=new Date(year,month,number),key=dateKey(date);
    const events=visibleRequests().filter(request=>request.eventDate===key).sort((a,b)=>(a.eventTime||'').localeCompare(b.eventTime||''));
    cells.push(`<div class="calendar-day ${inMonth?'':'outside'} ${key===dateKey(new Date())?'today':''}"><span class="day-number">${date.getDate()}</span><div class="calendar-events">${events.map(request=>`<button class="calendar-event status-${esc(request.status||'todo')}" data-id="${request.id}"><time>${esc(request.eventTime||'--:--')}</time><strong>${esc(request.customerName||'Zonder naam')}</strong><small>${esc(request.location||'')}</small></button>`).join('')}</div></div>`);
  }
  view.innerHTML=`<div class="calendar-toolbar"><div><h1>Kalender</h1><p>Aanvragen en bevestigde opdrachten. Afgewezen dossiers worden niet getoond.</p></div><div class="month-nav"><button id="prev-month" aria-label="Vorige maand">‹</button><strong>${monthNames[month]} ${year}</strong><button id="next-month" aria-label="Volgende maand">›</button></div></div><div class="calendar-filters"><strong>Medewerkers</strong><button class="staff-filter ${selectedStaff.size?'':'active'}" data-id="">Iedereen</button>${staff.map(person=>`<button class="staff-filter ${selectedStaff.has(person.id)?'active':''}" data-id="${person.id}">${esc(person.name)}</button>`).join('')}</div><div class="calendar-weekdays">${dayNames.map(day=>`<span>${day}</span>`).join('')}</div><div class="calendar-grid">${cells.join('')}</div>`;
  document.querySelector('#prev-month').onclick=()=>{cursor=new Date(year,month-1,1);render()};
  document.querySelector('#next-month').onclick=()=>{cursor=new Date(year,month+1,1);render()};
  document.querySelectorAll('.staff-filter').forEach(button=>button.onclick=()=>{if(!button.dataset.id)selectedStaff.clear();else if(selectedStaff.has(button.dataset.id))selectedStaff.delete(button.dataset.id);else selectedStaff.add(button.dataset.id);render()});
  document.querySelectorAll('.calendar-event').forEach(button=>button.onclick=()=>window.dispatchEvent(new CustomEvent('tsmoakt:open-request',{detail:button.dataset.id})));
}

window.addEventListener('tsmoakt:requests',event=>{requests=event.detail||[];render()});
window.addEventListener('tsmoakt:directory',event=>{staff=event.detail.staff||[];render()});
render();
