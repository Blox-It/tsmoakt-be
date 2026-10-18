"""Check built public HTML for metadata, local references and image dimensions."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import sys

ROOT=Path(__file__).resolve().parents[1]/'_site'
BASE='https://tsmoakt.be'

class Document(HTMLParser):
    def __init__(self, source):
        super().__init__();self.ids=[];self.refs=[];self.metas={};self.canon=[];self.h1=0;self.title='';self.in_title=False;self.json_text=None;self.errors=[]
        self.feed(source)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if a.get('id'):self.ids.append(a['id'])
        if tag=='h1':self.h1+=1
        if tag=='title':self.in_title=True
        if tag=='meta':self.metas[a.get('name',a.get('property',a.get('http-equiv','')))]=a.get('content','')
        if tag=='link' and a.get('rel')=='canonical':self.canon.append(a.get('href'))
        if tag=='a' and a.get('href'):self.refs.append(a['href'])
        if tag in ['img','script'] and a.get('src'):self.refs.append(a['src'])
        if tag=='link' and a.get('rel') in ['stylesheet','icon','preload']:self.refs.append(a['href'])
        if tag=='img':
            if 'alt' not in a:self.errors.append('image missing alt')
            if not a.get('width') or not a.get('height'):self.errors.append('image missing width/height: '+a.get('src',''))
            if a.get('srcset'):self.refs.extend(x.strip().split()[0] for x in a['srcset'].split(','))
        if tag=='script' and a.get('type')=='application/ld+json':self.json_text=''
    def handle_data(self,data):
        if self.in_title:self.title+=data
        if self.json_text is not None:self.json_text+=data
    def handle_endtag(self,tag):
        if tag=='title':self.in_title=False
        if tag=='script' and self.json_text is not None:
            try:json.loads(self.json_text)
            except ValueError:self.errors.append('invalid JSON-LD')
            self.json_text=None

def main():
    errors=[];docs={p:Document(p.read_text()) for p in ROOT.rglob('*.html') if 'admin' not in p.relative_to(ROOT).parts}
    for path,doc in docs.items():
        name=str(path.relative_to(ROOT));fail=lambda message:errors.append(name+': '+message)
        for error in doc.errors:fail(error)
        if 'refresh' not in doc.metas:
            if doc.h1!=1:fail('expected one h1')
            if not doc.title:fail('missing title')
            if not doc.metas.get('description'):fail('missing description')
            if len(doc.canon)!=1 or not doc.canon[0].startswith(BASE+'/'):fail('missing or wrong canonical')
            if not doc.metas.get('og:image'):fail('missing share image')
        if len(doc.ids)!=len(set(doc.ids)):fail('duplicate IDs')
        for href in doc.refs:
            url=urlsplit(href)
            if url.scheme or url.netloc:
                if url.netloc!='tsmoakt.be':continue
            dest=(ROOT/unquote(url.path).lstrip('/')) if url.path.startswith('/') else (path.parent/unquote(url.path))
            if not url.path:dest=path
            if dest.is_dir():dest=dest/'index.html'
            if not dest.is_file():fail('broken local reference '+href);continue
            if url.fragment and dest.suffix=='.html':
                target=docs.get(dest)
                if target and unquote(url.fragment) not in target.ids:fail('missing anchor '+href)
    if errors:
        print('\n'.join(errors));return 1
    print(f'Checked {len(docs)} public HTML pages: links, anchors, images, metadata and JSON-LD are valid.')
    return 0

if __name__=='__main__':sys.exit(main())
