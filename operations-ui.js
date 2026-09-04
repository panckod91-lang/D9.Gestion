"use strict";

// Presentation only. All mutations remain in the existing application/backend.
const operationsUI = {page:1, pageSize:25, fingerprint:"", trail:[], bound:false};
function docsToday(){
  const parts=new Intl.DateTimeFormat("en",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const value=type=>parts.find(p=>p.type===type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function docsRange(period,from="",to="",today=docsToday()){
  if(period==="all")return {from:"",to:""};
  if(period==="custom")return {from,to};
  const date=new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()-(period==="today"?0:Number(period)-1));
  return {from:date.toISOString().slice(0,10),to:today};
}
function docsClientKey(op){return op.cliente_id?`id:${op.cliente_id}`:`name:${normalize(op.cliente)}`}
function docsSellerKey(op){
  const info=operationSellerInfo(op);
  if(info.id==="__NO_COMMISSION__")return info.id;
  if(operationCommissionStatus(op)==="PENDIENTE"||(!info.id&&info.nombre==="Pendiente de definir"))return "__PENDING__";
  return info.id?`id:${info.id}`:`name:${normalize(info.nombre)}`;
}
function docsCreditLabel(op){return ({DEVOLUCION_PRODUCTOS:"Devolución",BONIFICACION_REMITO:"Bonificación",CREDITO_GENERAL:"Crédito general"})[op.credito_tipo]||"Nota de crédito"}
function docsReadFilters(){
  return {period:$("#operationsPeriod").value,from:$("#operationsFrom").value,to:$("#operationsTo").value,
    type:$("#operationsType").value,client:$("#operationsClient").value,seller:$("#operationsSeller").value,
    status:$("#operationsStatus").value,balance:$("#operationsBalance").value,query:$("#operationsSearch").value.trim()};
}
function docsFilterRows(operations,filter,today=docsToday()){
  const range=docsRange(filter.period,filter.from,filter.to,today);
  return operations.filter(op=>{
    const annul=isAnnulled(op.estado),date=String(op.fecha||"").slice(0,10),credit=String(op.tipo).toUpperCase()==="NOTA_CREDITO";
    if((range.from&&date<range.from)||(range.to&&date>range.to))return false;
    if(filter.type&&String(op.tipo).toUpperCase()!==filter.type)return false;
    if(filter.client&&docsClientKey(op)!==filter.client)return false;
    if(filter.seller&&docsSellerKey(op)!==filter.seller)return false;
    if(filter.status==="active"&&annul||filter.status==="annulled"&&!annul)return false;
    // NC and annulled documents do not represent a pending receivable.
    const withBalance=!annul&&!credit&&numeric(op.saldo)>.005;
    if(filter.balance==="with"&&!withBalance)return false;
    if(filter.balance==="without"&&(annul||credit||withBalance))return false;
    return matchesSearch([op.numero,formatOperationNumber(op.numero),op.tipo,op.cliente,op.origen_pedido_id,op.vendedor,operationSellerInfo(op).nombre],filter.query);
  }).sort((a,b)=>String(b.fecha||"").slice(0,10).localeCompare(String(a.fecha||"").slice(0,10))||String(b.created_at||"").localeCompare(String(a.created_at||""))||String(b.operacion_id).localeCompare(String(a.operacion_id)));
}
function docsFillOptions(selector,rows,emptyLabel){
  const select=$(selector),current=select.value;
  if(current&&!rows.some(row=>row.key===current))rows.push({key:current,label:select.selectedOptions[0]?.textContent||current});
  const html=`<option value="">${esc(emptyLabel)}</option>`+rows.map(row=>`<option value="${esc(row.key)}">${esc(row.label)}</option>`).join("");
  if(select.innerHTML!==html){select.innerHTML=html;select.value=current}
}
function docsHydrateClients(){
  const map=new Map(),selected=$("#operationsClient").value,q=$("#operationsClientSearch").value;
  // Keep distinct IDs even when names coincide; preserve historical/occasional identities.
  state.gestion.operaciones.forEach(op=>map.set(docsClientKey(op),{key:docsClientKey(op),name:op.cliente||"Sin nombre",id:op.cliente_id||"",historic:true}));
  [...state.source.clientes,...state.source.clientes_admin].forEach(c=>map.set(`id:${c.id}`,{key:`id:${c.id}`,name:c.nombre,id:c.id}));
  const rows=[...map.values()].filter(c=>c.key===selected||matchesSearch([c.name,c.id],q)).sort((a,b)=>a.name.localeCompare(b.name,"es")).map(c=>({key:c.key,label:`${c.name}${c.id?` · ${c.id}`:" · sin ID histórico"}`}));
  docsFillOptions("#operationsClient",rows,"Todos los clientes");
}
function docsHydrateSellers(){
  const map=new Map();
  sellers().forEach(s=>map.set(`id:${s.id}`,{key:`id:${s.id}`,label:s.nombre}));
  state.gestion.operaciones.forEach(op=>{const key=docsSellerKey(op);if(!key.startsWith("__"))map.set(key,{key,label:operationSellerInfo(op).nombre})});
  docsFillOptions("#operationsSeller",[
    {key:"__NO_COMMISSION__",label:"Venta directa / sin comisión"},{key:"__PENDING__",label:"Pendiente de definir"},
    ...[...map.values()].sort((a,b)=>a.label.localeCompare(b.label,"es"))
  ],"Todos los vendedores");
}
function docsPreset(name){
  const balance=name==="balance";
  $("#operationsPeriod").value=balance?"all":"30";
  $("#operationsStatus").value="active";$("#operationsBalance").value=balance?"with":"";
  ["#operationsType","#operationsSeller","#operationsClient","#operationsClientSearch","#operationsSearch","#operationsFrom","#operationsTo"].forEach(s=>$(s).value="");
  operationsUI.page=1;renderOperations();
}
function docsStatus(op){
  if(isAnnulled(op.estado))return '<span class="pill red">Anulado</span>';
  if(String(op.tipo).toUpperCase()==="NOTA_CREDITO")return '<span class="pill">Vigente · crédito</span>';
  return numeric(op.saldo)>.005?`<span class="pill amber">Saldo ${money(op.saldo)}</span>`:'<span class="pill green">Sin saldo pendiente</span>';
}
function docsLinkedCredits(op){return state.gestion.operaciones.filter(x=>String(x.referencia_operacion_id||"")===String(op.operacion_id)&&String(x.tipo).toUpperCase()==="NOTA_CREDITO")}
function docsRow(op){
  const credit=String(op.tipo).toUpperCase()==="NOTA_CREDITO",seller=operationSellerInfo(op),linked=docsLinkedCredits(op),id=esc(op.operacion_id);
  const relation=op.referencia_numero?`Sobre ${formatOperationNumber(op.referencia_numero)}`:linked.length?`${linked.length} NC vinculada${linked.length===1?"":"s"}`:op.origen_pedido_id?"Desde pedido":"Carga manual";
  return `<article class="docs-row ${isAnnulled(op.estado)?"docs-annulled":""}">
    <div class="docs-identity"><small>${esc(operationTypeLabel(op.tipo))}</small><strong>${esc(formatOperationNumber(op.numero))}</strong>${credit?`<span class="docs-credit-kind">${esc(docsCreditLabel(op))}</span>`:""}</div>
    <div class="docs-customer"><strong>${esc(op.cliente||"Sin cliente")}</strong><small>${formatDate(op.fecha)} · ${esc(seller.nombre)}</small><small class="docs-relation">${esc(relation)}</small></div>
    <div class="docs-amount"><strong class="${credit?"negative":""}">${credit?"− ":""}${money(op.total)}</strong>${docsStatus(op)}</div>
    <div class="docs-row-actions"><button type="button" class="mini-btn" data-operation-detail="${id}">Ver</button><button type="button" class="mini-btn primary" data-operation-print="${id}">Imprimir</button>${docsActions(op).length?`<button type="button" class="mini-btn" data-doc-more="${id}">Más acciones</button>`:""}</div>
  </article>`;
}
function renderOperationsUI(){
  docsHydrateClients();docsHydrateSellers();
  const f=docsReadFilters(),fingerprint=JSON.stringify(f);
  if(fingerprint!==operationsUI.fingerprint){operationsUI.page=1;operationsUI.fingerprint=fingerprint}
  const range=docsRange(f.period,f.from,f.to),invalid=f.period==="custom"&&(!f.from||!f.to||f.from>f.to);
  $("#operationsDates").classList.toggle("hidden",f.period!=="custom");
  const activeCount=[f.period!=="all",!!f.type,!!f.client,!!f.seller,f.status!=="all",!!f.balance].filter(Boolean).length;
  $("#operationsFiltersLabel").textContent=`Filtros · ${activeCount} activos`;
  const labels=[f.period==="all"?"Todo el historial":invalid?"Período personalizado: completá fechas válidas":`${formatDate(range.from)} al ${formatDate(range.to)}`];
  ["#operationsType","#operationsStatus","#operationsBalance","#operationsClient","#operationsSeller"].forEach(s=>{const el=$(s);if(el.value)labels.push(el.selectedOptions[0]?.textContent||"")});
  if(f.balance)labels.push("Saldo: sólo comprobantes de venta vigentes; excluye NC y anulados");
  $("#operationsScope").textContent=labels.join(" · ");
  const clean=!f.query&&!f.type&&!f.client&&!f.seller&&f.status==="active";
  $$("[data-doc-preset]").forEach(b=>{const active=clean&&(b.dataset.docPreset==="balance"?f.period==="all"&&f.balance==="with":f.period==="30"&&!f.balance);b.classList.toggle("primary",active);b.setAttribute("aria-pressed",String(active))});
  const rows=invalid?[]:docsFilterRows(state.gestion.operaciones,f),pages=Math.max(1,Math.ceil(rows.length/operationsUI.pageSize));
  operationsUI.page=Math.min(operationsUI.page,pages);
  const offset=(operationsUI.page-1)*operationsUI.pageSize;
  $("#operationsList").className="docs-list";
  $("#operationsList").innerHTML=rows.length?rows.slice(offset,offset+operationsUI.pageSize).map(docsRow).join(""):`<div class="empty">${invalid?"Completá el período: Desde debe ser anterior o igual a Hasta.":state.gestion.operaciones.length?"Sin resultados para estos filtros.":"Todavía no hay comprobantes."}</div>`;
  $("#operationsSummary").textContent=rows.length?`${offset+1}–${Math.min(offset+operationsUI.pageSize,rows.length)} de ${rows.length} · Página ${operationsUI.page} de ${pages}`:"0 resultados";
  $("#operationsPrev").disabled=operationsUI.page<=1;$("#operationsNext").disabled=operationsUI.page>=pages;
  $("#operationsExpandSearch").classList.toggle("hidden",invalid||rows.length>0||!f.query||f.period==="all"||!state.gestion.operaciones.length);
}

function docsClosed(op){return (state.gestion.comisiones_cierres||[]).some(c=>String(c.estado).toUpperCase()==="CERRADO"&&String(c.desde).slice(0,10)<=String(op.fecha).slice(0,10)&&String(c.hasta).slice(0,10)>=String(op.fecha).slice(0,10))}
function docsActions(op){
  if(isAnnulled(op.estado))return [];
  const type=String(op.tipo).toUpperCase(),remito=type==="REMITO",actions=[],linked=docsLinkedCredits(op).filter(x=>!isAnnulled(x.estado));
  const remaining=numeric(op.total)-linked.reduce((sum,x)=>sum+numeric(x.total),0);
  if(remito&&canIssueDocuments()){
    const quantities=creditedQuantities(op.operacion_id),items=operationItems(op.operacion_id);
    const available=items.some(item=>numeric(item.cantidad)-numeric(quantities[String(item.producto_id)])>.0001);
    actions.push({key:"return",label:"Devolver productos",reason:remaining<=.005?"El importe del remito ya fue acreditado por completo.":!available?"No quedan cantidades disponibles para devolver.":""});
  }
  if(remito&&isAdmin()){
    actions.push({key:"bonus",label:"Bonificar",reason:remaining<=.005?"El importe del remito ya fue acreditado por completo.":""});
    if(operationCommissionStatus(op)==="PENDIENTE")actions.push({key:"commission",label:"Definir comisión",reason:docsClosed(op)?"El comprobante pertenece a un período de comisiones cerrado.":""});
  }
  if(isAdmin())actions.push({key:"annul",label:"Anular",danger:true,reason:["REMITO","NOTA_CREDITO"].includes(type)&&docsClosed(op)?"El período de comisiones está cerrado. La corrección debe emitirse en un período abierto.":remito&&linked.length?"El remito tiene notas de crédito vigentes. Revisalas antes de anular la venta completa.":""});
  return actions;
}
function docsActionsHtml(op){
  return docsActions(op).map(action=>`<div class="docs-action ${action.danger?"docs-danger-action":""}"><button type="button" class="btn ${action.danger?"danger":"secondary"}" data-doc-action="${action.key}" data-doc-id="${esc(op.operacion_id)}" ${action.reason?'disabled aria-disabled="true"':""}>${esc(action.label)}</button>${action.reason?`<small>${esc(action.reason)}</small>`:""}</div>`).join("");
}
function docsRelationsHtml(op){
  const links=[];
  if(op.referencia_operacion_id){
    const parent=state.gestion.operaciones.find(x=>String(x.operacion_id)===String(op.referencia_operacion_id));
    links.push(parent?`<button type="button" class="mini-btn" data-doc-related="${esc(parent.operacion_id)}">Remito original: ${esc(formatOperationNumber(parent.numero))}${isAnnulled(parent.estado)?" · Anulado":""}</button>`:`<p>Remito original: ${esc(op.referencia_numero||op.referencia_operacion_id)} · no disponible en los datos cargados.</p>`);
  }
  docsLinkedCredits(op).forEach(nc=>links.push(`<button type="button" class="mini-btn" data-doc-related="${esc(nc.operacion_id)}">${esc(formatOperationNumber(nc.numero))} · ${esc(docsCreditLabel(nc))} · ${money(nc.total)}${isAnnulled(nc.estado)?" · Anulada":""}</button>`));
  return links.length?`<section class="docs-relations"><h3>Documentos relacionados</h3>${links.join("")}</section>`:"";
}
function showOperationsDetail(id,autoPrint=false,actionsOnly=false,related=false){
  const op=state.gestion.operaciones.find(x=>String(x.operacion_id)===String(id));if(!op)return toast("El comprobante no está disponible en los datos cargados.","error");
  if(!related)operationsUI.trail=[];
  operationsUI.trail.push(String(id));
  const credit=String(op.tipo).toUpperCase()==="NOTA_CREDITO",seller=operationSellerInfo(op);
  const fields=[["Número",`${operationTypeLabel(op.tipo)} ${formatOperationNumber(op.numero)}`],["Cliente",op.cliente],["Fecha",formatDate(op.fecha)],["Vendedor / comisión",seller.nombre],["Estado",op.estado],["Total",`${credit?"− ":""}${money(op.total)}`]];
  if(credit){fields.push(["Tipo de crédito",docsCreditLabel(op)]);if(op.credito_concepto)fields.push(["Motivo",op.credito_concepto])}
  else if(!isAnnulled(op.estado))fields.push(["Saldo pendiente del comprobante",money(op.saldo)]);
  if(op.origen_pedido_id)fields.push(["Pedido de origen",op.origen_pedido_id]);
  const back=operationsUI.trail.length>1?'<button type="button" class="mini-btn docs-back" data-doc-back>← Volver al comprobante anterior</button>':"";
  const body=back+detailHeader(fields)+(actionsOnly?"":itemsTable(operationItems(id)))+(op.observaciones?`<p>${esc(op.observaciones)}</p>`:"")+docsRelationsHtml(op);
  const actions=`<button type="button" class="btn primary" data-operation-print="${esc(id)}">Imprimir media A4</button>${docsActionsHtml(op)}`;
  $("#detailTitle").textContent=`${actionsOnly?"Acciones · ":""}${formatOperationNumber(op.numero)}`;
  $("#detailBody").innerHTML=body;$("#detailActions").innerHTML=actions;
  $("#detailDialog").classList.add("docs-detail");
  if(!$("#detailDialog").open)$("#detailDialog").showModal();
  $("#detailDialog").scrollTop=0;
  if(autoPrint)setTimeout(()=>printOperation(id),250);
}
async function runDocsAction(id,key){
  const op=state.gestion.operaciones.find(x=>String(x.operacion_id)===String(id));if(!op)return;
  const action=docsActions(op).find(a=>a.key===key);if(!action)return toast("Esta acción no está disponible para tu sesión.","error");
  if(action.reason)return toast(action.reason,"error");
  if(key==="annul"){
    await annulOperation(id);
    if($("#detailDialog").open)showOperationsDetail(id,false,false);
    return;
  }
  $("#detailDialog").close();
  if(key==="return")openCreditNote(id);
  if(key==="bonus")openFinancialCredit(id);
  if(key==="commission")openCommissionResolution(id);
}

function initOperationsUI(){
  if(operationsUI.bound)return;operationsUI.bound=true;
  $("#detailDialog").addEventListener("close",()=>{if(!$("#detailDialog").open)$("#detailDialog").classList.remove("docs-detail")});
  $("#operationsFilters").open=window.matchMedia("(min-width: 761px)").matches;
  ["#operationsPeriod","#operationsFrom","#operationsTo","#operationsSeller","#operationsClient","#operationsBalance"].forEach(s=>$(s).addEventListener("change",renderOperations));
  $("#operationsClientSearch").addEventListener("input",docsHydrateClients);
  $("#operationsPeriod").addEventListener("change",()=>{if($("#operationsPeriod").value==="custom"&&!$("#operationsFrom").value){const range=docsRange("30");$("#operationsFrom").value=range.from;$("#operationsTo").value=range.to;renderOperations()}});
  $("#btnOperationsAllHistory").addEventListener("click",()=>{$("#operationsPeriod").value="all";renderOperations()});
  [["#operationsPrev",-1],["#operationsNext",1]].forEach(([s,delta])=>$(s).addEventListener("click",()=>{operationsUI.page+=delta;renderOperations();$("#view-operaciones").scrollIntoView({block:"start"})}));
  document.addEventListener("click",event=>{
    const preset=event.target.closest("[data-doc-preset]");if(preset)docsPreset(preset.dataset.docPreset);
    const more=event.target.closest("[data-doc-more]");if(more)showOperationsDetail(more.dataset.docMore,false,true);
    const related=event.target.closest("[data-doc-related]");if(related)showOperationsDetail(related.dataset.docRelated,false,false,true);
    if(event.target.closest("[data-doc-back]")){operationsUI.trail.pop();const previous=operationsUI.trail.pop();if(previous)showOperationsDetail(previous,false,false,true)}
    const action=event.target.closest("[data-doc-action]");if(action)runDocsAction(action.dataset.docId,action.dataset.docAction);
  });
}
