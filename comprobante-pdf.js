"use strict";
function canShareOperationPdf(op){const status=String(op?.estado||"").toUpperCase();return !!op?.operacion_id&&!!op.numero&&["VIGENTE","CONFIRMADA","CONFIRMADO","ANULADA","ANULADO"].includes(status)&&Number.isFinite(Number(op.total))&&["REMITO","PROFORMA","NOTA_VENTA","NOTA_CREDITO"].includes(String(op.tipo).toUpperCase())&&operationItems(op.operacion_id).length>0&&operationItems(op.operacion_id).every(x=>Number.isFinite(Number(x.cantidad))&&Number.isFinite(Number(x.subtotal)))}
const VOUCHER_PDF_WIDTHS=[[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,556,222,556,333,1000,556,556,333,1000,667,333,1000,556,611,556,556,222,222,333,333,350,556,1000,333,1000,500,333,944,556,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,611,278,556,500,1000,556,556,333,1000,667,333,1000,611,611,611,611,278,278,500,500,350,556,1000,333,1000,556,333,944,611,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556]];
function voucherPdfByte(c){const n=c.charCodeAt(0),mapped={8364:128,8230:133,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,8482:153};if(n<=255)return n;if(mapped[n])return mapped[n];throw new Error("El comprobante contiene un carácter que este PDF no puede representar ("+c+"). Usá Imprimir / Guardar PDF para conservarlo.");}
function voucherPdfWidth(value,size=8,bold=false){return [...String(value??"")].reduce((sum,c)=>sum+(VOUCHER_PDF_WIDTHS[bold?1:0][voucherPdfByte(c)-32]||556),0)*size/1000;}
function voucherPdfEscape(value){return String(value??"").replace(/[\r\n\t]/g," ").replace(/[\\()]/g,"\\$&").replace(/[^\x20-\x7e]/g,c=>"\\"+voucherPdfByte(c).toString(8).padStart(3,"0"));}
function voucherPdfText(value,x,y,size=8,bold=false){return `BT /${bold?"F2":"F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${voucherPdfEscape(value)}) Tj ET\n`}
function voucherPdfWrap(value,width,size=8,bold=false){
  const lines=[];
  String(value??"").split(/\r?\n/).forEach(paragraph=>{
    let line="";
    for(let word of paragraph.split(/\s+/).filter(Boolean)){
      while(voucherPdfWidth(word,size,bold)>width){
        if(line){lines.push(line);line="";}
        let take=1;while(take<word.length&&voucherPdfWidth(word.slice(0,take+1),size,bold)<=width)take++;
        lines.push(word.slice(0,take));word=word.slice(take);
      }
      const candidate=(line+" "+word).trim();if(voucherPdfWidth(candidate,size,bold)>width){lines.push(line);line=word;}else line=candidate;
    }
    if(line||!paragraph.trim())lines.push(line);
  });
  return lines.length?lines:[""];
}
function buildOperationPdf(data,annulled=false){
  const width=595.28,height=841.89,half=height/2,margin=28.35;
  const clientLines=voucherPdfWrap(data.client,365,13,true),headerHeight=Math.max(63,25+clientLines.length*14),bodyHeight=half-20-headerHeight-15-18-20;
  if(bodyHeight<90)throw new Error("El nombre del cliente ocupa demasiado espacio. Usá Imprimir para este comprobante.");
  const cellWidths=[33,62,173,69,43,135],cellOffsets=[3,40,105,282,354,400];
  const rows=[];
  data.items.forEach(item=>{
    const cells=[item.quantity,item.code,item.description,item.unit,item.discount,item.amount].map((value,i)=>voucherPdfWrap(value,cellWidths[i],7.4,i===2));
    const lineCount=Math.max(...cells.map(lines=>lines.length)),maxLines=Math.max(1,Math.floor((bodyHeight-6)/8.5));
    for(let start=0;start<lineCount;start+=maxLines){const part=cells.map(lines=>lines.slice(start,start+maxLines));rows.push({cells:part,height:Math.max(...part.map(lines=>lines.length))*8.5+6});}
  });
  const summaries=[["Subtotal",data.subtotal],...(data.discountPct?[["Descuento "+data.discountPct+"%","-"+data.discount]]:[]),["Total",data.total],...(data.paidValue>.005?[["Pagado",data.paid]]:[]),["Saldo",data.balance]];
  const footerLines=voucherPdfWrap("Condición de pago: "+data.condition,300,8,true).map(line=>({line,bold:true,size:8})).concat(data.notes?voucherPdfWrap("Observaciones: "+data.notes,300,7.4).map(line=>({line,bold:false,size:7.4})):[]);
  const chunks=[];let chunk={rows:[],used:0,footer:[],summary:false};
  rows.forEach(row=>{if(chunk.used+row.height>bodyHeight&&chunk.rows.length){chunks.push(chunk);chunk={rows:[],used:0,footer:[],summary:false};}chunk.rows.push(row);chunk.used+=row.height;});
  chunks.push(chunk);
  let cursor=0;
  while(cursor<footerLines.length){
    const remaining=bodyHeight-chunk.used,capacity=Math.max(0,Math.floor((remaining-18)/9)),left=footerLines.length-cursor;
    const finalHeight=Math.max(left*9,summaries.length*12)+18;
    if(finalHeight<=remaining){chunk.footer=footerLines.slice(cursor);chunk.summary=true;chunk.footerHeight=finalHeight;cursor=footerLines.length;break;}
    // Secciones extensas continúan en otra media A4, sin perder observaciones.
    if(capacity>0){const take=Math.min(capacity,Math.max(0,left-1));if(take){chunk.footer=footerLines.slice(cursor,cursor+take);chunk.footerHeight=take*9+18;cursor+=take;}}
    chunk={rows:[],used:0,footer:[],summary:false};chunks.push(chunk);
  }
  const streams=[];
  for(let page=0;page<Math.ceil(chunks.length/2);page++){
    let out="";
    for(let slot=0;slot<2;slot++){
      const part=page*2+slot;if(part>=chunks.length)continue;
      const block=chunks[part],top=height-slot*half-20,bottom=height-(slot+1)*half+18;
      const text=(value,x,y,size=8,bold=false)=>{out+=voucherPdfText(value,x,y,size,bold);};
      const right=(value,end,y,size=8,bold=false)=>text(value,end-voucherPdfWidth(value,size,bold),y,size,bold);
      out+="0.10 0.11 0.13 rg\n";
      text((data.test?"PRUEBA — SIN VALOR OPERATIVO · ":"")+data.kind+" · Comprobante interno",margin,top,6.8,true);
      clientLines.forEach((line,i)=>text(line,margin,top-17-i*14,13,true));
      right(data.number,width-margin,top-16,10.5,true);right(data.date,width-margin,top-30,7.5);right(`Parte ${part+1} de ${chunks.length}`,width-margin,top-41,6.5);
      if(annulled)right("ANULADO",width-margin,top-53,9,true);
      let y=top-headerHeight;
      out+=`0.18 0.22 0.25 rg ${margin} ${y-4} 538 16 re f\n1 1 1 rg\n`;
      ["Cant.","Código","Descripción","P. unitario","Dto.","Subtotal"].forEach((label,i)=>text(label,margin+cellOffsets[i],y+1,6.5,true));y-=15;
      block.rows.forEach((row,index)=>{
        if(index%2===0)out+=`0.93 0.945 0.95 rg ${margin} ${y-row.height+3} 538 ${row.height} re f\n`;
        out+="0.10 0.11 0.13 rg\n";
        row.cells.forEach((lines,i)=>lines.forEach((line,n)=>{const yy=y-5-n*8.5;if([0,3,4,5].includes(i))right(line,margin+cellOffsets[i]+cellWidths[i],yy,7.4);else text(line,margin+cellOffsets[i],yy,7.4,i===2);}));
        y-=row.height;
      });
      if(block.footer.length||block.summary){
        out+="0.10 0.11 0.13 rg\n";const fy=bottom+block.footerHeight;
        out+=`0.25 0.28 0.31 RG ${margin} ${fy+8} m ${width-margin} ${fy+8} l S\n`;
        block.footer.forEach((entry,i)=>text(entry.line,margin,fy-i*9,entry.size,entry.bold));
        if(block.summary)summaries.forEach(([label,value],i)=>{text(label,370,fy-i*12,8,label==="Total");right(value,width-margin,fy-i*12,8,label==="Total");});
      }
      out+="0.10 0.11 0.13 rg\n";text("Comprobante interno — no válido como factura.",margin,bottom,6);
      if(slot===0)out+=`0.68 0.71 0.73 RG [3 3] 0 d 0 ${half} m ${width} ${half} l S [] 0 d\n`;
    }
    streams.push(out);
  }
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"],kids=[];
  streams.forEach(stream=>{const pageId=objects.length+1,contentId=pageId+1;kids.push(`${pageId} 0 R`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);});
  objects[1]=`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  let pdf="%PDF-1.4\n",offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
  const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf],{type:"application/pdf"});
}
function operationPdfFile(id){const op=state.gestion.operaciones.find(x=>String(x.operacion_id)===String(id));if(!canShareOperationPdf(op))throw new Error("El comprobante no tiene un estado confirmado y consistente para generar el PDF.");const data=operationPrintableData(id),blob=buildOperationPdf(data,isAnnulled(op.estado)),name=(data.title.replace(/[^A-Za-z0-9_-]/g,"_")||"D9_comprobante")+".pdf";return {blob,name,title:data.title};}
function downloadOperationPdf(id){try{const result=operationPdfFile(id);downloadBlob(result.blob,result.name);toast("PDF descargado. Podés adjuntarlo desde Descargas.")}catch(error){toast(error.message||"No se pudo generar el PDF.","error")}}
function showOperationPdfFallback(result,cancelled){let el=document.getElementById("operationPdfFallback");if(!el){el=document.createElement("dialog");el.id="operationPdfFallback";el.className="dialog";document.body.appendChild(el)}el.innerHTML=`<div class="dialog-head"><h2>PDF listo</h2><button class="dialog-close" type="button" data-close="operationPdfFallback">×</button></div><p>${cancelled?"El selector se cerró o el dispositivo no encontró una aplicación para compartir este PDF.":"El sistema no pudo compartir el archivo."}</p><p>El PDF está listo como archivo. Descargalo y adjuntalo en WhatsApp, mail u otra aplicación.</p><button class="btn primary" type="button" id="operationPdfFallbackDownload">Descargar PDF</button>`;document.getElementById("operationPdfFallbackDownload").onclick=()=>{downloadBlob(result.blob,result.name);el.close();toast("PDF descargado.")};if(!el.open)el.showModal();}
async function shareOperationPdf(id){try{const result=operationPdfFile(id),file=typeof File!=="undefined"?new File([result.blob],result.name,{type:"application/pdf"}):null;let supported=false;try{supported=!!(file&&navigator.share&&navigator.canShare?.({files:[file]}))}catch{}if(supported){try{await navigator.share({files:[file],title:result.title});return}catch(error){showOperationPdfFallback(result,error?.name==="AbortError");return}}downloadBlob(result.blob,result.name);toast("PDF descargado. Podés adjuntarlo desde Descargas.")}catch(error){toast(error.message||"No se pudo generar el PDF.","error")}}
