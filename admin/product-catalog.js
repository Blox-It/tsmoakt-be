// Shared source identities for the importer and CRM; no database or browser side effects.
const legacyPrice=value=>{
  if(typeof value==='number')return value;
  if(!value||!/\d/.test(value))return null;
  const amount=Number(value.replace(/[^\d,.-]/g,'').replace(',','.'));
  return Number.isFinite(amount)?amount:null;
};
const key=(slug,id)=>`${slug}:${id}`;
const productId=(slug,id)=>`website-${slug}-${id}`;

export function websiteCatalog(categories,files,christmas) {
  const catalog=categories.filter(c=>c.active!==false).map(category=>({
    id:category.slug,category,formulas:files[category.slug].filter(f=>f.active!==false).map(f=>{
      if(!f.id)throw Error(`Formule zonder vaste ID: ${f.title}`);
      const amount=f.priceOnRequest?null:(f.priceAmount??legacyPrice(f.price));
      return {...f,priceAmount:amount,priceOnRequest:amount===null,sourceKey:key(category.slug,f.id)};
    })
  }));
  catalog.push({id:'kerst-2026',category:{slug:'kerst-2026',title:christmas.title,description:'Alle kerstgerechten afzonderlijk, inclusief porties en varianten.'},
    formulas:christmas.sections.flatMap(section=>section.items.filter(i=>i.active!==false).map(item=>({
      id:`kerst-2026-${item.id}`,sourceItemId:item.id,sourceKey:key('kerst-2026',item.id),
      title:item.name+(item.desc?` — ${item.desc}`:''),description:item.desc||item.name,
      group:section.title,unit:item.unit==='pp'?'p.p.':item.unit,priceAmount:item.price,
      priceOnRequest:false,active:true
    }))).map((f,i)=>({...f,order:(i+1)*10}))
  });
  return catalog;
}

// Add missing records/links only. Existing edits, deactivations and recipes win.
export function productImportPlan(source,existingProducts,existingCatalog) {
  const products=[],catalog=[];
  for(const item of source){
    const previous=existingCatalog.find(c=>c.id===item.id);
    const merged=structuredClone(previous||{...item,formulas:[]});
    let changed=!previous;
    for(const formula of item.formulas){
      const id=productId(item.id,formula.sourceItemId||formula.id);
      let product=existingProducts.find(p=>p.sourceKey===formula.sourceKey||p.id===id);
      if(!product){
        product={id,name:`${item.category.title} · ${formula.title}`,category:'Voedsel',
          unit:formula.unit||'portie',salePrice:formula.priceAmount,purchasePrice:null,supplierId:'',active:true,
          description:formula.description,sourceCategory:item.id,sourceItemId:formula.sourceItemId||formula.id,sourceKey:formula.sourceKey};
        products.push(product);
      }
      let stored=merged.formulas.find(f=>f.id===formula.id||f.sourceKey===formula.sourceKey||f.title===formula.title);
      if(!stored){stored={...formula,productLines:[]};merged.formulas.push(stored);changed=true;}
      if(!stored.sourceKey){stored.sourceKey=formula.sourceKey;changed=true;}
      // An explicit empty list is a deliberate removal on already imported formulas.
      const previouslyImported=previous?.formulas.some(f=>f.id===stored.id&&f.sourceKey===formula.sourceKey);
      if(!stored.productLines?.length&&!previouslyImported){
        stored.productLines=[{productId:product.id,quantityPerPerson:1}];changed=true;
      }
    }
    if(changed)catalog.push(merged);
  }
  return {products,catalog};
}

export function requestProducts(request,products) {
  if(request.productSelections?.length||request.productsMapped||request.source!=='bestelformulier-kerst-2026')return request.productSelections||[];
  return (request.orderLines||[]).flatMap(line=>{
    const product=products.find(p=>p.sourceKey===key('kerst-2026',line.id));
    return product&&Number.isFinite(line.qty)&&line.qty>0?[{productId:product.id,quantity:line.qty}]:[];
  });
}
