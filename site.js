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
  let pending = null;
  let submitting = false;
  const button = form.querySelector('[type="submit"]');
  const status = document.querySelector('#contact-status');
  const error = document.querySelector('#contact-error');
  async function saveContact(payload) {
    if (typeof window.tsmoaktSubmitContact === 'function') return window.tsmoaktSubmitContact(payload);
    const [{initializeApp,getApps},{getFunctions,httpsCallable}] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.0.2/firebase-functions.js')
    ]);
    const app = getApps()[0] || initializeApp({apiKey:'AIzaSyDj5g9at9UQnpgTD0Q45O6AkaqycvTU6mo',authDomain:'tsmoakt-432c8.firebaseapp.com',projectId:'tsmoakt-432c8',appId:'1:866651532666:web:fd6693ffa8027b2cbafac3'});
    const response = await httpsCallable(getFunctions(app,'europe-west1'),'cateringAanvraag',{timeout:30000})(payload);
    return response.data;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    if (form.elements.website.value) return;
    error.hidden = true;
    status.textContent = '';
    const values = Object.fromEntries(new FormData(form));
    const fingerprint = JSON.stringify(values);
    if (!pending || pending.fingerprint !== fingerprint) pending = {fingerprint, requestId:crypto.randomUUID()};
    submitting = true;
    button.disabled = true;
    button.textContent = 'Bezig met versturen…';
    form.setAttribute('aria-busy','true');
    try {
      const result = await saveContact({...values,requestId:pending.requestId});
      document.querySelector('#contact-fields').hidden = true;
      status.textContent = `Bedankt! Je aanvraag is ontvangen. Aanvraagnummer: ${result.reference}. Je ontvangt een bevestiging per e-mail. We nemen contact met je op voor een voorstel.`;
      status.focus({preventScroll:true});
      status.scrollIntoView({behavior:'instant',block:'center'});
    } catch (problem) {
      const messages = {
        'functions/invalid-argument':'Controleer je naam, e-mailadres en de overige gegevens. Je bericht mag maximaal 3000 tekens bevatten.',
        'functions/resource-exhausted':'Er zijn te veel aanvragen kort na elkaar. Probeer over een kwartier opnieuw, of mail info@tsmoakt.be.',
        'functions/already-exists':'Deze aanvraagcode werd al gebruikt. Herlaad de pagina voor een nieuwe aanvraag.'
      };
      error.textContent = messages[problem.code] || 'We konden de ontvangst nog niet bevestigen. Probeer opnieuw; je ingevulde gegevens blijven staan. Lukt het nog niet? Mail info@tsmoakt.be of bel +32 499 62 83 36.';
      error.hidden = false;
      button.disabled = false;
      button.textContent = 'Aanvraag opnieuw versturen';
    } finally {
      submitting = false;
      form.removeAttribute('aria-busy');
    }
  });
  button.disabled = false;
}
