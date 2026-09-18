"use strict";

/* Adaptación localizada de Lista de precios de D9 Pedidos v1.5.31. */
function ensurePriceListState(){
  if(typeof state.priceListSearch!=="string")state.priceListSearch="";
  if(typeof state.priceListCategory!=="string")state.priceListCategory="";
  if(!Array.isArray(state.priceListBrands))state.priceListBrands=[];
  if(typeof state.priceListKey!=="string")state.priceListKey="lista_1";
  if(typeof state.priceListOrigin!=="string")state.priceListOrigin="maestros";
}
function openPriceList(origin="maestros"){
  if(!isAdmin())return toast("Esta sección requiere permisos de administrador.","error");
  ensurePriceListState();state.priceListOrigin=origin==="reportes"?"reportes":"maestros";showView("lista-precios");
}
function closePriceList(){ensurePriceListState();showView(state.priceListOrigin||"maestros",{fromMainNavigation:state.priceListOrigin==="reportes"})}
function priceListProductsSource(){return (state.source.productos||[]).filter(p=>activeValue(p.activo??true)&&numeric(p.lista_1)>0)}
function priceListProductCode(p){return String(p?.id||p?.codigo||p?.cod||p?.sku||"").trim()}
function priceListCleanCategory(value){return String(value||"").replace(/^\s*\d+[\s\-._:]*/,"").trim()}
function priceListBrand(p){return String(p?.marca||p?.brand||"").trim()}
function priceListProductPrice(p){const selected=numeric(p?.[state.priceListKey]);return selected>0?selected:numeric(p?.lista_1)}
function priceListSortName(a,b){return String(a.nombre||"").localeCompare(String(b.nombre||""),"es",{sensitivity:"base",numeric:true})}
function priceListCategories(){
  const map=new Map();priceListProductsSource().forEach(p=>{const raw=String(p.categoria||"").trim();if(raw&&!map.has(normalize(raw)))map.set(normalize(raw),raw)});
  return [...map.values()].sort((a,b)=>priceListCleanCategory(a).localeCompare(priceListCleanCategory(b),"es",{sensitivity:"base",numeric:true}));
}
function priceListBrands(){
  const map=new Map();priceListProductsSource().forEach(p=>{const brand=priceListBrand(p);if(brand&&!map.has(normalize(brand)))map.set(normalize(brand),brand)});
  return [...map.values()].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base",numeric:true}));
}
function getPriceListFilteredProducts(){
  ensurePriceListState();const term=state.priceListSearch,cat=state.priceListCategory,brands=state.priceListBrands;
  return priceListProductsSource().filter(p=>matchesSearch([priceListProductCode(p),p.nombre],term)&&(!cat||String(p.categoria||"")===cat)&&(!brands.length||brands.includes(priceListBrand(p)))).sort((a,b)=>{
    const ca=priceListCleanCategory(a.categoria||"Sin categoría"),cb=priceListCleanCategory(b.categoria||"Sin categoría");
    return !cat&&ca!==cb?ca.localeCompare(cb,"es",{sensitivity:"base",numeric:true}):priceListSortName(a,b);
  });
}
function priceListSelectionLabel(){
  const parts=[priceListLabel(state.priceListKey)];
  if(state.priceListCategory)parts.push(priceListCleanCategory(state.priceListCategory));
  if(state.priceListBrands.length===1)parts.push(`Marca: ${state.priceListBrands[0]}`);
  else if(state.priceListBrands.length>1)parts.push(`Marcas: ${state.priceListBrands.join(", ")}`);
  if(state.priceListSearch.trim())parts.push(`Filtro: ${state.priceListSearch.trim().toUpperCase()}`);
  return parts.join(" · ");
}
function renderPriceList(){
  ensurePriceListState();
  const lists=priceLists().filter(x=>["lista_1","lista_2","lista_3"].includes(String(x.id)));
  if(!lists.some(x=>x.id===state.priceListKey))state.priceListKey=lists[0]?.id||"lista_1";
  const select=$("#priceListSelect");select.innerHTML=lists.map(x=>`<option value="${esc(x.id)}">${esc(x.nombre||priceListLabel(x.id))}</option>`).join("");select.value=state.priceListKey;
  $("#priceListSearch").value=state.priceListSearch;
  $("#priceListCategoryLabel").textContent=state.priceListCategory?priceListCleanCategory(state.priceListCategory):"Todas las categorías";
  $("#priceListBrandLabel").textContent=state.priceListBrands.length===0?"Todas las marcas":state.priceListBrands.length===1?state.priceListBrands[0]:`${state.priceListBrands.length} marcas seleccionadas`;
  renderPriceListCategoryOptions();renderPriceListBrandOptions();renderPriceListProducts();
}
function renderPriceListProducts(){
  const all=getPriceListFilteredProducts(),hasFilters=!!(state.priceListSearch||state.priceListCategory||state.priceListBrands.length),limit=hasFilters?500:200,rows=all.slice(0,limit),box=$("#priceListProducts");
  $("#priceListSummary").textContent=`${all.length} producto${all.length===1?"":"s"} · ${priceListSelectionLabel()}${all.length>limit?` · se muestran los primeros ${limit}`:""}`;
  box.className="price-list-products";
  box.innerHTML=rows.map(p=>`<article class="price-list-row"><div><strong>${esc(p.nombre||"Producto")}</strong><small>${esc([priceListProductCode(p)?`Cód. ${priceListProductCode(p)}`:"",priceListCleanCategory(p.categoria)||"Sin categoría",priceListBrand(p)||"Sin marca"].filter(Boolean).join(" · "))}</small></div><b>${money(priceListProductPrice(p))}</b></article>`).join("")||'<div class="empty">No encontré productos con precio válido para esos filtros.</div>';
}
function renderPriceListCategoryOptions(){
  $("#priceListCategoryOptions").innerHTML=`<button class="price-filter-option ${!state.priceListCategory?"selected":""}" type="button" data-price-category="">Todas las categorías</button>`+priceListCategories().map(cat=>`<button class="price-filter-option ${state.priceListCategory===cat?"selected":""}" type="button" data-price-category="${esc(cat)}">${esc(priceListCleanCategory(cat))}</button>`).join("");
}
function renderPriceListBrandOptions(){
  $("#priceListBrandOptions").innerHTML=`<button class="price-filter-option ${!state.priceListBrands.length?"selected":""}" type="button" data-price-brand="">Todas las marcas</button>`+priceListBrands().map(brand=>`<button class="price-filter-option ${state.priceListBrands.includes(brand)?"selected":""}" type="button" data-price-brand="${esc(brand)}">${state.priceListBrands.includes(brand)?"✓ ":""}${esc(brand)}</button>`).join("");
}
function togglePriceListBrand(brand){
  if(!brand)state.priceListBrands=[];
  else state.priceListBrands=state.priceListBrands.includes(brand)?state.priceListBrands.filter(x=>x!==brand):[...state.priceListBrands,brand];
  renderPriceListBrandOptions();
}

function pricePdfAscii(value){return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ñ/g,"n").replace(/Ñ/g,"N").replace(/[^\x20-\x7E]/g," ").replace(/\s+/g," ").trim()}
function pricePdfEsc(value){return pricePdfAscii(value).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)")}
function pricePdfText(text,x,y,size=9,font="F1"){return `BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pricePdfEsc(text)}) Tj ET\n`}
function pricePdfTextRight(text,right,y,size=9,font="F1"){const clean=pricePdfAscii(text);return pricePdfText(clean,right-clean.length*size*.48,y,size,font)}
function pricePdfLine(x1,y1,x2,y2){return `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`}
function pricePdfWrap(text,max){
  const words=pricePdfAscii(text).split(/\s+/).filter(Boolean),lines=[];let line="";
  words.forEach(word=>{if(!line)line=word;else if(`${line} ${word}`.length<=max)line+=` ${word}`;else{lines.push(line);line=word}});if(line)lines.push(line);return lines.length?lines:[""];
}
async function loadPriceListPdfLogo(){
  try{
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src="icons/logo_d9.png"});
    const make=(size,alpha,quality)=>{const canvas=document.createElement("canvas");canvas.width=canvas.height=size;const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,size,size);const scale=Math.min(size/image.width,size/image.height)*.92,w=image.width*scale,h=image.height*scale;ctx.globalAlpha=alpha;ctx.drawImage(image,(size-w)/2,(size-h)/2,w,h);const data=canvas.toDataURL("image/jpeg",quality).split(",")[1]||"";return atob(data)};
    return {data:make(160,1,.88),width:160,height:160,watermarkData:make(520,.08,.82),watermarkWidth:520,watermarkHeight:520};
  }catch(error){console.warn("No se pudo cargar el logo para el PDF",error);return null}
}
function buildPriceListPdfBlob(products,logoImage=null){
  const pageW=595.28,pageH=841.89,margin=36,topY=742,bottomY=54,xCode=42,xName=102,xPrice=552,pages=[];let page=[],y=topY,rowIndex=0;
  const generated=new Date(),generatedAt=generated.toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"}),sentBy=state.user?.nombre||state.user?.usuario||"D9",titleExtra=priceListSelectionLabel(),maxNameChars=54,rowLineH=9,rowMinH=14,rowPadTop=3,rowPadBottom=3,headerH=27,columnsH=15,pageBodyH=topY-bottomY;
  const newPage=()=>{if(page.length)pages.push(page);page=[];y=topY;rowIndex=0},remaining=()=>y-bottomY,ensureSpace=h=>{if(remaining()<h&&page.length)newPage()};
  const rowInfo=p=>{const lines=pricePdfWrap(p.nombre||"",maxNameChars).slice(0,3);return {lines,height:Math.max(rowMinH,lines.length*rowLineH+rowPadTop+rowPadBottom)}};
  const columns=()=>{page.push(`0.10 0.24 0.38 rg ${pricePdfText("Cod",xCode,y,8,"F2")}${pricePdfText("Articulo",xName,y,8,"F2")}${pricePdfTextRight("Precio final",xPrice,y,8,"F2")}0.70 0.78 0.84 RG ${pricePdfLine(margin,y-5,pageW-margin,y-5)}`);y-=columnsH};
  const categoryHeader=(cat,repeated=false)=>{ensureSpace(headerH+columnsH+rowMinH);const bar=y-18,label=`${priceListCleanCategory(cat||"Sin categoria").toUpperCase()}${repeated?" (CONT.)":""}`;page.push(`0.87 0.95 0.99 rg ${margin} ${bar.toFixed(2)} ${(pageW-margin*2).toFixed(2)} 18 re f\n0.10 0.45 0.78 rg ${margin} ${bar.toFixed(2)} 4 18 re f\n0.02 0.16 0.30 rg ${pricePdfText(label,xCode+8,y-13,10,"F2")}`);y-=headerH;columns();rowIndex=0};
  const addRow=p=>{const info=rowInfo(p);if(remaining()<info.height){newPage();return false}const bottom=y-info.height;if(rowIndex%2===0)page.push(`0.965 0.970 0.978 rg ${margin} ${bottom.toFixed(2)} ${(pageW-margin*2).toFixed(2)} ${info.height.toFixed(2)} re f\n`);const base=y-rowPadTop-8;page.push(`0 0 0 rg ${pricePdfText(priceListProductCode(p),xCode,base,8)}`);info.lines.forEach((line,i)=>page.push(pricePdfText(line,xName,base-i*rowLineH,8)));page.push(pricePdfTextRight(pricePdfAscii(money(priceListProductPrice(p))),xPrice,base,8,"F2"));page.push(`0.91 0.94 0.96 RG ${pricePdfLine(margin,bottom,pageW-margin,bottom)}`);y-=info.height;rowIndex++;return true};
  const groups=[];products.forEach(p=>{const cat=state.priceListCategory?priceListCleanCategory(state.priceListCategory):priceListCleanCategory(p.categoria||"Sin categoria");let group=groups.at(-1);if(!group||group.cat!==cat){group={cat,items:[]};groups.push(group)}group.items.push(p)});
  const height=group=>headerH+columnsH+group.items.reduce((sum,p)=>sum+rowInfo(p).height,0),pending=groups.filter(g=>g.items.length);
  const renderGroup=group=>{categoryHeader(group.cat);group.items.forEach(item=>{if(!addRow(item)){categoryHeader(group.cat,true);addRow(item)}})};
  while(pending.length){const group=pending[0],full=height(group),rem=remaining();if(!state.priceListCategory&&page.length&&full>rem){let best=-1,bestH=0;for(let i=1;i<pending.length;i++){const h=height(pending[i]);if(h<=pageBodyH&&h<=rem&&h>bestH){best=i;bestH=h}}if(best>0){renderGroup(pending.splice(best,1)[0]);continue}newPage();continue}if(page.length&&full>pageBodyH)newPage();pending.shift();renderGroup(group)}
  if(page.length)pages.push(page);if(!pages.length)pages.push([pricePdfText("Sin productos para listar.",margin,topY,10)]);
  const objects=[],object=content=>(objects.push(content),objects.length),catalogId=object("<< /Type /Catalog /Pages 2 0 R >>"),pageKids=[],pagesId=2;objects.push("");const font1Id=object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),font2Id=object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");let logoId=null,watermarkId=null;
  if(logoImage?.data)logoId=object(`<< /Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImage.data.length} >>\nstream\n${logoImage.data}\nendstream`);
  if(logoImage?.watermarkData)watermarkId=object(`<< /Type /XObject /Subtype /Image /Width ${logoImage.watermarkWidth} /Height ${logoImage.watermarkHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImage.watermarkData.length} >>\nstream\n${logoImage.watermarkData}\nendstream`);
  const header=(num,total)=>`0.95 0.98 1 rg 28 774 539 44 re f\n0.38 0.74 0.91 RG 28 774 539 44 re S\n${logoId?"q 34 0 0 34 42 782 cm /ImLogo Do Q\n":`0.10 0.45 0.78 rg 42 786 34 22 re f\n1 1 1 rg ${pricePdfText("D9",49,793,14,"F2")}`}0.02 0.16 0.30 rg ${pricePdfText("DISTRIBUIDORA D9",88,800,16,"F2")}0.25 0.38 0.48 rg ${pricePdfText(`Lista de precios - ${titleExtra}`,88,784,9)}${pricePdfTextRight(`Generada: ${generatedAt}`,552,802,8)}${pricePdfTextRight(`Enviada por: ${sentBy}`,552,788,8)}`;
  const watermark=()=>watermarkId?"q 330 0 0 330 132 250 cm /ImLogoW Do Q\n":`0.94 0.98 1 rg ${pricePdfText("D9",214,392,148,"F2")}0 0 0 rg `;
  const footer=(num,total)=>`0.70 0.78 0.84 RG ${pricePdfLine(margin,38,pageW-margin,38)}0.35 0.45 0.52 rg ${pricePdfText("Precios sujetos a modificacion sin previo aviso.",margin,24,7)}${pricePdfTextRight(`Pagina ${num} de ${total}`,pageW-margin,24,7)}`;
  pages.map((body,i)=>header(i+1,pages.length)+watermark()+body.join("")+footer(i+1,pages.length)).forEach(stream=>{const contentId=objects.length+2,xObjects=[logoId?`/ImLogo ${logoId} 0 R`:"",watermarkId?`/ImLogoW ${watermarkId} 0 R`:""].filter(Boolean).join(" "),pageId=object(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /ProcSet [/PDF /Text /ImageC] /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> ${xObjects?`/XObject << ${xObjects} >>`:""} >> /Contents ${contentId} 0 R >>`);pageKids.push(`${pageId} 0 R`);object(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)});
  objects[pagesId-1]=`<< /Type /Pages /Kids [${pageKids.join(" ")}] /Count ${pageKids.length} >>`;let pdf="%PDF-1.4\n% D9\n";const offsets=[0];objects.forEach((content,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${content}\nendobj\n`});const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<=objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,"0")} 00000 n \n`;pdf+=`trailer\n<< /Size ${objects.length+1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes=new Uint8Array(pdf.length);for(let i=0;i<pdf.length;i++)bytes[i]=pdf.charCodeAt(i)&255;return {blob:new Blob([bytes],{type:"application/pdf"}),filename:`D9-lista-precios-${generated.toISOString().slice(0,10)}.pdf`};
}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),15000)}
async function generatePriceListPdf(mode="download"){
  const products=getPriceListFilteredProducts();if(!products.length)return toast("No hay productos para generar el PDF.","error");
  try{toast("Armando PDF…");const result=buildPriceListPdfBlob(products,await loadPriceListPdfLogo());
    if(mode==="share"&&typeof File!=="undefined"){const file=new File([result.blob],result.filename,{type:"application/pdf"});if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({title:"Lista de precios D9",text:"Lista de precios actualizada de Distribuidora D9.",files:[file]});return toast("Lista lista para compartir.")}}
    downloadBlob(result.blob,result.filename);toast(mode==="share"?"PDF descargado. Abrí WhatsApp y adjuntalo desde Descargas.":"PDF descargado.");
  }catch(error){if(error?.name==="AbortError")return;console.error("No se pudo generar la lista de precios",error);toast("No se pudo generar el PDF.","error")}
}
function bindPriceListEvents(){
  ensurePriceListState();
  document.addEventListener("click",event=>{const open=event.target.closest("[data-price-list-open]");if(open)openPriceList(open.dataset.priceListOpen);const cat=event.target.closest("[data-price-category]");if(cat){state.priceListCategory=cat.dataset.priceCategory;$("#priceListCategoryDialog").close();renderPriceList()}const brand=event.target.closest("[data-price-brand]");if(brand)togglePriceListBrand(brand)});
  $("#btnBackPriceList").addEventListener("click",closePriceList);
  $("#priceListSearch").addEventListener("input",event=>{state.priceListSearch=event.target.value;renderPriceListProducts()});
  $("#priceListSelect").addEventListener("change",event=>{state.priceListKey=event.target.value;renderPriceListProducts()});
  $("#btnPriceListCategory").addEventListener("click",()=>$("#priceListCategoryDialog").showModal());
  $("#btnPriceListBrand").addEventListener("click",()=>$("#priceListBrandDialog").showModal());
  $("#btnApplyPriceListBrands").addEventListener("click",()=>{$("#priceListBrandDialog").close();renderPriceList()});
  $("#btnDownloadPriceListPdf").addEventListener("click",()=>generatePriceListPdf("download"));
  $("#btnSharePriceListPdf").addEventListener("click",()=>generatePriceListPdf("share"));
}
