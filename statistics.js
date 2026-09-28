"use strict";
// Estadísticas de lectura: las respuestas ya están autorizadas y segregadas por ámbito en Gestión.
const statisticsD9={source:"pedidos",cacheKey:"",orders:[],sales:[],loaded:false,loading:null,generation:0,loadedAt:""};
function statisticsDayD9(value){
  const text=String(value||"").trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(text))return text.slice(0,10);
  const m=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m?`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`:"";
}
function statisticsPeriodD9(period,today){
  if(period==="today")return {from:today,to:today,label:"Hoy"};
  if(period==="7days"){
    const date=new Date(today+"T12:00:00Z");date.setUTCDate(date.getUTCDate()-6);
    return {from:date.toISOString().slice(0,10),to:today,label:"Últimos 7 días"};
  }
  if(period==="month")return {from:today.slice(0,7)+"-01",to:today,label:"Mes actual"};
  if(period==="year")return {from:today.slice(0,4)+"-01-01",to:today,label:"Año actual"};
  return {from:"",to:"",label:"Todo el historial"};
}
function statisticsAggregateD9(rows,source,period,today){
  const range=statisticsPeriodD9(period,today),rankProducts=new Map(),rankSellers=new Map(),rankClients=new Map(),timeline=new Map();
  let count=0,lines=0,total=0,annulled=0,undated=0;
  const add=(map,key,label,amount,quantity=0)=>{
    key=String(key||label||"Sin dato");const entry=map.get(key)||{label:label||"Sin dato",amount:0,quantity:0,count:0};
    entry.amount+=amount;entry.quantity+=quantity;entry.count++;map.set(key,entry);
  };
  for(const row of rows||[]){
    const day=statisticsDayD9(row.fecha_iso||row.fecha);
    if(range.from&&(!day||day<range.from||day>range.to))continue;
    if(source==="pedidos"&&isAnnulled(row.estado)){annulled++;continue;}
    const amount=source==="pedidos"?orderTotal(row):numeric(row.total_venta);
    const items=Array.isArray(row.items)?row.items:[];
    count++;total+=amount;lines+=items.length;
    if(day){const key=period==="today"||period==="7days"||period==="month"?day:day.slice(0,7);const bucket=timeline.get(key)||{amount:0,count:0};bucket.amount+=amount;bucket.count++;timeline.set(key,bucket)}else undated++;
    const sellerId=source==="pedidos"?row.vendedor_id:row.usuario_id;
    const sellerName=source==="pedidos"?row.vendedor:row.usuario;
    add(rankSellers,sellerId||sellerName,sellerName||"Sin vendedor",amount);
    add(rankClients,row.cliente_id||`nombre:${normalize(row.cliente)}`,row.cliente||"Sin cliente",amount);
    for(const item of items){
      const productName=item.nombre||"Sin descripción",quantity=numeric(item.cantidad);
      const lineAmount=item.subtotal!==undefined&&item.subtotal!==""?numeric(item.subtotal):quantity*numeric(source==="pedidos"?item.precio:item.precio_unitario);
      add(rankProducts,item.id_producto||`nombre:${normalize(productName)}`,productName,lineAmount,quantity);
    }
  }
  const sorted=(map,field)=>[...map.values()].sort((a,b)=>b[field]-a[field]||a.label.localeCompare(b.label,"es")).slice(0,8);
  return {source,range,count,lines,total,average:count?total/count:0,annulled,undated,productsAmount:sorted(rankProducts,"amount"),productsQuantity:sorted(rankProducts,"quantity"),sellers:sorted(rankSellers,"amount"),clients:sorted(rankClients,"amount"),timeline};
}
function statisticsTimelineD9(report,period,today){
  const points=[];
  if(period==="today"||period==="7days"||period==="month"){
    let day=report.range.from;
    while(day&&day<=today){points.push(day);const date=new Date(day+"T12:00:00Z");date.setUTCDate(date.getUTCDate()+1);day=date.toISOString().slice(0,10)}
  }else if(period==="year"){
    for(let month=1;month<=Number(today.slice(5,7));month++)points.push(`${today.slice(0,4)}-${String(month).padStart(2,"0")}`);
  }else points.push(...[...report.timeline.keys()].sort());
  return points.map(key=>({key,...(report.timeline.get(key)||{amount:0,count:0})}));
}
function statisticsRankHtmlD9(title,rows,field){
  const maximum=Math.max(0,...rows.map(row=>row[field]));
  return `<section class="statistics-rank"><h4>${esc(title)}</h4>${rows.length?rows.map((row,index)=>`<div class="statistics-rank-row"><span class="statistics-rank-label"><b>${index+1}.</b> ${esc(row.label)}</span><strong>${field==="quantity"?`${number(row.quantity)} cantidad`:money(row.amount)}</strong><span class="statistics-rank-bar" style="--bar:${maximum?Math.max(2,Math.round(row[field]/maximum*100)):0}%"></span></div>`).join(""):'<p class="empty">Sin datos en este período.</p>'}</section>`;
}
function statisticsRenderD9(){
  if(!statisticsD9.loaded||statisticsD9.cacheKey!==statisticsScopeKeyD9())return;
  const source=statisticsD9.source,period=$("#statsPeriod").value,today=todayISO();
  const report=statisticsAggregateD9(source==="pedidos"?statisticsD9.orders:statisticsD9.sales,source,period,today);
  const sourceName=source==="pedidos"?"PEDIDOS":"VENTAS DIRECTAS",evolution=statisticsTimelineD9(report,period,today),maximum=Math.max(0,...evolution.map(point=>point.amount));
  $$("[data-stats-source]").forEach(button=>button.classList.toggle("active",button.dataset.statsSource===source));
  $("#statisticsStatus").textContent=`${sourceName} · ${report.range.label} · ${statisticsD9.loadedAt}. Sólo ${state.testMode?"TEST":"REAL"}. Fuentes separadas; importes no sumados.${report.undated?` ${report.undated} registro(s) sin fecha válida se incluyen sólo en Todo y no en la evolución.`:""}`;
  $("#statisticsContent").classList.remove("hidden");
  $("#statisticsContent").innerHTML=`<div class="statistics-source-heading"><strong>${sourceName}</strong><span>${state.testMode?"🧪 Ámbito TEST":"Ámbito REAL"}</span></div>
    <div class="statistics-summary"><article><small>Importe de ${source==="pedidos"?"pedidos":"ventas directas"}</small><strong>${money(report.total)}</strong></article><article><small>${source==="pedidos"?"Pedidos":"Ventas directas"}</small><strong>${number(report.count)}</strong></article><article><small>Ticket promedio</small><strong>${money(report.average)}</strong></article><article><small>Líneas cargadas</small><strong>${number(report.lines)}</strong></article>${source==="pedidos"?`<article><small>Anulados excluidos</small><strong>${number(report.annulled)}</strong></article>`:""}</div>
    <section class="statistics-evolution"><div class="statistics-section-head"><h4>Evolución de importes</h4><small>${period==="today"||period==="7days"||period==="month"?"Por día":"Por mes"}</small></div>${evolution.length?`<div class="statistics-evolution-list">${evolution.map(point=>`<div class="statistics-evolution-row"><span>${esc(point.key)}</span><div class="statistics-evolution-track"><i style="width:${maximum?Math.max(2,Math.round(point.amount/maximum*100)):0}%"></i></div><strong>${money(point.amount)}</strong><small>${point.count} ${source==="pedidos"?"pedido(s)":"venta(s)"}</small></div>`).join("")}</div>`:'<p class="empty">Sin actividad fechada en el período.</p>'}</section>
    <div class="statistics-rank-grid">${statisticsRankHtmlD9("Top productos por importe",report.productsAmount,"amount")}${statisticsRankHtmlD9("Top productos por cantidad registrada",report.productsQuantity,"quantity")}${statisticsRankHtmlD9("Top vendedores / usuarios",report.sellers,"amount")}${statisticsRankHtmlD9("Top clientes",report.clients,"amount")}</div>
    ${source==="pedidos"?'<p class="statistics-note">La cantidad de un Pedido puede indicar piezas o bultos pendientes de pesaje. No representa necesariamente kilos ni unidades físicas entregadas.</p>':'<p class="statistics-note">Ventas directas registradas; no se suman a Pedidos ni a comprobantes.</p>'}`;
}
function statisticsScopeKeyD9(){return `${state.user?.id||""}|${state.testMode?"TEST":"REAL"}`}
async function loadStatisticsD9(force=false){
  const key=statisticsScopeKeyD9();
  if(statisticsD9.cacheKey!==key){statisticsD9.cacheKey=key;statisticsD9.loaded=false;statisticsD9.orders=[];statisticsD9.sales=[];statisticsD9.loading=null;statisticsD9.generation++}
  if(statisticsD9.loaded&&!force){statisticsRenderD9();return}
  if(statisticsD9.loading)return statisticsD9.loading;
  const generation=++statisticsD9.generation,button=$("#btnRefreshStatistics"),hadData=statisticsD9.loaded;button.disabled=true;
  if(!hadData)$("#statisticsContent").classList.add("hidden");$("#statisticsStatus").textContent="Consultando historial de Pedidos y Ventas directas…";
  const task=(async()=>{
    try{
      const [orders,sales]=await Promise.all([apiRead("pedidos",{history:true}),apiRead("ventas",{history:true})]);
      if(key!==statisticsScopeKeyD9()||generation!==statisticsD9.generation)return;
      if(orders.range?.history!==true||sales.range?.history!==true)throw new Error("El backend no confirmó el historial completo. Actualizá el Apps Script de Gestión antes de usar Estadísticas.");
      statisticsD9.orders=orders.pedidos||[];statisticsD9.sales=sales.ventas||[];statisticsD9.loaded=true;
      statisticsD9.loadedAt=`Actualizado ${new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}`;
      statisticsRenderD9();
    }catch(error){if(key===statisticsScopeKeyD9()&&generation===statisticsD9.generation){if(hadData)statisticsRenderD9();$("#statisticsStatus").textContent=`No se pudo actualizar Estadísticas: ${error.message}${hadData?" · se conservan los datos de la consulta anterior.":""}`;toast(error.message,"error")}}
    finally{if(generation===statisticsD9.generation){statisticsD9.loading=null;button.disabled=false}}
  })();
  statisticsD9.loading=task;return task;
}
$$("[data-stats-source]").forEach(button=>button.addEventListener("click",()=>{statisticsD9.source=button.dataset.statsSource;$$("[data-stats-source]").forEach(item=>item.classList.toggle("active",item===button));statisticsRenderD9()}));
$("#statsPeriod").addEventListener("change",statisticsRenderD9);
$("#btnRefreshStatistics").addEventListener("click",()=>void loadStatisticsD9(true));
if(typeof module!=="undefined"&&module.exports)module.exports={statisticsDayD9,statisticsPeriodD9,statisticsAggregateD9,statisticsTimelineD9};
