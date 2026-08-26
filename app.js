"use strict";

const CONFIG = window.D9_GESTION_CONFIG || {};
const API_URL = String(CONFIG.API_URL || "").trim();
const STORAGE = { token:"d9g_token", user:"d9g_user" };
const DATA_CACHE = { db:"d9_gestion_local", store:"snapshots", key:"bootstrap", version:1 };
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const numeric = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let text=String(value??"").trim().replace(/\s/g,"").replace(/\$/g,"");
  if (text.includes(",")&&text.includes(".")) text=text.replace(/\./g,"").replace(",",".");
  else if (text.includes(",")) text=text.replace(",",".");
  const parsed=Number(text);
  return Number.isFinite(parsed)?parsed:0;
};
const money = value => new Intl.NumberFormat("es-AR", {style:"currency",currency:"ARS",minimumFractionDigits:2}).format(numeric(value));
const number = value => new Intl.NumberFormat("es-AR", {maximumFractionDigits:3}).format(numeric(value));
const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const todayISO = () => new Date().toLocaleDateString("en-CA", {timeZone:"America/Argentina/Buenos_Aires"});
const normalize = value => String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const matchesSearch = (values, query) => {
  const tokens=normalize(query).split(" ").filter(Boolean);
  if(!tokens.length)return true;
  const haystack=normalize(Array.isArray(values)?values.join(" "):values);
  return tokens.every(token=>haystack.includes(token));
};
const isAnnulled = value => normalize(value).includes("anulad");

const state = {
  token: localStorage.getItem(STORAGE.token) || "",
  user: JSON.parse(localStorage.getItem(STORAGE.user) || "null"),
  source: {clientes:[],productos:[],usuarios:[],pedidos:[]},
  gestion: {operaciones:[],items:[],recibos:[],pagos:[],cheques:[],movimientos:[],config:{}},
  currentView:"home",
  masterTab:"clients",
  draftItems:[],
  currentOrder:null,
  cacheLoaded:false
};

function openDataCache() {
  return new Promise((resolve,reject)=>{
    if(!window.indexedDB)return reject(new Error("IndexedDB no disponible"));
    const request=indexedDB.open(DATA_CACHE.db,DATA_CACHE.version);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(DATA_CACHE.store))db.createObjectStore(DATA_CACHE.store)};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function readDataCache(){
  try{const db=await openDataCache();return await new Promise((resolve,reject)=>{const tx=db.transaction(DATA_CACHE.store,"readonly"),request=tx.objectStore(DATA_CACHE.store).get(DATA_CACHE.key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close()})}catch(_){return null}
}
async function writeDataCache(data){
  try{const db=await openDataCache();await new Promise((resolve,reject)=>{const tx=db.transaction(DATA_CACHE.store,"readwrite");tx.objectStore(DATA_CACHE.store).put(data,DATA_CACHE.key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(_){}
}
function cacheUserKey(){return String(state.user?.id||state.user?.usuario||"")}
function currentSnapshot(){return {source:state.source,gestion:state.gestion}}
function saveCurrentCache(){void writeDataCache({userKey:cacheUserKey(),savedAt:Date.now(),data:currentSnapshot()})}

function toast(message, type="") {
  const el = $("#toast"); el.textContent = message; el.className = `toast ${type}`.trim();
  clearTimeout(toast.timer); toast.timer = setTimeout(()=>el.classList.add("hidden"),3500);
}

function apiReady() { return /^https:\/\/script\.google\.com\/macros\/s\//.test(API_URL); }
function apiUrl(action, params={}) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v])=>{ if(v!==undefined && v!==null && v!=="") url.searchParams.set(k,v); });
  return url.toString();
}
async function parseResponse(res) {
  const text = await res.text();
  let data; try { data=JSON.parse(text); } catch { throw new Error(`Respuesta inválida: ${text.slice(0,100)}`); }
  if (!data.ok) throw new Error(data.error || data.message || "La operación no pudo completarse");
  return data;
}
async function apiGet(action, params={}) {
  if (!apiReady()) throw new Error("Falta configurar la URL de D9 Gestión");
  const res = await fetch(apiUrl(action,{...params,token:state.token,ts:Date.now()}),{cache:"no-store",redirect:"follow"});
  return parseResponse(res);
}
async function apiPost(action, payload={}) {
  if (!apiReady()) throw new Error("Falta configurar la URL de D9 Gestión");
  const body = JSON.stringify({action,token:state.token,...payload});
  const res = await fetch(apiUrl(action),{method:"POST",cache:"no-store",redirect:"follow",headers:{"Content-Type":"text/plain;charset=utf-8"},body});
  return parseResponse(res);
}

function setSync(text, error=false) { const el=$("#syncBadge"); el.textContent=text; el.classList.toggle("error",error); }
function saveSession(data) {
  state.token=data.token; state.user=data.user;
  localStorage.setItem(STORAGE.token,state.token); localStorage.setItem(STORAGE.user,JSON.stringify(state.user));
}
function clearSession() { state.token=""; state.user=null; localStorage.removeItem(STORAGE.token); localStorage.removeItem(STORAGE.user); }
function showLogin(message="") {
  $("#loginScreen").classList.remove("hidden"); $("#app").classList.add("hidden");
  const el=$("#loginMessage"); el.textContent=message||"Acceso exclusivo para usuarios autorizados."; el.classList.toggle("error",!!message);
}
function showApp() {
  $("#loginScreen").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#sessionName").textContent=state.user?.nombre||state.user?.usuario||"Usuario";
  $("#sessionRole").textContent=state.user?.rol_gestion||"Gestión";
  $("#welcomeName").textContent=(state.user?.nombre||"Ale").split(/\s+/)[0];
}

async function login(event) {
  event.preventDefault();
  const button=$("#loginForm button"); button.disabled=true; button.textContent="Ingresando…";
  try {
    const data=await apiPost("login",{usuario:$("#loginUser").value.trim(),clave:$("#loginPassword").value});
    saveSession(data);showApp();const cached=await showCachedData();await loadAll({silent:cached});
  } catch(err) { showLogin(err.message); }
  finally { button.disabled=false; button.textContent="Ingresar"; }
}

function applyBootstrap(data) {
  state.source={
    clientes:data.source?.clientes||[], productos:data.source?.productos||[], usuarios:data.source?.usuarios||[], pedidos:data.source?.pedidos||[]
  };
  state.gestion={
    operaciones:data.gestion?.operaciones||[], items:data.gestion?.items||[], recibos:data.gestion?.recibos||[], pagos:data.gestion?.pagos||[], cheques:data.gestion?.cheques||[], movimientos:data.gestion?.movimientos||[], config:data.gestion?.config||{}
  };
  hydrateConfig();populateSelectors();renderAll();
}
async function showCachedData() {
  const cached=await readDataCache();
  if(!cached?.data||cached.userKey!==cacheUserKey())return false;
  applyBootstrap(cached.data);state.cacheLoaded=true;
  const time=cached.savedAt?new Date(cached.savedAt).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}):"";
  setSync(time?`Datos guardados ${time} · actualizando…`:"Datos guardados · actualizando…");
  return true;
}
async function loadAll(options={}) {
  if(!options.silent)setSync("Sincronizando…");
  try {
    const data=await apiGet("bootstrap");
    applyBootstrap(data);state.cacheLoaded=true;saveCurrentCache();
    setSync(`Actualizado ${new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}`);
  } catch(err) {
    if (/sesión|token|autoriz/i.test(err.message)) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); }
    else {setSync(state.cacheLoaded?"Datos guardados · sin conexión":"Error de conexión",true);toast(err.message,"error")}
  }
}

function showView(name) {
  state.currentView=name;
  $$(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${name}`));
  $$("#nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  $("#btnMore").classList.toggle("active",["cheques","maestros","config"].includes(name));
  const labels={home:"Gestión",pedidos:"Pedidos",operaciones:"Comprobantes",cuentas:"Cuentas corrientes",recibos:"Recibos",cheques:"Cheques",maestros:"Productos y clientes",config:"Configuración"};
  $("#viewTitle").textContent=labels[name]||"Gestión"; window.scrollTo({top:0,behavior:"smooth"});
  renderCurrentView();
}

function orderDateValue(o) { return String(o.fecha_iso||o.fecha||"").slice(0,10); }
function operationItems(id) { return state.gestion.items.filter(x=>String(x.operacion_id)===String(id)); }
function receiptPayments(id) { return state.gestion.pagos.filter(x=>String(x.recibo_id)===String(id)); }
function paymentCheck(payment) {
  const paymentId=String(payment?.pago_id||""),checkId=String(payment?.cheque_id||"");
  return state.gestion.cheques.find(c=>(paymentId&&String(c.pago_id)===paymentId)||(checkId&&String(c.cheque_id)===checkId));
}
function activeOperations() { return state.gestion.operaciones.filter(o=>!isAnnulled(o.estado)); }
function clientById(id) { return state.source.clientes.find(c=>String(c.id)===String(id)); }
function productById(id) { return state.source.productos.find(p=>String(p.id)===String(id)); }

function accountRows() {
  const map=new Map();
  state.gestion.movimientos.filter(m=>!isAnnulled(m.estado)).forEach(m=>{
    const id=String(m.cliente_id||""); if(!id) return;
    if(!map.has(id)) map.set(id,{cliente_id:id,cliente:m.cliente||clientById(id)?.nombre||"Cliente",debe:0,haber:0,movimientos:[]});
    const a=map.get(id); a.debe+=numeric(m.debe); a.haber+=numeric(m.haber); a.movimientos.push(m);
  });
  return [...map.values()].map(a=>({...a,saldo:a.debe-a.haber})).sort((a,b)=>b.saldo-a.saldo);
}

function renderHome() {
  $("#todayLabel").textContent=new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});
  const today=todayISO();
  const orders=state.source.pedidos.filter(o=>orderDateValue(o)===today && !isAnnulled(o.estado));
  const ops=activeOperations().filter(o=>String(o.fecha||"").slice(0,10)===today);
  const accounts=accountRows();
  const checks=state.gestion.cheques.filter(c=>!["COBRADO","RECHAZADO","ANULADO"].includes(String(c.estado||"").toUpperCase()) && daysFromToday(c.fecha_vencimiento)>=0 && daysFromToday(c.fecha_vencimiento)<=7);
  $("#kpiOrders").textContent=orders.length; $("#kpiOperations").textContent=ops.length; $("#kpiOperationsAmount").textContent=money(ops.reduce((s,o)=>s+numeric(o.total),0));
  $("#kpiDebt").textContent=money(accounts.reduce((s,a)=>s+Math.max(0,a.saldo),0)); $("#kpiChecks").textContent=checks.length;
  $("#homeOrders").className="compact-list"; $("#homeOrders").innerHTML=orders.slice(0,6).map(o=>compactOrder(o)).join("")||'<div class="empty">No hay pedidos hoy.</div>';
  $("#homeDebts").className="compact-list"; $("#homeDebts").innerHTML=accounts.filter(a=>a.saldo>0.005).slice(0,6).map(a=>`<button type="button" class="compact-item compact-action" data-account-receipt="${esc(a.cliente_id)}"><div><strong>${esc(a.cliente)}</strong><small>${a.movimientos.length} movimientos · ingresar recibo</small></div><b>${money(a.saldo)}</b></button>`).join("")||'<div class="empty">No hay saldos pendientes.</div>';
}
function compactOrder(o) { return `<div class="compact-item"><div><strong>${esc(o.cliente||"Sin cliente")}</strong><small>${esc(o.fecha||"")} · ${esc(o.vendedor||"")}</small></div><div class="row-actions"><b>${money(o.total||o.total_pedido)}</b><button class="mini-btn primary" data-order-import="${esc(o.pedido_id)}">Usar</button></div></div>`; }

function renderOrders() {
  const q=normalize($("#ordersSearch").value), date=$("#ordersDate").value, status=$("#ordersStatus").value;
  const rows=state.source.pedidos.filter(o=>{
    const annul=isAnnulled(o.estado); if(status==="active"&&annul)return false;if(status==="annulled"&&!annul)return false;
    if(date&&orderDateValue(o)!==date)return false;
    return matchesSearch([o.pedido_id,o.cliente,o.vendedor,...(o.items||[]).flatMap(i=>[i.nombre,i.id_producto])],q);
  });
  const el=$("#ordersList"); el.className="card-list"; el.innerHTML=rows.map(o=>`
    <article class="data-card"><div><h3>${esc(o.cliente||"Sin cliente")}</h3><p>${esc(o.fecha||"")} · ${esc(o.vendedor||"Sin vendedor")}</p><div class="meta"><span class="pill">${esc(o.pedido_id)}</span><span class="pill">${(o.items||[]).length} productos</span>${isAnnulled(o.estado)?'<span class="pill red">Anulado</span>':''}</div></div><div class="card-side"><strong>${money(o.total||o.total_pedido)}</strong><div class="row-actions"><button class="mini-btn" data-order-detail="${esc(o.pedido_id)}">Ver</button>${!isAnnulled(o.estado)?`<button class="mini-btn primary" data-order-import="${esc(o.pedido_id)}">Crear comprobante</button>`:""}</div></div></article>`).join("")||'<div class="empty">No hay pedidos con esos filtros.</div>';
}

function renderOperations() {
  const q=normalize($("#operationsSearch").value), status=$("#operationsStatus").value;
  const rows=[...state.gestion.operaciones].sort((a,b)=>String(b.created_at||b.fecha).localeCompare(String(a.created_at||a.fecha))).filter(o=>{
    const annul=isAnnulled(o.estado); if(status==="active"&&annul)return false;if(status==="annulled"&&!annul)return false;
    return matchesSearch([o.numero,o.tipo,o.cliente,o.origen_pedido_id],q);
  });
  $("#operationsList").className="card-list"; $("#operationsList").innerHTML=rows.map(o=>`
    <article class="data-card"><div><h3>${esc(o.tipo||"COMPROBANTE")} ${esc(o.numero||"")}</h3><p>${esc(o.cliente||"")} · ${formatDate(o.fecha)}</p><div class="meta">${o.origen_pedido_id?`<span class="pill">Pedido ${esc(o.origen_pedido_id)}</span>`:'<span class="pill">Carga manual</span>'}<span class="pill ${numeric(o.saldo)>0?'amber':'green'}">${numeric(o.saldo)>0?`Saldo ${money(o.saldo)}`:"Pagado"}</span>${isAnnulled(o.estado)?'<span class="pill red">Anulado</span>':''}</div></div><div class="card-side"><strong>${money(o.total)}</strong><div class="row-actions"><button class="mini-btn" data-operation-detail="${esc(o.operacion_id)}">Ver</button><button class="mini-btn primary" data-operation-print="${esc(o.operacion_id)}">Imprimir</button>${!isAnnulled(o.estado)?`<button class="mini-btn danger" data-operation-annul="${esc(o.operacion_id)}">Anular</button>`:""}</div></div></article>`).join("")||'<div class="empty">Todavía no hay comprobantes.</div>';
}

function renderAccounts() {
  const q=normalize($("#accountsSearch").value), filter=$("#accountsFilter").value;
  const rows=accountRows().filter(a=>{if(filter==="debt"&&a.saldo<=.005)return false;if(filter==="credit"&&a.saldo>=-.005)return false;return matchesSearch(a.cliente,q)});
  $("#accountsList").className="card-list"; $("#accountsList").innerHTML=rows.map(a=>`<article class="data-card"><div><h3>${esc(a.cliente)}</h3><p>${a.movimientos.length} movimientos · Debe ${money(a.debe)} · Pagó ${money(a.haber)}</p></div><div class="card-side"><strong class="${a.saldo>0?'debt':''}">${money(a.saldo)}</strong><div class="row-actions"><button class="mini-btn" data-account-detail="${esc(a.cliente_id)}">Ver movimientos</button><button class="mini-btn primary" data-account-receipt="${esc(a.cliente_id)}">Ingresar pago</button></div></div></article>`).join("")||'<div class="empty">No hay cuentas con ese filtro.</div>';
}

function renderReceipts() {
  renderReceiptDebtors();
  const q=normalize($("#receiptsSearch").value);
  const rows=[...state.gestion.recibos].sort((a,b)=>String(b.created_at||b.fecha).localeCompare(String(a.created_at||a.fecha))).filter(r=>matchesSearch([r.numero,r.cliente,r.recibo_id],q));
  $("#receiptsList").className="card-list"; $("#receiptsList").innerHTML=rows.map(r=>`<article class="data-card clickable-card" data-receipt-card="${esc(r.recibo_id)}" tabindex="0" role="button"><div><h3>Recibo ${esc(r.numero||"")}</h3><p>${esc(r.cliente||"")} · ${formatDate(r.fecha)}</p><div class="meta"><span class="pill">${esc(r.medio_principal||"Pago")}</span>${r.operacion_numero?`<span class="pill">Aplicado a ${esc(r.operacion_numero)}</span>`:'<span class="pill">A cuenta</span>'}${isAnnulled(r.estado)?'<span class="pill red">Anulado</span>':''}</div></div><div class="card-side"><strong>${money(r.total)}</strong><div class="row-actions"><button class="mini-btn" data-receipt-detail="${esc(r.recibo_id)}">Ver detalle</button><button class="mini-btn primary" data-receipt-print="${esc(r.recibo_id)}">Imprimir</button></div></div></article>`).join("")||'<div class="empty">Todavía no hay recibos.</div>';
}

function renderReceiptDebtors() {
  const q=normalize($("#receiptDebtsSearch").value);
  const rows=accountRows().filter(a=>a.saldo>.005&&matchesSearch(a.cliente,q));
  $("#receiptDebtsList").className="compact-list";
  $("#receiptDebtsList").innerHTML=rows.map(a=>`<div class="compact-item debt-pick-row"><div><strong>${esc(a.cliente)}</strong><small>${a.movimientos.length} movimientos pendientes</small></div><div class="row-actions"><b>${money(a.saldo)}</b><button type="button" class="mini-btn primary" data-account-receipt="${esc(a.cliente_id)}">Cobrar</button></div></div>`).join("")||'<div class="empty">No hay clientes con saldo para esa búsqueda.</div>';
}

function daysFromToday(date) { if(!date)return 99999; const a=new Date(`${todayISO()}T00:00:00`),b=new Date(`${String(date).slice(0,10)}T00:00:00`); return Math.round((b-a)/86400000); }
function renderChecks() {
  const q=normalize($("#checksSearch").value), filter=$("#checksStatus").value;
  const rows=[...state.gestion.cheques].sort((a,b)=>String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento))).filter(c=>{const st=String(c.estado||"").toUpperCase();if(filter==="active"&&["COBRADO","RECHAZADO","ANULADO"].includes(st))return false;if(filter==="rejected"&&st!=="RECHAZADO")return false;return matchesSearch([c.banco,c.numero,c.cliente,c.librador],q)});
  $("#checksList").className="card-list"; $("#checksList").innerHTML=rows.map(c=>{const due=daysFromToday(c.fecha_vencimiento);return `<article class="data-card"><div><h3>${esc(c.banco||"Cheque")} · ${esc(c.numero||"Sin número")}</h3><p>${esc(c.cliente||"")} · Librador: ${esc(c.librador||"—")}</p><div class="meta"><span class="pill ${due<0?'red':due<=7?'amber':''}">Vence ${formatDate(c.fecha_vencimiento)}</span><span class="pill">${esc(c.estado||"EN_CARTERA")}</span></div></div><div class="card-side"><strong>${money(c.importe)}</strong><div class="row-actions">${!["COBRADO","RECHAZADO","ANULADO"].includes(String(c.estado||"").toUpperCase())?`<button class="mini-btn primary" data-check-status="${esc(c.cheque_id)}" data-status="COBRADO">Cobrado</button><button class="mini-btn danger" data-check-status="${esc(c.cheque_id)}" data-status="RECHAZADO">Rechazado</button>`:""}</div></div></article>`}).join("")||'<div class="empty">No hay cheques con ese filtro.</div>';
}

function renderMasters() {
  const q=normalize($("#mastersSearch").value); let rows=[];
  if(state.masterTab==="clients") rows=state.source.clientes.filter(c=>matchesSearch([c.id,c.nombre,c.ciudad,c.telefono],q)).map(c=>`<article class="data-card"><div><h3>${esc(c.nombre)}</h3><p>${esc(c.direccion||"")} ${esc(c.ciudad||"")}</p><div class="meta"><span class="pill">ID ${esc(c.id)}</span><span class="pill">${esc(c.lista_precio||"lista_1")}</span></div></div><div class="card-side"><span>${esc(c.telefono||"")}</span></div></article>`);
  if(state.masterTab==="products") rows=state.source.productos.filter(p=>matchesSearch([p.id,p.nombre,p.categoria,p.marca],q)).slice(0,300).map(p=>`<article class="data-card"><div><h3>${esc(p.nombre)}</h3><p>${esc(p.categoria||"")} · ${esc(p.marca||"Sin marca")}</p><div class="meta"><span class="pill">${esc(p.id)}</span></div></div><div class="card-side"><strong>${money(p.lista_1)}</strong></div></article>`);
  if(state.masterTab==="users") rows=state.source.usuarios.filter(u=>matchesSearch([u.id,u.usuario,u.nombre,u.rol],q)).map(u=>`<article class="data-card"><div><h3>${esc(u.nombre)}</h3><p>${esc(u.usuario)} · ${esc(u.rol)}</p><div class="meta"><span class="pill">ID ${esc(u.id)}</span></div></div></article>`);
  $("#mastersList").className="card-list"; $("#mastersList").innerHTML=rows.join("")||'<div class="empty">Sin resultados.</div>';
}

function renderCurrentView() { ({home:renderHome,pedidos:renderOrders,operaciones:renderOperations,cuentas:renderAccounts,recibos:renderReceipts,cheques:renderChecks,maestros:renderMasters}[state.currentView]||(()=>{}))(); }
function renderAll() { renderHome(); if(state.currentView!=="home")renderCurrentView(); }

function populateSelectors() {
  const clients=[...state.source.clientes].sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),"es"));
  const options='<option value="">Seleccionar cliente…</option>'+clients.map(c=>`<option value="${esc(c.id)}">${esc(c.nombre)}${c.ciudad?` · ${esc(c.ciudad)}`:""}</option>`).join("");
  $("#opClient").innerHTML=options;
}
function productOptions(selected="") { return '<option value="">Seleccionar producto…</option>'+state.source.productos.filter(p=>numeric(p.lista_1)>0).map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(selected)?"selected":""}>${esc(p.nombre)} · ${money(p.lista_1)}</option>`).join(""); }

function openOperation(order=null) {
  state.currentOrder=order; state.draftItems=(order?.items||[]).map(i=>({id_producto:i.id_producto||i.id, nombre:i.nombre||i.detalle, cantidad:numeric(i.cantidad||i.total), precio:numeric(i.precio)}));
  if(!state.draftItems.length) state.draftItems=[{id_producto:"",nombre:"",cantidad:1,precio:0}];
  $("#operationForm").reset(); $("#opDate").value=todayISO(); $("#opSourceOrder").value=order?.pedido_id||""; $("#operationDialogTitle").textContent=order?`Desde pedido ${order.pedido_id}`:"Crear desde cero";$("#opPaidAmount").readOnly=false;$("#opMixedFields").classList.add("hidden");$("#opCheckFields").classList.add("hidden");
  const cfg=state.gestion.config; $("#opType").value=cfg.documento_default||"REMITO";
  if(order){const candidates=state.source.clientes.filter(c=>normalize(c.nombre)===normalize(order.cliente));if(candidates.length===1)$("#opClient").value=candidates[0].id;else toast(candidates.length>1?"Hay más de un cliente con ese nombre. Elegí el correcto.":"El cliente del pedido no coincide con la ficha. Elegilo antes de guardar.");}
  renderDraftItems(); updateOperationTotal(); $("#operationDialog").showModal();
}
function renderDraftItems() {
  $("#opItems").innerHTML=state.draftItems.map((item,index)=>`<div class="item-row" data-item-index="${index}"><label>Producto<select data-item-product>${productOptions(item.id_producto)}</select></label><label>Cantidad<input data-item-qty type="number" min="0.001" step="0.001" value="${esc(item.cantidad)}"></label><label>Precio<input data-item-price type="number" min="0" step="0.01" value="${esc(item.precio)}"></label><div class="line-total">${money(Number(item.cantidad)*Number(item.precio))}</div><button class="remove-item" data-item-remove type="button">×</button></div>`).join("");
}
function syncDraftFromDom() { $$(".item-row").forEach(row=>{const i=Number(row.dataset.itemIndex),pid=$("[data-item-product]",row).value,p=productById(pid);state.draftItems[i]={id_producto:pid,nombre:p?.nombre||state.draftItems[i]?.nombre||"",cantidad:Number($("[data-item-qty]",row).value)||0,precio:Number($("[data-item-price]",row).value)||0};}); }
function operationTotal() { const sub=state.draftItems.reduce((s,i)=>s+Number(i.cantidad||0)*Number(i.precio||0),0);return sub*(1-(Number($("#opDiscount").value)||0)/100); }
function mixedTotal(prefix){return ["Cash","Transfer","Check"].reduce((s,k)=>s+(Number($(`#${prefix}Mixed${k}`).value)||0),0)}
function updateOperationTotal() { syncDraftFromDom(); const total=operationTotal();if($("#opPaymentMethod").value==="MIXTO")$("#opPaidAmount").value=mixedTotal("op");const paid=Math.min(total,Number($("#opPaidAmount").value)||0); $("#opTotal").textContent=money(total); $("#opBalance").textContent=`Saldo: ${money(total-paid)}`; $$(".item-row").forEach((r,i)=>$(".line-total",r).textContent=money(Number(state.draftItems[i].cantidad)*Number(state.draftItems[i].precio))); }
function stageCreatedOperation(data,payload,total,paid){
  const now=new Date().toISOString(),subtotal=payload.items.reduce((sum,item)=>sum+numeric(item.cantidad)*numeric(item.precio),0);
  state.gestion.operaciones.push({operacion_id:data.operacion_id,numero:data.numero,tipo:payload.tipo,fecha:payload.fecha,cliente_id:payload.cliente_id,cliente:payload.cliente,origen_tipo:payload.origen_pedido_id?"PEDIDO":"MANUAL",origen_pedido_id:payload.origen_pedido_id,usuario_id:state.user?.id||"",usuario:state.user?.nombre||"",estado:"VIGENTE",subtotal,descuento_pct:payload.descuento_pct,total,saldo:Math.max(0,total-paid),observaciones:payload.observaciones,created_at:now,updated_at:now,_initial_paid:paid,_initial_methods:[...new Set((payload.pagos_iniciales||[]).map(p=>p.medio))]});
  state.gestion.items.push(...payload.items.map((item,index)=>({item_id:`LOCAL-IT-${index}`,operacion_id:data.operacion_id,orden:index+1,producto_id:item.id_producto,producto:item.nombre,cantidad:item.cantidad,precio_unitario:item.precio,descuento_pct:0,subtotal:numeric(item.cantidad)*numeric(item.precio)})));
  saveCurrentCache();
}
function refreshAfterMutation(){setSync("Guardado · actualizando…");void loadAll({silent:true})}
async function saveOperation(event) {
  event.preventDefault(); syncDraftFromDom();
  const items=state.draftItems.filter(i=>i.id_producto&&i.cantidad>0); if(!items.length)return toast("Agregá al menos un producto.","error");
  const cliente=clientById($("#opClient").value); if(!cliente)return toast("Elegí el cliente correcto.","error");
  const total=operationTotal(),payments=readPayments("op"),paid=payments.reduce((s,p)=>s+Number(p.importe),0);if(paid>total+.01)return toast("El pago inicial no puede superar el total.","error");if($("#opPaymentMethod").value!=="CUENTA_CORRIENTE"&&!payments.length)return toast("Ingresá el importe pagado.","error");
  const payload={tipo:$("#opType").value,fecha:$("#opDate").value,cliente_id:cliente.id,cliente:cliente.nombre,origen_pedido_id:$("#opSourceOrder").value,descuento_pct:Number($("#opDiscount").value)||0,observaciones:$("#opNotes").value.trim(),items,pagos_iniciales:payments};
  const btn=$("#btnSaveOperation");btn.disabled=true;btn.textContent="Guardando…";
  try{const data=await apiPost("create_operacion",payload);stageCreatedOperation(data,payload,total,paid);$("#operationDialog").close();toast(`Comprobante ${data.numero} guardado`);showOperationDetail(data.operacion_id,false);refreshAfterMutation();}catch(err){toast(err.message,"error")}finally{btn.disabled=false;btn.textContent="Guardar comprobante";}
}

function setReceiptMessage(message="",type=""){
  const el=$("#receiptMessage");el.textContent=message;el.className=`form-message ${type}`.trim();el.classList.toggle("hidden",!message);
}
function debtAccounts(){return accountRows().filter(a=>a.saldo>.005)}
function renderReceiptClientPicker(query=""){
  const selectedId=$("#receiptClient").value,q=normalize(query);
  const rows=debtAccounts().filter(a=>matchesSearch(a.cliente,q)).slice(0,20);
  $("#receiptClientResults").innerHTML=rows.map(a=>`<button type="button" class="client-pick ${String(a.cliente_id)===String(selectedId)?"selected":""}" data-receipt-client="${esc(a.cliente_id)}"><span><strong>${esc(a.cliente)}</strong><small>Saldo pendiente</small></span><b>${money(a.saldo)}</b></button>`).join("")||'<div class="empty compact-empty">No encontré clientes con deuda.</div>';
}
function selectReceiptClient(clientId){
  const account=debtAccounts().find(a=>String(a.cliente_id)===String(clientId));
  $("#receiptClient").value=account?.cliente_id||"";
  $("#receiptClientSearch").value=account?.cliente||"";
  const selected=$("#receiptClientSelected");
  selected.innerHTML=account?`<span><strong>${esc(account.cliente)}</strong><small>Saldo pendiente · ${money(account.saldo)}</small></span><button type="button" class="mini-btn" data-receipt-client-change>Cambiar</button>`:"";
  selected.classList.toggle("hidden",!account);
  $("#receiptClientSearch").classList.toggle("hidden",!!account);
  $("#receiptClientResults").classList.toggle("hidden",!!account);
  updateReceiptOperations();setReceiptMessage();
}
function startReceiptClientSearch(){
  $("#receiptClient").value="";$("#receiptClientSearch").value="";$("#receiptClientSearch").classList.remove("hidden");$("#receiptClientSelected").classList.add("hidden");$("#receiptClientResults").classList.remove("hidden");updateReceiptOperations();renderReceiptClientPicker();setReceiptMessage();setTimeout(()=>$("#receiptClientSearch").focus(),40);
}
function openReceipt(clientId="") {
  $("#receiptForm").reset();$("#receiptClient").value="";$("#receiptDate").value=todayISO();$("#receiptAmount").readOnly=false;$("#receiptMixedFields").classList.add("hidden");$("#receiptCheckFields").classList.add("hidden");setReceiptMessage();
  if(clientId)selectReceiptClient(clientId);else startReceiptClientSearch();
  $("#receiptDialog").showModal();if(!clientId)setTimeout(()=>$("#receiptClientSearch").focus(),80);
}
function updateReceiptOperations(){
  const cid=$("#receiptClient").value;
  const ops=activeOperations().filter(o=>String(o.cliente_id)===String(cid)&&numeric(o.saldo)>.005);
  $("#receiptOperation").innerHTML='<option value="">A cuenta, sin comprobante específico</option>'+ops.map(o=>`<option value="${esc(o.operacion_id)}">${esc(o.tipo)} ${esc(o.numero)} · saldo ${money(o.saldo)}</option>`).join("");
  if(ops.length===1){$("#receiptOperation").value=ops[0].operacion_id;$("#receiptAmount").value=numeric(ops[0].saldo).toFixed(2)}
  else if(!cid)$("#receiptAmount").value="";
}
function readCheckFields(prefix){return {banco:$(`#${prefix}CheckBank`).value.trim(),numero:$(`#${prefix}CheckNumber`).value.trim(),librador:$(`#${prefix}CheckIssuer`).value.trim(),fecha_vencimiento:$(`#${prefix}CheckDue`).value};}
function readPayments(prefix){const method=$(prefix==="op"?"#opPaymentMethod":"#receiptMethod").value,amountEl=$(prefix==="op"?"#opPaidAmount":"#receiptAmount"),reference=$(prefix==="op"?"#opPaymentReference":"#receiptReference").value.trim();if(method==="CUENTA_CORRIENTE")return[];if(method!=="MIXTO"){const importe=Number(amountEl.value)||0;return importe>0?[{medio:method,importe,referencia:reference,cheque:method==="CHEQUE"?readCheckFields(prefix):null}]:[];}const cash=Number($(`#${prefix}MixedCash`).value)||0,transfer=Number($(`#${prefix}MixedTransfer`).value)||0,check=Number($(`#${prefix}MixedCheck`).value)||0;return [{medio:"EFECTIVO",importe:cash,referencia:""},{medio:"TRANSFERENCIA",importe:transfer,referencia:$(`#${prefix}MixedReference`).value.trim()},{medio:"CHEQUE",importe:check,referencia:"",cheque:readCheckFields(prefix)}].filter(p=>p.importe>0)}
function updateReceiptMixed(){if($("#receiptMethod").value==="MIXTO")$("#receiptAmount").value=mixedTotal("receipt")}
function stageCreatedReceipt(data,payload,payments,amount,operation){
  const now=new Date().toISOString(),receiptId=data.recibo_id;
  state.gestion.recibos.push({recibo_id:receiptId,numero:data.numero,fecha:payload.fecha,cliente_id:payload.cliente_id,cliente:payload.cliente,operacion_id:payload.operacion_id,operacion_numero:operation?.numero||"",medio_principal:payments.length>1?"MIXTO":payments[0].medio,total:amount,observaciones:payload.observaciones,estado:"VIGENTE",usuario_id:state.user?.id||"",usuario:state.user?.nombre||"",created_at:now});
  payments.forEach((payment,index)=>{const paymentId=`LOCAL-PG-${index}`,checkId=payment.medio==="CHEQUE"?`LOCAL-CH-${index}`:"";state.gestion.pagos.push({pago_id:paymentId,recibo_id:receiptId,operacion_id:payload.operacion_id,cliente_id:payload.cliente_id,fecha:payload.fecha,medio:payment.medio,importe:payment.importe,referencia:payment.referencia||"",cheque_id:checkId,estado:"VIGENTE",created_at:now});if(checkId){const c=payment.cheque||{};state.gestion.cheques.push({cheque_id:checkId,pago_id:paymentId,recibo_id:receiptId,operacion_id:payload.operacion_id,cliente_id:payload.cliente_id,cliente:payload.cliente,banco:c.banco,numero:c.numero,librador:c.librador,fecha_ingreso:payload.fecha,fecha_vencimiento:c.fecha_vencimiento,importe:payment.importe,estado:"EN_CARTERA",updated_at:now})}});
  state.gestion.movimientos.push({movimiento_id:`LOCAL-MV-${receiptId}`,fecha:payload.fecha,cliente_id:payload.cliente_id,cliente:payload.cliente,tipo:"PAGO",documento_tipo:"RECIBO",documento_id:receiptId,documento_numero:data.numero,operacion_id:payload.operacion_id,debe:0,haber:amount,estado:"VIGENTE",detalle:payments.map(p=>`${p.medio} ${p.importe}`).join(" + "),created_at:now});
  if(operation)operation.saldo=Math.max(0,numeric(operation.saldo)-amount);
  saveCurrentCache();
}
async function saveReceipt(event){
  event.preventDefault();const btn=$("#btnSaveReceipt");setReceiptMessage();
  try{
    const client=clientById($("#receiptClient").value);if(!client)throw new Error("Elegí un cliente con saldo pendiente.");
    if(!$("#receiptDate").value)throw new Error("Elegí la fecha del recibo.");
    const payments=readPayments("receipt"),amount=payments.reduce((s,p)=>s+numeric(p.importe),0);if(amount<=0)throw new Error("Ingresá el importe recibido.");
    if($("#receiptMethod").value==="CHEQUE"){const c=readCheckFields("receipt");if(!c.banco||!c.numero||!c.fecha_vencimiento)throw new Error("Para el cheque faltan banco, número o vencimiento.")}
    const op=activeOperations().find(o=>String(o.operacion_id)===String($("#receiptOperation").value));if(op&&amount>numeric(op.saldo)+.01)throw new Error(`El pago supera el saldo de ${money(op.saldo)}.`);
    const payload={fecha:$("#receiptDate").value,cliente_id:client.id,cliente:client.nombre,importe:amount,pagos:payments,operacion_id:$("#receiptOperation").value,observaciones:$("#receiptNotes").value.trim()};
    btn.disabled=true;btn.textContent="Guardando…";setReceiptMessage("Guardando el recibo…","working");
    const data=await apiPost("create_recibo",payload);stageCreatedReceipt(data,payload,payments,amount,op);$("#receiptDialog").close();toast(`Recibo ${data.numero} guardado`);showReceiptDetail(data.recibo_id,false);refreshAfterMutation();
  }catch(err){setReceiptMessage(err.message||"No se pudo guardar el recibo.","error");}
  finally{btn.disabled=false;btn.textContent="Guardar recibo"}
}

function showOrderDetail(id){const o=state.source.pedidos.find(x=>String(x.pedido_id)===String(id));if(!o)return;openDetail(`Pedido ${o.pedido_id}`,detailHeader([["Fecha",o.fecha],["Cliente",o.cliente],["Vendedor",o.vendedor],["Total",money(o.total||o.total_pedido)]])+itemsTable(o.items||[]),`<button class="btn primary" data-order-import="${esc(o.pedido_id)}">Crear comprobante</button>`)}
function showOperationDetail(id,autoPrint=false){const o=state.gestion.operaciones.find(x=>String(x.operacion_id)===String(id));if(!o)return;const html=detailHeader([["Número",`${o.tipo} ${o.numero}`],["Fecha",formatDate(o.fecha)],["Cliente",o.cliente],["Estado",o.estado],["Total",money(o.total)],["Saldo",money(o.saldo)]])+itemsTable(operationItems(id))+`<p>${esc(o.observaciones||"")}</p>`;openDetail(`${o.tipo} ${o.numero}`,html,`<button class="btn primary" data-operation-print="${esc(id)}">Imprimir media A4</button>`);if(autoPrint)setTimeout(()=>printOperation(id),250)}
function receiptPaymentDetail(payment){const c=paymentCheck(payment);return `<section class="payment-detail"><div class="payment-detail-head"><div><small>Medio de pago</small><strong>${esc(payment.medio)}</strong></div><b>${money(payment.importe)}</b></div>${payment.referencia?`<p><b>Referencia:</b> ${esc(payment.referencia)}</p>`:""}${c?`<h4>Datos del cheque</h4>${detailHeader([["Banco",c.banco||"—"],["Número",c.numero||"—"],["Librador",c.librador||"—"],["Vencimiento",formatDate(c.fecha_vencimiento)],["Estado",c.estado||"EN_CARTERA"]])}`:""}</section>`}
function showReceiptDetail(id,autoPrint=false){const r=state.gestion.recibos.find(x=>String(x.recibo_id)===String(id));if(!r)return;const pays=receiptPayments(id);const html=detailHeader([["Fecha",formatDate(r.fecha)],["Cliente",r.cliente],["Importe",money(r.total)],["Estado",r.estado],["Aplicado a",r.operacion_numero||"A cuenta"]])+pays.map(receiptPaymentDetail).join("")+(r.observaciones?`<p><b>Observaciones:</b> ${esc(r.observaciones)}</p>`:"");openDetail(`Recibo ${r.numero}`,html,`<button class="btn primary" data-receipt-print="${esc(id)}">Imprimir</button>`);if(autoPrint)setTimeout(()=>printReceipt(id),250)}
function showAccountDetail(id){const a=accountRows().find(x=>String(x.cliente_id)===String(id));if(!a)return;const rows=[...a.movimientos].sort((x,y)=>String(y.fecha).localeCompare(String(x.fecha))).map(m=>`<tr><td>${formatDate(m.fecha)}</td><td>${esc(m.tipo)}</td><td>${esc(m.documento_numero||"")}</td><td>${money(m.debe)}</td><td>${money(m.haber)}</td></tr>`).join("");openDetail(a.cliente,detailHeader([["Total debitado",money(a.debe)],["Total pagado",money(a.haber)],["Saldo",money(a.saldo)]])+`<table class="detail-lines"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Documento</th><th>Debe</th><th>Haber</th></tr></thead><tbody>${rows}</tbody></table>`,`<button class="btn primary" data-account-receipt="${esc(id)}">Ingresar pago</button>`)}
function detailHeader(items){return `<div class="detail-grid">${items.map(([a,b])=>`<div class="detail-box"><small>${esc(a)}</small><strong>${esc(b)}</strong></div>`).join("")}</div>`}
function itemsTable(items){return `<table class="detail-lines"><thead><tr><th>Producto</th><th>Cant.</th><th>Unit.</th><th>Total</th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(i.nombre||i.producto||i.detalle)}</td><td>${number(i.cantidad||i.total)}</td><td>${money(i.precio||i.precio_unitario)}</td><td>${money(i.subtotal||i.total_item||numeric(i.cantidad||i.total)*numeric(i.precio||i.precio_unitario))}</td></tr>`).join("")}</tbody></table>`}
function openDetail(title,body,actions=""){ $("#detailTitle").textContent=title;$("#detailBody").innerHTML=body;$("#detailActions").innerHTML=actions;$("#detailDialog").showModal(); }

function printWindow(title, body, format="A5") {const win=window.open("","_blank");if(!win)return toast("El navegador bloqueó la impresión.","error");win.document.open();win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${format} portrait;margin:8mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#101d2b;margin:0}.head{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #17365c;padding-bottom:8px}.head h1{margin:0;font-size:21px}.head p{margin:2px 0}.doc{text-align:right}.doc strong{font-size:18px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:5px 16px;margin:10px 0;padding:8px;background:#f2f6f8}.meta div{display:flex;justify-content:space-between;gap:8px}table{width:100%;border-collapse:collapse}th,td{padding:5px;border-bottom:1px solid #ccd6dc;text-align:left}th{font-size:10px;text-transform:uppercase}th:nth-child(n+2),td:nth-child(n+2){text-align:right}.check-box{margin-top:9px;padding:8px;border:1px solid #bfcdd6;background:#f7fafb}.check-box>strong{display:block;margin-bottom:6px}.check-grid{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:3px 10px}.check-grid span{color:#52616e}.check-grid b{text-align:right}.totals{margin:10px 0 0 auto;width:48%}.totals div{display:flex;justify-content:space-between;padding:4px}.totals .grand{font-size:16px;font-weight:bold;border-top:2px solid #17365c}.foot{margin-top:14px;border-top:1px solid #ccd6dc;padding-top:7px;font-size:10px;color:#52616e}.signature{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:28px}.signature div{border-top:1px solid #222;text-align:center;padding-top:4px}</style></head><body>${body}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);win.document.close();win.focus();}
function formatOperationNumber(value){
  const raw=String(value||"").trim(),match=raw.match(/^([^0-9]*?)[-\s]*(\d+)$/);
  if(!match)return raw;
  const prefix=(match[1]||"R").replace(/[-\s]+$/g,"").trim()||"R";
  return `${prefix} 0001-${match[2].padStart(8,"0").slice(-8)}`;
}
function paymentMethodLabel(value){return ({EFECTIVO:"Efectivo",TRANSFERENCIA:"Transferencia",CHEQUE:"Cheque",MIXTO:"Mixto"})[String(value||"").toUpperCase()]||String(value||"");}
function operationPaymentInfo(operation){
  const total=numeric(operation.total),saldo=numeric(operation.saldo),paid=Math.max(0,total-saldo);
  const livePayments=state.gestion.pagos.filter(p=>String(p.operacion_id)===String(operation.operacion_id)&&!isAnnulled(p.estado));
  const rawMethods=operation._initial_methods?.length?operation._initial_methods:livePayments.map(p=>p.medio);
  const methods=[...new Set(rawMethods.map(paymentMethodLabel).filter(Boolean))].join(" + ");
  if(saldo>=total-.005)return {condition:"Cuenta corriente",paid:0,saldo:total};
  if(saldo<=.005)return {condition:methods?`Pago total · ${methods}`:"Pagado",paid:total,saldo:0};
  return {condition:`Pago parcial${methods?` · ${methods}`:""} / saldo en cuenta corriente`,paid,saldo};
}
function printOperation(id){
  const operation=state.gestion.operaciones.find(x=>String(x.operacion_id)===String(id));
  if(!operation)return;
  const win=window.open("","_blank");
  if(!win)return toast("El navegador bloqueó la impresión.","error");
  const items=operationItems(id).map((item,index)=>({
    index:index+1,
    code:String(item.producto_id||item.id_producto||""),
    description:String(item.producto||item.nombre||item.detalle||""),
    quantity:number(item.cantidad),
    unit:money(item.precio_unitario||item.precio),
    amount:money(item.subtotal||numeric(item.cantidad)*numeric(item.precio_unitario||item.precio))
  }));
  const subtotal=items.reduce((sum,_,index)=>{const item=operationItems(id)[index];return sum+numeric(item.subtotal||numeric(item.cantidad)*numeric(item.precio_unitario||item.precio));},0);
  const payment=operationPaymentInfo(operation);
  const printable={
    title:`${operation.tipo||"COMPROBANTE"} ${formatOperationNumber(operation.numero)}`,
    kind:String(operation.tipo||"COMPROBANTE").replace(/_/g," "),
    number:formatOperationNumber(operation.numero),
    date:formatDate(operation.fecha),
    client:String(operation.cliente||""),
    items,
    subtotal:money(subtotal),
    discountPct:numeric(operation.descuento_pct),
    discount:money(Math.max(0,subtotal-numeric(operation.total))),
    total:money(operation.total),
    paidValue:payment.paid,
    paid:money(payment.paid),
    balance:money(payment.saldo),
    condition:payment.condition,
    notes:String(operation.observaciones||"")
  };
  const data=JSON.stringify(printable).replace(/</g,"\\u003c");
  win.document.open();
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(printable.title)}</title><style>
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#d8dde1;color:#171b20;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
#pages{padding:12px 0}.sheet{width:210mm;height:297mm;margin:0 auto 12px;background:#fff;box-shadow:0 2px 14px #0003;display:grid;grid-template-rows:148.5mm 148.5mm;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}
.half{height:148.5mm;padding:8mm 10mm 7mm;overflow:hidden;position:relative}.half:first-child{border-bottom:.25mm dashed #aeb5bb}.blank{background:#fff}
.voucher{height:100%;display:flex;flex-direction:column}.voucher-head{display:grid;grid-template-columns:1fr auto;gap:8mm;align-items:end;padding-bottom:3mm;border-bottom:.55mm solid #20262b}.eyebrow{font-size:7.5pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4b555d}.client{font-size:15pt;font-weight:800;line-height:1.05;margin-top:1.2mm}.doc{text-align:right}.doc strong{display:block;font-size:12pt;white-space:nowrap}.doc span{display:block;font-size:8.5pt;margin-top:1.2mm}.part{font-size:7pt;color:#68727a;margin-top:.8mm}
.lines{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:3mm;font-size:8.2pt}.lines col.qty{width:13mm}.lines col.code{width:25mm}.lines col.unit{width:28mm}.lines col.amount{width:30mm}.lines th{background:#2f3940;color:#fff;padding:2mm 1.6mm;text-transform:uppercase;font-size:7pt;letter-spacing:.04em;text-align:left}.lines th.num,.lines td.num{text-align:right}.lines td{padding:1.55mm 1.6mm;border-bottom:.18mm solid #d6dadd;vertical-align:top;line-height:1.15;overflow-wrap:anywhere}.lines tbody tr:nth-child(odd) td{background:#eef1f3}.lines td.description{font-weight:600}
.footer{margin-top:auto;padding-top:2.4mm;border-top:.4mm solid #40484e;display:grid;grid-template-columns:minmax(0,1fr) 65mm;gap:6mm;align-items:end;font-size:8pt}.condition strong{display:block;font-size:9pt;margin-bottom:.8mm}.notes{margin-top:1.5mm;color:#41484e;line-height:1.2}.summary div{display:flex;justify-content:space-between;gap:5mm;padding:.7mm 0}.summary .grand{border-top:.45mm solid #20262b;margin-top:.7mm;padding-top:1.2mm;font-size:11pt;font-weight:800}.summary .balance{font-weight:700}.legal{position:absolute;left:10mm;bottom:2.5mm;font-size:6.5pt;color:#6d7479}
#measure{position:fixed;left:-10000px;top:0;visibility:hidden}.measure-half{width:210mm;height:148.5mm;padding:8mm 10mm 7mm;overflow:hidden;position:relative;background:#fff}
@media print{html,body{background:#fff}#pages{padding:0}.sheet{margin:0;box-shadow:none}.half:first-child{border-bottom:.25mm dashed #aeb5bb}}
</style></head><body><main id="pages"></main><div id="measure"></div><script>
const data=${data};
const rowMarkup=item=>\`<tr><td class="num">\${item.quantity}</td><td>\${escapeHtml(item.code)}</td><td class="description">\${escapeHtml(item.description)}</td><td class="num">\${item.unit}</td><td class="num">\${item.amount}</td></tr>\`;
function escapeHtml(value){return String(value??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;"}[c]))}
function headerMarkup(part,total){return \`<header class="voucher-head"><div><div class="eyebrow">\${escapeHtml(data.kind)} · Comprobante interno</div><div class="client">\${escapeHtml(data.client)}</div></div><div class="doc"><strong>\${escapeHtml(data.number)}</strong><span>\${escapeHtml(data.date)}</span><div class="part">Parte \${part} de \${total}</div></div></header>\`}
function tableMarkup(rows){return \`<table class="lines"><colgroup><col class="qty"><col class="code"><col><col class="unit"><col class="amount"></colgroup><thead><tr><th class="num">Cant.</th><th>Código</th><th>Descripción</th><th class="num">P. unitario</th><th class="num">Importe</th></tr></thead><tbody>\${rows.map(rowMarkup).join("")}</tbody></table>\`}
function footerMarkup(){return \`<footer class="footer"><div class="condition"><strong>Condición de pago: \${escapeHtml(data.condition)}</strong>\${data.notes?\`<div class="notes"><b>Observaciones:</b> \${escapeHtml(data.notes)}</div>\`:""}</div><div class="summary"><div><span>Subtotal</span><b>\${data.subtotal}</b></div>\${data.discountPct?\`<div><span>Descuento \${data.discountPct}%</span><b>-\${data.discount}</b></div>\`:""}<div class="grand"><span>Total</span><b>\${data.total}</b></div>\${data.paidValue>.005?\`<div><span>Pagado</span><b>\${data.paid}</b></div>\`:""}<div class="balance"><span>Saldo</span><b>\${data.balance}</b></div></div></footer>\`}
function voucherMarkup(rows,part,total,final){return \`<article class="voucher">\${headerMarkup(part,total)}\${tableMarkup(rows)}\${final?footerMarkup():""}<div class="legal">Comprobante interno — no válido como factura.</div></article>\`}
function fits(rows,withFooter){const holder=document.getElementById("measure");holder.innerHTML=\`<div class="measure-half">\${voucherMarkup(rows,1,1,withFooter)}</div>\`;const half=holder.firstElementChild;return half.scrollHeight<=half.clientHeight+.5}
function splitRows(){const chunks=[];let cursor=0;if(!data.items.length)return [{rows:[],final:true}];while(cursor<data.items.length){let rows=[];while(cursor+rows.length<data.items.length){const candidate=[...rows,data.items[cursor+rows.length]];if(rows.length&& !fits(candidate,false))break;rows=candidate;if(cursor+rows.length===data.items.length)break}let final=cursor+rows.length===data.items.length;if(final&&!fits(rows,true)){while(rows.length>1&&!fits(rows,true))rows.pop();final=cursor+rows.length===data.items.length}chunks.push({rows,final});cursor+=rows.length}return chunks}
function render(){const chunks=splitRows(),pages=document.getElementById("pages");for(let i=0;i<chunks.length;i+=2){const sheet=document.createElement("section");sheet.className="sheet";[i,i+1].forEach(index=>{const half=document.createElement("div");half.className="half"+(index>=chunks.length?" blank":" ");if(index<chunks.length)half.innerHTML=voucherMarkup(chunks[index].rows,index+1,chunks.length,chunks[index].final);sheet.appendChild(half)});pages.appendChild(sheet)}document.getElementById("measure").remove();setTimeout(()=>window.print(),450)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",render);else render();
<\/script></body></html>`);
  win.document.close();win.focus();
}
function printReceipt(id){const r=state.gestion.recibos.find(x=>String(x.recibo_id)===String(id));if(!r)return;const pays=receiptPayments(id),checks=pays.map(p=>({payment:p,check:paymentCheck(p)})).filter(x=>x.check);const checkBlocks=checks.map(({payment:p,check:c})=>`<div class="check-box"><strong>Datos del cheque · ${money(p.importe)}</strong><div class="check-grid"><span>Banco</span><b>${esc(c.banco||"—")}</b><span>Número</span><b>${esc(c.numero||"—")}</b><span>Librador</span><b>${esc(c.librador||"—")}</b><span>Vencimiento</span><b>${formatDate(c.fecha_vencimiento)}</b><span>Estado</span><b>${esc(c.estado||"EN_CARTERA")}</b></div></div>`).join("");const body=`<div class="head"><div><h1>${esc(state.gestion.config.empresa_nombre||"Distribuidora D9")}</h1><p>Recibo de pago</p></div><div class="doc"><strong>RECIBO ${esc(r.numero)}</strong><p>${formatDate(r.fecha)}</p></div></div><div class="meta"><div><span>Recibimos de</span><b>${esc(r.cliente)}</b></div><div><span>Importe</span><b>${money(r.total)}</b></div></div><p>En concepto de pago${r.operacion_numero?` aplicado al comprobante ${esc(r.operacion_numero)}`:" a cuenta"}.</p><table><thead><tr><th>Medio</th><th>Referencia</th><th>Importe</th></tr></thead><tbody>${pays.map(p=>`<tr><td>${esc(p.medio)}</td><td>${esc(p.referencia||"")}</td><td>${money(p.importe)}</td></tr>`).join("")}</tbody></table>${checkBlocks}${r.observaciones?`<p><b>Observaciones:</b> ${esc(r.observaciones)}</p>`:""}<div class="totals"><div class="grand"><span>Total recibido</span><b>${money(r.total)}</b></div></div><div class="signature"><div>Firma y aclaración</div><div>Recibí conforme</div></div><div class="foot">Recibo interno de cobranza.</div>`;printWindow(`Recibo ${r.numero}`,body,state.gestion.config.impresion||"A5")}
function formatDate(value){const s=String(value||"");if(/^\d{4}-\d{2}-\d{2}/.test(s)){const [y,m,d]=s.slice(0,10).split("-");return `${d}/${m}/${y}`;}return s;}
function hydrateConfig(){const f=$("#configForm"),c=state.gestion.config;[...f.elements].forEach(el=>{if(el.name&&c[el.name]!==undefined)el.value=c[el.name]})}
async function saveConfig(event){event.preventDefault();const config=Object.fromEntries(new FormData(event.currentTarget));try{await apiPost("update_config",{config});toast("Configuración guardada");await loadAll()}catch(err){toast(err.message,"error")}}

async function annulOperation(id){if(!confirm("¿Anular este comprobante? No se borrará: se generarán los movimientos de reversión."))return;try{await apiPost("anular_operacion",{operacion_id:id});toast("Comprobante anulado");await loadAll()}catch(err){toast(err.message,"error")}}
async function updateCheck(id,status){if(!confirm(`¿Marcar el cheque como ${status.toLowerCase()}?`))return;try{await apiPost("update_cheque_status",{cheque_id:id,estado:status});toast("Cheque actualizado");await loadAll()}catch(err){toast(err.message,"error")}}

function bindEvents(){
  $("#loginForm").addEventListener("submit",login);$("#btnLogout").addEventListener("click",()=>{clearSession();showLogin()});$("#btnRefresh").addEventListener("click",loadAll);$("#homeLogo").addEventListener("click",()=>showView("home"));
  $("#nav").addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(b)showView(b.dataset.view)});document.addEventListener("click",e=>{const go=e.target.closest("[data-go]");if(go){$("#moreDialog")?.close();showView(go.dataset.go)}const close=e.target.closest("[data-close]");if(close)document.getElementById(close.dataset.close)?.close();const changeClient=e.target.closest("[data-receipt-client-change]");if(changeClient)startReceiptClientSearch();const rc=e.target.closest("[data-receipt-client]");if(rc)selectReceiptClient(rc.dataset.receiptClient);const oi=e.target.closest("[data-order-import]");if(oi){$("#detailDialog")?.close();openOperation(state.source.pedidos.find(o=>String(o.pedido_id)===String(oi.dataset.orderImport)))}const od=e.target.closest("[data-order-detail]");if(od)showOrderDetail(od.dataset.orderDetail);const op=e.target.closest("[data-operation-detail]");if(op)showOperationDetail(op.dataset.operationDetail);const pp=e.target.closest("[data-operation-print]");if(pp)printOperation(pp.dataset.operationPrint);const oa=e.target.closest("[data-operation-annul]");if(oa)annulOperation(oa.dataset.operationAnnul);const ad=e.target.closest("[data-account-detail]");if(ad)showAccountDetail(ad.dataset.accountDetail);const ar=e.target.closest("[data-account-receipt]");if(ar){$("#detailDialog")?.close();openReceipt(ar.dataset.accountReceipt)}const rd=e.target.closest("[data-receipt-detail]");if(rd)showReceiptDetail(rd.dataset.receiptDetail);const rp=e.target.closest("[data-receipt-print]");if(rp)printReceipt(rp.dataset.receiptPrint);const cs=e.target.closest("[data-check-status]");if(cs)updateCheck(cs.dataset.checkStatus,cs.dataset.status)});
  document.addEventListener("click",e=>{const card=e.target.closest("[data-receipt-card]");if(card&&!e.target.closest("button"))showReceiptDetail(card.dataset.receiptCard)});
  document.addEventListener("keydown",e=>{const card=e.target.closest?.("[data-receipt-card]");if(card&&(e.key==="Enter"||e.key===" ")){e.preventDefault();showReceiptDetail(card.dataset.receiptCard)}});
  ["#btnNewOperation","#btnNewOperation2"].forEach(s=>$(s).addEventListener("click",()=>openOperation()));$("#btnNewReceipt").addEventListener("click",()=>openReceipt());$("#operationForm").addEventListener("submit",saveOperation);$("#receiptForm").addEventListener("submit",saveReceipt);$("#configForm").addEventListener("submit",saveConfig);
  $("#btnAddItem").addEventListener("click",()=>{syncDraftFromDom();state.draftItems.push({id_producto:"",nombre:"",cantidad:1,precio:0});renderDraftItems();updateOperationTotal()});$("#opItems").addEventListener("input",updateOperationTotal);$("#opItems").addEventListener("change",e=>{if(e.target.matches("[data-item-product]")){const row=e.target.closest(".item-row"),i=Number(row.dataset.itemIndex),p=productById(e.target.value);state.draftItems[i].id_producto=e.target.value;state.draftItems[i].nombre=p?.nombre||"";state.draftItems[i].precio=Number(p?.lista_1)||0;renderDraftItems();updateOperationTotal()}});$("#opItems").addEventListener("click",e=>{if(e.target.matches("[data-item-remove]")){syncDraftFromDom();state.draftItems.splice(Number(e.target.closest(".item-row").dataset.itemIndex),1);if(!state.draftItems.length)state.draftItems.push({id_producto:"",nombre:"",cantidad:1,precio:0});renderDraftItems();updateOperationTotal()}});
  ["#opDiscount","#opPaidAmount","#opMixedCash","#opMixedTransfer","#opMixedCheck"].forEach(s=>$(s).addEventListener("input",updateOperationTotal));$("#opPaymentMethod").addEventListener("change",e=>{const mixed=e.target.value==="MIXTO",check=e.target.value==="CHEQUE"||mixed;$("#opMixedFields").classList.toggle("hidden",!mixed);$("#opCheckFields").classList.toggle("hidden",!check);$("#opPaidAmount").readOnly=mixed;updateOperationTotal()});$("#receiptMethod").addEventListener("change",e=>{const mixed=e.target.value==="MIXTO",check=e.target.value==="CHEQUE"||mixed;$("#receiptMixedFields").classList.toggle("hidden",!mixed);$("#receiptCheckFields").classList.toggle("hidden",!check);$("#receiptAmount").readOnly=mixed;updateReceiptMixed()});["#receiptMixedCash","#receiptMixedTransfer","#receiptMixedCheck"].forEach(s=>$(s).addEventListener("input",updateReceiptMixed));$("#receiptOperation").addEventListener("change",e=>{const op=activeOperations().find(o=>String(o.operacion_id)===String(e.target.value));if(op)$("#receiptAmount").value=numeric(op.saldo).toFixed(2)});$("#receiptClientSearch").addEventListener("input",e=>{$("#receiptClient").value="";$("#receiptClientSelected").classList.add("hidden");updateReceiptOperations();renderReceiptClientPicker(e.target.value);setReceiptMessage()});
  $("#btnOccasionalClient").addEventListener("click",()=>toast("En la primera versión los clientes nuevos se cargan desde el maestro para conservar un único ID."));
  [["#ordersSearch",renderOrders],["#ordersDate",renderOrders],["#ordersStatus",renderOrders],["#operationsSearch",renderOperations],["#operationsStatus",renderOperations],["#accountsSearch",renderAccounts],["#accountsFilter",renderAccounts],["#receiptDebtsSearch",renderReceiptDebtors],["#receiptsSearch",renderReceipts],["#checksSearch",renderChecks],["#checksStatus",renderChecks],["#mastersSearch",renderMasters]].forEach(([s,fn])=>$(s).addEventListener("input",fn));
  $("#btnMore").addEventListener("click",()=>$("#moreDialog").showModal());
  $("#btnReloadOrders").addEventListener("click",loadAll);$$("[data-master-tab]").forEach(b=>b.addEventListener("click",()=>{$$("[data-master-tab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.masterTab=b.dataset.masterTab;renderMasters()}));
}

async function boot(){bindEvents();if("serviceWorker" in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});if(!apiReady())return showLogin("Primero hay que configurar la URL del Apps Script de D9 Gestión en config.js.");if(!state.token)return showLogin();showApp();const cached=await showCachedData();await loadAll({silent:cached});}
boot();
