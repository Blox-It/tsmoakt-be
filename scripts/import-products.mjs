// Run without arguments for a dry run; --apply adds missing products and mappings.
// Uses the existing Firebase CLI login; credentials are never printed or persisted here.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {websiteCatalog,productImportPlan} from '../admin/product-catalog.js';
const require=createRequire(import.meta.url);
const root=execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
const auth=require(root+'/firebase-tools/lib/auth.js');
const account=auth.getGlobalDefaultAccount();
if(!account)throw Error('Meld eerst aan met firebase login.');
const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const base='https://firestore.googleapis.com/v1/projects/tsmoakt-432c8/databases/(default)/documents';
async function api(path,body){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error(`Firestore ${response.status}; geen verdere wijzigingen uitgevoerd.`);
  return response.json();
}
function decode(v){
  if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
  if(v.arrayValue)return(v.arrayValue.values||[]).map(decode);
  if('integerValue'in v)return Number(v.integerValue);
  return Object.values(v)[0];
}
function encode(v){
  if(v===null)return {nullValue:null};
  if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
  if(typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
  if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(typeof v==='boolean')return {booleanValue:v};
  if(typeof v==='string')return {stringValue:v};
  throw Error('Niet-ondersteund veldtype');
}
async function list(collection){
  let records=[],next='';
  do{
    const result=await api(`/${collection}?pageSize=1000${next?'&pageToken='+encodeURIComponent(next):''}`);
    records.push(...(result.documents||[]).map(d=>({id:d.name.split('/').pop(),...decode({mapValue:{fields:d.fields}}),_updateTime:d.updateTime})));
    next=result.nextPageToken;
  }while(next);
  return records;
}
const read=async name=>JSON.parse(await readFile(new URL('../data/'+name,import.meta.url),'utf8'));
const categories=(await read('categories.json')).items;
const files=Object.fromEntries(await Promise.all(categories.map(async c=>[c.slug,(await read(`formulas-${c.slug}.json`)).items])));
const source=websiteCatalog(categories,files,await read('kerst-2026.json'));
const [products,catalog]=await Promise.all([list('tsmoakt_products'),list('tsmoakt_catalog')]);
const plan=productImportPlan(source,products,catalog);
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',existingProducts:products.length,createProducts:plan.products.length,updateCatalog:plan.catalog.length,products:plan.products.map(p=>({name:p.name,price:p.salePrice,unit:p.unit}))},null,2));
if(process.argv.includes('--apply')){
  const writes=[];
  for(const [collection,entries,existing] of [['tsmoakt_products',plan.products,products],['tsmoakt_catalog',plan.catalog,catalog]]){
    for(const entry of entries){
      const {id,_updateTime,...data}=entry;
      const previous=existing.find(p=>p.id===id);
      const fields=encode(previous?{category:data.category,formulas:data.formulas}:data).mapValue.fields;
      writes.push({update:{name:base.replace('https://firestore.googleapis.com/v1/','')+`/${collection}/${id}`,fields},
        currentDocument:previous?{updateTime:previous._updateTime}:{exists:false},
        ...(previous?{updateMask:{fieldPaths:['category','formulas','updatedAt']}}:{}),
        updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'},...(!previous?[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]:[])]});
    }
  }
  if(writes.length>450)throw Error('Te veel wijzigingen voor één veilige import.');
  if(writes.length)await api(':commit',{writes});
  const [savedProducts,savedCatalog]=await Promise.all([list('tsmoakt_products'),list('tsmoakt_catalog')]);
  const remaining=productImportPlan(source,savedProducts,savedCatalog);
  if(remaining.products.length||remaining.catalog.length)throw Error('Nacontrole: import is onvolledig.');
  const ids=new Set(savedProducts.map(p=>p.id));
  for(const c of savedCatalog)for(const f of c.formulas||[])for(const line of f.productLines||[]){
    if(!ids.has(line.productId))throw Error('Nacontrole: onbekende productkoppeling.');
  }
  console.log(`Geverifieerd: ${savedProducts.length} producten en ${savedCatalog.length} formulecategorieën. Herhaalde import verandert niets.`);
}
