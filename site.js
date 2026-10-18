// Progressive enhancement: navigation and content remain available without JavaScript.
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#hoofdmenu');
if (toggle && nav) {
  document.documentElement.classList.add('js-menu');
  toggle.hidden = false;
  const setMenu = (open, restoreFocus = false) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
    if (restoreFocus) toggle.focus();
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('open')) setMenu(false, true);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.site-header') && nav.classList.contains('open')) setMenu(false);
  });
  matchMedia('(min-width: 801px)').addEventListener('change', () => setMenu(false));
}

const form = document.querySelector('#contact-form');
if (form) {
  const labels = { burgers: 'Verse burgers', bbq: 'BBQ', paella: 'Spaanse paella', steak: 'Steak friet', tapas: 'Tapas & planken' };
  const requested = labels[new URLSearchParams(location.search).get('formule')];
  if (requested && !form.elements.message.value) form.elements.message.value = `Ik ontvang graag een voorstel voor ${requested.toLowerCase()}.`;
  const date = form.elements.date;
  const now = new Date();
  date.min = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const body = `Naam: ${data.get('name')}\nE-mail: ${data.get('email')}\nDatum: ${data.get('date') || '-'}\nAantal personen: ${data.get('guests') || '-'}\nLocatie: ${data.get('location') || '-'}\n\n${data.get('message')}`;
    location.href = `mailto:info@tsmoakt.be?subject=${encodeURIComponent('Cateringaanvraag van '+data.get('name'))}&body=${encodeURIComponent(body)}`;
    document.querySelector('#contact-status').textContent = 'Verstuur de aanvraag in je e-mailprogramma. Opent het niet? Mail rechtstreeks naar info@tsmoakt.be of bel ons.';
  });
}
