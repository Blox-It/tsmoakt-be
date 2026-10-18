"""Public website contracts, checked against built HTML without executing JavaScript."""
import json
import build
import os
from pathlib import Path
import unittest
from html.parser import HTMLParser
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / os.environ.get('SITE_DIR', '_site')

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.links=[]; self.meta={}; self.ids=[]; self.h1=0; self.canonical=[]; self.schemas=[]; self._schema=False; self._data=''
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='a' and a.get('href'): self.links.append(a['href'])
        if 'id' in a: self.ids.append(a['id'])
        if tag=='h1': self.h1+=1
        if tag=='meta': self.meta[a.get('name',a.get('property',''))]=a.get('content','')
        if tag=='link' and a.get('rel')=='canonical': self.canonical.append(a['href'])
        if tag=='script' and a.get('type')=='application/ld+json': self._schema=True; self._data=''
    def handle_data(self,data):
        if self._schema:self._data+=data
    def handle_endtag(self,tag):
        if tag=='script' and self._schema:self.schemas.append(json.loads(self._data));self._schema=False

class PublicSiteTests(unittest.TestCase):
    def read(self,path):
        p=SITE/path
        self.assertTrue(p.is_file(),f'Missing crawlable page: {path}')
        return p.read_text()
    def test_hidden_category_can_be_rendered_when_restored(self):
        c=next(x for x in build.read_json('data/categories.json')['items'] if x['slug']=='tapas')
        html=build.service_page(c, build.read_json('data/formulas-tapas.json')['items'], [c])
        self.assertIn('/assets/tapas.webp',html)
        self.assertIn('<h1>Tapas &amp; planken catering</h1>',html)
    def test_existing_search_console_verification_is_preserved(self):
        self.assertEqual(Page(self.read('index.html')).meta['google-site-verification'], build.SITE['googleVerification'])
    def test_homepage_has_real_links_and_prices_without_js(self):
        text=self.read('index.html');page=Page(text)
        for href in ['/hamburgers/','/bbq/','/paella/','/steak/']:self.assertIn(href,page.links)
        self.assertIn('Vanaf € 9,00 p.p.',text)
        self.assertNotIn('/tapas/',page.links)
    def test_every_service_has_metadata_formulas_and_minimum(self):
        titles=set()
        for slug,price in [('hamburgers','9,00'),('bbq','10,00'),('paella','17,50'),('steak','18,00')]:
            text=self.read(f'{slug}/index.html');page=Page(text)
            self.assertEqual(page.h1,1)
            self.assertEqual(page.canonical,[f'https://tsmoakt.be/{slug}/'])
            self.assertIn('Onze cateringformules gelden vanaf 30 personen.',text); self.assertIn('Kleinere groepen zijn mogelijk in overleg',text)
            self.assertIn('Vanaf € '+price+' p.p.',text)
            self.assertIn('class="formula"',text)
            self.assertTrue(page.meta.get('description'))
            self.assertNotIn(page.meta['og:title'],titles);titles.add(page.meta['og:title'])
            graph=page.schemas[0]['@graph']
            self.assertTrue(any(x['@type']=='Service' for x in graph))
            self.assertTrue(any(x['@type']=='BreadcrumbList' for x in graph))
            self.assertEqual(len(page.ids),len(set(page.ids)))
    def test_sitemap_only_contains_canonical_public_urls(self):
        root=ET.fromstring(self.read('sitemap.xml'))
        urls=[e.text for e in root.findall('{*}url/{*}loc')]
        self.assertIn('https://tsmoakt.be/hamburgers/',urls);self.assertIn('https://tsmoakt.be/kerst/',urls)
        self.assertEqual(len(urls),len(set(urls)))
        self.assertFalse(any(x in u for u in urls for x in ['admin','category.html','tapas','404','?']))
    def test_non_public_files_not_published(self):
        for path in ['functions','firebase','scripts','tests','.git','README.md']:self.assertFalse((SITE/path).exists(),path)
        self.assertIn('noindex',self.read('admin/index.html'))
        self.assertIn('noindex',self.read('404.html'))
    def test_christmas_menu_is_readable_without_js(self):
        text=self.read('kerst/index.html');page=Page(text)
        self.assertIn('Empanada',text);self.assertIn('24 december',text)
        self.assertEqual(page.canonical,['https://tsmoakt.be/kerst/'])
        self.assertIn('<noscript>',text)
    def test_images_have_sizes_and_no_read_aloud_widget(self):
        for path in ['index.html','hamburgers/index.html','kerst/index.html']:
            text=self.read(path)
            self.assertNotIn('speechSynthesis',text)
            self.assertIn('width=',text); self.assertIn('height=',text)

if __name__=='__main__':unittest.main()
