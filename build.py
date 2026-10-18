"""Build a crawlable GitHub Pages site with Python's standard library only."""
from pathlib import Path
from html import escape
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib.parse import quote
import json
import hashlib
import re
import shutil

ROOT = Path(__file__).parent.resolve()
OUT = ROOT / '_site'
SITE = json.loads((ROOT / 'site.json').read_text())
BASE = SITE['url']
MINIMUM = 'Vanaf 30 personen'
SMALL = 'Kleinere groepen in overleg'


def read_json(path):
    return json.loads((ROOT / path).read_text())


def esc(value):
    return escape(str(value), quote=True)


def price_number(value):
    value = re.sub(r'[^0-9,.-]', '', str(value)).replace(',', '.')
    try:
        amount = Decimal(value)
        return amount if amount.is_finite() and amount >= 0 else None
    except InvalidOperation:
        return None


def from_price(items):
    prices = [price_number(x.get('price', '')) for x in items
              if x.get('active') is not False and x.get('homepagePrice') in (True, 'true')]
    prices = [x for x in prices if x is not None]
    return 'Vanaf € '+format(min(prices), '.2f').replace('.', ',')+' p.p.' if prices else 'Prijs op aanvraag'


def route(c):
    return '/' + SITE['routes'][c['slug']] + '/'


def image(slug, alt, sizes='(max-width: 650px) 90vw, 440px', eager=False, css=''):
    if slug == 'tapas':
        return f'<img class="{css}" src="/assets/tapas.webp" width="1024" height="1024" alt="{esc(alt)}" loading="{"eager" if eager else "lazy"}" decoding="async">'
    heights = {'burgers': 801, 'bbq': 1600, 'paella': 1600, 'steak': 795}
    middle = f'/assets/photos/{slug}-900.webp 900w, ' if slug == 'bbq' else ''
    return (f'<img class="{css}" src="/assets/photos/{slug}-1200.webp" '
            f'srcset="/assets/photos/{slug}-640.webp 640w, {middle}/assets/photos/{slug}-1200.webp 1200w" '
            f'sizes="{sizes}" width="1200" height="{heights[slug]}" alt="{esc(alt)}" '
            f'loading="{"eager" if eager else "lazy"}" decoding="async"'
            f'{" fetchpriority=\"high\"" if eager else ""}>')


def asset_url(path):
    data=(ROOT/path.lstrip('/')).read_bytes()
    if path=='/legal.css': data+=(ROOT/'styles.css').read_bytes()
    return path+'?v='+hashlib.sha256(data).hexdigest()[:12]


def business():
    return {'@type': 'FoodEstablishment', '@id': BASE+'/#business', 'name': SITE['name'], 'url': BASE+'/',
            'logo': BASE+'/assets/logo.webp', 'image': BASE+'/assets/photos/burgers.jpg',
            'telephone': SITE['phoneHref'], 'email': SITE['email'], 'vatID': SITE['vatID'],
            'address': {'@type': 'PostalAddress', 'streetAddress': SITE['street'], 'postalCode': SITE['postalCode'],
                        'addressLocality': SITE['locality'], 'addressCountry': 'BE'},
            'sameAs': [SITE['facebook']], 'hasMenu': BASE+'/#aanbod',
            'description': 'Catering op maat vanuit Moerbeke-Waas. Burgers, BBQ, paella en steak-friet.'}


def head(title, description, path, photo='burgers', extra='', noindex=False, schema=None, css='/styles.css'):
    canonical = BASE + path
    graph = [business(), {'@type': 'WebSite', '@id': BASE+'/#website', 'url': BASE+'/', 'name': SITE['name'], 'inLanguage': 'nl-BE'},
             {'@type': 'WebPage', '@id': canonical+'#webpage', 'url': canonical, 'name': title,
              'description': description, 'inLanguage': 'nl-BE', 'isPartOf': {'@id': BASE+'/#website'}}]
    if schema: graph.extend(schema)
    # Prevent script termination even if text from a spreadsheet contains HTML.
    ld = json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False).replace('<', '\\u003c')
    og_image = BASE + ('/assets/tapas.webp' if photo == 'tapas' else f'/assets/photos/{photo}.jpg')
    return f'''<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<meta name="robots" content="{'noindex, follow' if noindex else 'index, follow, max-image-preview:large'}">
<meta name="theme-color" content="#ed4f36">
<meta name="google-site-verification" content="{esc(SITE['googleVerification'])}">
<link rel="canonical" href="{esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{esc(canonical)}">
<meta property="og:site_name" content="T'Smoakt">
<meta property="og:locale" content="nl_BE">
<meta property="og:image" content="{og_image}">
<meta property="og:image:alt" content="{esc('Catering van '+SITE['name']+' — sfeerbeeld van '+photo)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(description)}">
<meta name="twitter:image" content="{og_image}">
<link rel="icon" href="/assets/logo.webp" type="image/webp">
<link rel="stylesheet" href="{asset_url(css)}">
{extra}
<script type="application/ld+json">{ld}</script>'''


def header(current='/'):
    links = [('/', 'Home'), ('/#over', 'Over ons'), ('/#aanbod', 'Aanbod'), ('/#contact', 'Contact'), ('/kerst/?van=website', 'Feestdagen bestellen')]
    nav = ''.join(f'<a href="{url}"'+(' class="nav-holidays"' if url.startswith('/kerst/') else '')+
                  (' aria-current="page"' if url==current else '')+f'>{label}</a>' for url,label in links)
    return f'''<a class="skip-link" href="#inhoud">Naar de inhoud</a>
<header class="site-header"><a class="logo" href="/" aria-label="T'Smoakt, naar de startpagina"><img src="/assets/logo.webp" alt="" width="82" height="82"></a>
<button class="menu-toggle" type="button" aria-label="Menu openen" aria-expanded="false" aria-controls="hoofdmenu" hidden>Menu</button>
<nav id="hoofdmenu" aria-label="Hoofdnavigatie">{nav}</nav></header>'''


def footer(categories):
    links=''.join(f'<a href="{route(c)}">{esc(c["title"])}</a>' for c in categories)
    return f'''<footer class="site-footer"><div class="footer-brand"><img src="/assets/logo.webp" alt="T'Smoakt" width="70" height="70"><p>Catering op maat vanuit Moerbeke-Waas.</p></div>
<nav aria-label="Cateringformules">{links}<a href="/kerst/?van=website">Kerstbestelling</a></nav>
<address><a href="tel:{SITE['phoneHref']}">{SITE['phone']}</a><a href="mailto:{SITE['email']}">{SITE['email']}</a><span>{esc(SITE['street'])}<br>{SITE['postalCode']} {SITE['locality']}</span></address>
<div class="footer-bottom"><span>© {date.today().year} T'Smoakt · {SITE['vatID']}</span><a href="/privacy.html">Privacy</a><a href="/voorwaarden.html">Algemene voorwaarden</a><a href="{SITE['facebook']}">Facebook</a></div></footer>'''


def layout(title, description, path, content, categories, **kwargs):
    return '<!doctype html>\n<html lang="nl-BE"><head>\n<script>document.documentElement.classList.add("js-menu")</script>\n'+head(title,description,path,**kwargs)+f'''\n<script src="{asset_url('/site.js')}" defer onerror="document.documentElement.classList.remove('js-menu')"></script></head><body>
{header(path)}<main id="inhoud" tabindex="-1">{content}</main>{footer(categories)}</body></html>'''


def write(path, content):
    dest=OUT/path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content, encoding='utf-8')


def category_cards(categories, formulas):
    return ''.join(f'''<a class="category-card" href="{route(c)}">{image(c['image'],c['title'], '(max-width: 650px) 45vw, (max-width: 900px) 42vw, 280px')}<div class="category-content"><h3>{esc(c['title'])}</h3><p>{esc(c['summary'])}</p><span>{from_price(formulas[c['slug']])}</span><small>Vanaf 30 personen</small><span class="card-action">Bekijk de formules →</span></div></a>''' for c in categories)


def faq_html(c):
    return f'''<section class="service-faq" aria-labelledby="faq-title"><h2 id="faq-title">Praktisch voor jouw feest</h2>
<details><summary>Voor hoeveel personen kan ik catering aanvragen?</summary><p>Onze cateringformules gelden vanaf 30 personen. Kleinere groepen zijn mogelijk in overleg; afhankelijk van de locatie en wensen kan een toeslag gelden.</p></details>
<details><summary>Kan ik verschillende formules combineren?</summary><p>Ja, we bespreken graag welke combinatie bij jouw gezelschap past. Vermeld je wensen en het aantal gasten bij je aanvraag.</p></details>
<details><summary>Hoe vraag ik een voorstel aan?</summary><p>Geef je datum, locatie, aantal personen en gewenste formule door. De prijzen op deze pagina zijn indicatief; vraag een actuele offerte voor jouw feest.</p></details>
<details><summary>Wat als een gast een allergie heeft?</summary><p>Vermeld allergieën en dieetwensen vooraf in je aanvraag. We bespreken samen wat mogelijk is voor jouw menu.</p></details></section>'''


def service_page(c, items, categories):
    price=from_price(items)
    cards=[]
    for x in sorted((x for x in items if x.get('active') is not False), key=lambda x:x.get('order',0)):
        badge=f'<span class="formula-badge">{esc(x["group"])}</span>' if x.get('group') else ''
        cards.append(f'<article class="formula"><div>{badge}<h3>{esc(x["title"])}</h3><p>{esc(x.get("description",""))}</p></div><div class="formula-price">{esc(x.get("price") or "Prijs op aanvraag")} <small>{esc(x.get("unit", ""))}</small></div></article>')
    h1={'burgers':'Burgercatering voor jouw feest','bbq':'BBQ-catering op maat','paella':'Paella catering op locatie','steak':'Steak-friet catering'}.get(c['slug'], c['title']+' catering')
    content=f'''<section class="detail-hero"><div class="detail-hero-inner"><div><nav class="breadcrumbs" aria-label="Broodkruimel"><a href="/">Home</a><span aria-hidden="true"> / </span><a href="/#aanbod">Aanbod</a><span aria-hidden="true"> / </span><span aria-current="page">{esc(c['title'])}</span></nav><h1>{esc(h1)}</h1><p>{esc(c['tagline'])}</p><p class="service-from">{price}</p><p class="minimum-badge"><strong>{MINIMUM}</strong><span>{SMALL}</span></p><a class="btn" href="/?formule={quote(c['slug'])}#contact">Vraag een voorstel voor {esc(c['title'].lower())}</a></div>{image(c['image'],c['title'],'(max-width: 650px) 90vw, 400px',True)}</div></section>
<section class="detail-main"><div class="intro-copy"><h2>{esc(c['heading'])}</h2><p>{esc(c['description'])}</p><p>We verzorgen catering vanuit {SITE['locality']}. {esc(SITE['serviceArea'])}. Geef je feestlocatie door bij je aanvraag.</p></div>
<aside class="notice" aria-label="Minimumafname en prijzen"><strong>Vanaf 30 personen.</strong> Kleinere groepen in overleg. De prijzen zijn indicatief en gelden bij een minimumafname van 30 personen. Voor kleinere groepen kan, afhankelijk van locatie en wensen, een toeslag gelden. Vraag steeds een actuele offerte.</aside>
<h2 id="formules">Formules en prijzen</h2><div class="formula-list">{''.join(cards)}</div>{faq_html(c)}
<div class="detail-cta"><div><h2>Bespreek jouw feest met ons</h2><p>Vanaf 30 personen · kleinere groepen in overleg.</p></div><a class="btn" href="/?formule={quote(c['slug'])}#contact">Vraag je voorstel aan</a></div>
<section class="related"><h2>Ook iets voor jouw gezelschap?</h2><div class="related-links">{''.join(f'<a href="{route(x)}">{esc(x["title"])} →</a>' for x in categories if x['slug']!=c['slug'])}</div></section></section>'''
    title={'burgers':"Burgercatering vanaf 30 personen | T'Smoakt",'bbq':"BBQ-catering vanaf 30 personen | T'Smoakt",'paella':"Paella catering vanaf 30 personen | T'Smoakt",'steak':"Steak-friet catering vanaf 30 personen | T'Smoakt"}.get(c['slug'], c['title']+" vanaf 30 personen | T'Smoakt")
    desc=f"{c['title']} voor jouw feest, vanuit Moerbeke-Waas. {price} Vanaf 30 personen, kleinere groepen in overleg. Bekijk de formules."
    schema=[{'@type':'Service','@id':BASE+route(c)+'#service','name':h1,'url':BASE+route(c),'description':desc,'provider':{'@id':BASE+'/#business'},'serviceType':c['title']},
            {'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Home','item':BASE+'/'},{'@type':'ListItem','position':2,'name':c['title'],'item':BASE+route(c)}]}]
    return layout(title,desc,route(c),content,categories,photo=c['image'],schema=schema)


def home(categories, formulas):
    source=(ROOT/'index.html').read_text()
    content=re.search(r'<main>(.*?)</main>',source,re.S).group(1)
    content=content.replace('<div class="category-grid" id="category-grid"></div>',f'<div class="category-grid" id="category-grid">{category_cards(categories,formulas)}</div>')
    content=content.replace('<section class="hero">','<section class="hero">'+image('burgers','', '(max-width: 650px) 100vw, 1100px',True,'hero-image'))
    content=content.replace('<h1>T\'Smoakt</h1>', '<p class="hero-brand">T\'Smoakt</p><h1>Catering<br> in Moerbeke-Waas</h1>')
    content=content.replace('Catering op maat voor uw feesten, groot en klein.', 'Samen genieten, van de eerste hap tot de laatste gast.')
    content=content.replace('Een greep uit onze diensten','Cateringformules voor jouw feest')
    content=content.replace('src="assets/photos/bbq.jpg" alt="Vlees dat vers wordt gegrild op de barbecue" loading="lazy"', 'src="/assets/photos/bbq-640.webp" srcset="/assets/photos/bbq-640.webp 640w, /assets/photos/bbq-900.webp 900w, /assets/photos/bbq-1200.webp 1200w" sizes="(max-width:650px) 90vw,440px" width="1200" height="1600" alt="Vlees dat vers wordt gegrild op de barbecue" loading="lazy" decoding="async"')
    content=content.replace('href="kerst/"','href="/kerst/?van=website"')
    content=content.replace('<label>Naam en voornaam<input name="name" required>', '<p id="contact-help" class="form-help">Velden met * zijn verplicht. Dit formulier opent je e-mailprogramma; verstuur daar je aanvraag. Liever rechtstreeks? <a href="mailto:info@tsmoakt.be">Mail ons</a> of <a href="tel:+32499628336">bel ons</a>.</p><label>Naam en voornaam *<input name="name" autocomplete="name" maxlength="100" required>')
    content=content.replace('<label>E-mail<input name="email" type="email" required>', '<label>E-mail *<input name="email" type="email" autocomplete="email" maxlength="120" required>')
    content=content.replace('<label>Uw bericht<textarea name="message" rows="4" required>', '<label>Locatie van je feest<input name="location" autocomplete="off" maxlength="200" placeholder="Gemeente of adres"></label><label>Je bericht *<textarea name="message" rows="4" maxlength="3000" required>')
    content=content.replace('<form id="contact-form">','<form id="contact-form" aria-describedby="contact-help"><noscript><p>Mail je aanvraag rechtstreeks naar <a href="mailto:info@tsmoakt.be">info@tsmoakt.be</a>. Het formulier hieronder heeft JavaScript nodig.</p><style>#contact-form label,#contact-form .two,#contact-form button{display:none}</style></noscript>')
    content=content.replace('</button></form>','</button><p id="contact-status" role="status"></p></form>')
    process='''<section class="section planning" aria-labelledby="planning-title"><p class="kicker">ZO WERKT HET</p><h2 id="planning-title">Van een idee naar een geslaagd feest</h2><ol><li><h3>Vertel ons je plannen</h3><p>Geef je datum, locatie en aantal gasten door.</p></li><li><h3>Kies samen je formule</h3><p>Burgers, BBQ, paella of steak-friet: we bespreken wat bij je gezelschap past.</p></li><li><h3>Ontvang een voorstel op maat</h3><p>We stemmen het menu en de praktische afspraken met je af.</p></li></ol><p><strong>Vanaf 30 personen.</strong> Kleinere groepen in overleg.</p></section>'''
    content=content.replace('<section class="section contact"', process+'<section class="section contact"')
    return layout("Catering Moerbeke-Waas | T'Smoakt", 'Burgers, BBQ, paella en steak-friet voor jouw feest. Catering vanuit Moerbeke-Waas vanaf 30 personen, kleinere groepen in overleg. Vraag je voorstel.', '/',content,categories)


def christmas():
    source=(ROOT/'kerst/index.html').read_text();data=read_json('data/kerst-2026.json')
    extra='<script>if(new URLSearchParams(location.search).get("van")==="website")document.documentElement.classList.add("from-site")</script><link rel="preload" href="/kerst/fonts/montserrat.woff2" as="font" type="font/woff2" crossorigin><script type="module" src="/kerst/kerst.js"></script>'
    extra=extra.replace('/kerst/kerst.js',asset_url('/kerst/kerst.js'))
    meta=head("Kerstmenu 2026 bestellen in Moerbeke-Waas | T'Smoakt", 'Bestel je kerstmenu bij T\'Smoakt: hapjes, soep, voor- en hoofdgerechten en dessert. Afhalen in Moerbeke-Waas op 24, 25 of 26 december 2026.', '/kerst/',extra=extra,css='/kerst/kerst.css')
    source=re.sub(r'<head>.*?</head>', '<head>'+meta+'</head>', source,flags=re.S).replace('lang="nl"','lang="nl-BE"')
    source=source.replace('<body>', '<body><a class="skip-link" href="#inhoud">Naar het kerstmenu</a>').replace('<main>', '<main id="inhoud" tabindex="-1">')
    source=source.replace('href="../index.html"','href="/"').replace('<h1 class="t2">KERSTBESTELLING</h1>', '<h1 class="t2">KERSTBESTELLING 2026</h1>')
    menu=''
    for sec in data['sections']:
        menu+=f'<section class="sec"><h2>{esc(sec["title"])}</h2><p class="sub">{esc(sec["sub"])}</p>'
        for item in sec['items']:
            cost=format(item['price'], '.2f').replace('.', ',')
            unit='/ liter' if item['unit']=='liter' else 'p.p.'
            menu+=f'<div class="item"><div><h3 class="n">{esc(item["name"])} {esc(item["desc"])}</h3><div class="pr">€ {cost} <small>{unit}</small></div></div></div>'
        menu+='</section>'
    source=source.replace('<div id="menu"><p class="loading">Menu laden…</p></div>','<div id="menu">'+menu+'</div>')
    slots=''.join(f'<li><b>{esc(s["label"])}</b> · {esc(s["time"])}</li>' for s in data['pickupSlots'])
    source=source.replace('aria-label="Afhaalmomenten"></ul>',f'aria-label="Afhaalmomenten">{slots}</ul>')
    source=source.replace('<form id="order-form" novalidate>', '<noscript><p class="notice">Bekijk hieronder het menu. Om online te bestellen heb je JavaScript nodig. Je kunt je bestelling ook doorgeven via <a href="mailto:info@tsmoakt.be">info@tsmoakt.be</a> of <a href="tel:+32499628336">+32 499 62 83 36</a>.</p><style>.details,.summary,.bar{display:none}</style></noscript><form id="order-form" novalidate><p class="form-instructions">Kies je gerechten en aantallen. Vul daarna je gegevens en afhaalmoment in. Velden met * zijn verplicht.</p>')
    for label in ['Naam en voornaam','E-mail','Telefoon']: source=source.replace('<label>'+label+'<input','<label>'+label+' *<input')
    source=source.replace('type="tel" required','type="tel" autocomplete="tel" required')
    source=source.replace('id="submit">','id="submit" disabled>')
    source=source.replace('class="lights" src="img/lichtjes.webp"','class="lights" src="img/lichtjes.webp" width="900" height="185"')
    source=source.replace('src="../assets/logo.webp" alt="\'t Smoakt"','src="../assets/logo.webp" alt="\'t Smoakt, naar de startpagina" width="104" height="104"')
    for name,w,h in [('dessert',195,195),('mousse',193,226),('spiesjes',175,199)]:source=source.replace(f'src="img/{name}.webp" alt=""', f'src="img/{name}.webp" alt="" width="{w}" height="{h}" loading="lazy"')
    return source


def redirect(path, target):
    return f'''<!doctype html><html lang="nl-BE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pagina verhuisd | T'Smoakt</title><link rel="canonical" href="{BASE+target.split('#')[0]}"><meta http-equiv="refresh" content="0;url={esc(target)}"></head><body><p>Deze pagina is verhuisd. <a href="{esc(target)}">Ga naar de nieuwe pagina</a>.</p></body></html>'''


def build():
    if OUT.exists():shutil.rmtree(OUT)
    OUT.mkdir()
    for directory in ['assets','kerst','admin']:shutil.copytree(ROOT/directory,OUT/directory)
    (OUT/'assets/photos/SOURCES.txt').unlink(missing_ok=True)
    (OUT/'data').mkdir()
    # Only data actually used by the public order form and current admin UI.
    for path in (ROOT/'data').glob('*.json'):
        if path.name!='sheets.json':shutil.copy2(path,OUT/'data'/path.name)
    for filename in ['styles.css','legal.css','site.js','category.js','.nojekyll']:shutil.copy2(ROOT/filename,OUT/filename)
    write('legal.css',(ROOT/'legal.css').read_text().replace("'styles.css'","'"+asset_url('/styles.css')+"'"))
    all_categories=read_json('data/categories.json')['items']
    categories=[c for c in all_categories if c.get('active') is not False]
    formulas={c['slug']:read_json(f'data/formulas-{c["slug"]}.json')['items'] for c in categories}
    write('index.html',home(categories,formulas))
    urls=['/']
    for c in categories:
        write(SITE['routes'][c['slug']]+'/index.html',service_page(c,formulas[c['slug']],categories));urls.append(route(c))
    for path,title,description in [('privacy.html',"Privacybeleid | T'Smoakt",'Lees hoe T\'Smoakt omgaat met contactgegevens, cateringaanvragen en bestellingen.'),('voorwaarden.html',"Algemene voorwaarden | T'Smoakt",'De voorwaarden voor offertes, cateringdiensten, betaling en annulering bij T\'Smoakt in Moerbeke-Waas.')]:
        text=(ROOT/path).read_text();content=re.search(r'<main[^>]*>(.*?)</main>',text,re.S).group(1)
        content=content.replace('href="index.html"','href="/"')
        write(path,layout(title,description,'/'+path,'<div class="legal">'+content+'</div>',categories,css='/legal.css'));urls.append('/'+path)
    write('kerst/index.html',christmas());urls.append('/kerst/')
    admin=(OUT/'admin/index.html').read_text()
    if 'name="robots"' not in admin:admin=admin.replace('</head>','<meta name="robots" content="noindex, nofollow"></head>')
    write('admin/index.html',admin)
    # Query-based links remain usable, but new internal links use the canonical static pages.
    write('category.html',layout("Cateringformules | T'Smoakt",'Bekijk de actuele cateringformules van T\'Smoakt.','/category.html', '<section class="section"><h1>Onze cateringformules</h1><p>Kies je formule hieronder.</p><div class="category-grid">'+category_cards(categories,formulas)+'</div></section><script src="/category.js" defer></script>',categories,noindex=True))
    write('404.html',layout("Pagina niet gevonden | T'Smoakt",'Deze pagina bestaat niet. Bekijk onze cateringformules of neem contact op.','/404.html','<section class="section not-found"><p class="kicker">404</p><h1>Deze pagina staat niet op het menu.</h1><p>Misschien is de link verouderd. Kies een cateringformule of ga terug naar de startpagina.</p><a class="btn" href="/">Naar de startpagina</a><div class="related-links">'+''.join(f'<a href="{route(c)}">{esc(c["title"])}</a>' for c in categories)+'</div></section>',categories,noindex=True))
    if not any(c['slug'] == 'tapas' for c in categories):
        write('tapasplanken/index.html',layout("Tapas tijdelijk niet beschikbaar | T'Smoakt",'De losse tapasformule is tijdelijk niet beschikbaar. Bekijk onze andere cateringformules.','/tapasplanken/','<section class="section"><h1>Tapas tijdelijk niet beschikbaar</h1><p>Onze losse tapasformule staat momenteel niet in het aanbod. Ontdek onze andere mogelijkheden voor jouw feest.</p><a class="btn" href="/#aanbod">Bekijk het aanbod</a></section>',categories,noindex=True))
    for path,target in SITE['redirects'].items():write(path.strip('/')+'/index.html',redirect(path,target))
    xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join(f'<url><loc>{BASE+p}</loc></url>\n' for p in urls)+'</urlset>\n'
    write('sitemap.xml',xml)
    write('robots.txt',f'User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n')
    print(f'Built {len(urls)} canonical public pages, legacy links and admin into {OUT}')

if __name__=='__main__':build()
