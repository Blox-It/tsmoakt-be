import {writeFile} from 'node:fs/promises';
const url=process.env.GOOGLE_SHEET_CSV_URL;
if(!url){console.log('Geen GOOGLE_SHEET_CSV_URL ingesteld; synchronisatie overgeslagen.');process.exit(0)}
const response=await fetch(url);if(!response.ok) throw new Error(`Google Sheet ophalen mislukt: ${response.status}`);
const csv=await response.text();
function rows(text){let out=[],row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&quoted&&n==='"'){cell+='"';i++}else if(c==='"'){quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(Boolean))out.push(row);row=[];cell=''}else cell+=c}row.push(cell);if(row.some(Boolean))out.push(row);return out}
const table=rows(csv),headers=table.shift().map(x=>x.trim().toLowerCase());const required=['id','title','price','description','image','active'];for(const h of required)if(!headers.includes(h))throw new Error(`Kolom ontbreekt: ${h}`);
const items=table.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]??'').trim()]))).filter(x=>x.id).map(x=>({...x,active:!['false','0','nee','no'].includes(x.active.toLowerCase())}));
await writeFile(new URL('../data/prices.json',import.meta.url),JSON.stringify({updated:new Date().toISOString().slice(0,10),items},null,2)+'\n');console.log(`${items.length} items gesynchroniseerd.`);
