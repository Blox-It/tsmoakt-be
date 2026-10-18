import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {websiteCatalog, productImportPlan, requestProducts} from '../admin/product-catalog.js';
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url)));
const categories=read('categories.json').items;
const files=Object.fromEntries(categories.map(c=>[c.slug,read(`formulas-${c.slug}.json`).items]));
const source=()=>websiteCatalog(categories,files,read('kerst-2026.json'));

test('all 20 active catering offers and 30 Christmas variants become distinct linkable products',()=>{
  const catalog=source(), plan=productImportPlan(catalog,[],[]);
  assert.equal(plan.products.length,50);
  assert.equal(new Set(plan.products.map(p=>p.id)).size,50);
  assert.equal(plan.catalog.length,5);
  const fries=plan.products.find(p=>p.sourceCategory==='burgers'&&p.name.endsWith('Friet'));
  assert.equal(fries.salePrice,3.5);
  const croquettes=plan.products.filter(p=>p.sourceItemId?.startsWith('vg-wildkroket'));
  assert.equal(croquettes.length,2);
  assert.notEqual(croquettes[0].name,croquettes[1].name);
  assert.deepEqual(croquettes.map(p=>p.salePrice),[8.5,16]);
  assert.ok(plan.products.some(p=>p.sourceItemId==='soep-tomaat'&&p.unit==='liter'));
  assert.ok(plan.products.some(p=>p.salePrice===null));
  for(const c of plan.catalog)for(const f of c.formulas){
    assert.equal(f.productLines.length,1);
    assert.ok(plan.products.some(p=>p.id===f.productLines[0].productId));
  }
});

test('repeat import preserves existing prices, inactive products, custom formulas and mappings',()=>{
  const first=productImportPlan(source(),[],[]);
  const products=structuredClone(first.products), catalog=structuredClone(first.catalog);
  products[0].salePrice=123;products[0].active=false;
  catalog[0].formulas[0].productLines=[{productId:'existing-ingredient',quantityPerPerson:0.25}];
  catalog[0].formulas.push({id:'custom',title:'Eigen formule',productLines:[]});
  const again=productImportPlan(source(),products,catalog);
  assert.deepEqual(again.products,[]);
  assert.deepEqual(again.catalog,[]);
});

test('Christmas orders resolve to product IDs, keep quantities and respect saved removals',()=>{
  const {products}=productImportPlan(source(),[],[]);
  const order={source:'bestelformulier-kerst-2026',productSelections:[],orderLines:[{id:'soep-tomaat',qty:2},{id:'vg-wildkroket-2',qty:4}]};
  const lines=requestProducts(order,products);
  assert.equal(lines.length,2);assert.deepEqual(lines.map(l=>l.quantity),[2,4]);
  assert.ok(lines.every(l=>products.some(p=>p.id===l.productId)));
  assert.deepEqual(requestProducts({...order,productsMapped:true},products),[]);
  assert.deepEqual(requestProducts({...order,source:'website-contact'},products),[]);
  const saved=[{productId:'manual',quantity:3}];
  assert.deepEqual(requestProducts({...order,productSelections:saved},products),saved);
});
