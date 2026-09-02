"use strict";

const FISCAL_FIELDS = Object.freeze([
  "razon_social","tipo_documento","numero_documento","cuit","condicion_iva",
  "domicilio_fiscal","localidad_fiscal","provincia_fiscal","codigo_postal","email_facturacion"
]);

const VAT_CONDITIONS = Object.freeze({
  "RESP INSCRIPTO":"RESPONSABLE_INSCRIPTO",
  "RESPONSABLE INSCRIPTO":"RESPONSABLE_INSCRIPTO",
  "MONOTRIBUTISTA":"MONOTRIBUTO",
  "MONOTRIBUTO":"MONOTRIBUTO",
  "EXENTO":"EXENTO",
  "CONSUMIDOR FINAL":"CONSUMIDOR_FINAL"
});

const CITY_ALIASES = Object.freeze({
  "CIUDAD":"CAÑADA DE GOMEZ",
  "CDG":"CAÑADA DE GOMEZ",
  "CDA DE GOMEZ":"CAÑADA DE GOMEZ",
  "CANADA DE":"CAÑADA DE GOMEZ",
  "CANADA DEGOMEZ":"CAÑADA DE GOMEZ",
  "CANADA DE GOEMZ":"CAÑADA DE GOMEZ"
});

const SANTA_FE_CITIES = new Set([
  "ARMSTRONG","BUSTINZA","CARCARANA","CANADA DE GOMEZ","CORREA","FUNES",
  "LAS PAREJAS","LAS ROSAS","MONTES DE OCA","PIAMONTE","ROSARIO","TOTORAS","VILLA ELOISA"
]);

export function normalizeImportText(value){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g," ").replace(/\s+/g," ").trim();
}

function digits(value){return String(value||"").replace(/\D/g,"")}

function validCuit(value){
  const valueDigits=digits(value);if(valueDigits.length!==11)return false;
  const weights=[5,4,3,2,7,6,5,4,3,2];let sum=0;
  for(let index=0;index<10;index++)sum+=Number(valueDigits[index])*weights[index];
  let check=11-(sum%11);if(check===11)check=0;else if(check===10)check=9;
  return check===Number(valueDigits[10]);
}

function canonicalCity(value){
  const raw=String(value||"").trim(),key=normalizeImportText(raw),alias=CITY_ALIASES[key];
  if(alias)return alias;
  return raw.replace(/\s+/g," ").trim();
}

function provinceForCity(value){
  const city=normalizeImportText(value);
  if(SANTA_FE_CITIES.has(city))return "Santa Fe";
  if(city==="CRUZ ALTA")return "Córdoba";
  if(city==="RINCON DE LOS SAUCES"||city==="SAN PATRICIO DEL CHANAR")return "Neuquén";
  return "";
}

function fiscalFromRow(row){
  const documentNumber=digits(row.tax_id),documentType=documentNumber.length===11?"CUIT":documentNumber.length>=7&&documentNumber.length<=9?"DNI":"";
  return {
    razon_social:String(row.name||"").trim(),
    tipo_documento:documentType,
    numero_documento:documentNumber,
    cuit:documentType==="CUIT"?documentNumber:"",
    condicion_iva:String(row.condition||"").trim(),
    domicilio_fiscal:String(row.fiscal_address||"").trim(),
    localidad_fiscal:String(row.fiscal_city||"").trim(),
    provincia_fiscal:provinceForCity(row.fiscal_city),
    codigo_postal:"",
    email_facturacion:""
  };
}

function validatePdfRow(row){
  const problems=[];
  if(!row.code||!row.name)problems.push("Faltan código o nombre");
  if(!row.condition)problems.push("Condición de IVA no reconocida");
  if(row.tax_id&&row.tax_id.length===11&&!validCuit(row.tax_id))problems.push("CUIT inválido");
  if(row.tax_id&&row.tax_id.length!==11&&(row.tax_id.length<7||row.tax_id.length>9))problems.push("Documento inválido");
  if(row.condition&&row.condition!=="CONSUMIDOR_FINAL"&&!row.tax_id)problems.push("Falta CUIT o documento");
  return problems;
}

function joinColumn(items,low,high){
  return items.filter(item=>item.x>=low&&item.x<high&&item.text).sort((a,b)=>a.x-b.x).map(item=>item.text).join(" ").replace(/\s+/g," ").trim();
}

export async function parseClientPdf(file,onProgress=()=>{}){
  if(!file)throw new Error("Elegí un archivo PDF.");
  if(file.size>20*1024*1024)throw new Error("El PDF supera el límite de 20 MB.");
  if(!Uint8Array.prototype.toHex)Object.defineProperty(Uint8Array.prototype,"toHex",{value:function(){return Array.from(this,value=>value.toString(16).padStart(2,"0")).join("")},configurable:true});
  const bytes=new Uint8Array(await file.arrayBuffer());
  const pdfjs=await import("./vendor/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc=new URL("./vendor/pdf.worker.min.mjs",import.meta.url).href;
  const documentTask=pdfjs.getDocument({data:bytes}),pdf=await documentTask.promise,rows=[];
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
    onProgress(pageNumber,pdf.numPages);
    const page=await pdf.getPage(pageNumber),content=await page.getTextContent();
    const items=content.items.map(item=>({text:String(item.str||"").trim(),x:Number(item.transform?.[4]||0),y:Number(item.transform?.[5]||0)})).filter(item=>item.text);
    const codes=items.filter(item=>item.x<50&&/^\d+$/.test(item.text)&&item.y>35);
    codes.forEach(codeItem=>{
      const line=items.filter(item=>Math.abs(item.y-codeItem.y)<=3.2);
      const code=joinColumn(line,0,50),name=joinColumn(line,50,210),addressFull=joinColumn(line,210,370),taxId=digits(joinColumn(line,370,450));
      const conditionRaw=normalizeImportText(joinColumn(line,450,600)),condition=VAT_CONDITIONS[conditionRaw]||"";
      const separator=addressFull.lastIndexOf("-");
      let fiscalAddress=separator>=0?addressFull.slice(0,separator).trim():addressFull.trim();
      const fiscalCity=canonicalCity(separator>=0?addressFull.slice(separator+1):"");
      if(fiscalAddress==="-")fiscalAddress="";
      const row={page:pageNumber,code,name,address_full:addressFull,fiscal_address:fiscalAddress,fiscal_city:fiscalCity,tax_id:taxId,condition_raw:conditionRaw,condition};
      row.fiscal=fiscalFromRow(row);row.problems=validatePdfRow(row);rows.push(row);
    });
  }
  const ids=new Set();
  rows.forEach(row=>{if(ids.has(row.code))throw new Error(`El PDF repite el código ${row.code}. No se importó nada.`);ids.add(row.code)});
  if(!rows.length)throw new Error("No encontré la tabla de clientes. Este importador admite el formato del listado de Ale.");
  const hash=globalThis.crypto?.subtle?Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(value=>value.toString(16).padStart(2,"0")).join(""):`${file.name}-${file.size}-${file.lastModified}`;
  return {rows,fileName:file.name,pages:pdf.numPages,hash};
}

function fiscalSnapshot(client={}){return Object.fromEntries(FISCAL_FIELDS.map(field=>[field,String(client[field]??"").trim()]))}

function fiscalConflicts(current,incoming){
  return FISCAL_FIELDS.filter(field=>current[field]&&incoming[field]&&normalizeImportText(current[field])!==normalizeImportText(incoming[field]));
}

function targetItem(row,target,reason,extra={}){
  return {key:`${row.page}-${row.code}`,source:row,target:target||null,reason,...extra};
}

export function analyzeClientImport(pdfRows,clients){
  const current=Array.isArray(clients)?clients:[],byId=new Map(),byName=new Map();
  current.forEach(client=>{
    const id=String(client.id||"").trim(),name=normalizeImportText(client.nombre);
    if(id){const group=byId.get(id)||[];group.push(client);byId.set(id,group)}
    if(name){const group=byName.get(name)||[];group.push(client);byName.set(name,group)}
  });
  const taxGroups=new Map();
  pdfRows.forEach(row=>{if(row.tax_id){const group=taxGroups.get(row.tax_id)||[];group.push(row);taxGroups.set(row.tax_id,group)}});
  const repeatedTaxIds=new Set([...taxGroups].filter(([,group])=>group.length>1).map(([taxId])=>taxId));
  const safe=[],review=[];
  pdfRows.forEach(row=>{
    const idMatches=byId.get(row.code)||[],nameMatches=byName.get(normalizeImportText(row.name))||[];
    if(idMatches.length!==1){
      const reason=idMatches.length>1?"El ID está repetido en D9":nameMatches.length===1?"Coincide por nombre, pero tiene otro ID":"No existe una ficha inequívoca en D9";
      review.push(targetItem(row,nameMatches.length===1?nameMatches[0]:null,reason,{canCreate:idMatches.length===0&&!byId.has(row.code)}));return;
    }
    const target=idMatches[0];
    if(normalizeImportText(target.nombre)!==normalizeImportText(row.name)){
      review.push(targetItem(row,target,"El código coincide, pero el nombre es diferente",{canCreate:false}));return;
    }
    if(row.problems.length){review.push(targetItem(row,target,row.problems.join(" · "),{canCreate:false}));return;}
    const conflicts=fiscalConflicts(fiscalSnapshot(target),row.fiscal);
    if(conflicts.length){review.push(targetItem(row,target,`D9 ya tiene datos fiscales diferentes: ${conflicts.join(", ")}`,{canCreate:false}));return;}
    if(row.tax_id&&repeatedTaxIds.has(row.tax_id)){
      review.push(targetItem(row,target,"El CUIT aparece en más de un cliente del PDF",{canCreate:false,sharedTaxId:true}));return;
    }
    safe.push(targetItem(row,target,"Código y nombre coinciden",{canCreate:false}));
  });
  return {safe,review,total:pdfRows.length,repeatedTaxIds:[...repeatedTaxIds]};
}

export function importUpdatePayload(item,decision){
  const target=decision?.target||item.target;
  if(!target)throw new Error(`Elegí la ficha D9 para ${item.source.name}.`);
  return {
    cliente_id:String(target.id),expected_nombre:String(target.nombre||""),expected_fiscal:fiscalSnapshot(target),
    fiscal:item.source.fiscal,origen_codigo:item.source.code,origen_nombre:item.source.name,
    decision:item.reason==="Código y nombre coinciden"?"SEGURO":"REVISADO"
  };
}

export function importCreatePayload(item){
  const row=item.source;
  return {
    cliente:{id:row.code,nombre:row.name,telefono:"",direccion:row.fiscal_address,ciudad:row.fiscal_city,lista_precio:"lista_1",vendedor_id:"",vendedor:"",activo:"si",...row.fiscal},
    origen_codigo:row.code,origen_nombre:row.name,decision:"REVISADO_CREAR"
  };
}

export {FISCAL_FIELDS};
