"use strict";

const OFFERS_SHARE_DEFAULT=`🔥 ¡Ofertas D9!

Te compartimos nuestras ofertas vigentes.
Encontrá precios especiales en productos seleccionados.

📎 Mirá la lista completa en el archivo adjunto.

Distribuidora D9`;
let offersPdfResult=null;

function currentOffersForPdf(){
  return (state.source.ofertas||[]).filter(offer=>offerIsCurrent(offer)).sort((a,b)=>{
    const pa=offerProduct(a)||{},pb=offerProduct(b)||{},ca=priceListCleanCategory(pa.categoria||"Sin categoría"),cb=priceListCleanCategory(pb.categoria||"Sin categoría");
    return ca!==cb?ca.localeCompare(cb,"es",{sensitivity:"base",numeric:true}):String(pa.nombre||a.producto_id).localeCompare(String(pb.nombre||b.producto_id),"es",{sensitivity:"base",numeric:true});
  });
}
function offerPdfDate(value){
  const text=String(value||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return "";const [year,month,day]=text.split("-");return `${day}/${month}/${year}`;
}
function offerPdfValidity(offer){
  const from=offerPdfDate(offer.fecha_desde),to=offerPdfDate(offer.fecha_hasta);if(from&&to)return `Vigencia: ${from} al ${to}`;if(to)return `Válida hasta ${to}`;if(from)return `Vigente desde ${from}`;return "Oferta vigente";
}
function openOffersPdfGenerator(){
  const offers=currentOffersForPdf();if(!offers.length)return toast("No hay ofertas vigentes para generar.","error");
  $("#offersPdfIncludeNormal").checked=false;$("#offersPdfDialog").showModal();
}

function buildOffersPdfBlob(offers,includeNormal=false,logoImage=null){
  const pageW=595.28,pageH=841.89,margin=34,topY=744,bottomY=53,contentW=pageW-margin*2,priceW=130,textW=contentW-priceW-22,pages=[];let page=[],y=topY;
  const generated=new Date(),generatedAt=generated.toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"});
  const newPage=()=>{if(page.length)pages.push(page);page=[];y=topY},remaining=()=>y-bottomY;
  const rowInfo=entry=>{const product=offerProduct(entry)||{},nameLines=pricePdfWrap(product.nombre||"Producto no encontrado",includeNormal?47:54).slice(0,2),titleLines=entry.titulo?pricePdfWrap(entry.titulo,58).slice(0,1):[],height=45+(nameLines.length-1)*10+(titleLines.length?11:0);return {product,nameLines,titleLines,height}};
  offers.forEach(offer=>{
    const info=rowInfo(offer);if(remaining()<info.height&&page.length)newPage();
    const x=margin,rowBottom=y-info.height,category=priceListCleanCategory(info.product.categoria)||"Sin categoría",brand=String(info.product.marca||"").trim(),meta=[priceListProductCode(info.product)||offer.producto_id,category,brand].filter(Boolean).join(" - "),validity=offerPdfValidity(offer),offerPrice=pricePdfAscii(money(numeric(offer.precio_oferta))),normalPrice=pricePdfAscii(money(numeric(info.product.lista_1)));
    page.push(`0.985 0.988 0.992 rg ${x} ${rowBottom.toFixed(2)} ${contentW.toFixed(2)} ${info.height.toFixed(2)} re f\n`);
    page.push(`0.91 0.31 0.12 rg ${x} ${rowBottom.toFixed(2)} 5 ${info.height.toFixed(2)} re f\n`);
    page.push(`0.02 0.16 0.30 rg ${pricePdfText(meta,x+15,y-13,7.4,"F1")}`);
    info.nameLines.forEach((line,index)=>page.push(pricePdfText(line,x+15,y-26-index*10,10.5,"F2")));
    const detailY=y-27-(info.nameLines.length-1)*10;
    if(info.titleLines.length)page.push(`0.55 0.25 0.09 rg ${pricePdfText(info.titleLines[0],x+15,detailY-11,8,"F2")}`);
    page.push(`0.34 0.43 0.50 rg ${pricePdfText(validity,x+15,rowBottom+8,7.4,"F1")}`);
    if(includeNormal){page.push(`0.35 0.43 0.49 rg ${pricePdfText("Habitual",pageW-margin-priceW+5,y-13,7.2,"F1")}${pricePdfTextRight(normalPrice,pageW-margin-7,y-14,9,"F1")}`)}
    page.push(`0.88 0.22 0.08 rg ${pricePdfText("PRECIO OFERTA",pageW-margin-priceW+5,includeNormal?y-29:y-17,7.8,"F2")}${pricePdfTextRight(offerPrice,pageW-margin-7,includeNormal?y-44:y-34,15,"F2")}`);
    page.push(`0.88 0.90 0.92 RG ${pricePdfLine(x,rowBottom,pageW-margin,rowBottom)}`);y-=info.height+6;
  });
  if(page.length)pages.push(page);if(!pages.length)pages.push([pricePdfText("Sin ofertas vigentes.",margin,topY,10)]);

  const objects=[],object=content=>(objects.push(content),objects.length),catalogId=object("<< /Type /Catalog /Pages 2 0 R >>"),pageKids=[],pagesId=2;objects.push("");
  const font1Id=object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),font2Id=object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");let logoId=null,watermarkId=null;
  if(logoImage?.data)logoId=object(`<< /Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImage.data.length} >>\nstream\n${logoImage.data}\nendstream`);
  if(logoImage?.watermarkData)watermarkId=object(`<< /Type /XObject /Subtype /Image /Width ${logoImage.watermarkWidth} /Height ${logoImage.watermarkHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImage.watermarkData.length} >>\nstream\n${logoImage.watermarkData}\nendstream`);
  const header=()=>`0.99 0.96 0.93 rg 28 774 539 44 re f\n0.93 0.45 0.18 RG 28 774 539 44 re S\n${logoId?"q 34 0 0 34 42 782 cm /ImLogo Do Q\n":`0.90 0.23 0.08 rg 42 786 34 22 re f\n1 1 1 rg ${pricePdfText("D9",49,793,14,"F2")}`}0.02 0.16 0.30 rg ${pricePdfText("DISTRIBUIDORA D9",88,800,16,"F2")}0.88 0.22 0.08 rg ${pricePdfText("OFERTAS",88,783,11,"F2")}${pricePdfTextRight(`Generado: ${generatedAt}`,552,797,8)}${pricePdfTextRight(`${offers.length} ofertas vigentes`,552,784,8,"F2")}`;
  const watermark=()=>watermarkId?"q 330 0 0 330 132 250 cm /ImLogoW Do Q\n":`0.98 0.96 0.94 rg ${pricePdfText("D9",214,392,148,"F2")}0 0 0 rg `;
  const footer=(pageNumber,total)=>`0.82 0.58 0.46 RG ${pricePdfLine(margin,38,pageW-margin,38)}0.35 0.45 0.52 rg ${pricePdfText("Ofertas sujetas a disponibilidad y vigencia indicada.",margin,24,7)}${pricePdfTextRight(`Pagina ${pageNumber} de ${total}`,pageW-margin,24,7)}`;
  pages.map((body,index)=>header()+watermark()+body.join("")+footer(index+1,pages.length)).forEach(stream=>{const contentId=objects.length+2,xObjects=[logoId?`/ImLogo ${logoId} 0 R`:"",watermarkId?`/ImLogoW ${watermarkId} 0 R`:""].filter(Boolean).join(" "),pageId=object(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /ProcSet [/PDF /Text /ImageC] /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> ${xObjects?`/XObject << ${xObjects} >>`:""} >> /Contents ${contentId} 0 R >>`);pageKids.push(`${pageId} 0 R`);object(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)});
  objects[pagesId-1]=`<< /Type /Pages /Kids [${pageKids.join(" ")}] /Count ${pageKids.length} >>`;let pdf="%PDF-1.4\n% D9 Ofertas\n";const offsets=[0];objects.forEach((content,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${content}\nendobj\n`});const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let index=1;index<=objects.length;index++)pdf+=`${String(offsets[index]).padStart(10,"0")} 00000 n \n`;pdf+=`trailer\n<< /Size ${objects.length+1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes=new Uint8Array(pdf.length);for(let index=0;index<pdf.length;index++)bytes[index]=pdf.charCodeAt(index)&255;
  return {blob:new Blob([bytes],{type:"application/pdf"}),filename:`D9-ofertas-${generated.toISOString().slice(0,10)}.pdf`,count:offers.length,includeNormal};
}

async function generateOffersPdf(event){
  event.preventDefault();const offers=currentOffersForPdf();if(!offers.length){$("#offersPdfDialog").close();return toast("No hay ofertas vigentes para generar.","error")}
  const button=$("#btnGenerateOffersPdf");button.disabled=true;button.textContent="Generando…";
  try{offersPdfResult=buildOffersPdfBlob(offers,$("#offersPdfIncludeNormal").checked,await loadPriceListPdfLogo());$("#offersPdfReadyTitle").textContent=`${offersPdfResult.count} oferta${offersPdfResult.count===1?"":"s"} vigente${offersPdfResult.count===1?"":"s"}`;$("#offersPdfReadyDetail").textContent=offersPdfResult.includeNormal?"Incluye precio habitual y precio de oferta.":"Muestra solamente el precio de oferta.";$("#offersPdfDialog").close();$("#offersPdfActionsDialog").showModal()}
  catch(error){console.error("No se pudo generar el PDF de ofertas",error);toast("No se pudo generar el PDF de ofertas.","error")}
  finally{button.disabled=false;button.textContent="Generar PDF"}
}
function requireOffersPdf(){if(!offersPdfResult){toast("Primero generá la lista de ofertas.","error");return false}return true}
function openOffersPdfForPrint(){
  if(!requireOffersPdf())return;const url=URL.createObjectURL(offersPdfResult.blob),win=window.open(url,"_blank");if(!win){URL.revokeObjectURL(url);return toast("El navegador bloqueó la apertura del PDF.","error")}setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function downloadOffersPdf(){if(requireOffersPdf()){downloadBlob(offersPdfResult.blob,offersPdfResult.filename);toast("PDF de ofertas descargado.")}}
function openOffersShare(){if(!requireOffersPdf())return;$("#offersShareText").value=OFFERS_SHARE_DEFAULT;$("#offersShareDialog").showModal();setTimeout(()=>$("#offersShareText").focus(),40)}
async function shareOffersPdf(event){
  event.preventDefault();if(!requireOffersPdf())return;const textoEditado=document.getElementById("offersShareText").value,$form=event.currentTarget,button=$form.querySelector('button[type="submit"]');button.disabled=true;button.textContent="Compartiendo…";
  try{
    if(typeof File!=="undefined"){const pdfFile=new File([offersPdfResult.blob],offersPdfResult.filename,{type:"application/pdf"});if(navigator.canShare?.({files:[pdfFile]})&&navigator.share){const shareData={files:[pdfFile]};if(textoEditado!=="")shareData.text=textoEditado;await navigator.share(shareData);$("#offersShareDialog").close();toast("Archivo entregado al selector para compartir.");return}}
    downloadBlob(offersPdfResult.blob,offersPdfResult.filename);$("#offersShareDialog").close();toast("PDF descargado. Compartilo manualmente desde Descargas.");
  }catch(error){if(error?.name!=="AbortError"){console.error("No se pudo compartir el PDF de ofertas",error);toast("No se pudo abrir el mecanismo para compartir.","error")}}
  finally{button.disabled=false;button.textContent="Compartir"}
}
function bindOffersPdfEvents(){
  $("#btnOffersPdf").addEventListener("click",openOffersPdfGenerator);$("#offersPdfForm").addEventListener("submit",generateOffersPdf);$("#btnOpenOffersPdf").addEventListener("click",openOffersPdfForPrint);$("#btnDownloadOffersPdf").addEventListener("click",downloadOffersPdf);$("#btnShareOffersPdf").addEventListener("click",openOffersShare);$("#offersShareForm").addEventListener("submit",shareOffersPdf);
}
