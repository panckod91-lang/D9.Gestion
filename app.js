"use strict";

const CONFIG = window.D9_GESTION_CONFIG || {};
const API_URL = String(CONFIG.API_URL || "").trim();
const STORAGE = { token:"d9g_token", user:"d9g_user" };
const DATA_CACHE = { db:"d9_gestion_local", store:"snapshots", key:"bootstrap", version:1 };
const ORDER_POLL_MS = 15000;
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
  permissions: {source_admin:false,gestion_admin:false,super_admin:false,can_issue_documents:false,source_writes_enabled:false},
  source: {clientes:[],clientes_admin:[],productos:[],productos_admin:[],price_lists:[],usuarios:[],usuarios_admin:[],pedidos:[],ofertas:[],publicidad:[]},
  gestion: {operaciones:[],items:[],recibos:[],pagos:[],cheques:[],movimientos:[],comisiones_reglas:[],comisiones_cierres:[],comisiones_detalle:[],config:{}},
  currentView:"home",
  draftItems:[],
  clientSearchResults:[],
  clientSearchIndex:0,
  occasionalClientId:"",
  autoPaidAmount:false,
  productSearchResults:[],
  productSearchIndex:0,
  currentOrder:null,
  currentCreditOperation:null,
  currentCreditMode:"",
  currentReport:"",
  operationPriceList:"lista_1",
  cacheLoaded:false,
  ordersRangeActive:false,
  ordersRevision:"",
  bulkPriceChanges:[],
  sellerSuggestions:{},
  sellerAssignments:{},
  sellerAssignmentOriginal:{},
  clientImport:null,
  clientImportDecisions:{},
  clientEditorOrigin:"",
  pendingOrderReuseId:""
};

let ordersPollTimer=null;
let ordersPollBusy=false;

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
function currentSnapshot(){return {user:state.user,permissions:state.permissions,source:state.source,gestion:state.gestion}}
function saveCurrentCache(){void writeDataCache({userKey:cacheUserKey(),savedAt:Date.now(),data:currentSnapshot()})}

function toast(message, type="") {
  const el = $("#toast");
  const focusedDialog=document.activeElement?.closest?.("dialog[open]");
  const openDialogs=$$("dialog[open]");
  const host=focusedDialog||openDialogs.at(-1)||document.body;
  if(el.parentElement!==host)host.appendChild(el);
  el.textContent = message; el.className = `toast ${type}`.trim();
  clearTimeout(toast.timer); toast.timer = setTimeout(()=>el.classList.add("hidden"),3500);
}

function apiReady() { return /^https:\/\/script\.google\.com\/macros\/s\//.test(API_URL); }
function apiUrl(action) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  return url.toString();
}
async function parseResponse(res) {
  const text = await res.text();
  let data; try { data=JSON.parse(text); } catch { throw new Error(`Respuesta inválida: ${text.slice(0,100)}`); }
  if (!data.ok) {
    const message=data.error||data.message||"La operación no pudo completarse";
    if(state.token&&/sesión|token|autoriz/i.test(message)){clearSession();showLogin("La sesión venció. Volvé a ingresar.")}
    throw new Error(message);
  }
  return data;
}
async function apiPost(action, payload={}) {
  if (!apiReady()) throw new Error("Falta configurar la URL de D9 Gestión");
  const body = JSON.stringify({action,token:state.token,...payload});
  const res = await fetch(apiUrl(action),{method:"POST",cache:"no-store",redirect:"follow",headers:{"Content-Type":"text/plain;charset=utf-8"},body});
  return parseResponse(res);
}
function apiRead(action,params={}){return apiPost(action,params)}

function setSync(text, error=false) { const el=$("#syncBadge"); el.textContent=text; el.classList.toggle("error",error); }
function saveSession(data) {
  state.token=data.token; state.user=data.user;
  localStorage.setItem(STORAGE.token,state.token); localStorage.setItem(STORAGE.user,JSON.stringify(state.user));
}
function clearSession() { state.token=""; state.user=null; localStorage.removeItem(STORAGE.token); localStorage.removeItem(STORAGE.user); }
function showLogin(message="") {
  stopOrderPolling();
  $("#loginScreen").classList.remove("hidden"); $("#app").classList.add("hidden");
  const el=$("#loginMessage"); el.textContent=message||"Acceso exclusivo para usuarios autorizados."; el.classList.toggle("error",!!message);
}
function showApp() {
  $("#loginScreen").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#sessionName").textContent=state.user?.nombre||state.user?.usuario||"Usuario";
  $("#sessionRole").textContent=gestionRoleLabel(state.user?.rol_gestion);
  $("#welcomeName").textContent=(state.user?.nombre||"Ale").split(/\s+/)[0];
  const version=String(CONFIG.APP_VERSION||"versión sin identificar");
  if($("#appVersion"))$("#appVersion").textContent=version;
  if($("#appVersionMore"))$("#appVersionMore").textContent=`D9 Gestión · ${version}`;
}

async function login(event) {
  event.preventDefault();
  const button=$("#loginForm button"); button.disabled=true; button.textContent="Ingresando…";
  try {
    const data=await apiPost("login",{usuario:$("#loginUser").value.trim(),clave:$("#loginPassword").value});
    saveSession(data);showApp();const cached=await showCachedData();await loadAll({silent:cached});startOrderPolling();
  } catch(err) { showLogin(err.message); }
  finally { button.disabled=false; button.textContent="Ingresar"; }
}

function applyBootstrap(data) {
  if(data.user){state.user=data.user;localStorage.setItem(STORAGE.user,JSON.stringify(state.user));showApp()}
  state.permissions={source_admin:!!data.permissions?.source_admin,gestion_admin:!!data.permissions?.gestion_admin,super_admin:!!data.permissions?.super_admin,can_issue_documents:!!data.permissions?.can_issue_documents,source_writes_enabled:!!data.permissions?.source_writes_enabled};
  state.source={
    clientes:data.source?.clientes||[], clientes_admin:data.source?.clientes_admin||data.source?.clientes||[], productos:data.source?.productos||[], productos_admin:data.source?.productos_admin||data.source?.productos||[], price_lists:data.source?.price_lists||[{id:"lista_1",nombre:"Lista 1"},{id:"lista_2",nombre:"Lista 2"},{id:"lista_3",nombre:"Lista 3"}], usuarios:data.source?.usuarios||[], usuarios_admin:data.source?.usuarios_admin||data.source?.usuarios||[], pedidos:state.ordersRangeActive?state.source.pedidos:(data.source?.pedidos||[]), ofertas:data.source?.ofertas||[], publicidad:data.source?.publicidad||[]
  };
  if(data.source?.pedidos_revision)state.ordersRevision=String(data.source.pedidos_revision);
  state.gestion={
    operaciones:data.gestion?.operaciones||[], items:data.gestion?.items||[], recibos:data.gestion?.recibos||[], pagos:data.gestion?.pagos||[], cheques:data.gestion?.cheques||[], movimientos:data.gestion?.movimientos||[], comisiones_reglas:data.gestion?.comisiones_reglas||[], comisiones_cierres:data.gestion?.comisiones_cierres||[], comisiones_detalle:data.gestion?.comisiones_detalle||[], config:data.gestion?.config||{}
  };
  state.gestion.operaciones.forEach(operation=>operation.numero=canonicalOperationNumber(operation.numero,operation.tipo));
  hydrateConfig();applyPermissionsUI();populateSelectors();hydrateMasterFilters();hydrateClientFilters();renderAll();
}

function stopOrderPolling(){
  if(ordersPollTimer)clearInterval(ordersPollTimer);
  ordersPollTimer=null;
}
function startOrderPolling(){
  stopOrderPolling();
  if(!state.token)return;
  ordersPollTimer=setInterval(()=>void pollOrders(),ORDER_POLL_MS);
}
function canPollOrders(){
  return !!state.token&&document.visibilityState==="visible"&&!$("#app").classList.contains("hidden")&&!state.ordersRangeActive;
}
async function pollOrders(){
  if(ordersPollBusy||!canPollOrders())return;
  ordersPollBusy=true;
  try{
    const check=await apiRead("pedidos_revision"),revision=String(check.revision||"");
    if(!revision||revision===state.ordersRevision)return;
    const previousIds=new Set(state.source.pedidos.map(order=>String(order.pedido_id||"")));
    const data=await apiRead("pedidos");
    state.source.pedidos=data.pedidos||[];
    state.ordersRevision=String(data.revision||revision);
    const newOrders=state.source.pedidos.filter(order=>!previousIds.has(String(order.pedido_id||"")));
    populateSelectors();renderHome();if(state.currentView==="pedidos")renderOrders();saveCurrentCache();
    const time=new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
    setSync(newOrders.length?`${newOrders.length===1?"Pedido nuevo":"Pedidos nuevos"} · ${time}`:`Pedidos actualizados ${time}`);
  }catch(err){
    if(/sesión|token|autoriz/i.test(err.message)){clearSession();showLogin("La sesión venció. Volvé a ingresar.")}
  }finally{ordersPollBusy=false}
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
    const data=await apiRead("bootstrap");
    applyBootstrap(data);state.cacheLoaded=true;saveCurrentCache();
    setSync(`Actualizado ${new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}`);
  } catch(err) {
    if (/sesión|token|autoriz/i.test(err.message)) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); }
    else {setSync(state.cacheLoaded?"Datos guardados · sin conexión":"Error de conexión",true);toast(err.message,"error")}
  }
}

function showView(name) {
  if(!isAdmin()&&ADMIN_VIEWS.has(name))return toast("Esta sección requiere permisos de administrador.","error");
  if(name==="recibos"&&!canIssueDocuments())return toast("Esta sección requiere permiso para comprobantes y recibos.","error");
  state.currentView=name;
  $$(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${name}`));
  $$("#nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  $("#btnMore").classList.toggle("active",["cheques","maestros","clientes","usuarios","ofertas","publicidad","reportes","config"].includes(name));
  const labels={home:"Gestión",pedidos:"Pedidos",operaciones:"Comprobantes",cuentas:"Cuentas corrientes",recibos:"Recibos",cheques:"Cheques",maestros:"Productos y precios",clientes:"Clientes",usuarios:"Usuarios",ofertas:"Productos en oferta",publicidad:"Publicidad",reportes:"Reportes",config:"Configuración"};
  $("#viewTitle").textContent=labels[name]||"Gestión"; window.scrollTo({top:0,behavior:"smooth"});
  renderCurrentView();
}

async function loadOrdersHistory(){
  const from=$("#ordersFrom").value,to=$("#ordersTo").value;if(from&&to&&from>to)return toast("La fecha desde no puede ser posterior a la fecha hasta.","error");
  const button=$("#btnReloadOrders");button.disabled=true;button.textContent="Cargando…";setSync(from||to?"Buscando pedidos del período…":"Cargando pedidos recientes…");
  try{const data=await apiRead("pedidos",{from,to});state.source.pedidos=data.pedidos||[];state.ordersRangeActive=!!(from||to);if(!state.ordersRangeActive&&data.revision)state.ordersRevision=String(data.revision);populateSelectors();renderHome();renderOrders();if(!state.ordersRangeActive)saveCurrentCache();setSync(`Pedidos actualizados ${new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}`)}
  catch(err){toast(err.message||"No se pudo cargar el historial de pedidos.","error");setSync("No se pudo actualizar Pedidos",true)}
  finally{button.disabled=false;button.textContent="↻ Actualizar"}
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
function isOccasionalId(id){return /^OCASIONAL-/i.test(String(id||""))}
function occasionalIdentityKey(name){return normalize(name).replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}
function newOccasionalId(){return `OCASIONAL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`}
function occasionalProfiles(){
  const map=new Map();
  [...state.gestion.operaciones].sort((a,b)=>String(b.created_at||b.fecha).localeCompare(String(a.created_at||a.fecha))).forEach(operation=>{
    const id=String(operation.cliente_id||""),name=String(operation.cliente||"").trim(),key=occasionalIdentityKey(name);
    if(!isOccasionalId(id)||!key)return;
    if(!map.has(key))map.set(key,{id,nombre:name,_occasional:true,ids:[]});
    const profile=map.get(key);if(!profile.ids.includes(id))profile.ids.push(id);
  });
  return [...map.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,"es"));
}
function occasionalProfileById(id){return occasionalProfiles().find(profile=>profile.ids.includes(String(id)))}
function accountByReference(reference){return accountRows().find(account=>String(account.cliente_id)===String(reference)||account.client_ids.includes(String(reference)))}

function accountRows() {
  const map=new Map();
  state.gestion.movimientos.filter(m=>!isAnnulled(m.estado)).forEach(m=>{
    const id=String(m.cliente_id||""); if(!id) return;
    const name=m.cliente||clientById(id)?.nombre||"Cliente",identity=occasionalIdentityKey(name),key=isOccasionalId(id)&&identity?`OCASIONAL:${identity}`:`CLIENTE:${id}`;
    if(!map.has(key)) map.set(key,{cliente_id:id,client_ids:[],cliente:name,debe:0,haber:0,movimientos:[],occasional:isOccasionalId(id)});
    const a=map.get(key);if(!a.client_ids.includes(id))a.client_ids.push(id);a.debe+=numeric(m.debe);a.haber+=numeric(m.haber);a.movimientos.push(m);
  });
  return [...map.values()].map(a=>{const profile=a.occasional?occasionalProfiles().find(item=>occasionalIdentityKey(item.nombre)===occasionalIdentityKey(a.cliente)):null;return {...a,cliente_id:profile?.id||a.cliente_id,client_ids:[...new Set([...(profile?.ids||[]),...a.client_ids])],saldo:a.debe-a.haber}}).sort((a,b)=>b.saldo-a.saldo);
}

function renderHome() {
  $("#todayLabel").textContent=new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});
  const today=todayISO();
  const orders=state.source.pedidos.filter(o=>orderDateValue(o)===today && !isAnnulled(o.estado));
  const ops=activeOperations().filter(o=>String(o.fecha||"").slice(0,10)===today);
  const accounts=accountRows();
  const checks=state.gestion.cheques.filter(c=>!["COBRADO","RECHAZADO","ANULADO"].includes(String(c.estado||"").toUpperCase()) && daysFromToday(c.fecha_vencimiento)>=0 && daysFromToday(c.fecha_vencimiento)<=7);
  $("#kpiOrders").textContent=orders.length; $("#kpiOperations").textContent=ops.length; $("#kpiOperationsAmount").textContent=money(ops.reduce((s,o)=>s+operationSignedTotal(o),0));
  $("#kpiDebt").textContent=money(accounts.reduce((s,a)=>s+Math.max(0,a.saldo),0)); $("#kpiChecks").textContent=checks.length;
  $("#homeOrders").className="compact-list"; $("#homeOrders").innerHTML=orders.slice(0,6).map(o=>compactOrder(o)).join("")||'<div class="empty">No hay pedidos hoy.</div>';
  $("#homeDebts").className="compact-list"; $("#homeDebts").innerHTML=accounts.filter(a=>a.saldo>0.005).slice(0,6).map(a=>`<button type="button" class="compact-item compact-action" data-account-receipt="${esc(a.cliente_id)}"><div><strong>${esc(a.cliente)}</strong><small>${a.movimientos.length} movimientos · ingresar recibo</small></div><b>${money(a.saldo)}</b></button>`).join("")||'<div class="empty">No hay saldos pendientes.</div>';
}
function orderSourceOperations(order){return [...state.gestion.operaciones].filter(operation=>String(operation.origen_pedido_id||"")===String(order?.pedido_id||"")).sort((a,b)=>String(b.created_at||b.fecha||"").localeCompare(String(a.created_at||a.fecha||"")))}
function orderUsedLabel(operation){return `${operationTypeLabel(operation.tipo)} ${formatOperationNumber(operation.numero)}`}
function orderActionButtons(order,quick=false){
  if(isAnnulled(order.estado)||!canIssueDocuments())return "";
  const used=orderSourceOperations(order),quickClass=quick?" order-create-quick":"";
  if(!used.length)return `<button type="button" class="mini-btn primary${quickClass}" data-order-import="${esc(order.pedido_id)}"><span>Crear comprobante</span><b>Usar</b></button>`;
  const latest=used[0],count=used.length,label=orderUsedLabel(latest),title=count===1?`Abre ${label}`:`Abre el más reciente de ${count} comprobantes`;
  return `<button type="button" class="mini-btn order-used${quickClass}" data-operation-detail="${esc(latest.operacion_id)}" title="${esc(title)}"><span>Ya usado: ${esc(label)}${count>1?` +${count-1}`:""}</span><b>✓ ${esc(formatOperationNumber(latest.numero))}${count>1?` +${count-1}`:""}</b></button><button type="button" class="mini-btn warning${quickClass}" data-order-import="${esc(order.pedido_id)}"><span>Generar otro</span><b>Reusar</b></button>`;
}

function requestOrderImport(orderId){
  const order=state.source.pedidos.find(item=>String(item.pedido_id)===String(orderId));if(!order)return toast("El pedido ya no está disponible.","error");
  const used=orderSourceOperations(order);if(!used.length)return openOperation(order,true);
  state.pendingOrderReuseId=String(order.pedido_id);$("#orderReuseTitle").textContent=`El pedido ${order.pedido_id} ya fue utilizado.`;
  $("#orderReuseDetail").textContent=`Comprobante${used.length===1?"":"s"} generado${used.length===1?"":"s"}: ${used.map(orderUsedLabel).join(", ")}.`;
  $("#orderReuseDialog").showModal();
}
function confirmOrderReuse(){
  const id=state.pendingOrderReuseId,order=state.source.pedidos.find(item=>String(item.pedido_id)===String(id));state.pendingOrderReuseId="";$("#orderReuseDialog").close();
  if(!order)return toast("El pedido ya no está disponible.","error");openOperation(order,true);
}
function compactOrder(o) { return `<div class="compact-item"><div><strong>${esc(o.cliente||"Sin cliente")}</strong><small>${esc(o.fecha||"")} · ${esc(o.vendedor||"")}</small></div><div class="row-actions"><b>${money(o.total||o.total_pedido)}</b>${orderActionButtons(o,true)}</div></div>`; }

function filteredOrders(){
  const q=$("#ordersSearch").value.trim(),from=$("#ordersFrom").value,to=$("#ordersTo").value,seller=$("#ordersSeller").value,status=$("#ordersStatus").value;
  return state.source.pedidos.filter(o=>{
    const annul=isAnnulled(o.estado),date=orderDateValue(o);
    if(status==="active"&&annul)return false;if(status==="annulled"&&!annul)return false;
    if(from&&date&&date<from)return false;if(to&&date&&date>to)return false;
    if(seller&&String(o.vendedor_id||o.vendedor)!==seller)return false;
    return matchesSearch([o.pedido_id,o.cliente,o.vendedor,o.estado,o.nota_pedido,...(o.items||[]).flatMap(i=>[i.nombre,i.id_producto,i.nota_item])],q);
  });
}
function orderTotal(o){const lines=(o.items||[]).reduce((sum,item)=>sum+numeric(item.subtotal||numeric(item.cantidad)*numeric(item.precio)),0);return numeric(o.total||o.total_pedido)||lines}
function renderOrders() {
  const rows=filteredOrders(),lines=rows.reduce((sum,o)=>sum+(o.items||[]).length,0),total=rows.reduce((sum,o)=>sum+orderTotal(o),0);
  const range=$("#ordersFrom").value||$("#ordersTo").value?"período elegido":"últimos 3 días";$("#ordersSummary").textContent=`${rows.length} pedidos · ${lines} líneas · Total ${money(total)} · ${range}`;
  const el=$("#ordersList");el.className="orders-history";el.innerHTML=rows.map((o,index)=>`
    <details class="order-history-card ${isAnnulled(o.estado)?"annulled":""}" style="--seller-hue:${(index*47)%360}">
      <summary><div><strong>${esc(o.cliente||"Sin cliente")}${isAnnulled(o.estado)?' <span class="pill red">ANULADO</span>':""}</strong><small>${formatDate(o.fecha_iso||o.fecha)} · ${esc(o.vendedor||"Sin vendedor")}${o.nota_pedido?" · Nota pedido":""}</small></div><div class="order-summary-side"><span>${esc(o.pedido_id)}</span><b>${money(orderTotal(o))}</b></div><div class="order-quick-actions">${orderActionButtons(o,true)}</div><span class="order-chevron">⌄</span></summary>
      <div class="order-history-detail">${o.nota_pedido?`<p class="order-note"><b>Nota:</b> ${esc(o.nota_pedido)}</p>`:""}${(o.items||[]).map(i=>`<div class="order-line"><span><b>${esc(i.nombre||"Producto")}</b><small>${esc(i.id_producto||"")}${i.nota_item?` · ${esc(i.nota_item)}`:""}</small></span><em>${number(i.cantidad)}</em><small>${money(i.precio)}</small><strong>${money(i.subtotal||numeric(i.cantidad)*numeric(i.precio))}</strong></div>`).join("")}<div class="order-history-actions"><button class="mini-btn" data-order-detail="${esc(o.pedido_id)}">Ver detalle</button>${orderActionButtons(o)}</div></div>
    </details>`).join("")||'<div class="empty">No hay pedidos con esos filtros.</div>';
}
function ordersReportBody(rows){
  const title="Reporte de pedidos",total=rows.reduce((sum,o)=>sum+orderTotal(o),0);
  return `<div class="head"><div><h1>${esc(state.gestion.config.empresa_nombre||"Distribuidora D9")}</h1><p>${title}</p></div><div class="doc"><strong>${rows.length} pedidos</strong><p>${formatDate(todayISO())}</p></div></div>${rows.map(o=>`<section style="margin-top:12px;break-inside:avoid"><h3 style="margin:0 0 4px">${esc(o.cliente||"Sin cliente")} · ${esc(o.pedido_id)}</h3><p style="margin:0 0 6px;color:#52616e">${formatDate(o.fecha_iso||o.fecha)} · ${esc(o.vendedor||"Sin vendedor")}</p><table><thead><tr><th>Producto</th><th>Cant.</th><th>Unit.</th><th>Importe</th></tr></thead><tbody>${(o.items||[]).map(i=>`<tr><td>${esc(i.nombre||"")}</td><td>${number(i.cantidad)}</td><td>${money(i.precio)}</td><td>${money(i.subtotal||numeric(i.cantidad)*numeric(i.precio))}</td></tr>`).join("")}</tbody></table><p style="text-align:right"><b>Total ${money(orderTotal(o))}</b></p></section>`).join("")}<div class="totals"><div class="grand"><span>Total general</span><b>${money(total)}</b></div></div>`;
}
function printOrdersReport(){const rows=filteredOrders();if(!rows.length)return toast("No hay pedidos para exportar.","error");printWindow("Reporte de pedidos",ordersReportBody(rows),"A4")}
function shareOrdersWhatsApp(){
  const rows=filteredOrders();if(!rows.length)return toast("No hay pedidos para compartir.","error");
  const total=rows.reduce((sum,o)=>sum+orderTotal(o),0),lines=[`*REPORTE DE PEDIDOS*`,`${rows.length} pedidos · Total ${money(total)}`];
  rows.slice(0,60).forEach(o=>lines.push(`\n*${o.cliente||"Sin cliente"}* · ${o.pedido_id}\n${formatDate(o.fecha_iso||o.fecha)} · ${o.vendedor||"Sin vendedor"}\n${(o.items||[]).map(i=>`• ${number(i.cantidad)} x ${i.nombre} · ${money(i.subtotal||numeric(i.cantidad)*numeric(i.precio))}`).join("\n")}\nTotal: ${money(orderTotal(o))}`));
  if(rows.length>60)lines.push(`\n…y ${rows.length-60} pedidos más. Usá el PDF para el listado completo.`);
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`,"_blank");
}

function renderOperations() { renderOperationsUI(); }

function renderAccounts() {
  const q=normalize($("#accountsSearch").value), filter=$("#accountsFilter").value;
  const rows=accountRows().filter(a=>{if(filter==="debt"&&a.saldo<=.005)return false;if(filter==="credit"&&a.saldo>=-.005)return false;return matchesSearch(a.cliente,q)});
  $("#accountsList").className="card-list"; $("#accountsList").innerHTML=rows.map(a=>`<article class="data-card"><div><h3>${esc(a.cliente)}</h3><p>${a.movimientos.length} movimientos · Debe ${money(a.debe)} · Pagó ${money(a.haber)}</p></div><div class="card-side"><strong class="${a.saldo>0?'debt':''}">${money(a.saldo)}</strong><div class="row-actions"><button class="mini-btn" data-account-detail="${esc(a.cliente_id)}">Ver movimientos</button><button class="mini-btn primary" data-account-receipt="${esc(a.cliente_id)}">Ingresar pago</button></div></div></article>`).join("")||'<div class="empty">No hay cuentas con ese filtro.</div>';
}

function renderReceipts() {
  renderReceiptDebtors();
  const q=normalize($("#receiptsSearch").value);
  const rows=[...state.gestion.recibos].sort((a,b)=>String(b.created_at||b.fecha).localeCompare(String(a.created_at||a.fecha))).filter(r=>matchesSearch([r.numero,r.cliente,r.recibo_id],q));
  $("#receiptsList").className="card-list"; $("#receiptsList").innerHTML=rows.map(r=>`<article class="data-card clickable-card" data-receipt-card="${esc(r.recibo_id)}" tabindex="0" role="button"><div><h3>Recibo ${esc(r.numero||"")}</h3><p>${esc(r.cliente||"")} · ${formatDate(r.fecha)}</p><div class="meta"><span class="pill">${esc(r.medio_principal||"Pago")}</span>${r.operacion_numero?`<span class="pill">Aplicado a ${esc(formatOperationNumber(r.operacion_numero))}</span>`:'<span class="pill">A cuenta</span>'}${isAnnulled(r.estado)?'<span class="pill red">Anulado</span>':''}</div></div><div class="card-side"><strong>${money(r.total)}</strong><div class="row-actions"><button class="mini-btn" data-receipt-detail="${esc(r.recibo_id)}">Ver detalle</button><button class="mini-btn primary" data-receipt-print="${esc(r.recibo_id)}">Imprimir</button></div></div></article>`).join("")||'<div class="empty">Todavía no hay recibos.</div>';
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

const ADMIN_VIEWS=new Set(["cuentas","cheques","maestros","clientes","usuarios","ofertas","publicidad","reportes","config"]);
function gestionRole(value){
  const role=normalize(value).replace(/\s+/g,"_");
  if(["super_admin","superadmin"].includes(role))return "super_admin";
  if(["admin","administrador"].includes(role))return "admin";
  if(["vendedor","operador"].includes(role))return "vendedor";
  return "sin_acceso";
}
function gestionRoleLabel(value){return ({super_admin:"Super admin",admin:"Administrador",vendedor:"Vendedor",sin_acceso:"Sin acceso"})[gestionRole(value)]||"Gestión"}
function isAdmin(){return ["admin","super_admin"].includes(gestionRole(state.user?.rol_gestion))||state.permissions?.gestion_admin===true}
function canIssueDocuments(){return isAdmin()||state.permissions?.can_issue_documents===true||activeValue(state.user?.permiso_comprobantes)}
function sourceWritesEnabled(){return isAdmin()&&state.permissions?.source_writes_enabled===true}
function applyPermissionsUI(){
  document.body.classList.toggle("role-limited",!isAdmin());
  document.body.classList.toggle("role-issuer",!isAdmin()&&canIssueDocuments());
  $$("[data-view]").forEach(button=>{if(ADMIN_VIEWS.has(button.dataset.view))button.classList.toggle("permission-hidden",!isAdmin())});
  $$("[data-go]").forEach(button=>{if(ADMIN_VIEWS.has(button.dataset.go))button.classList.toggle("permission-hidden",!isAdmin())});
  $$("[data-view=\"recibos\"],[data-go=\"recibos\"]").forEach(button=>button.classList.toggle("permission-hidden",!canIssueDocuments()));
  $("#btnMore")?.classList.toggle("permission-hidden",!isAdmin());
  $("#btnCreateOperationClient")?.classList.toggle("permission-hidden",!isAdmin());
  ["#btnNewOperation","#btnNewOperation2"].forEach(selector=>$(selector)?.classList.toggle("permission-hidden",!canIssueDocuments()));
}
function sellers(){return [...state.source.usuarios].filter(user=>user.id&&user.nombre&&normalize(user.rol)==="vendedor").sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),"es"))}
function sellerById(id){return sellers().find(user=>String(user.id)===String(id))}
function sellerLabel(id,fallback=""){return sellerById(id)?.nombre||fallback||"Sin vendedor"}
function sellerOptions(value="",allLabel=""){
  return `${allLabel?`<option value="">${esc(allLabel)}</option>`:'<option value="">Sin vendedor asignado</option>'}${sellers().map(user=>`<option value="${esc(user.id)}" ${String(user.id)===String(value)?"selected":""}>${esc(user.nombre)}</option>`).join("")}`;
}
function operationSellerOptions(value=""){return `<option value="">Seleccionar vendedor</option>${isAdmin()?'<option value="__NO_COMMISSION__">Venta directa de Ale · sin comisión</option>':""}${sellers().map(user=>`<option value="${esc(user.id)}" ${String(user.id)===String(value)?"selected":""}>${esc(user.nombre)}</option>`).join("")}`}
function hydrateSellerSelectors(){
  const clientFilter=$("#clientsSeller"),clientCurrent=clientFilter?.value,report=$("#reportSalesSeller"),reportCurrent=report?.value,commission=$("#reportCommissionSeller"),commissionCurrent=commission?.value;
  if(clientFilter){clientFilter.innerHTML='<option value="">Todos los vendedores</option><option value="__NONE__">Sin vendedor asignado</option>'+sellers().map(user=>`<option value="${esc(user.id)}">${esc(user.nombre)}</option>`).join("");if(clientCurrent)clientFilter.value=clientCurrent}
  if(report){report.innerHTML=sellerOptions(reportCurrent,"Todos los vendedores")+'<option value="__NO_COMMISSION__">Venta directa / sin comisión</option>';if(reportCurrent)report.value=reportCurrent}
  if(commission){commission.innerHTML=sellerOptions(commissionCurrent,"Todos los vendedores")+'<option value="__NO_COMMISSION__">Venta directa / sin comisión</option>';if(commissionCurrent)commission.value=commissionCurrent}
}
function activeValue(value){return value===true||["true","si","sí","1","activo","yes"].includes(normalize(value))}
function adminProducts(){return state.source.productos_admin?.length?state.source.productos_admin:state.source.productos}
function priceLists(){return state.source.price_lists?.length?state.source.price_lists:[{id:"lista_1",nombre:"Lista 1"}]}
function priceListLabel(id){return priceLists().find(x=>x.id===id)?.nombre||String(id||"").replace("lista_","Lista ")}
function fillPriceListSelect(select,value=""){
  if(!select)return;select.innerHTML=priceLists().map(list=>`<option value="${esc(list.id)}">${esc(list.nombre)}</option>`).join("");
  if(value&&priceLists().some(x=>x.id===value))select.value=value;
}

function renderMasters() {
  const q=normalize($("#mastersSearch").value),selectedList=$("#mastersPriceList").value||priceLists()[0]?.id||"lista_1";let rows=[];
  $("#productAdminNotice").textContent=!isAdmin()?"Tu sesión es de consulta; solo Ale puede modificar maestros.":sourceWritesEnabled()?"Escritura habilitada: los cambios impactan en D9_pedidos y quedan auditados.":"Modo seguro: podés revisar y preparar cambios, pero D9_pedidos está bloqueada hasta activar SOURCE_WRITES_ENABLED.";
  $("#btnNewProduct").disabled=!isAdmin();$("#btnBulkPrices").disabled=!isAdmin();
  rows=adminProducts().filter(p=>matchesSearch([p.id,p.nombre,p.categoria,p.marca],q)).slice(0,500).map(p=>`<article class="data-card product-master-card ${activeValue(p.activo)?"":"inactive"}"><div><h3>${esc(p.nombre)}</h3><p>${esc(p.categoria||"Sin categoría")} · ${esc(p.marca||"Sin marca")}</p><div class="meta"><span class="pill">${esc(p.id)}</span><span class="pill ${activeValue(p.activo)?"green":"red"}">${activeValue(p.activo)?"Activo":"Oculto"}</span>${priceLists().map(list=>numeric(p[list.id])>0?`<span class="pill">${esc(list.nombre)} ${money(p[list.id])}</span>`:"").join("")}</div></div><div class="card-side"><strong>${money(p[selectedList])}</strong>${isAdmin()?`<button class="mini-btn primary" data-edit-product="${esc(p.id)}">Editar</button>`:""}</div></article>`);
  $("#mastersList").className="card-list";$("#mastersList").innerHTML=rows.join("")||'<div class="empty">Sin resultados.</div>';
}

function hydrateMasterFilters(){
  const select=$("#mastersPriceList"),current=select?.value;fillPriceListSelect(select,current||priceLists()[0]?.id);
}

function fillProductDatalist(id,key){
  const list=document.getElementById(id);if(!list)return;
  list.innerHTML=uniqueValues(key).map(value=>`<option value="${esc(value)}"></option>`).join("");
}
function hydrateProductSuggestions(){fillProductDatalist("productCategoryOptions","categoria");fillProductDatalist("productBrandOptions","marca")}

function openProductEditor(productId=""){
  if(!isAdmin())return toast("Esta sesión no puede modificar productos.","error");
  const product=productId?adminProducts().find(p=>String(p.id)===String(productId)):null;
  hydrateProductSuggestions();
  $("#productForm").reset();$("#productDialogTitle").textContent=product?"Editar producto":"Nuevo producto";
  $("#productId").value=product?.id||"";$("#productId").readOnly=!!product;$("#productName").value=product?.nombre||"";$("#productCategory").value=product?.categoria||"";$("#productBrand").value=product?.marca||"";$("#productActive").value=activeValue(product?.activo??"si")?"si":"no";
  $("#productPriceFields").innerHTML=priceLists().map(list=>`<label>${esc(list.nombre)}<input data-product-price="${esc(list.id)}" type="number" min="0" step="0.01" inputmode="decimal" value="${product?.[list.id]===undefined||product?.[list.id]===""?"":esc(numeric(product[list.id]))}"></label>`).join("");
  $("#btnSaveProduct").disabled=!sourceWritesEnabled();$("#btnSaveProduct").title=sourceWritesEnabled()?"":"Activá SOURCE_WRITES_ENABLED para guardar en la Sheet central.";
  $("#productFormMessage").classList.add("hidden");$("#productDialog").showModal();setTimeout(()=>$(product?"#productName":"#productId").focus(),50);
}

function upsertBy(rows,key,value){const index=rows.findIndex(row=>String(row[key])===String(value[key]));if(index>=0)rows[index]={...rows[index],...value};else rows.push(value)}
function stageSourceProduct(producto){upsertBy(state.source.productos_admin,"id",producto);state.source.productos=state.source.productos_admin.filter(p=>activeValue(p.activo)&&priceLists().some(list=>numeric(p[list.id])>0));saveCurrentCache()}
async function saveProduct(event){
  event.preventDefault();const button=$("#btnSaveProduct"),message=$("#productFormMessage");if(!sourceWritesEnabled())return toast("La escritura sobre D9_pedidos está bloqueada por seguridad.","error");
  const producto={id:$("#productId").value.trim(),nombre:$("#productName").value.trim(),categoria:$("#productCategory").value.trim(),marca:$("#productBrand").value.trim(),activo:$("#productActive").value};
  $$('[data-product-price]',$("#productPriceFields")).forEach(input=>producto[input.dataset.productPrice]=input.value===""?"":numeric(input.value));
  button.disabled=true;button.textContent="Guardando…";message.classList.add("hidden");
  try{const result=await apiPost("source_save_product",{producto});stageSourceProduct(producto);toast(result.message||"Producto guardado");$("#productDialog").close();hydrateMasterFilters();renderMasters();refreshAfterMutation()}
  catch(err){message.textContent=err.message;message.className="form-message error"}
  finally{button.disabled=false;button.textContent="Guardar producto"}
}

function uniqueValues(key){const values=new Map();adminProducts().forEach(p=>{const value=String(p[key]||"").trim(),normalized=normalize(value);if(value&&normalized&&!values.has(normalized))values.set(normalized,value)});return [...values.values()].sort((a,b)=>a.localeCompare(b,"es"))}
function fillBulkFilters(){
  $("#bulkCategory").innerHTML='<option value="">Todas</option>'+uniqueValues("categoria").map(v=>`<option>${esc(v)}</option>`).join("");
  $("#bulkBrand").innerHTML='<option value="">Todas</option>'+uniqueValues("marca").map(v=>`<option>${esc(v)}</option>`).join("");
  fillPriceListSelect($("#bulkSourceList"),priceLists()[0]?.id);fillPriceListSelect($("#bulkTargetList"),priceLists()[0]?.id);
}
function openBulkPrices(){
  if(!isAdmin())return toast("Esta sesión no puede modificar precios.","error");
  $("#bulkPriceForm").reset();fillBulkFilters();state.bulkPriceChanges=[];$("#bulkPreview").className="bulk-preview empty";$("#bulkPreview").textContent="Sin cambios calculados.";$("#bulkSummary").textContent="Completá los filtros y la variación.";$("#btnApplyBulkPrices").disabled=true;$("#bulkPriceDialog").showModal();
}
function roundedPrice(value,step){const unit=Math.max(.01,numeric(step));return Math.round((Math.max(0,value)+Number.EPSILON)/unit)*unit}
function calculateBulkPreview(){
  const search=$("#bulkSearch").value,category=$("#bulkCategory").value,brand=$("#bulkBrand").value,source=$("#bulkSourceList").value,target=$("#bulkTargetList").value,operation=$("#bulkOperation").value,variation=numeric($("#bulkValue").value),rounding=$("#bulkRounding").value;
  const products=adminProducts().filter(p=>activeValue(p.activo)&&(!category||String(p.categoria)===category)&&(!brand||String(p.marca)===brand)&&matchesSearch([p.id,p.nombre,p.categoria,p.marca],search));
  state.bulkPriceChanges=products.map(p=>{const base=numeric(p[source]),old=numeric(p[target]);if(base<=0)return null;const raw=operation==="percent"?base*(1+variation/100):base+variation,next=Math.max(0,Math.round(roundedPrice(raw,rounding)*100)/100);return Math.abs(next-old)>.004?{id:String(p.id),nombre:p.nombre,lista:target,anterior:old,nuevo:next}:null}).filter(Boolean);
  const changes=state.bulkPriceChanges;$("#bulkSummary").textContent=`${changes.length} producto${changes.length===1?"":"s"} cambiarán en ${priceListLabel(target)}.`;
  $("#bulkPreview").className="bulk-preview";$("#bulkPreview").innerHTML=changes.length?`<div class="bulk-table">${changes.slice(0,80).map(c=>`<div><span><b>${esc(c.id)}</b> ${esc(c.nombre)}</span><del>${money(c.anterior)}</del><strong>${money(c.nuevo)}</strong></div>`).join("")}</div>${changes.length>80?`<p class="helper">Se muestran 80 de ${changes.length} cambios.</p>`:""}`:'<div class="empty">Los filtros no producen cambios.</div>';
  $("#btnApplyBulkPrices").disabled=!changes.length||!sourceWritesEnabled();
}
async function applyBulkPrices(event){
  event.preventDefault();if(!sourceWritesEnabled())return toast("La escritura sobre D9_pedidos está bloqueada por seguridad.","error");if(!state.bulkPriceChanges.length)return;if(!confirm(`¿Aplicar ${state.bulkPriceChanges.length} cambios de precios en la Sheet original?`))return;
  const button=$("#btnApplyBulkPrices");button.disabled=true;button.textContent="Aplicando…";
  try{const result=await apiPost("source_bulk_prices",{cambios:state.bulkPriceChanges});state.bulkPriceChanges.forEach(change=>{const product=state.source.productos_admin.find(p=>String(p.id)===String(change.id));if(product)product[change.lista]=change.nuevo});state.source.productos=state.source.productos_admin.filter(p=>activeValue(p.activo)&&priceLists().some(list=>numeric(p[list.id])>0));saveCurrentCache();toast(`${result.actualizados||0} precios actualizados`);$("#bulkPriceDialog").close();renderMasters();refreshAfterMutation()}
  catch(err){toast(err.message,"error")}
  finally{button.disabled=false;button.textContent="Aplicar cambios"}
}

function adminClients(){return state.source.clientes_admin?.length?state.source.clientes_admin:state.source.clientes}
const CLIENT_FISCAL_REQUIRED=["razon_social","tipo_documento","numero_documento","condicion_iva","domicilio_fiscal","localidad_fiscal","provincia_fiscal"];
const CLIENT_FISCAL_FIELDS=[...CLIENT_FISCAL_REQUIRED,"codigo_postal","email_facturacion","cuit"];
function clientFiscalState(client={}){
  const data={...client};
  if(!data.numero_documento&&data.cuit)data.numero_documento=data.cuit;
  if(!data.tipo_documento&&data.cuit)data.tipo_documento="CUIT";
  const hasAny=CLIENT_FISCAL_FIELDS.some(key=>String(data[key]||"").trim());
  if(!hasAny)return {id:"empty",label:"Sin datos fiscales",missing:CLIENT_FISCAL_REQUIRED};
  const missing=CLIENT_FISCAL_REQUIRED.filter(key=>!String(data[key]||"").trim());
  if((data.tipo_documento==="CUIT"||data.tipo_documento==="CUIL")&&data.numero_documento&&!validCuit(data.numero_documento))missing.push("numero_documento_invalido");
  if(data.tipo_documento==="DNI"&&data.numero_documento){const length=onlyDigits(data.numero_documento).length;if(length<7||length>9)missing.push("numero_documento_invalido")}
  return missing.length?{id:"incomplete",label:`Faltan ${missing.length} datos fiscales`,missing}:{id:"complete",label:"Listo para facturar",missing:[]};
}
function clientAssignedList(client){const assigned=String(client?.lista_precio||"lista_1").toLowerCase();return priceLists().some(list=>list.id===assigned)?assigned:"lista_1"}
function nextClientId(){const values=adminClients().map(c=>Number(String(c.id||"").replace(/\D+/g,""))).filter(n=>Number.isFinite(n)&&n>0);return String(values.length?Math.max(...values)+1:1)}
function onlyDigits(value){return String(value||"").replace(/\D/g,"")}
function validCuit(value){const digits=onlyDigits(value);if(digits.length!==11)return false;const weights=[5,4,3,2,7,6,5,4,3,2];const sum=weights.reduce((total,weight,index)=>total+Number(digits[index])*weight,0);let check=11-(sum%11);if(check===11)check=0;else if(check===10)check=9;return check===Number(digits[10])}
function readClientFiscalForm(){return {razon_social:$("#clientLegalName").value.trim(),tipo_documento:$("#clientDocumentType").value,numero_documento:$("#clientDocumentNumber").value.trim(),condicion_iva:$("#clientVatCondition").value,domicilio_fiscal:$("#clientFiscalAddress").value.trim(),localidad_fiscal:$("#clientFiscalCity").value.trim(),provincia_fiscal:$("#clientFiscalProvince").value.trim(),codigo_postal:$("#clientPostalCode").value.trim(),email_facturacion:$("#clientBillingEmail").value.trim()}}
function updateClientFiscalStatus(){
  const status=clientFiscalState(readClientFiscalForm()),badge=$("#clientFiscalStatus");
  badge.textContent=status.label;badge.className=`pill ${status.id==="complete"?"green":status.id==="incomplete"?"amber":""}`;
}
function hydrateClientFilters(){
  const filter=$("#clientsPriceList"),current=filter?.value;
  if(filter){filter.innerHTML='<option value="">Todas las listas</option>'+priceLists().map(list=>`<option value="${esc(list.id)}">${esc(list.nombre)}</option>`).join("");if(current&&priceLists().some(list=>list.id===current))filter.value=current;}
}
function renderClients(){
  const search=$("#clientsSearch"),listFilter=$("#clientsPriceList"),sellerFilter=$("#clientsSeller"),statusFilter=$("#clientsStatus"),fiscalFilter=$("#clientsFiscal");if(!search||!listFilter||!sellerFilter||!statusFilter||!fiscalFilter)return;
  const q=search.value,list=listFilter.value,seller=sellerFilter.value,status=statusFilter.value,fiscal=fiscalFilter.value;
  $("#clientAdminNotice").textContent=!isAdmin()?"Tu sesión es de consulta; solo Ale puede modificar clientes.":sourceWritesEnabled()?"Escritura habilitada: los cambios impactan en D9_pedidos y quedan auditados.":"Modo seguro: podés revisar clientes, pero el guardado en D9_pedidos está bloqueado.";
  $("#btnNewClient").disabled=!isAdmin();$("#btnAssignSellers").disabled=!isAdmin();$("#btnImportClients").disabled=!isAdmin();
  const all=[...adminClients()].sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||""),"es",{sensitivity:"base",numeric:true}));
  const rows=all.filter(client=>{
    const active=activeValue(client.activo),fiscalState=clientFiscalState(client);
    if(status==="active"&&!active)return false;if(status==="inactive"&&active)return false;
    if(list&&clientAssignedList(client)!==list)return false;
    if(seller==="__NONE__"&&client.vendedor_id)return false;if(seller&&seller!=="__NONE__"&&String(client.vendedor_id)!==seller)return false;
    if(fiscal!=="all"&&fiscalState.id!==fiscal)return false;
    return matchesSearch([client.id,client.nombre,client.telefono,client.direccion,client.ciudad,client.razon_social,client.cuit,client.numero_documento,client.condicion_iva,client.vendedor,sellerLabel(client.vendedor_id)],q);
  }).slice(0,700);
  $("#clientsSummary").textContent=`${rows.length} mostrados · ${all.length} clientes en total`;
  $("#clientsList").className="card-list";
  $("#clientsList").innerHTML=rows.map(client=>{const fiscalState=clientFiscalState(client),active=activeValue(client.activo),assigned=clientAssignedList(client),document=client.numero_documento||client.cuit||"",sellerName=sellerLabel(client.vendedor_id,client.vendedor);return `<article class="data-card client-master-card ${active?"":"inactive"}"><div><h3>${esc(client.nombre||"Sin nombre")}</h3><p>${esc([client.direccion,client.ciudad,client.telefono].filter(Boolean).join(" · ")||"Sin datos comerciales adicionales")}</p><div class="meta"><span class="pill">${esc(client.id)}</span><span class="pill ${active?"green":"red"}">${active?"Activo":"Oculto"}</span><span class="pill blue">${esc(priceListLabel(assigned))}</span><span class="pill ${client.vendedor_id?"violet":"amber"}">👤 ${esc(sellerName)}</span><span class="pill ${fiscalState.id==="complete"?"green":fiscalState.id==="incomplete"?"amber":""}">${esc(fiscalState.label)}</span>${document?`<span class="pill">${esc(client.tipo_documento||"CUIT")} ${esc(document)}</span>`:""}</div></div><div class="card-side">${client.razon_social?`<small>${esc(client.razon_social)}</small>`:""}<div class="row-actions"><button class="mini-btn" data-client-account="${esc(client.id)}">Cta. corriente</button>${isAdmin()?`<button class="mini-btn primary" data-edit-client="${esc(client.id)}">Editar</button>`:""}</div></div></article>`}).join("")||'<div class="empty">No hay clientes con esos filtros.</div>';
}

function operationSellerInfo(operation){
  const commissionStatus=operationCommissionStatus(operation);if(commissionStatus==="NO_APLICA")return {id:"__NO_COMMISSION__",nombre:"Venta directa / sin comisión"};
  if(operation.vendedor_id||operation.vendedor)return {id:String(operation.vendedor_id||""),nombre:sellerLabel(operation.vendedor_id,operation.vendedor)};
  const reference=state.gestion.operaciones.find(item=>String(item.operacion_id)===String(operation.referencia_operacion_id));if(reference){const inherited=operationSellerInfo(reference);if(inherited.id)return inherited}
  const order=state.source.pedidos.find(item=>String(item.pedido_id)===String(operation.origen_pedido_id));if(order?.vendedor_id||order?.vendedor)return {id:String(order.vendedor_id||""),nombre:sellerLabel(order.vendedor_id,order.vendedor)};
  return {id:"",nombre:"Pendiente de definir"};
}
function operationCommissionStatus(operation){const explicit=String(operation?.comision_estado||"").toUpperCase();if(explicit)return explicit;if(operation?.vendedor_id)return "APLICA";const reference=state.gestion.operaciones.find(item=>String(item.operacion_id)===String(operation?.referencia_operacion_id));if(reference)return operationCommissionStatus(reference);const order=state.source.pedidos.find(item=>String(item.pedido_id)===String(operation?.origen_pedido_id));return order?.vendedor_id?"APLICA":"PENDIENTE"}
function initialPaymentsForOperation(operation){
  const receipts=state.gestion.recibos.filter(receipt=>String(receipt.operacion_id)===String(operation.operacion_id)&&!isAnnulled(receipt.estado)&&normalize(receipt.observaciones).startsWith("pago inicial"));
  const stored=receipts.flatMap(receipt=>receiptPayments(receipt.recibo_id)).filter(payment=>!isAnnulled(payment.estado));return stored.length?stored:(operation._initial_payments||[]);
}
function paymentLabelForOperation(operation){
  if(String(operation.tipo).toUpperCase()==="NOTA_CREDITO")return {parts:[],text:"Nota de crédito"};
  const payments=initialPaymentsForOperation(operation),parts=[];payments.forEach(payment=>{const current=parts.find(item=>item.method===payment.medio);if(current)current.amount+=numeric(payment.importe);else parts.push({method:payment.medio,amount:numeric(payment.importe)})});
  const paid=parts.reduce((sum,item)=>sum+item.amount,0),credit=Math.max(0,numeric(operation.total)-paid);if(credit>.005)parts.push({method:"CUENTA_CORRIENTE",amount:credit});
  return {parts,text:parts.map(item=>`${item.method.replace("CUENTA_CORRIENTE","Cta. cte.")} ${money(item.amount)}`).join(" · ")||"Cta. cte."};
}
function salesReportRows(){
  const from=$("#reportSalesFrom").value,to=$("#reportSalesTo").value,seller=$("#reportSalesSeller").value;
  return activeOperations().filter(operation=>{const date=String(operation.fecha||"").slice(0,10),info=operationSellerInfo(operation);return (!from||date>=from)&&(!to||date<=to)&&(!seller||String(info.id)===seller)}).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha))||String(a.created_at).localeCompare(String(b.created_at)));
}
function operationSignedTotal(operation){return numeric(operation.total)*(String(operation.tipo).toUpperCase()==="NOTA_CREDITO"?-1:1)}
function salesReportTotals(rows){const totals={VENTAS:0,EFECTIVO:0,TRANSFERENCIA:0,CHEQUE:0,CUENTA_CORRIENTE:0};rows.forEach(operation=>{totals.VENTAS+=operationSignedTotal(operation);paymentLabelForOperation(operation).parts.forEach(item=>totals[item.method]=(totals[item.method]||0)+item.amount)});return totals}
function operationTime(operation){
  const raw=String(operation.created_at||"").trim();if(!raw)return "—";
  if(/T/.test(raw)||/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)){const parsed=new Date(raw);if(!Number.isNaN(parsed.getTime()))return parsed.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"America/Argentina/Buenos_Aires"})}
  const match=raw.match(/\s(\d{2}:\d{2})(?::\d{2})?/);return match?match[1]:"—";
}
function renderSalesReport(){
  $("#salesReportResults")?.classList.remove("hidden");
  const list=$("#salesReportList"),summary=$("#salesReportSummary");if(!list||!summary)return;const from=$("#reportSalesFrom").value,to=$("#reportSalesTo").value;if(from&&to&&from>to){list.className="report-table-wrap empty";list.textContent="La fecha desde no puede ser posterior a la fecha hasta.";summary.innerHTML="";return}
  const rows=salesReportRows(),totals=salesReportTotals(rows);summary.innerHTML=`<div><small>Comprobantes</small><strong>${rows.length}</strong></div><div><small>Ventas</small><strong>${money(totals.VENTAS)}</strong></div><div><small>Efectivo</small><strong>${money(totals.EFECTIVO)}</strong></div><div><small>Transferencias</small><strong>${money(totals.TRANSFERENCIA)}</strong></div><div><small>Cheques</small><strong>${money(totals.CHEQUE)}</strong></div><div><small>Cta. cte.</small><strong>${money(totals.CUENTA_CORRIENTE)}</strong></div>`;
  list.className="report-table-wrap";list.innerHTML=rows.length?`<table class="report-table"><thead><tr><th>Fecha / hora</th><th>Vendedor</th><th>Cliente</th><th>Comprobante</th><th>Pago inicial</th><th>Total</th></tr></thead><tbody>${rows.map(operation=>{const seller=operationSellerInfo(operation),signed=operationSignedTotal(operation);return `<tr><td>${formatDate(operation.fecha)}<small>${operationTime(operation)}</small></td><td>${esc(seller.nombre)}</td><td>${esc(operation.cliente)}</td><td>${esc(operationTypeLabel(operation.tipo))} ${esc(formatOperationNumber(operation.numero))}</td><td>${esc(paymentLabelForOperation(operation).text)}</td><td class="${signed<0?"negative":""}"><strong>${money(signed)}</strong></td></tr>`}).join("")}</tbody></table>`:'<div class="empty">No hay ventas para el período.</div>';
}
function printSalesReport(){
  const rows=salesReportRows();if(!rows.length)return toast("No hay ventas para imprimir.","error");const totals=salesReportTotals(rows),from=$("#reportSalesFrom").value,to=$("#reportSalesTo").value,seller=$("#reportSalesSeller").selectedOptions[0]?.textContent||"Todos los vendedores";
  const body=`<div class="head"><div><h1>${esc(state.gestion.config.empresa_nombre||"Distribuidora D9")}</h1><p>Ventas del ${formatDate(from)} al ${formatDate(to)}</p></div><div class="doc"><strong>${esc(seller)}</strong><p>Emitido ${formatDate(todayISO())}</p></div></div><table><thead><tr><th>Hora</th><th>Cliente</th><th>Comprobante</th><th>Pagos</th><th>Total</th></tr></thead><tbody>${rows.map(operation=>`<tr><td>${esc(operationTime(operation))}</td><td>${esc(operation.cliente)}</td><td>${esc(operationTypeLabel(operation.tipo))} ${esc(formatOperationNumber(operation.numero))}</td><td>${esc(paymentLabelForOperation(operation).text)}</td><td>${money(operationSignedTotal(operation))}</td></tr>`).join("")}</tbody></table><div class="totals"><div><span>Efectivo</span><b>${money(totals.EFECTIVO)}</b></div><div><span>Transferencias</span><b>${money(totals.TRANSFERENCIA)}</b></div><div><span>Cheques</span><b>${money(totals.CHEQUE)}</b></div><div><span>Cuenta corriente</span><b>${money(totals.CUENTA_CORRIENTE)}</b></div><div class="grand"><span>Total ventas</span><b>${money(totals.VENTAS)}</b></div></div>`;printWindow("Ventas por vendedor",body,"A4");
}

function commissionRuleAt(sellerId,brand,date){const normalizedBrand=normalize(brand||"general"),day=String(date||"").slice(0,10);return (state.gestion.comisiones_reglas||[]).filter(rule=>{const from=String(rule.vigente_desde||"").slice(0,10),to=String(rule.vigente_hasta||"").slice(0,10),ruleBrand=normalize(rule.marca||"general");return String(rule.vendedor_id)===String(sellerId)&&activeValue(rule.activo)&&(!from||from<=day)&&(!to||to>=day)&&(ruleBrand==="general"||ruleBrand===normalizedBrand)}).sort((a,b)=>{const exactA=normalize(a.marca||"general")===normalizedBrand?1:0,exactB=normalize(b.marca||"general")===normalizedBrand?1:0;return exactB-exactA||String(b.vigente_desde||"").localeCompare(String(a.vigente_desde||""))})[0]||null}
function commissionClosureOverlap(from,to){return (state.gestion.comisiones_cierres||[]).find(row=>String(row.estado).toUpperCase()==="CERRADO"&&String(row.desde).slice(0,10)<=to&&String(row.hasta).slice(0,10)>=from)||null}
function liveCommissionLines(from,to){
  const opMap=Object.fromEntries(state.gestion.operaciones.map(op=>[String(op.operacion_id),op])),productBrands=Object.fromEntries(adminProducts().map(product=>[String(product.id),String(product.marca||"")])),lines=[],missing=[];
  activeOperations().filter(op=>["REMITO","NOTA_CREDITO"].includes(String(op.tipo).toUpperCase())&&String(op.credito_tipo||"").toUpperCase()!=="CREDITO_GENERAL"&&String(op.fecha).slice(0,10)>=from&&String(op.fecha).slice(0,10)<=to).forEach(op=>{
    const type=String(op.tipo).toUpperCase(),sign=type==="NOTA_CREDITO"?-1:1,commissionStatus=operationCommissionStatus(op),seller=operationSellerInfo(op),reference=opMap[String(op.referencia_operacion_id||"")],referenceItems=reference?operationItems(reference.operacion_id):[],items=operationItems(op.operacion_id),rows=items.length?items:[{producto:"Total del comprobante",subtotal:op.total,comision_base:op.total,marca:"GENERAL"}],discount=numeric(op.descuento_pct);
    rows.forEach((item,index)=>{const brand=item.marca||productBrands[String(item.producto_id)]||"GENERAL",original=referenceItems.find(row=>String(row.producto_id)===String(item.producto_id))||{},stored=String(item.comision_porcentaje??"").trim(),originalStored=String(original.comision_porcentaje??"").trim(),rule=commissionStatus==="NO_APLICA"?{regla_id:"NO_APLICA",porcentaje:0}:(stored!==""?{regla_id:item.comision_regla_id,porcentaje:numeric(stored)}:(originalStored!==""?{regla_id:original.comision_regla_id,porcentaje:numeric(originalStored)}:commissionRuleAt(seller.id,brand,reference?.fecha||op.fecha)));let base=String(item.comision_base??"").trim()!==""?numeric(item.comision_base):numeric(item.subtotal)*(1-discount/100);if(index===rows.length-1){const previous=rows.slice(0,index).reduce((sum,row)=>sum+(String(row.comision_base??"").trim()!==""?numeric(row.comision_base):numeric(row.subtotal)*(1-discount/100)),0);base=numeric(op.total)-previous}if(commissionStatus==="PENDIENTE"||!seller.id||!rule){missing.push({operacion:op,vendedor:seller.nombre,producto:item.producto,motivo:commissionStatus==="PENDIENTE"?"PENDIENTE":"SIN_REGLA"});return}const signedBase=Math.round(base*sign*100)/100;lines.push({vendedor_id:seller.id,vendedor:seller.nombre,fecha:String(op.fecha).slice(0,10),operacion_id:op.operacion_id,tipo:type,numero:op.numero,cliente:op.cliente,referencia_operacion_id:op.referencia_operacion_id||"",referencia_numero:op.referencia_numero||reference?.numero||"",producto_id:item.producto_id||"",producto:item.producto||"",marca:brand,base:signedBase,regla_id:rule.regla_id||"",porcentaje:numeric(rule.porcentaje),comision:Math.round(signedBase*numeric(rule.porcentaje))/100})});
  });return {lines,missing};
}
function commissionReportData(){
  const from=$("#reportCommissionFrom").value,to=$("#reportCommissionTo").value,seller=$("#reportCommissionSeller").value,exact=(state.gestion.comisiones_cierres||[]).find(row=>String(row.estado).toUpperCase()==="CERRADO"&&String(row.desde).slice(0,10)===from&&String(row.hasta).slice(0,10)===to);let lines,missing=[];
  if(exact)lines=(state.gestion.comisiones_detalle||[]).filter(line=>String(line.cierre_id)===String(exact.cierre_id));else ({lines,missing}=liveCommissionLines(from,to));if(seller){lines=lines.filter(line=>String(line.vendedor_id)===seller);missing=missing.filter(item=>String(operationSellerInfo(item.operacion).id)===seller)}
  return {from,to,seller,closure:exact,overlap:commissionClosureOverlap(from,to),future:to>todayISO(),lines,missing};
}
function commissionOperationRows(lines){const map=new Map();lines.forEach(line=>{const key=String(line.operacion_id);if(!map.has(key))map.set(key,{...line,base:0,comision:0,percentages:new Set()});const row=map.get(key);row.base+=numeric(line.base);row.comision+=numeric(line.comision);row.percentages.add(numeric(line.porcentaje))});return [...map.values()].map(row=>({...row,porcentaje_text:[...row.percentages].map(value=>`${number(value)}%`).join(" + ")})).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha))||String(a.numero).localeCompare(String(b.numero)))}
function commissionSellerGroups(lines){const map=new Map();lines.forEach(line=>{const key=String(line.vendedor_id);if(!map.has(key))map.set(key,{vendedor_id:key,vendedor:line.vendedor,lines:[]});map.get(key).lines.push(line)});return [...map.values()].map(group=>{const docs=commissionOperationRows(group.lines),sales=docs.filter(row=>row.base>0).reduce((sum,row)=>sum+row.base,0),credits=Math.abs(docs.filter(row=>row.base<0).reduce((sum,row)=>sum+row.base,0)),commission=docs.reduce((sum,row)=>sum+row.comision,0);return {...group,docs,ventas:sales,notas_credito:credits,base:sales-credits,comision:commission}}).sort((a,b)=>String(a.vendedor).localeCompare(String(b.vendedor),"es"))}
function renderCommissionReport(){
  $("#commissionReportResults")?.classList.remove("hidden");
  const summary=$("#commissionReportSummary"),list=$("#commissionReportList"),status=$("#commissionReportStatus"),close=$("#btnCloseCommissions"),from=$("#reportCommissionFrom").value,to=$("#reportCommissionTo").value;if(!from||!to||from>to){summary.innerHTML="";list.className="commission-report-list empty";list.textContent="Elegí un período válido.";status.className="commission-report-status error";status.textContent="La fecha desde no puede ser posterior a la fecha hasta.";close.disabled=true;return}
  const data=commissionReportData(),groups=commissionSellerGroups(data.lines),docs=commissionOperationRows(data.lines),sales=docs.filter(row=>row.base>0).reduce((sum,row)=>sum+row.base,0),credits=Math.abs(docs.filter(row=>row.base<0).reduce((sum,row)=>sum+row.base,0)),commission=docs.reduce((sum,row)=>sum+row.comision,0);summary.innerHTML=`<div><small>Comprobantes</small><strong>${docs.length}</strong></div><div><small>Remitos</small><strong>${money(sales)}</strong></div><div><small>Notas de crédito</small><strong>− ${money(credits)}</strong></div><div><small>Base neta</small><strong>${money(sales-credits)}</strong></div><div><small>Comisión total</small><strong>${money(commission)}</strong></div>`;
  if(data.closure){status.className="commission-report-status closed";status.innerHTML=`🔒 Período cerrado por <b>${esc(data.closure.cerrado_por||"Administración")}</b> · ${esc(data.closure.cerrado_at||"")}`;}else if(data.missing.length){const pending=data.missing.some(item=>item.motivo==="PENDIENTE"),names=[...new Set(data.missing.filter(item=>item.motivo!=="PENDIENTE").map(item=>item.vendedor))];status.className="commission-report-status warning";status.textContent=pending?"Hay remitos pendientes: asignales vendedor o marcalos como venta directa sin comisión antes de cerrar.":`Faltan reglas de comisión para: ${names.join(", ")}. Podés consultar, pero no cerrar.`;}else if(data.overlap){status.className="commission-report-status warning";status.textContent=`El período incluye un cierre existente del ${formatDate(data.overlap.desde)} al ${formatDate(data.overlap.hasta)}.`;}else if(data.future){status.className="commission-report-status warning";status.textContent="Podés consultar este período, pero sólo se cierra cuando haya terminado.";}else{status.className="commission-report-status open";status.textContent="Período abierto · los importes se actualizan con los comprobantes vigentes."}
  close.disabled=!!data.closure||!!data.overlap||!!data.missing.length||data.future||!data.lines.length||!!data.seller;close.textContent=data.closure?"🔒 Período cerrado":"🔒 Cerrar período";
  list.className="commission-report-list";list.innerHTML=groups.length?groups.map(group=>`<details class="commission-seller-card" open><summary><span><strong>${esc(group.vendedor)}</strong><small>${group.docs.length} comprobantes · Base ${money(group.base)}</small></span><b>${money(group.comision)}</b></summary><div class="commission-seller-detail"><table class="report-table commission-table"><thead><tr><th>Fecha</th><th>Comprobante</th><th>Cliente</th><th>Base</th><th>%</th><th>Comisión</th></tr></thead><tbody>${group.docs.map(row=>`<tr><td>${formatDate(row.fecha)}</td><td><button class="table-link" data-operation-detail="${esc(row.operacion_id)}">${esc(operationTypeLabel(row.tipo))} ${esc(formatOperationNumber(row.numero))}</button>${row.referencia_numero?`<small>Sobre ${esc(formatOperationNumber(row.referencia_numero))}</small>`:""}</td><td>${esc(row.cliente)}</td><td class="${row.base<0?"negative":""}">${money(row.base)}</td><td>${esc(row.porcentaje_text)}</td><td class="${row.comision<0?"negative":""}"><strong>${money(row.comision)}</strong></td></tr>`).join("")}</tbody></table></div></details>`).join(""):'<div class="empty">No hay movimientos comisionables para el período.</div>';
  renderCommissionClosures();
}
function renderCommissionClosures(){const el=$("#commissionClosures"),rows=[...(state.gestion.comisiones_cierres||[])].sort((a,b)=>String(b.hasta).localeCompare(String(a.hasta))).slice(0,12);el.className="commission-closures";el.innerHTML=rows.length?rows.map(row=>`<button type="button" data-commission-closure="${esc(row.cierre_id)}"><span><strong>${formatDate(row.desde)} al ${formatDate(row.hasta)}</strong><small>Cerrado por ${esc(row.cerrado_por||"Administración")}</small></span><b>${money(row.comision_total)}</b></button>`).join(""):'<div class="empty">Todavía no hay cierres.</div>'}
function openCommissionClosure(id){const row=(state.gestion.comisiones_cierres||[]).find(item=>String(item.cierre_id)===String(id));if(!row)return;openReport("commissions");$("#reportCommissionFrom").value=String(row.desde).slice(0,10);$("#reportCommissionTo").value=String(row.hasta).slice(0,10);$("#reportCommissionSeller").value="";renderCommissionReport();$("#commissionReportStatus").scrollIntoView({behavior:"smooth",block:"center"})}
async function closeCommissions(){const data=commissionReportData();if(data.seller)return toast("El cierre incluye a todos los vendedores. Quitá el filtro individual.","error");if(data.missing.length||data.overlap||data.future||!data.lines.length)return toast("El período todavía no está listo para cerrar.","error");if(!confirm(`¿Cerrar definitivamente las comisiones del ${formatDate(data.from)} al ${formatDate(data.to)}?\n\nDespués no se podrán alterar los comprobantes comisionables de ese período.`))return;const button=$("#btnCloseCommissions");button.disabled=true;button.textContent="Cerrando…";try{const result=await apiPost("close_commissions",{desde:data.from,hasta:data.to});state.gestion.comisiones_cierres.push(result.cierre);state.gestion.comisiones_detalle.push(...(result.detalle||[]).map((line,index)=>({...line,detalle_id:`LOCAL-CD-${index}`,cierre_id:result.cierre.cierre_id})));saveCurrentCache();toast(result.message||"Período cerrado");await refreshAfterMutation()}catch(err){toast(err.message,"error")}finally{button.disabled=false;button.textContent="🔒 Cerrar período"}}
function printCommissionReport(){const data=commissionReportData(),groups=commissionSellerGroups(data.lines);if(!groups.length)return toast("No hay comisiones para imprimir.","error");const body=`<div class="head"><div><h1>${esc(state.gestion.config.empresa_nombre||"Distribuidora D9")}</h1><p>Comisiones del ${formatDate(data.from)} al ${formatDate(data.to)}</p></div><div class="doc"><strong>${data.closure?"PERÍODO CERRADO":"VISTA PREVIA"}</strong><p>Emitido ${formatDate(todayISO())}</p></div></div>${groups.map(group=>`<section style="margin-top:14px;break-inside:avoid"><h3>${esc(group.vendedor)} · Comisión ${money(group.comision)}</h3><table><thead><tr><th>Fecha</th><th>Comprobante</th><th>Cliente</th><th>Base</th><th>%</th><th>Comisión</th></tr></thead><tbody>${group.docs.map(row=>`<tr><td>${formatDate(row.fecha)}</td><td>${esc(operationTypeLabel(row.tipo))} ${esc(formatOperationNumber(row.numero))}</td><td>${esc(row.cliente)}</td><td>${money(row.base)}</td><td>${esc(row.porcentaje_text)}</td><td>${money(row.comision)}</td></tr>`).join("")}</tbody></table><div class="totals"><div><span>Remitos</span><b>${money(group.ventas)}</b></div><div><span>Notas de crédito</span><b>− ${money(group.notas_credito)}</b></div><div><span>Base neta</span><b>${money(group.base)}</b></div><div class="grand"><span>Comisión</span><b>${money(group.comision)}</b></div></div></section>`).join("")}`;printWindow("Comisiones",body,"A4")}

async function openSellerAssignment(){
  if(!isAdmin())return toast("Esta sesión no puede asignar vendedores.","error");state.sellerAssignments={};state.sellerAssignmentOriginal={};adminClients().forEach(client=>{state.sellerAssignments[String(client.id)]=String(client.vendedor_id||"");state.sellerAssignmentOriginal[String(client.id)]=String(client.vendedor_id||"")});state.sellerSuggestions={};$("#sellerAssignmentSearch").value="";$("#sellerAssignmentMissing").checked=true;const applyButton=$("#btnApplySellerSuggestions"),message=$("#sellerAssignmentMessage");applyButton.disabled=true;applyButton.textContent="Calculando sugerencias…";message.textContent="Estoy revisando los pedidos históricos. Puede tardar unos segundos.";message.className="form-message";$("#sellerAssignmentDialog").showModal();renderSellerAssignments();
  try{const data=await apiPost("source_seller_suggestions",{}),suggestions=data.suggestions||[];state.sellerSuggestions=Object.fromEntries(suggestions.map(item=>[String(item.cliente_id),item]));renderSellerAssignments();message.textContent=suggestions.length?`Encontré ${suggestions.length} sugerencias en los pedidos históricos. Aplicalas y revisalas antes de guardar.`:"No encontré coincidencias seguras en los pedidos históricos. No se modificó ningún cliente.";message.className=`form-message ${suggestions.length?"success":"error"}`;applyButton.disabled=!suggestions.length}catch(err){message.textContent=`No pude calcular sugerencias: ${err.message}`;message.className="form-message error";applyButton.disabled=true}finally{applyButton.textContent="✨ Aplicar sugerencias"}
}
function renderSellerAssignments(){
  const q=$("#sellerAssignmentSearch").value,onlyMissing=$("#sellerAssignmentMissing").checked,rows=adminClients().filter(client=>(!onlyMissing||!state.sellerAssignments[String(client.id)])&&matchesSearch([client.id,client.nombre,client.direccion],q)).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),"es"));
  $("#sellerAssignmentSummary").textContent=`${rows.length} clientes mostrados · ${Object.values(state.sellerAssignments).filter(Boolean).length} asignados en total`;$("#sellerAssignmentList").className="seller-assignment-list";$("#sellerAssignmentList").innerHTML=rows.map(client=>{const id=String(client.id),suggestion=state.sellerSuggestions[id];return `<div class="seller-assignment-row"><span><strong>${esc(client.nombre)}</strong><small>${esc(client.id)}${client.direccion?` · ${esc(client.direccion)}`:""}${suggestion?` · Sugerido: ${esc(suggestion.vendedor)} (${suggestion.pedidos} pedidos)`:" · Sin sugerencia"}</small></span><select data-seller-assignment="${esc(id)}">${sellerOptions(state.sellerAssignments[id])}</select></div>`}).join("")||'<div class="empty">No hay clientes con ese filtro.</div>';
}
function applySellerSuggestions(){const suggestions=Object.entries(state.sellerSuggestions);if(!suggestions.length)return toast("Todavía no hay sugerencias para aplicar.","error");let applied=0;suggestions.forEach(([clientId,suggestion])=>{if(!state.sellerAssignments[clientId]){state.sellerAssignments[clientId]=String(suggestion.vendedor_id);applied++}});$("#sellerAssignmentMissing").checked=false;renderSellerAssignments();toast(applied?`${applied} sugerencias aplicadas. Revisalas antes de guardar.`:"Las sugerencias ya estaban aplicadas.")}
async function saveSellerAssignments(){
  const changes=Object.keys(state.sellerAssignments).filter(id=>state.sellerAssignments[id]!==state.sellerAssignmentOriginal[id]).map(id=>({cliente_id:id,vendedor_id:state.sellerAssignments[id]}));if(!changes.length)return toast("No hay cambios para guardar.","error");
  const button=$("#btnSaveSellerAssignments"),message=$("#sellerAssignmentMessage");button.disabled=true;button.textContent="Guardando…";message.classList.add("hidden");try{const result=await apiPost("source_assign_client_sellers",{asignaciones:changes});const applied=Object.fromEntries((result.asignaciones||[]).map(item=>[String(item.cliente_id),item]));[state.source.clientes_admin,state.source.clientes].forEach(rows=>rows.forEach(client=>{const item=applied[String(client.id)];if(item){client.vendedor_id=item.vendedor_id;client.vendedor=item.vendedor}}));saveCurrentCache();$("#sellerAssignmentDialog").close();hydrateSellerSelectors();renderClients();renderSalesReport();toast(result.message||"Vendedores asignados");refreshAfterMutation()}catch(err){message.textContent=err.message;message.className="form-message error"}finally{button.disabled=false;button.textContent="Guardar asignaciones"}
}

let clientImportModulePromise=null;
function loadClientImportModule(){return clientImportModulePromise||(clientImportModulePromise=import("./client-import.js?v=111"))}
function openClientImportPicker(){
  if(!isAdmin())return toast("Esta sesión no puede importar clientes.","error");
  const input=$("#clientImportFile");input.value="";input.click();
}
async function readClientImportPdf(event){
  const file=event.target.files?.[0];if(!file)return;
  const dialog=$("#clientImportDialog"),loading=$("#clientImportLoading"),content=$("#clientImportContent"),loadingText=$("#clientImportLoadingText");
  state.clientImport=null;state.clientImportDecisions={};content.classList.add("hidden");loading.classList.remove("hidden");loadingText.textContent="Preparando el PDF…";dialog.showModal();
  try{
    const module=await loadClientImportModule(),parsed=await module.parseClientPdf(file,(page,total)=>loadingText.textContent=`Leyendo página ${page} de ${total}…`),analysis=module.analyzeClientImport(parsed.rows,adminClients());
    state.clientImport={...parsed,analysis,module};analysis.review.forEach(item=>{const conflictingName=item.reason==="El código coincide, pero el nombre es diferente";state.clientImportDecisions[item.key]={action:"",targetId:conflictingName?"":String(item.target?.id||"")}});
    loading.classList.add("hidden");content.classList.remove("hidden");renderClientImport();
  }catch(err){loading.classList.add("hidden");content.classList.add("hidden");dialog.close();toast(`No pude leer el PDF: ${err.message}`,"error")}
}
function clientImportTargetOptions(){
  return [...adminClients()].sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),"es")).map(client=>`<option value="${esc(client.id)} · ${esc(client.nombre)}"></option>`).join("");
}
function clientImportVatLabel(value){return ({RESPONSABLE_INSCRIPTO:"Responsable inscripto",MONOTRIBUTO:"Monotributo",EXENTO:"Exento",CONSUMIDOR_FINAL:"Consumidor final"})[value]||value||"Sin condición"}
function renderClientImport(){
  const current=state.clientImport;if(!current)return;const {analysis}=current,decisions=state.clientImportDecisions;
  $("#clientImportSource").textContent=`${current.fileName} · ${current.pages} páginas · ${analysis.total} clientes detectados`;
  const newCandidates=analysis.review.filter(item=>item.canCreate).length;
  $("#clientImportSummary").innerHTML=`<div><small>Leídos del PDF</small><strong>${analysis.total}</strong></div><div class="safe"><small>Seguros</small><strong>${analysis.safe.length}</strong></div><div class="current"><small>Ya actualizados</small><strong>${analysis.already?.length||0}</strong></div><div class="review"><small>Para revisar</small><strong>${analysis.review.length}</strong></div><div><small>Posibles nuevos</small><strong>${newCandidates}</strong></div>`;
  $("#clientImportSafeTitle").textContent=`${analysis.safe.length} coincidencias seguras preparadas`;
  $("#clientImportSafeList").innerHTML=analysis.safe.map(item=>`<div class="import-safe-row"><strong>${esc(item.source.code)} · ${esc(item.source.name)}</strong><small>${esc(item.source.tax_id?`CUIT/DNI ${item.source.tax_id} · ${clientImportVatLabel(item.source.condition)}`:clientImportVatLabel(item.source.condition))}</small></div>`).join("")||'<div class="empty">No hay coincidencias automáticas.</div>';
  $("#clientImportTargetOptions").innerHTML=clientImportTargetOptions();
  $("#clientImportReviewList").innerHTML=analysis.review.map(item=>{
    const decision=decisions[item.key]||{action:"",targetId:""},target=adminClients().find(client=>String(client.id)===String(decision.targetId)),resolved=decision.action==="omit"||decision.action==="create"||(decision.action==="update"&&target),cardClass=decision.action==="omit"?"omitted":resolved?"resolved":"";
    return `<article class="import-review-card ${cardClass}" data-import-key="${esc(item.key)}"><div class="import-review-head"><div><strong>${esc(item.source.code)} · ${esc(item.source.name)}</strong><small>${esc(item.source.address_full||"Sin domicilio")} · ${esc(item.source.tax_id||"Sin documento")} · ${esc(clientImportVatLabel(item.source.condition))}</small></div><span class="import-review-reason">${esc(item.reason)}</span></div><div class="import-compare"><div><small>Sistema anterior</small><strong>${esc(item.source.name)}</strong><span>${esc(item.source.fiscal_address||"Sin domicilio")} · ${esc(item.source.fiscal_city||"Sin localidad")}</span></div><div><small>Ficha D9 seleccionada</small><strong>${esc(target?`${target.id} · ${target.nombre}`:"Todavía ninguna")}</strong><span>${esc(target?[target.direccion,target.ciudad].filter(Boolean).join(" · ")||"Sin domicilio comercial":"Elegí una ficha o decidí crear/omitir")}</span></div></div><div class="import-review-controls"><label>Decisión<select data-import-action="${esc(item.key)}"><option value="" ${!decision.action?"selected":""}>Pendiente de Ale</option><option value="update" ${decision.action==="update"?"selected":""}>Completar ficha D9 elegida</option>${item.canCreate?`<option value="create" ${decision.action==="create"?"selected":""}>Crear cliente nuevo con ID ${esc(item.source.code)}</option>`:""}<option value="omit" ${decision.action==="omit"?"selected":""}>Omitir este registro</option></select></label><label>Cliente de D9<input data-import-target="${esc(item.key)}" list="clientImportTargetOptions" value="${esc(target?`${target.id} · ${target.nombre}`:"")}" placeholder="Buscar por ID o nombre" ${decision.action==="create"||decision.action==="omit"?"disabled":""}></label></div></article>`;
  }).join("")||'<div class="empty">No hay casos dudosos: el lote puede aplicarse directamente.</div>';
  const resolved=analysis.review.filter(item=>{const decision=decisions[item.key]||{};return decision.action==="omit"||decision.action==="create"||(decision.action==="update"&&decision.targetId)}).length,pending=analysis.review.length-resolved,reviewedChanges=analysis.review.filter(item=>{const decision=decisions[item.key]||{};return decision.action==="create"||(decision.action==="update"&&decision.targetId)}).length,planned=analysis.safe.length+reviewedChanges;
  $("#clientImportReviewProgress").textContent=pending?`${pending} pendientes`:`${resolved} resueltos`;$("#clientImportReviewProgress").className=`pill ${pending?"amber":"green"}`;
  const button=$("#btnApplyClientImport"),safeText=analysis.safe.length?`${analysis.safe.length} seguros`:"",reviewedText=reviewedChanges?`${reviewedChanges} revisados`:"";button.textContent=planned?`Aplicar ${[safeText,reviewedText].filter(Boolean).join(" + ")}`:"Sin cambios para aplicar";button.disabled=!planned||!sourceWritesEnabled();button.title=!sourceWritesEnabled()?"La escritura sobre la Sheet central está bloqueada.":!planned?"No hay cambios seleccionados.":pending?`${pending} casos quedarán pendientes para después.`:"";
}
function changeClientImportDecision(event){
  const action=event.target.closest("[data-import-action]"),target=event.target.closest("[data-import-target]");if(!action&&!target)return;
  const key=(action?.dataset.importAction||target?.dataset.importTarget),decision=state.clientImportDecisions[key]||{action:"",targetId:""};
  if(action){decision.action=action.value;if(action.value==="create"||action.value==="omit")decision.targetId=""}
  if(target){const raw=target.value.trim(),selected=adminClients().find(client=>raw===String(client.id)||raw===`${client.id} · ${client.nombre}`);decision.targetId=String(selected?.id||"");if(selected&&!decision.action)decision.action="update";if(raw&&!selected)toast("Elegí un cliente válido de la lista.","error")}
  state.clientImportDecisions[key]=decision;renderClientImport();
}
async function applyClientImport(){
  const current=state.clientImport;if(!current)return;const {analysis,module}=current,updates=analysis.safe.map(item=>module.importUpdatePayload(item,{target:item.target})),creates=[];let omitted=0,pending=0;
  for(const item of analysis.review){const decision=state.clientImportDecisions[item.key]||{};if(decision.action==="omit"){omitted++;continue}if(decision.action==="create"){creates.push(module.importCreatePayload(item));continue}if(decision.action==="update"){const target=adminClients().find(client=>String(client.id)===String(decision.targetId));if(target){updates.push(module.importUpdatePayload(item,{target}));continue}}pending++}
  if(!updates.length&&!creates.length)return toast("No hay cambios seleccionados para aplicar.","error");
  const targetIds=updates.map(item=>item.cliente_id),duplicates=targetIds.filter((id,index)=>targetIds.indexOf(id)!==index);if(duplicates.length)return toast(`La ficha D9 ${duplicates[0]} fue elegida para más de un registro del PDF. Revisala.`,"error");
  const reviewedChanges=updates.length-analysis.safe.length+creates.length;
  if(!confirm(`¿Aplicar esta parte de la importación?\n\n${analysis.safe.length} coincidencias seguras\n${reviewedChanges} decisiones revisadas\n${pending} casos quedarán pendientes\n${omitted} registros se omitirán\n\nPodés volver a cargar el mismo PDF más adelante. No se modificarán vendedores, listas, nombres comerciales ni historiales.`))return;
  const button=$("#btnApplyClientImport"),message=$("#clientImportMessage");button.disabled=true;button.textContent="Aplicando…";message.textContent="Validando todo el lote antes de escribir…";message.className="form-message working";
  try{
    const result=await apiPost("source_import_clients",{importacion:{archivo:{nombre:current.fileName,sha256:current.hash,paginas:current.pages,filas:analysis.total},actualizaciones:updates,altas:creates,omitidos:omitted,pendientes:pending}});
    message.textContent=result.message||"Importación terminada.";message.className="form-message success";await loadAll({silent:true});setTimeout(()=>$("#clientImportDialog").close(),350);toast(result.message||"Clientes importados");
  }catch(err){message.textContent=err.message;message.className="form-message error";renderClientImport()}
}

function offerIsCurrent(offer={},date=todayISO()){if(!activeValue(offer.activo))return false;const from=String(offer.fecha_desde||"").slice(0,10),to=String(offer.fecha_hasta||"").slice(0,10);return (!from||from<=date)&&(!to||to>=date)}
function offerProduct(offer){return adminProducts().find(p=>String(p.id)===String(offer.producto_id))}
function offerForProduct(productId){return state.source.ofertas.find(o=>String(o.producto_id)===String(productId))}
function currentOfferForProduct(productId){const offer=offerForProduct(productId);return offer&&offerIsCurrent(offer)?offer:null}
function renderOffers(){
  const search=$("#offersSearch"),status=$("#offersStatus");if(!search||!status)return;
  const rows=[...state.source.ofertas].filter(offer=>{const product=offerProduct(offer)||{};if(status.value==="current"&&!offerIsCurrent(offer))return false;if(status.value==="active"&&!activeValue(offer.activo))return false;if(status.value==="inactive"&&activeValue(offer.activo))return false;return matchesSearch([offer.producto_id,product.nombre,product.categoria,product.marca,offer.titulo],search.value)}).sort((a,b)=>String(offerProduct(a)?.nombre||a.producto_id).localeCompare(String(offerProduct(b)?.nombre||b.producto_id),"es"));
  $("#offerAdminNotice").innerHTML=`<span class="helper">${sourceWritesEnabled()?"Escritura habilitada: el precio normal queda intacto y la oferta se publica en Pedidos y Gestión.":"Modo seguro: podés revisar ofertas, pero el guardado está bloqueado."}</span>`;$("#btnNewOffer").disabled=!isAdmin();$("#offersSummary").textContent=`${rows.length} mostradas · ${state.source.ofertas.length} ofertas configuradas`;
  $("#offersList").className="card-list";$("#offersList").innerHTML=rows.map(offer=>{const product=offerProduct(offer)||{},current=offerIsCurrent(offer);return `<article class="data-card ${activeValue(offer.activo)?"":"inactive"}"><div><h3>${esc(product.nombre||"Producto no encontrado")}</h3><p>${esc(offer.producto_id)} · ${esc([product.categoria,product.marca].filter(Boolean).join(" · ")||"Sin categoría")}</p><div class="meta"><span class="pill ${current?"green":activeValue(offer.activo)?"amber":"red"}">${current?"Vigente hoy":activeValue(offer.activo)?"Programada / fuera de fecha":"Desactivada"}</span>${offer.fecha_desde?`<span class="pill">Desde ${esc(offer.fecha_desde)}</span>`:""}${offer.fecha_hasta?`<span class="pill">Hasta ${esc(offer.fecha_hasta)}</span>`:""}</div></div><div class="card-side"><strong>${money(offer.precio_oferta)}</strong><button class="mini-btn primary" data-edit-offer="${esc(offer.producto_id)}">Editar</button></div></article>`}).join("")||'<div class="empty">No hay ofertas con esos filtros.</div>';
}
function hydrateOfferProducts(){const list=$("#offerProductOptions");if(list)list.innerHTML=adminProducts().filter(p=>activeValue(p.activo)).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),"es")).map(p=>`<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join("")}
function updateOfferProductInfo(){
  const product=adminProducts().find(item=>String(item.id)===$("#offerProduct").value.trim()),box=$("#offerProductInfo");
  if(!product){box.innerHTML="";box.classList.add("hidden");return}
  const normal=numeric(product.lista_1);box.innerHTML=`<span><small>${esc(product.id)}</small><strong>${esc(product.nombre||"Producto sin nombre")}</strong></span><span><small>Precio normal · ${esc(priceListLabel("lista_1"))}</small><strong>${normal>0?money(normal):"Sin precio"}</strong></span>`;box.classList.remove("hidden");
}
function openOfferEditor(productId=""){if(!isAdmin())return toast("Esta sesión no puede modificar ofertas.","error");const offer=productId?offerForProduct(productId):null;hydrateOfferProducts();$("#offerForm").reset();$("#offerDialogTitle").textContent=offer?"Editar oferta":"Nueva oferta";$("#offerProduct").value=offer?.producto_id||"";$("#offerProduct").readOnly=!!offer;$("#offerPrice").value=offer?.precio_oferta||"";$("#offerActive").value=activeValue(offer?.activo??"si")?"si":"no";$("#offerFrom").value=String(offer?.fecha_desde||"").slice(0,10);$("#offerTo").value=String(offer?.fecha_hasta||"").slice(0,10);$("#offerTitle").value=offer?.titulo||"";$("#btnSaveOffer").disabled=!sourceWritesEnabled();$("#btnDeleteOffer").classList.toggle("hidden",!offer);$("#btnDeleteOffer").dataset.productId=offer?.producto_id||"";$("#offerFormMessage").classList.add("hidden");updateOfferProductInfo();$("#offerDialog").showModal();setTimeout(()=>$(offer?"#offerPrice":"#offerProduct").focus(),50)}
async function saveOffer(event){event.preventDefault();const productId=$("#offerProduct").value.trim();if(!adminProducts().some(p=>String(p.id)===productId))return toast("Elegí un producto válido del listado.","error");const oferta={producto_id:productId,precio_oferta:numeric($("#offerPrice").value),fecha_desde:$("#offerFrom").value,fecha_hasta:$("#offerTo").value,activo:$("#offerActive").value,titulo:$("#offerTitle").value.trim()},button=$("#btnSaveOffer"),message=$("#offerFormMessage");button.disabled=true;button.textContent="Guardando…";try{const result=await apiPost("source_save_offer",{oferta});upsertBy(state.source.ofertas,"producto_id",{...oferta,oferta_id:result.oferta_id||offerForProduct(productId)?.oferta_id||""});saveCurrentCache();toast(result.message||"Oferta guardada");$("#offerDialog").close();renderOffers();refreshAfterMutation()}catch(err){message.textContent=err.message;message.className="form-message error"}finally{button.disabled=false;button.textContent="Guardar oferta"}}
async function deleteOffer(){
  const productId=$("#btnDeleteOffer").dataset.productId,offer=offerForProduct(productId),product=offerProduct(offer)||{};
  if(!offer)return toast("La oferta ya no existe.","error");
  if(!confirm(`¿Eliminar definitivamente la oferta de ${product.nombre||productId}?\n\nDesactivar la conserva para reutilizarla. Eliminar la borra de la Sheet.`))return;
  const button=$("#btnDeleteOffer"),message=$("#offerFormMessage");button.disabled=true;button.textContent="Eliminando…";
  try{const result=await apiPost("source_delete_offer",{producto_id:productId,oferta_id:offer.oferta_id});state.source.ofertas=state.source.ofertas.filter(item=>String(item.producto_id)!==String(productId));saveCurrentCache();$("#offerDialog").close();toast(result.message||"Oferta eliminada");renderOffers();refreshAfterMutation()}catch(err){message.textContent=err.message;message.className="form-message error"}finally{button.disabled=false;button.textContent="Eliminar definitivamente"}
}

function normalizeAd(ad={}){return {id:String(ad.id??ad.orden??"").trim(),orden:String(ad.orden??ad.id??"").trim(),activo:activeValue(ad.activo??"si")?"si":"no",modo:String(ad.modo||ad.tipo||(ad.imagen_url_full?"full":"producto")).toLowerCase(),texto:String(ad.texto??ad.tag??"").trim(),titulo:String(ad.titulo||"").trim(),texto_1:String(ad.texto_1??ad.texto1??"").trim(),texto_2:String(ad.texto_2??ad.texto2??"").trim(),imagen_url:String(ad.imagen_url??ad.imagen??"").trim(),imagen_url_full:String(ad.imagen_url_full??ad.imagen_full??"").trim(),link_url:String(ad.link_url??ad.link??"").trim()}}
function nextAdId(){const values=state.source.publicidad.map(ad=>Number(String(ad.id||ad.orden||"").replace(/\D+/g,""))).filter(value=>Number.isFinite(value)&&value>0);return String(values.length?Math.max(...values)+1:1)}
function renderPublicidad(){
  const search=$("#adsSearch"),status=$("#adsStatus");if(!search||!status)return;
  const rows=state.source.publicidad.map(normalizeAd).filter(ad=>{const active=activeValue(ad.activo);if(status.value==="active"&&!active)return false;if(status.value==="inactive"&&active)return false;return matchesSearch([ad.id,ad.orden,ad.texto,ad.titulo,ad.texto_1,ad.texto_2,ad.link_url],search.value)}).sort((a,b)=>(Number(a.orden)||999999)-(Number(b.orden)||999999)||String(a.orden).localeCompare(String(b.orden),"es"));
  $("#adAdminNotice").innerHTML=`<span class="helper">${sourceWritesEnabled()?"Escritura habilitada: los cambios se publican en el carrusel de D9 Pedidos.":"Modo seguro: podés revisar banners, pero el guardado está bloqueado."}</span>`;$("#btnNewAd").disabled=!isAdmin();$("#adsSummary").textContent=`${rows.length} mostrados · ${state.source.publicidad.length} banners en total`;
  $("#adsList").className="card-list";$("#adsList").innerHTML=rows.map(ad=>{const full=ad.modo==="full",image=full?ad.imagen_url_full:ad.imagen_url;return `<article class="data-card ad-master-card ${activeValue(ad.activo)?"":"inactive"}"><div class="ad-card-main">${image?`<img class="ad-card-thumb ${full?"full":"product"}" src="${esc(image)}" alt="">`:`<div class="ad-card-thumb placeholder">🖼️</div>`}<div><h3>${esc(ad.titulo||ad.texto||"Banner sin título")}</h3><p>Orden ${esc(ad.orden||ad.id)} · ${full?"Imagen completa":"Producto + textos"}</p><div class="meta"><span class="pill">ID ${esc(ad.id)}</span><span class="pill ${activeValue(ad.activo)?"green":"red"}">${activeValue(ad.activo)?"Activo":"Desactivado"}</span>${ad.link_url?'<span class="pill blue">Con enlace</span>':""}</div></div></div><div class="card-side"><button class="mini-btn primary" data-edit-ad="${esc(ad.id)}">Editar</button></div></article>`}).join("")||'<div class="empty">No hay banners con esos filtros.</div>';
}
function updateAdMode(){const full=$("#adMode").value==="full";$$('.ad-full-field',$("#adDialog")).forEach(field=>field.classList.toggle("hidden",!full));$$('.ad-product-field',$("#adDialog")).forEach(field=>field.classList.toggle("hidden",full))}
function readAdForm(){return {id:$("#adId").value.trim(),orden:$("#adOrder").value.trim(),activo:$("#adActive").value,modo:$("#adMode").value,texto:$("#adTag").value.trim(),titulo:$("#adTitle").value.trim(),texto_1:$("#adText1").value.trim(),texto_2:$("#adText2").value.trim(),imagen_url:$("#adProductImage").value.trim(),imagen_url_full:$("#adFullImage").value.trim(),link_url:$("#adLink").value.trim()}}
function updateAdPreview(){
  const ad=readAdForm(),box=$("#adPreview");if(ad.modo==="full"){box.innerHTML=ad.imagen_url_full?`<div class="ad-preview-full"><img src="${esc(ad.imagen_url_full)}" alt="Vista previa del banner"></div>`:'<div class="ad-preview-empty">Pegá una imagen horizontal para ver el banner.</div>';return}
  box.innerHTML=`<div class="ad-preview-product"><div><small>${esc(ad.texto||"DESTACADO")}</small><strong>${esc(ad.titulo||"Título del banner")}</strong>${ad.texto_1?`<p>${esc(ad.texto_1)}</p>`:""}${ad.texto_2?`<p>${esc(ad.texto_2)}</p>`:""}</div><div class="ad-preview-product-image">${ad.imagen_url?`<img src="${esc(ad.imagen_url)}" alt="">`:'<span>Imagen</span>'}</div></div>`;
}
function openAdEditor(id=""){
  if(!isAdmin())return toast("Esta sesión no puede modificar publicidad.","error");const current=id?state.source.publicidad.find(item=>String(item.id||item.orden)===String(id)):null,ad=current?normalizeAd(current):normalizeAd({id:nextAdId(),orden:nextAdId(),activo:"si",modo:"full"});
  $("#adForm").reset();$("#adDialogTitle").textContent=current?"Editar banner":"Nuevo banner";$("#adId").value=ad.id;$("#adId").readOnly=!!current;$("#adOrder").value=ad.orden;$("#adActive").value=ad.activo;$("#adMode").value=ad.modo==="producto"?"producto":"full";$("#adTag").value=ad.texto;$("#adTitle").value=ad.titulo;$("#adText1").value=ad.texto_1;$("#adText2").value=ad.texto_2;$("#adProductImage").value=ad.imagen_url;$("#adFullImage").value=ad.imagen_url_full;$("#adLink").value=ad.link_url;$("#adFormMessage").classList.add("hidden");$("#btnSaveAd").disabled=!sourceWritesEnabled();updateAdMode();updateAdPreview();$("#adDialog").showModal();setTimeout(()=>$(current?"#adOrder":"#adId").focus(),50)
}
async function saveAd(event){event.preventDefault();if(!sourceWritesEnabled())return toast("La escritura sobre D9_pedidos está bloqueada por seguridad.","error");const publicidad=readAdForm(),button=$("#btnSaveAd"),message=$("#adFormMessage");if(publicidad.modo==="full"&&!publicidad.imagen_url_full)return toast("Cargá Imagen horizontal URL.","error");if(publicidad.modo==="producto"&&!publicidad.titulo&&!publicidad.imagen_url)return toast("Cargá al menos un título o una imagen de producto.","error");button.disabled=true;button.textContent="Guardando…";message.classList.add("hidden");try{const result=await apiPost("source_save_publicidad",{publicidad});upsertBy(state.source.publicidad,"id",result.publicidad||publicidad);saveCurrentCache();toast(result.message||"Banner guardado");$("#adDialog").close();renderPublicidad();refreshAfterMutation()}catch(err){message.textContent=err.message;message.className="form-message error"}finally{button.disabled=false;button.textContent="Guardar banner"}}

function openClientAccount(clientId){const account=accountRows().find(row=>String(row.cliente_id)===String(clientId)),client=adminClients().find(row=>String(row.id)===String(clientId));if(account)return showAccountDetail(clientId);showView("cuentas");$("#accountsFilter").value="all";$("#accountsSearch").value=client?.nombre||clientId;renderAccounts();toast("Este cliente todavía no tiene movimientos.")}
function openClientEditor(clientId="",origin=""){
  if(!isAdmin())return toast("Esta sesión no puede modificar clientes.","error");
  state.clientEditorOrigin=origin;
  const client=clientId?adminClients().find(item=>String(item.id)===String(clientId)):null;
  $("#clientForm").reset();$("#clientForm").dataset.mode=client?"edit":"new";$("#clientDialogTitle").textContent=client?"Editar cliente":"Nuevo cliente";
  $("#clientId").value=client?.id||nextClientId();$("#clientId").readOnly=!!client;$("#clientName").value=client?.nombre||"";$("#clientPhone").value=client?.telefono||"";$("#clientAddress").value=client?.direccion||"";$("#clientCity").value=client?.ciudad||client?.localidad||"";$("#clientActive").value=activeValue(client?.activo??"si")?"si":"no";
  fillPriceListSelect($("#clientPriceList"),clientAssignedList(client));
  $("#clientSeller").innerHTML=sellerOptions(client?.vendedor_id||"");$("#clientSeller").value=client?.vendedor_id||"";
  $("#clientLegalName").value=client?.razon_social||"";$("#clientDocumentType").value=client?.tipo_documento||(client?.cuit?"CUIT":"");$("#clientDocumentNumber").value=client?.numero_documento||client?.cuit||"";$("#clientVatCondition").value=client?.condicion_iva||"";$("#clientFiscalAddress").value=client?.domicilio_fiscal||"";$("#clientFiscalCity").value=client?.localidad_fiscal||"";$("#clientFiscalProvince").value=client?.provincia_fiscal||"";$("#clientPostalCode").value=client?.codigo_postal||"";$("#clientBillingEmail").value=client?.email_facturacion||"";
  const fiscalState=clientFiscalState(client||{});$("#clientFiscalDetails").open=fiscalState.id!=="empty";updateClientFiscalStatus();
  $("#btnSaveClient").disabled=!isAdmin();$("#btnSaveClient").title=isAdmin()?"":"Sólo el administrador puede modificar clientes.";
  $("#btnDeleteClient").classList.toggle("hidden",!client);$("#btnDeleteClient").dataset.clientId=client?.id||"";$("#btnDeleteClient").disabled=!isAdmin();
  $("#clientFormMessage").classList.add("hidden");$("#clientDialog").showModal();setTimeout(()=>$(client?"#clientName":"#clientId").focus(),60);
}
async function saveClient(event){
  event.preventDefault();if(!isAdmin())return toast("Esta sesión no puede modificar clientes.","error");
  const fiscal=readClientFiscalForm(),documentDigits=onlyDigits(fiscal.numero_documento);
  const seller=sellerById($("#clientSeller").value),cliente={id:$("#clientId").value.trim(),nombre:$("#clientName").value.trim(),telefono:$("#clientPhone").value.trim(),direccion:$("#clientAddress").value.trim(),ciudad:$("#clientCity").value.trim(),lista_precio:$("#clientPriceList").value||"lista_1",vendedor_id:seller?.id||"",vendedor:seller?.nombre||"",activo:$("#clientActive").value,...fiscal,cuit:fiscal.tipo_documento==="CUIT"?documentDigits:""};
  if(!cliente.id||!cliente.nombre)return toast("ID y nombre comercial son obligatorios.","error");
  const button=$("#btnSaveClient"),message=$("#clientFormMessage");button.disabled=true;button.textContent="Guardando…";message.classList.add("hidden");
  try{const returnToOperation=state.clientEditorOrigin==="operation"&&$("#operationDialog").open,result=await apiPost("source_save_client",{cliente,nuevo:$("#clientForm").dataset.mode==="new"});upsertBy(state.source.clientes_admin,"id",cliente);state.source.clientes=state.source.clientes_admin.filter(c=>activeValue(c.activo));saveCurrentCache();toast(result.message||"Cliente guardado");state.clientEditorOrigin="";$("#clientDialog").close();hydrateClientFilters();renderClients();if(returnToOperation){selectOperationClient(cliente.id);setTimeout(()=>$("#opProductSearch").focus(),60)}refreshAfterMutation()}
  catch(err){message.textContent=err.message;message.className="form-message error";message.classList.remove("hidden")}
  finally{button.disabled=false;button.textContent="Guardar cliente"}
}
async function deleteClient(){
  if(!isAdmin())return toast("Esta sesión no puede eliminar clientes.","error");
  const button=$("#btnDeleteClient"),id=String(button.dataset.clientId||"").trim(),client=adminClients().find(item=>String(item.id)===id),message=$("#clientFormMessage");
  if(!id||!client)return toast("No encontré el cliente que querés eliminar.","error");
  const originalText=button.textContent;button.disabled=true;button.textContent="Revisando…";message.classList.add("hidden");
  try{
    const impact=await apiPost("source_client_delete_impact",{cliente_id:id});
    if(impact.blocked){
      const references=[impact.operaciones?`${impact.operaciones} comprobante${impact.operaciones===1?"":"s"}`:"",impact.recibos?`${impact.recibos} recibo${impact.recibos===1?"":"s"}`:"",impact.movimientos?`${impact.movimientos} movimiento${impact.movimientos===1?"":"s"} de cuenta corriente`:""].filter(Boolean).join(", ");
      message.textContent=`No se puede eliminar: tiene ${references}. Para no separar el saldo ni el historial, primero hay que fusionarlo con la ficha correcta.`;message.className="form-message error";message.classList.remove("hidden");return;
    }
    const historical=impact.pedidos?`\n\nTiene ${impact.pedidos} pedido${impact.pedidos===1?"":"s"} histórico${impact.pedidos===1?"":"s"}. No se borrará${impact.pedidos===1?"":"n"}; Gestión intentará vincularlo${impact.pedidos===1?"":"s"} a la ficha restante por nombre y domicilio.`:"";
    if(!confirm(`¿Eliminar definitivamente a ${client.nombre}?${historical}\n\nEsta acción borra su fila de la hoja Clientes.`))return;
    button.textContent="Eliminando…";const result=await apiPost("source_delete_client",{cliente_id:id});
    state.source.clientes_admin=state.source.clientes_admin.filter(item=>String(item.id)!==id);state.source.clientes=state.source.clientes.filter(item=>String(item.id)!==id);saveCurrentCache();
    $("#clientDialog").close();hydrateClientFilters();renderClients();renderOrders();toast(result.message||"Cliente eliminado");refreshAfterMutation();
  }catch(err){message.textContent=err.message;message.className="form-message error";message.classList.remove("hidden")}
  finally{button.disabled=!isAdmin();button.textContent=originalText}
}

function adminUsers(){return state.source.usuarios_admin?.length?state.source.usuarios_admin:state.source.usuarios}
function sourceRoleLabel(role){return ({vendedor:"Vendedor",mostrador:"Venta mostrador",cliente:"Cliente",admin:"Admin"})[normalize(role)]||String(role||"Usuario")}
function sellerCommissionRules(userId){return (state.gestion.comisiones_reglas||[]).filter(rule=>String(rule.vendedor_id)===String(userId)&&["","general"].includes(normalize(rule.marca))).sort((a,b)=>String(b.vigente_desde||"").localeCompare(String(a.vigente_desde||"")))}
function currentSellerCommission(userId,date=todayISO()){return sellerCommissionRules(userId).find(rule=>{const from=String(rule.vigente_desde||"").slice(0,10),to=String(rule.vigente_hasta||"").slice(0,10);return activeValue(rule.activo)&&(!from||from<=date)&&(!to||to>=date)})||null}
function renderUsers(){
  if(!isAdmin())return;
  const query=$("#usersSearch").value,status=$("#usersStatus").value,role=$("#usersGestionRole").value;
  const rows=adminUsers().filter(user=>{
    const active=activeValue(user.activo),gestion=gestionRole(user.rol_gestion);
    if(status==="active"&&!active)return false;if(status==="inactive"&&active)return false;if(role&&gestion!==role)return false;
    return matchesSearch([user.id,user.usuario,user.nombre,user.rol,gestionRoleLabel(gestion),user.wasap_report],query);
  }).sort((a,b)=>String(a.nombre||a.usuario).localeCompare(String(b.nombre||b.usuario),"es"));
  $("#btnNewUser").disabled=!sourceWritesEnabled();
  $("#userAdminNotice").textContent=sourceWritesEnabled()?"Escritura habilitada: los cambios impactan en la hoja usuarios central y quedan auditados.":"Modo seguro: podés revisar usuarios, pero el guardado está bloqueado hasta activar SOURCE_WRITES_ENABLED.";
  $("#usersSummary").textContent=`${rows.length} mostrados · ${adminUsers().length} usuarios en total`;
  $("#usersList").className="card-list";
  $("#usersList").innerHTML=rows.map(user=>{
    const gestion=gestionRole(user.rol_gestion),canIssue=activeValue(user.permiso_comprobantes)||["admin","super_admin"].includes(gestion),sellerRole=normalize(user.rol)==="vendedor",commission=currentSellerCommission(user.id);
    return `<article class="data-card user-master-card ${activeValue(user.activo)?"":"inactive"}"><div><h3>${esc(user.nombre||user.usuario)}</h3><p>@${esc(user.usuario||"—")} · ID ${esc(user.id)}</p><div class="meta"><span class="pill">${esc(sourceRoleLabel(user.rol))}</span><span class="pill violet">${esc(gestionRoleLabel(gestion))}</span>${canIssue?'<span class="pill green">Comprobantes y recibos</span>':""}${sellerRole?`<span class="pill ${commission?'blue':'amber'}">${commission?`Comisión ${number(commission.porcentaje)}%`:"Comisión sin definir"}</span>`:""}<span class="pill ${activeValue(user.activo)?"green":"red"}">${activeValue(user.activo)?"Activo":"Inactivo"}</span></div></div><div class="card-side"><div class="row-actions">${sellerRole?`<button class="mini-btn" data-user-commission="${esc(user.id)}">Comisión</button>`:""}<button class="mini-btn primary" data-edit-user="${esc(user.id)}">Editar</button></div></div></article>`;
  }).join("")||'<div class="empty">No hay usuarios con esos filtros.</div>';
}
function openCommissionEditor(userId){
  if(!isAdmin())return toast("Esta acción requiere permisos de administrador.","error");
  const user=adminUsers().find(item=>String(item.id)===String(userId));if(!user||normalize(user.rol)!=="vendedor")return toast("No encontré ese vendedor.","error");
  const rule=sellerCommissionRules(userId)[0];$("#commissionRuleId").value=rule?.regla_id||"";$("#commissionSellerId").value=user.id;$("#commissionSellerName").textContent=user.nombre||user.usuario;$("#commissionPercentage").value=rule?.porcentaje??"";$("#commissionFrom").value=String(rule?.vigente_desde||todayISO()).slice(0,10);$("#commissionActive").value=activeValue(rule?.activo??"si")?"si":"no";$("#commissionFormMessage").classList.add("hidden");$("#commissionDialog").showModal();setTimeout(()=>$("#commissionPercentage").focus(),40);
}
async function saveCommission(event){
  event.preventDefault();const button=$("#btnSaveCommission"),message=$("#commissionFormMessage"),percentage=$("#commissionPercentage").value.trim();if(percentage==="")return toast("Ingresá el porcentaje de comisión.","error");
  const rule={regla_id:$("#commissionRuleId").value,vendedor_id:$("#commissionSellerId").value,marca:"GENERAL",porcentaje:percentage,vigente_desde:$("#commissionFrom").value,vigente_hasta:"",activo:$("#commissionActive").value};button.disabled=true;button.textContent="Guardando…";message.classList.add("hidden");
  try{const result=await apiPost("save_commission_rule",{regla:rule});upsertBy(state.gestion.comisiones_reglas,"regla_id",result.regla);saveCurrentCache();$("#commissionDialog").close();renderUsers();toast(result.message||"Comisión guardada");refreshAfterMutation()}catch(err){message.textContent=err.message;message.className="form-message error";message.classList.remove("hidden")}finally{button.disabled=false;button.textContent="Guardar comisión"}
}
function openCommissionResolution(operationId){const operation=state.gestion.operaciones.find(item=>String(item.operacion_id)===String(operationId));if(!operation)return toast("No encontré el comprobante.","error");if($("#detailDialog")?.open)$("#detailDialog").close();$("#commissionResolveForm").reset();$("#commissionResolveOperationId").value=operationId;$("#commissionResolveTitle").textContent=`${formatOperationNumber(operation.numero)} · ${operation.cliente}`;$("#commissionResolveSeller").innerHTML=sellerOptions("","Elegir vendedor");$("#commissionResolveSellerField").classList.add("hidden");$("#commissionResolveMessage").classList.add("hidden");$("#commissionResolveDialog").showModal()}
function updateCommissionResolutionMode(){$("#commissionResolveSellerField").classList.toggle("hidden",$("#commissionResolveMode").value!=="ASIGNAR")}
async function saveCommissionResolution(event){event.preventDefault();const mode=$("#commissionResolveMode").value,sellerId=$("#commissionResolveSeller").value,message=$("#commissionResolveMessage"),button=$("#btnSaveCommissionResolution");if(!mode)return toast("Elegí qué ocurrió con esa venta.","error");if(mode==="ASIGNAR"&&!sellerId)return toast("Elegí el vendedor.","error");button.disabled=true;button.textContent="Guardando…";try{const result=await apiPost("resolve_operation_commission",{operacion_id:$("#commissionResolveOperationId").value,modo:mode,vendedor_id:sellerId,motivo:$("#commissionResolveReason").value.trim()}),operation=state.gestion.operaciones.find(item=>String(item.operacion_id)===String(result.operacion_id));if(operation)Object.assign(operation,result);$("#commissionResolveDialog").close();saveCurrentCache();renderOperations();toast(result.message||"Decisión guardada");await refreshAfterMutation()}catch(err){message.textContent=err.message;message.className="form-message error";message.classList.remove("hidden")}finally{button.disabled=false;button.textContent="Guardar decisión"}}
function fillUserClientOptions(value=""){
  const select=$("#userClient");select.innerHTML='<option value="">Sin cliente vinculado</option>'+adminClients().filter(client=>activeValue(client.activo)).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),"es")).map(client=>`<option value="${esc(client.id)}">${esc(client.nombre||client.id)}</option>`).join("");
  select.value=value||"";
}
function updateUserRoleFields(){
  const sourceRole=normalize($("#userRole").value),gestion=gestionRole($("#userGestionRole").value),adminRole=["admin","super_admin"].includes(gestion);
  $("#userClientField").classList.toggle("hidden",sourceRole!=="cliente");
  $("#userColor1Field").classList.toggle("hidden",sourceRole!=="vendedor");
  $("#userColor2Field").classList.toggle("hidden",sourceRole!=="vendedor");
  if(adminRole)$("#userCanIssue").value="si";
  $("#userCanIssue").disabled=adminRole;
}
function openUserEditor(userId=""){
  if(!isAdmin())return toast("Esta sesión no puede modificar usuarios.","error");
  const user=userId?adminUsers().find(item=>String(item.id)===String(userId)):null,isNew=!userId;
  if(!isNew&&!user)return toast("No encontré ese usuario.","error");
  $("#userForm").reset();$("#userForm").dataset.mode=isNew?"new":"edit";$("#userDialogTitle").textContent=isNew?"Nuevo usuario":"Editar usuario";
  $("#userId").value=user?.id||"";$("#userLogin").value=user?.usuario||"";$("#userName").value=user?.nombre||"";$("#userPassword").value="";
  $("#userPassword").required=isNew;$("#userPasswordHelp").textContent=isNew?"Ingresá una clave inicial.":"Dejala vacía para conservar la clave actual.";
  $("#userRole").value=["vendedor","mostrador","cliente","admin"].includes(normalize(user?.rol))?normalize(user.rol):"vendedor";
  $("#userWhatsapp").value=user?.wasap_report||"";$("#userColor1").value=/^#[0-9a-f]{6}$/i.test(user?.color_1||"")?user.color_1:"#DDEEFF";$("#userColor2").value=/^#[0-9a-f]{6}$/i.test(user?.color_2||"")?user.color_2:"#FFFFFF";
  $("#userActive").value=activeValue(user?.activo??"si")?"si":"no";$("#userGestionRole").value=gestionRole(user?.rol_gestion);$("#userCanIssue").value=activeValue(user?.permiso_comprobantes)?"si":"no";
  fillUserClientOptions(user?.cliente_id||"");updateUserRoleFields();$("#btnSaveUser").disabled=!sourceWritesEnabled();$("#userFormMessage").classList.add("hidden");$("#userDialog").showModal();setTimeout(()=>$(isNew?"#userLogin":"#userName").focus(),40);
}
async function saveUser(event){
  event.preventDefault();if(!sourceWritesEnabled())return toast("La escritura sobre la Sheet principal está bloqueada por seguridad.","error");
  const isNew=$("#userForm").dataset.mode==="new",usuario={id:$("#userId").value.trim(),usuario:$("#userLogin").value.trim(),nombre:$("#userName").value.trim(),clave:$("#userPassword").value,rol:$("#userRole").value,wasap_report:$("#userWhatsapp").value.trim(),cliente_id:$("#userRole").value==="cliente"?$("#userClient").value:"",color_1:$("#userColor1").value,color_2:$("#userColor2").value,activo:$("#userActive").value,rol_gestion:$("#userGestionRole").value,permiso_comprobantes:$("#userCanIssue").value};
  const button=$("#btnSaveUser"),message=$("#userFormMessage");button.disabled=true;button.textContent="Guardando…";message.classList.add("hidden");
  try{
    const result=await apiPost("source_save_user",{usuario,nuevo:isNew}),saved=result.usuario;
    if(saved){upsertBy(state.source.usuarios_admin,"id",saved);state.source.usuarios=state.source.usuarios_admin.filter(item=>activeValue(item.activo))}
    $("#userDialog").close();renderUsers();toast(result.message||"Usuario guardado");await refreshAfterMutation();
  }catch(err){message.textContent=err.message;message.className="form-message error";message.classList.remove("hidden")}
  finally{button.disabled=!sourceWritesEnabled();button.textContent="Guardar usuario"}
}

function renderReports(){if(state.currentReport)openReport(state.currentReport);else showReportsHub()}
function showReportsHub(){state.currentReport="";$("#reportsHub").classList.remove("hidden");$$(".report-detail").forEach(view=>view.classList.add("hidden"))}
function openReport(kind){state.currentReport=kind;$("#reportsHub").classList.add("hidden");$$(".report-detail").forEach(view=>view.classList.add("hidden"));const view=$(kind==="sales"?"#salesReportView":"#commissionReportView");view.classList.remove("hidden");if(kind==="sales")$("#salesReportResults").classList.add("hidden");else{$("#commissionReportResults").classList.add("hidden");renderCommissionClosures()}window.scrollTo({top:0,behavior:"smooth"})}
function renderCurrentView() { ({home:renderHome,pedidos:renderOrders,operaciones:renderOperations,cuentas:renderAccounts,recibos:renderReceipts,cheques:renderChecks,maestros:renderMasters,clientes:renderClients,usuarios:renderUsers,ofertas:renderOffers,publicidad:renderPublicidad,reportes:renderReports}[state.currentView]||(()=>{}))(); }
function renderAll() { renderHome(); if(state.currentView!=="home")renderCurrentView(); }

function populateSelectors() {
  if($("#opClient")&&!$("#operationDialog")?.open)$("#opClient").value="";
  const seller=$("#ordersSeller");if(seller){const current=seller.value,map=new Map();state.source.pedidos.forEach(o=>{const key=String(o.vendedor_id||o.vendedor||"");if(key&&!map.has(key))map.set(key,o.vendedor||o.vendedor_id)});seller.innerHTML='<option value="">Todos los vendedores</option>'+[...map].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),"es")).map(([key,label])=>`<option value="${esc(key)}">${esc(label)}</option>`).join("");if([...map].some(([key])=>key===current))seller.value=current}
  hydrateSellerSelectors();if(!$("#reportSalesFrom").value)$("#reportSalesFrom").value=todayISO();if(!$("#reportSalesTo").value)$("#reportSalesTo").value=todayISO();const monthStart=todayISO().slice(0,8)+"01";if(!$("#reportCommissionFrom").value)$("#reportCommissionFrom").value=monthStart;if(!$("#reportCommissionTo").value)$("#reportCommissionTo").value=todayISO();
}

function operationClients(){return [...state.source.clientes,...occasionalProfiles()].sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),"es"))}

function clientSearchRank(client,term){
  const q=normalize(term),id=normalize(client.id),name=normalize(client.nombre);
  if(id===q)return 0;
  if(id.startsWith(q))return 1;
  if(name.startsWith(q))return 2;
  if(id.includes(q))return 3;
  if(name.includes(q))return 4;
  return 5;
}

function renderOperationClientResults(){
  const input=$("#opClientSearch"),results=$("#opClientResults"),hint=$("#opClientSearchHint");
  if(!input||!results||!hint)return;
  const term=input.value.trim();
  hint.classList.remove("error","success");
  if(!term){state.clientSearchResults=[];state.clientSearchIndex=0;results.innerHTML="";results.classList.add("hidden");hint.textContent="Escribí el código o cualquier parte del nombre.";return}
  const rows=operationClients().filter(c=>matchesSearch([c.id,c.nombre],term)).sort((a,b)=>clientSearchRank(a,term)-clientSearchRank(b,term)||String(a.nombre).localeCompare(String(b.nombre),"es")).slice(0,12);
  state.clientSearchResults=rows;state.clientSearchIndex=Math.min(state.clientSearchIndex,Math.max(0,rows.length-1));
  if(!rows.length){results.innerHTML='<div class="empty compact-empty">No encontré ese cliente.</div>';results.classList.remove("hidden");hint.textContent=`Sin resultados para “${term}”.`;hint.classList.add("error");return}
  hint.textContent="Enter selecciona el primer resultado.";
  results.innerHTML=rows.map((c,index)=>`<button type="button" class="client-search-result ${index===state.clientSearchIndex?"selected":""}" data-op-client="${esc(c.id)}"><span><strong>${c._occasional?"":`${esc(c.id)} · `}${esc(c.nombre)}</strong><small>${c._occasional?`Ocasional anterior · ${c.ids.length} identidad${c.ids.length===1?"":"es"} vinculada${c.ids.length===1?"":"s"}`:esc([c.direccion,c.ciudad].filter(Boolean).join(" · ")||"Cliente activo")}</small></span><b>Elegir</b></button>`).join("");
  results.classList.remove("hidden");
}

function moveClientSearchSelection(direction){
  if(!state.clientSearchResults.length)return;
  state.clientSearchIndex=(state.clientSearchIndex+direction+state.clientSearchResults.length)%state.clientSearchResults.length;
  $$(".client-search-result",$("#opClientResults")).forEach((row,index)=>row.classList.toggle("selected",index===state.clientSearchIndex));
  $(".client-search-result.selected",$("#opClientResults"))?.scrollIntoView({block:"nearest"});
}

function selectOperationClient(clientId){
  const client=clientById(clientId)||occasionalProfileById(clientId);if(!client)return toast("Cliente no encontrado.","error");
  const assigned=String(client.lista_precio||"lista_1");state.operationPriceList=priceLists().some(list=>list.id===assigned)?assigned:"lista_1";state.occasionalClientId=client._occasional?client.id:"";
  $("#opClient").value=client.id;$("#opClientSearch").value="";$("#opClientSearchBox").classList.add("hidden");$("#opOccasionalFields").classList.add("hidden");setOperationClientActionsVisible(false);
  $("#opClientSelectedName").textContent=client.nombre;$("#opClientSelectedMeta").textContent=client._occasional?"Cliente ocasional anterior · conserva su cuenta corriente":`Código ${client.id}${client.ciudad?` · ${client.ciudad}`:""} · ${priceListLabel(state.operationPriceList)}`;$("#opClientSelected").classList.remove("hidden");
  const assignedSeller=sellerById(client.vendedor_id)||sellers().find(user=>normalize(user.nombre)===normalize(client.vendedor));
  if(!state.currentOrder&&!state.currentCreditOperation&&!state.currentCreditMode&&!$("#opSeller").disabled&&assignedSeller)$("#opSeller").value=String(assignedSeller.id);
  state.clientSearchResults=[];state.clientSearchIndex=0;$("#opClientResults").innerHTML="";$("#opClientResults").classList.add("hidden");
}

function selectOrderOccasionalClient(order){
  const name=orderClientName(order),existing=occasionalProfiles().find(profile=>occasionalIdentityKey(profile.nombre)===occasionalIdentityKey(name));
  if(existing){selectOperationClient(existing.id);return}
  const id=newOccasionalId();state.occasionalClientId=id;state.operationPriceList="lista_1";
  $("#opClient").value=id;$("#opClientSearch").value="";$("#opClientSearchBox").classList.add("hidden");$("#opOccasionalFields").classList.add("hidden");setOperationClientActionsVisible(false);
  $("#opClientSelectedName").textContent=name;$("#opClientSelectedMeta").textContent="Cliente ocasional del pedido · conservará su cuenta corriente";$("#opClientSelected").classList.remove("hidden");
  state.clientSearchResults=[];state.clientSearchIndex=0;$("#opClientResults").innerHTML="";$("#opClientResults").classList.add("hidden");
}

function setOperationClientActionsVisible(visible){["#btnOccasionalClient","#btnCreateOperationClient"].forEach(selector=>$(selector)?.classList.toggle("hidden",!visible))}
function startOperationClientSearch(){
  $("#opClient").value="";$("#opOccasionalName").value="";$("#opClientSelected").classList.add("hidden");$("#opOccasionalFields").classList.add("hidden");$("#opClientSearchBox").classList.remove("hidden");setOperationClientActionsVisible(true);
  state.clientSearchResults=[];state.clientSearchIndex=0;state.occasionalClientId="";state.operationPriceList="lista_1";renderOperationClientResults();setTimeout(()=>$("#opClientSearch").focus(),30);
}

function startOccasionalClient(){
  $("#opClient").value="";$("#opClientSearch").value="";$("#opClientSearchBox").classList.add("hidden");$("#opClientSelected").classList.add("hidden");setOperationClientActionsVisible(false);$("#opOccasionalFields").classList.remove("hidden");
  state.clientSearchResults=[];state.clientSearchIndex=0;state.operationPriceList="lista_1";state.occasionalClientId=newOccasionalId();$("#opOccasionalOptions").innerHTML=occasionalProfiles().map(profile=>`<option value="${esc(profile.nombre)}"></option>`).join("");setTimeout(()=>$("#opOccasionalName").focus(),30);
}

function orderClientParts(order){return String(order?.cliente||"").split("|").map(part=>part.trim()).filter(Boolean)}
function orderClientName(order){return orderClientParts(order)[0]||""}
function clientOrderMetadata(client){return [client?.direccion,client?.ciudad,client?.localidad,client?.telefono].filter(Boolean).join(" ")}
function clientMatchesOrderClues(client,order){
  const clues=orderClientParts(order).slice(1).map(normalize).filter(Boolean),metadata=normalize(clientOrderMetadata(client));
  return !!clues.length&&clues.every(clue=>clue.split(" ").filter(Boolean).every(token=>metadata.includes(token)));
}
function matchOrderClient(order){
  const id=String(order?.cliente_id||"").trim();
  if(id){const byId=state.source.clientes.filter(client=>String(client.id)===id);if(byId.length===1)return {client:byId[0],kind:"registered",reason:"id"};if(byId.length>1)return {client:null,reason:"duplicate_id"};if(/ocasional/i.test(id)&&orderClientName(order))return {client:null,kind:"occasional",reason:"occasional_id"}}
  const name=orderClientName(order);if(!name)return {client:null,reason:"missing"};
  const byName=state.source.clientes.filter(client=>normalize(client.nombre)===normalize(name));
  if(byName.length===1)return {client:byName[0],kind:"registered",reason:id?"missing_id_name":"name"};
  if(byName.length>1){const byClues=byName.filter(client=>clientMatchesOrderClues(client,order));if(byClues.length===1)return {client:byClues[0],kind:"registered",reason:"name_and_details"};return {client:null,reason:"duplicate_name"}}
  return id?{client:null,reason:"missing_id"}:{client:null,kind:"occasional",reason:"occasional_name"};
}

function productPriceForOperation(product){const field=state.operationPriceList||"lista_1",selected=numeric(product?.[field]);return selected>0?selected:numeric(product?.lista_1)}
function operationProducts(){return state.source.productos.filter(p=>productPriceForOperation(p)>0)}

function parseProductQuickQuery(value=""){
  const raw=String(value||"").trim();
  const match=raw.match(/^((?:\d+(?:[.,]\d{1,3})?)|(?:[.,]\d{1,3}))\s*(?:\*|x|×)\s*(.*)$/i);
  if(!match)return {quantity:1,term:raw,explicitQuantity:false};
  const quantity=Number(match[1].replace(",","."));
  return {quantity:Number.isFinite(quantity)&&quantity>0?Math.round(quantity*1000)/1000:0,term:String(match[2]||"").trim(),explicitQuantity:true};
}

function productSearchRank(product,term){
  const q=normalize(term),id=normalize(product.id),name=normalize(product.nombre);
  if(id===q)return 0;
  if(id.startsWith(q))return 1;
  if(name.startsWith(q))return 2;
  if(id.includes(q))return 3;
  if(name.includes(q))return 4;
  return 5;
}

function renderOperationProductResults(){
  const input=$("#opProductSearch"),results=$("#opProductResults"),hint=$("#opProductSearchHint");
  if(!input||!results||!hint)return;
  const parsed=parseProductQuickQuery(input.value);
  if(!parsed.term){state.productSearchResults=[];state.productSearchIndex=0;results.innerHTML="";results.classList.add("hidden");hint.textContent=parsed.quantity===0?"La cantidad debe ser mayor que cero.":"Sin cantidad indicada se pregunta antes de agregar. Acepta *, x y cantidades con coma.";hint.classList.toggle("error",parsed.quantity===0);return}
  hint.classList.remove("error","success");
  if(parsed.quantity<=0){state.productSearchResults=[];results.innerHTML="";results.classList.add("hidden");hint.textContent="La cantidad debe ser mayor que cero.";hint.classList.add("error");return}
  const rows=operationProducts().filter(p=>matchesSearch([p.id,p.nombre],parsed.term)).sort((a,b)=>productSearchRank(a,parsed.term)-productSearchRank(b,parsed.term)||String(a.nombre).localeCompare(String(b.nombre),"es")).slice(0,12);
  state.productSearchResults=rows;state.productSearchIndex=Math.min(state.productSearchIndex,Math.max(0,rows.length-1));
  if(!rows.length){results.innerHTML='<div class="empty compact-empty">No encontré ese producto.</div>';results.classList.remove("hidden");hint.textContent=`Sin resultados para “${parsed.term}”.`;return}
  hint.textContent=parsed.explicitQuantity?`Cantidad a agregar: ${number(parsed.quantity)} · Enter agrega el primer resultado.`:"Enter selecciona el producto y después confirma la cantidad.";
  results.innerHTML=rows.map((p,index)=>{const offer=currentOfferForProduct(p.id);return `<button type="button" class="product-search-result ${index===state.productSearchIndex?"selected":""}" data-op-product="${esc(p.id)}"><span><strong>${esc(p.id)} · ${esc(p.nombre)}</strong><small>${esc(p.categoria||p.marca||"Producto")} · ${esc(priceListLabel(state.operationPriceList))}${offer?" · 🔥 Oferta vigente":""}</small></span><span class="product-result-side"><b>${money(productPriceForOperation(p))}</b>${offer?`<small>🔥 Oferta disponible ${money(offer.precio_oferta)}</small>`:""}<small>${parsed.explicitQuantity?`Agregar ${number(parsed.quantity)}`:"Elegir cantidad"}</small></span></button>`}).join("");
  results.classList.remove("hidden");
}

function moveProductSearchSelection(direction){
  if(!state.productSearchResults.length)return;
  state.productSearchIndex=(state.productSearchIndex+direction+state.productSearchResults.length)%state.productSearchResults.length;
  $$(".product-search-result",$("#opProductResults")).forEach((row,index)=>row.classList.toggle("selected",index===state.productSearchIndex));
  $(".product-search-result.selected",$("#opProductResults"))?.scrollIntoView({block:"nearest"});
}

function commitQuickProduct(product,quantity){
  if(!product)return toast("Producto no encontrado.","error");
  quantity=Math.round(numeric(quantity)*1000)/1000;if(quantity<=0)return toast("La cantidad debe ser mayor que cero.","error");
  syncDraftFromDom();
  const existing=state.draftItems.find(item=>String(item.id_producto)===String(product.id));
  if(existing)existing.cantidad=Math.round((numeric(existing.cantidad)+quantity)*1000)/1000;
  else {const offer=currentOfferForProduct(product.id),normal=productPriceForOperation(product);state.draftItems.push({id_producto:product.id,nombre:product.nombre,cantidad:quantity,precio:normal,precio_lista:normal,precio_oferta:offer?numeric(offer.precio_oferta):0,usa_oferta:false,oferta_id:""})}
  renderDraftItems();updateOperationTotal();
  $("#opProductSearch").value="";state.productSearchResults=[];state.productSearchIndex=0;$("#opProductResults").innerHTML="";$("#opProductResults").classList.add("hidden");
  const hint=$("#opProductSearchHint");hint.textContent=`Agregado: ${number(quantity)} × ${product.nombre}${existing?" · cantidad acumulada":""}.`;hint.className="product-search-hint success";
  $("#opProductSearch").focus();
}

function openProductQuantity(product){
  if(!product)return toast("Producto no encontrado.","error");
  $("#quantityProductId").value=product.id;$("#quantityProductCode").textContent=product.id;$("#quantityProductName").textContent=product.nombre;$("#quantityProductPrice").textContent=`${priceListLabel(state.operationPriceList)} · ${money(productPriceForOperation(product))}`;$("#quantityProductValue").value="";$("#opProductResults").classList.add("hidden");
  $("#productQuantityDialog").showModal();setTimeout(()=>$("#quantityProductValue").focus(),50);
}

function addQuickProduct(productId){
  const product=productById(productId),parsed=parseProductQuickQuery($("#opProductSearch").value);
  if(!product)return toast("Producto no encontrado.","error");
  if(parsed.quantity<=0)return toast("La cantidad debe ser mayor que cero.","error");
  if(!parsed.explicitQuantity)return openProductQuantity(product);
  commitQuickProduct(product,parsed.quantity);
}

function confirmProductQuantity(event){
  event.preventDefault();const product=productById($("#quantityProductId").value),raw=$("#quantityProductValue").value.trim(),quantity=raw?numeric(raw):1;
  if(!product)return toast("Producto no encontrado.","error");
  if(quantity<=0)return toast("La cantidad debe ser mayor que cero.","error");
  $("#productQuantityDialog").close();commitQuickProduct(product,quantity);
}

function openOperation(order=null,allowReuse=false) {
  if(!canIssueDocuments())return toast("Tu usuario puede consultar, pero no emitir comprobantes.","error");
  if(order&&!allowReuse&&orderSourceOperations(order).length)return requestOrderImport(order.pedido_id);
  state.currentOrder=order;state.currentCreditOperation=null;state.currentCreditMode="";state.operationPriceList="lista_1"; state.draftItems=(order?.items||[]).map(i=>({id_producto:i.id_producto||i.id, nombre:i.nombre||i.detalle, cantidad:numeric(i.cantidad||i.total), precio:numeric(i.precio)}));
  state.clientSearchResults=[];state.clientSearchIndex=0;state.occasionalClientId="";state.autoPaidAmount=false;state.productSearchResults=[];state.productSearchIndex=0;
  $("#operationForm").reset(); $("#opDate").value=todayISO(); $("#opSourceOrder").value=order?.pedido_id||"";$("#opReferenceOperation").value=""; $("#operationDialogTitle").textContent=order?`Desde pedido ${order.pedido_id}`:"Crear desde cero";$("#opPaidAmount").readOnly=false;$("#opMixedFields").classList.add("hidden");$("#opCheckFields").classList.add("hidden");$("#creditNoteBanner").classList.add("hidden");$("#financialCreditFields").classList.add("hidden");$("#operationProductsSection").classList.remove("hidden");$("#opSellerField").classList.remove("hidden");$("#opDiscount").closest("label").classList.remove("hidden");$("#opType").disabled=false;$("#opDiscount").disabled=false;$("#btnChangeOperationClient").classList.remove("hidden");$$("[data-sale-payment]").forEach(el=>el.classList.remove("hidden"));$("#operationDialog .product-quick-add").classList.remove("hidden");
  const orderSeller=sellerById(order?.vendedor_id)||sellers().find(user=>normalize(user.nombre)===normalize(order?.vendedor)),sessionSeller=sellerById(state.user?.id),selectedSeller=orderSeller||sessionSeller;
  $("#opSeller").innerHTML=operationSellerOptions(selectedSeller?.id||"");$("#opSeller").value=selectedSeller?.id||"";$("#opSeller").disabled=!!orderSeller||!canIssueDocuments();
  const cfg=state.gestion.config; $("#opType").value=cfg.documento_default||"REMITO";
  $("#opClient").value="";$("#opClientSearch").value="";$("#opOccasionalName").value="";$("#opClientSelected").classList.add("hidden");$("#opOccasionalFields").classList.add("hidden");$("#opClientSearchBox").classList.remove("hidden");setOperationClientActionsVisible(true);renderOperationClientResults();
  let matchedClient=false,clientWarning="";if(order){const match=matchOrderClient(order);if(match.client){selectOperationClient(match.client.id);matchedClient=true}else if(match.kind==="occasional"){selectOrderOccasionalClient(order);matchedClient=true}else{const messages={duplicate_id:"Hay más de una ficha con el mismo ID. Revisá clientes antes de continuar.",duplicate_name:"Hay más de un cliente con ese nombre. Usá la dirección del pedido para elegir la ficha correcta.",missing_id:"El ID del cliente ya no coincide con una ficha activa. Elegí el cliente antes de guardar.",missing:"El pedido no tiene datos suficientes para identificar al cliente. Elegilo antes de guardar."};clientWarning=messages[match.reason]||messages.missing;const hint=$("#opClientSearchHint");hint.textContent=clientWarning;hint.className="client-search-hint error"}}
  $("#opProductSearch").value="";$("#opProductResults").innerHTML="";$("#opProductResults").classList.add("hidden");$("#opProductSearchHint").className="product-search-hint";$("#opProductSearchHint").textContent="Sin cantidad indicada se pregunta antes de agregar. Acepta *, x y cantidades con coma.";
  renderDraftItems(); updateOperationTotal(); $("#operationDialog").showModal();if(clientWarning)toast(clientWarning,"error");setTimeout(()=>$(matchedClient?"#opProductSearch":"#opClientSearch").focus(),80);
}
function creditedQuantities(referenceId){const totals={};activeOperations().filter(op=>String(op.tipo).toUpperCase()==="NOTA_CREDITO"&&String(op.referencia_operacion_id)===String(referenceId)).forEach(op=>operationItems(op.operacion_id).forEach(item=>{const id=String(item.producto_id);totals[id]=(totals[id]||0)+numeric(item.cantidad)}));return totals}
function openCreditNote(referenceId){
  if(!canIssueDocuments())return toast("Tu usuario no tiene permiso para emitir notas de crédito.","error");const reference=activeOperations().find(op=>String(op.operacion_id)===String(referenceId)&&String(op.tipo).toUpperCase()==="REMITO");if(!reference)return toast("El remito ya no está vigente.","error");const credited=creditedQuantities(referenceId),available=operationItems(referenceId).map(item=>({...item,maximo:Math.max(0,numeric(item.cantidad)-numeric(credited[String(item.producto_id)]))})).filter(item=>item.maximo>.0001);if(!available.length)return toast("Ese remito ya fue acreditado por completo.","error");
  openOperation();state.currentCreditOperation=reference;state.currentCreditMode="DEVOLUCION_PRODUCTOS";state.currentOrder=null;state.draftItems=available.map(item=>({id_producto:item.producto_id,nombre:item.producto,cantidad:item.maximo,precio:numeric(item.precio_unitario),maximo:item.maximo,marca:item.marca||""}));const sellerInfo=operationSellerInfo(reference);$("#opSourceOrder").value="";$("#opReferenceOperation").value=reference.operacion_id;$("#operationDialogTitle").textContent=`Nota de crédito de ${formatOperationNumber(reference.numero)}`;$("#creditNoteBanner").innerHTML=`Se descontará del remito <b>${esc(formatOperationNumber(reference.numero))}</b> y de la comisión original de <b>${esc(sellerInfo.nombre)}</b>. Eliminá los productos que no correspondan y ajustá solamente las cantidades.`;$("#creditNoteBanner").classList.remove("hidden");$("#opType").value="NOTA_CREDITO";$("#opType").disabled=true;$("#opDiscount").value=numeric(reference.descuento_pct);$("#opDiscount").disabled=true;$("#opSeller").innerHTML=`<option value="${esc(sellerInfo.id)}">${esc(sellerInfo.nombre)}</option>`;$("#opSeller").value=sellerInfo.id;$("#opSeller").disabled=true;$$("[data-sale-payment]").forEach(el=>el.classList.add("hidden"));$("#opPaymentMethod").value="CUENTA_CORRIENTE";$("#opPaidAmount").value="0";$("#operationDialog .product-quick-add").classList.add("hidden");
  const client=clientById(reference.cliente_id)||occasionalProfileById(reference.cliente_id);if(client)selectOperationClient(client.id);else{$("#opClient").value=reference.cliente_id;$("#opClientSearchBox").classList.add("hidden");setOperationClientActionsVisible(false);$("#opClientSelectedName").textContent=reference.cliente;$("#opClientSelectedMeta").textContent="Cliente del remito original";$("#opClientSelected").classList.remove("hidden")}$("#btnChangeOperationClient").classList.add("hidden");renderDraftItems();updateOperationTotal();setTimeout(()=>$("[data-item-qty]")?.focus(),60);
}
function prepareFinancialCredit(mode,reference=null){
  if($("#operationDialog").open)$("#operationDialog").close();
  if(!isAdmin())return toast("Los ajustes financieros requieren permisos de administrador.","error");openOperation();state.currentCreditMode=mode;state.currentCreditOperation=reference;state.draftItems=[];$("#opType").value="NOTA_CREDITO";$("#opType").disabled=true;$("#opSourceOrder").value="";$("#opReferenceOperation").value=reference?.operacion_id||"";$("#financialCreditFields").classList.remove("hidden");$("#operationProductsSection").classList.add("hidden");$("#opDiscount").closest("label").classList.add("hidden");$("#opSellerField").classList.add("hidden");$$("[data-sale-payment]").forEach(el=>el.classList.add("hidden"));$("#financialCreditAmount").value="";$("#financialCreditConcept").value="";$("#financialCreditTitle").textContent=mode==="BONIFICACION_REMITO"?"Bonificación sobre remito":"Crédito general al cliente";$("#financialCreditHelp").textContent=mode==="BONIFICACION_REMITO"?"Reduce el remito y su comisión original sin devolver productos.":"Reduce la cuenta corriente y no genera ni descuenta comisión.";$("#operationDialogTitle").textContent=mode==="BONIFICACION_REMITO"?`Bonificar ${formatOperationNumber(reference.numero)}`:"Crear ajuste de crédito";
  if(reference){const sellerInfo=operationSellerInfo(reference);$("#creditNoteBanner").innerHTML=`Bonificación vinculada al remito <b>${esc(formatOperationNumber(reference.numero))}</b> · ${esc(sellerInfo.nombre)}.`;$("#creditNoteBanner").classList.remove("hidden");const client=clientById(reference.cliente_id)||occasionalProfileById(reference.cliente_id);if(client)selectOperationClient(client.id);else{$("#opClient").value=reference.cliente_id;$("#opClientSearchBox").classList.add("hidden");setOperationClientActionsVisible(false);$("#opClientSelectedName").textContent=reference.cliente;$("#opClientSelectedMeta").textContent="Cliente del remito original";$("#opClientSelected").classList.remove("hidden")}$("#btnChangeOperationClient").classList.add("hidden")}
  renderDraftItems();updateOperationTotal();setTimeout(()=>$("#financialCreditAmount").focus(),60);
}
function openFinancialCredit(referenceId){if($("#detailDialog")?.open)$("#detailDialog").close();const reference=activeOperations().find(op=>String(op.operacion_id)===String(referenceId)&&String(op.tipo).toUpperCase()==="REMITO");if(!reference)return toast("El remito ya no está vigente.","error");prepareFinancialCredit("BONIFICACION_REMITO",reference)}
function openGeneralCredit(){prepareFinancialCredit("CREDITO_GENERAL",null)}
function renderDraftItems() {
  const credit=!!state.currentCreditOperation;$("#opItems").innerHTML=state.draftItems.length?state.draftItems.map((item,index)=>{const offer=credit?null:currentOfferForProduct(item.id_producto);return `<div class="item-row" data-item-index="${index}"><div class="item-product-summary"><input data-item-product type="hidden" value="${esc(item.id_producto)}"><small>${esc(item.id_producto||"SIN CÓDIGO")}${credit?` · Máximo ${number(item.maximo)}`:""}</small><strong>${esc(item.nombre||productById(item.id_producto)?.nombre||"Producto")}</strong>${offer?`<button type="button" class="mini-btn ${item.usa_oferta?"primary":""}" data-draft-offer="${index}">${item.usa_oferta?"🔥 Oferta aplicada":"🔥 Usar oferta "+money(offer.precio_oferta)}</button>`:""}</div><label>Cantidad<input data-item-qty type="number" min="0.001" ${credit?`max="${esc(item.maximo)}"`:""} step="0.001" inputmode="decimal" value="${esc(item.cantidad)}"></label><label>Precio<input data-item-price type="number" min="0" step="0.01" inputmode="decimal" value="${esc(item.precio)}" ${credit?"readonly":""}></label><div class="line-total">${money(Number(item.cantidad)*Number(item.precio))}</div><button class="remove-item" data-item-remove type="button" aria-label="Eliminar ${esc(item.nombre||"producto")}">×</button></div>`}).join(""):'<div class="empty compact-empty">Todavía no agregaste productos.</div>';
}
function syncDraftFromDom() { $$(".item-row").forEach(row=>{const i=Number(row.dataset.itemIndex),pid=$("[data-item-product]",row).value,p=productById(pid),old=state.draftItems[i]||{};state.draftItems[i]={...old,id_producto:pid,nombre:p?.nombre||old.nombre||"",cantidad:Number($("[data-item-qty]",row).value)||0,precio:Number($("[data-item-price]",row).value)||0};}); }
function toggleDraftOffer(index){if(state.currentCreditOperation)return;syncDraftFromDom();const item=state.draftItems[index],offer=currentOfferForProduct(item?.id_producto),product=productById(item?.id_producto);if(!item||!offer)return;item.precio_lista=numeric(item.precio_lista)||productPriceForOperation(product);item.precio_oferta=numeric(offer.precio_oferta);item.usa_oferta=!item.usa_oferta;item.oferta_id=item.usa_oferta?offer.oferta_id||"":"";item.precio=item.usa_oferta?item.precio_oferta:item.precio_lista;renderDraftItems();updateOperationTotal()}
function operationTotal() {if(["BONIFICACION_REMITO","CREDITO_GENERAL"].includes(state.currentCreditMode))return numeric($("#financialCreditAmount").value);const sub=state.draftItems.reduce((s,i)=>s+Number(i.cantidad||0)*Number(i.precio||0),0);return sub*(1-(Number($("#opDiscount").value)||0)/100); }
function mixedTotal(prefix){return ["Cash","Transfer","Check"].reduce((s,k)=>s+(Number($(`#${prefix}Mixed${k}`).value)||0),0)}
function updateOperationTotal() { syncDraftFromDom(); const total=operationTotal(),method=$("#opPaymentMethod").value;if(method==="MIXTO")$("#opPaidAmount").value=mixedTotal("op");else if(["EFECTIVO","TRANSFERENCIA"].includes(method)&&state.autoPaidAmount)$("#opPaidAmount").value=total.toFixed(2);const paid=Math.min(total,Number($("#opPaidAmount").value)||0); $("#opTotal").textContent=money(total); $("#opBalance").textContent=`Saldo: ${money(total-paid)}`; $$(".item-row").forEach((r,i)=>$(".line-total",r).textContent=money(Number(state.draftItems[i].cantidad)*Number(state.draftItems[i].precio))); }
function stageCreatedOperation(data,payload,total,paid){
  const now=new Date().toISOString(),subtotal=payload.items.length?payload.items.reduce((sum,item)=>sum+numeric(item.cantidad)*numeric(item.precio),0):total;
  state.gestion.operaciones.push({operacion_id:data.operacion_id,numero:data.numero,tipo:payload.tipo,fecha:payload.fecha,cliente_id:payload.cliente_id,cliente:payload.cliente,vendedor_id:payload.vendedor_id,vendedor:payload.vendedor,origen_tipo:payload.referencia_operacion_id?"NOTA_CREDITO":(payload.origen_pedido_id?"PEDIDO":"MANUAL"),origen_pedido_id:payload.origen_pedido_id,referencia_operacion_id:payload.referencia_operacion_id||"",credito_tipo:payload.credito_tipo||"",credito_concepto:payload.credito_concepto||"",comision_estado:data.comision_estado||payload.comision_estado||"",usuario_id:state.user?.id||"",usuario:state.user?.nombre||"",estado:"VIGENTE",subtotal,descuento_pct:payload.descuento_pct,total,saldo:payload.tipo==="NOTA_CREDITO"?0:Math.max(0,total-paid),observaciones:payload.observaciones,created_at:now,updated_at:now,_initial_paid:paid,_initial_methods:[...new Set((payload.pagos_iniciales||[]).map(p=>p.medio))],_initial_payments:payload.pagos_iniciales||[]});
  const localItems=payload.items.length?payload.items:[{id_producto:"AJUSTE-FINANCIERO",nombre:payload.credito_tipo==="CREDITO_GENERAL"?"Crédito general":"Bonificación comercial",cantidad:1,precio:total}];state.gestion.items.push(...localItems.map((item,index)=>({item_id:`LOCAL-IT-${index}`,operacion_id:data.operacion_id,orden:index+1,producto_id:item.id_producto,producto:item.nombre,cantidad:item.cantidad,precio_unitario:item.precio,descuento_pct:0,subtotal:numeric(item.cantidad)*numeric(item.precio)})));
  saveCurrentCache();
}
function refreshAfterMutation(){setSync("Guardado · actualizando…");return loadAll({silent:true})}
async function saveOperation(event) {
  event.preventDefault();if(!canIssueDocuments())return toast("Tu usuario no tiene permiso para emitir comprobantes.","error");syncDraftFromDom();const financial=["BONIFICACION_REMITO","CREDITO_GENERAL"].includes(state.currentCreditMode);
  const items=financial?[]:state.draftItems.filter(i=>i.id_producto&&i.cantidad>0); if(!financial&&!items.length)return toast("Agregá al menos un producto.","error");
  const selectedClientId=$("#opClient").value,selectedOccasional=occasionalProfileById(selectedClientId),selectedOrderOccasional=isOccasionalId(selectedClientId),occasionalMode=!$("#opOccasionalFields").classList.contains("hidden")||!!selectedOccasional||selectedOrderOccasional,occasionalName=selectedOccasional?.nombre||(selectedOrderOccasional?$("#opClientSelectedName").textContent.trim():$("#opOccasionalName").value.trim());
  const cliente=occasionalMode?{id:selectedOccasional?.id||(selectedOrderOccasional?selectedClientId:state.occasionalClientId),nombre:occasionalName}:clientById($("#opClient").value);
  if(occasionalMode&&!occasionalName)return toast("Escribí el nombre del cliente ocasional.","error");
  if(!cliente?.id||!cliente?.nombre)return toast("Buscá y elegí el cliente correcto.","error");
  if(state.currentCreditMode==="DEVOLUCION_PRODUCTOS"&&items.some(item=>numeric(item.cantidad)>numeric(item.maximo)+.0001))return toast("Una cantidad supera lo disponible en el remito.","error");const total=operationTotal();if(financial&&total<=0)return toast("Ingresá el importe del crédito.","error");if(financial&&!$("#financialCreditConcept").value.trim())return toast("Ingresá el motivo del crédito.","error");const payments=(state.currentCreditOperation||financial)?[]:readPayments("op"),paid=payments.reduce((s,p)=>s+Number(p.importe),0);if(paid>total+.01)return toast("El pago inicial no puede superar el total.","error");if(!state.currentCreditOperation&&!financial&&$("#opPaymentMethod").value!=="CUENTA_CORRIENTE"&&!payments.length)return toast("Ingresá el importe pagado.","error");
  const sellerValue=$("#opSeller").value,direct=sellerValue==="__NO_COMMISSION__",selectedSeller=sellerById(sellerValue)||(state.currentCreditOperation?operationSellerInfo(state.currentCreditOperation):null),payload={tipo:$("#opType").value,fecha:$("#opDate").value,cliente_id:cliente.id,cliente:cliente.nombre,vendedor_id:direct?"":(selectedSeller?.id||""),vendedor:direct?"Venta directa / sin comisión":(selectedSeller?.nombre||""),comision_estado:direct?"NO_APLICA":"APLICA",credito_tipo:state.currentCreditMode||"",credito_importe:financial?total:0,credito_concepto:financial?$("#financialCreditConcept").value.trim():"",origen_pedido_id:$("#opSourceOrder").value,referencia_operacion_id:$("#opReferenceOperation").value,descuento_pct:Number($("#opDiscount").value)||0,observaciones:$("#opNotes").value.trim(),items,pagos_iniciales:payments};
  const btn=$("#btnSaveOperation");btn.disabled=true;btn.textContent="Guardando…";
  try{const data=await apiPost("create_operacion",payload);stageCreatedOperation(data,payload,total,paid);$("#operationDialog").close();toast(`Comprobante ${formatOperationNumber(data.numero)} guardado`);showOperationDetail(data.operacion_id,false);refreshAfterMutation();}catch(err){toast(err.message,"error")}finally{btn.disabled=false;btn.textContent="Guardar comprobante";}
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
  const account=debtAccounts().find(a=>String(a.cliente_id)===String(clientId)||a.client_ids.includes(String(clientId)));
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
  if(!canIssueDocuments())return toast("Tu usuario no tiene permiso para generar recibos.","error");
  $("#receiptForm").reset();$("#receiptClient").value="";$("#receiptDate").value=todayISO();$("#receiptAmount").readOnly=false;$("#receiptMixedFields").classList.add("hidden");$("#receiptCheckFields").classList.add("hidden");setReceiptMessage();
  if(clientId)selectReceiptClient(clientId);else startReceiptClientSearch();
  $("#receiptDialog").showModal();if(!clientId)setTimeout(()=>$("#receiptClientSearch").focus(),80);
}
function updateReceiptOperations(){
  const account=accountByReference($("#receiptClient").value),ids=account?.client_ids||[];
  const ops=activeOperations().filter(o=>ids.includes(String(o.cliente_id))&&numeric(o.saldo)>.005);
  $("#receiptOperation").innerHTML='<option value="">A cuenta, sin comprobante específico</option>'+ops.map(o=>`<option value="${esc(o.operacion_id)}">${esc(o.tipo)} ${esc(formatOperationNumber(o.numero))} · saldo ${money(o.saldo)}</option>`).join("");
  if(ops.length===1){$("#receiptOperation").value=ops[0].operacion_id;$("#receiptAmount").value=numeric(ops[0].saldo).toFixed(2)}
  else if(!account)$("#receiptAmount").value="";
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
  event.preventDefault();if(!canIssueDocuments())return toast("Tu usuario no tiene permiso para generar recibos.","error");const btn=$("#btnSaveReceipt");setReceiptMessage();
  try{
    const account=accountByReference($("#receiptClient").value);if(!account)throw new Error("Elegí un cliente con saldo pendiente.");
    if(!$("#receiptDate").value)throw new Error("Elegí la fecha del recibo.");
    const payments=readPayments("receipt"),amount=payments.reduce((s,p)=>s+numeric(p.importe),0);if(amount<=0)throw new Error("Ingresá el importe recibido.");
    if($("#receiptMethod").value==="CHEQUE"){const c=readCheckFields("receipt");if(!c.banco||!c.numero||!c.fecha_vencimiento)throw new Error("Para el cheque faltan banco, número o vencimiento.")}
    const op=activeOperations().find(o=>String(o.operacion_id)===String($("#receiptOperation").value));if(op&&amount>numeric(op.saldo)+.01)throw new Error(`El pago supera el saldo de ${money(op.saldo)}.`);
    const payload={fecha:$("#receiptDate").value,cliente_id:op?.cliente_id||account.cliente_id,cliente:op?.cliente||account.cliente,importe:amount,pagos:payments,operacion_id:$("#receiptOperation").value,observaciones:$("#receiptNotes").value.trim()};
    btn.disabled=true;btn.textContent="Guardando…";setReceiptMessage("Guardando el recibo…","working");
    const data=await apiPost("create_recibo",payload);stageCreatedReceipt(data,payload,payments,amount,op);$("#receiptDialog").close();toast(`Recibo ${data.numero} guardado`);showReceiptDetail(data.recibo_id,false);refreshAfterMutation();
  }catch(err){setReceiptMessage(err.message||"No se pudo guardar el recibo.","error");}
  finally{btn.disabled=false;btn.textContent="Guardar recibo"}
}

function showOrderDetail(id){const o=state.source.pedidos.find(x=>String(x.pedido_id)===String(id));if(!o)return;openDetail(`Pedido ${o.pedido_id}`,detailHeader([["Fecha",o.fecha],["Cliente",o.cliente],["Vendedor",o.vendedor],["Total",money(o.total||o.total_pedido)]])+itemsTable(o.items||[]),orderActionButtons(o))}
function showOperationDetail(id,autoPrint=false){ showOperationsDetail(id,autoPrint); }
function receiptPaymentDetail(payment){const c=paymentCheck(payment);return `<section class="payment-detail"><div class="payment-detail-head"><div><small>Medio de pago</small><strong>${esc(payment.medio)}</strong></div><b>${money(payment.importe)}</b></div>${payment.referencia?`<p><b>Referencia:</b> ${esc(payment.referencia)}</p>`:""}${c?`<h4>Datos del cheque</h4>${detailHeader([["Banco",c.banco||"—"],["Número",c.numero||"—"],["Librador",c.librador||"—"],["Vencimiento",formatDate(c.fecha_vencimiento)],["Estado",c.estado||"EN_CARTERA"]])}`:""}</section>`}
function showReceiptDetail(id,autoPrint=false){const r=state.gestion.recibos.find(x=>String(x.recibo_id)===String(id));if(!r)return;const pays=receiptPayments(id);const html=detailHeader([["Fecha",formatDate(r.fecha)],["Cliente",r.cliente],["Importe",money(r.total)],["Estado",r.estado],["Aplicado a",r.operacion_numero?formatOperationNumber(r.operacion_numero):"A cuenta"]])+pays.map(receiptPaymentDetail).join("")+(r.observaciones?`<p><b>Observaciones:</b> ${esc(r.observaciones)}</p>`:"");openDetail(`Recibo ${r.numero}`,html,`<button class="btn primary" data-receipt-print="${esc(id)}">Imprimir</button>`);if(autoPrint)setTimeout(()=>printReceipt(id),250)}
function showAccountDetail(id){const a=accountByReference(id);if(!a)return;const rows=[...a.movimientos].sort((x,y)=>String(y.fecha).localeCompare(String(x.fecha))).map(m=>`<tr><td>${formatDate(m.fecha)}</td><td>${esc(m.tipo)}</td><td>${esc(displayDocumentNumber(m.documento_tipo,m.documento_numero))}</td><td>${money(m.debe)}</td><td>${money(m.haber)}</td></tr>`).join("");openDetail(a.cliente,detailHeader([["Total debitado",money(a.debe)],["Total pagado",money(a.haber)],["Saldo",money(a.saldo)]])+`<table class="detail-lines"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Documento</th><th>Debe</th><th>Haber</th></tr></thead><tbody>${rows}</tbody></table>`,`<button class="btn primary" data-account-receipt="${esc(a.cliente_id)}">Ingresar pago</button>`)}
function detailHeader(items){return `<div class="detail-grid">${items.map(([a,b])=>`<div class="detail-box"><small>${esc(a)}</small><strong>${esc(b)}</strong></div>`).join("")}</div>`}
function itemsTable(items){return `<table class="detail-lines"><thead><tr><th>Producto</th><th>Cant.</th><th>Unit.</th><th>Total</th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(i.nombre||i.producto||i.detalle)}</td><td>${number(i.cantidad||i.total)}</td><td>${money(i.precio||i.precio_unitario)}</td><td>${money(i.subtotal||i.total_item||numeric(i.cantidad||i.total)*numeric(i.precio||i.precio_unitario))}</td></tr>`).join("")}</tbody></table>`}
function openDetail(title,body,actions=""){ $("#detailDialog").classList.remove("docs-detail"); $("#detailTitle").textContent=title;$("#detailBody").innerHTML=body;$("#detailActions").innerHTML=actions;$("#detailDialog").showModal(); }

function printWindow(title, body, format="A5") {const win=window.open("","_blank");if(!win)return toast("El navegador bloqueó la impresión.","error");win.document.open();win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${format} portrait;margin:8mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#101d2b;margin:0}.head{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #17365c;padding-bottom:8px}.head h1{margin:0;font-size:21px}.head p{margin:2px 0}.doc{text-align:right}.doc strong{font-size:18px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:5px 16px;margin:10px 0;padding:8px;background:#f2f6f8}.meta div{display:flex;justify-content:space-between;gap:8px}table{width:100%;border-collapse:collapse}th,td{padding:5px;border-bottom:1px solid #ccd6dc;text-align:left}th{font-size:10px;text-transform:uppercase}th:nth-child(n+2),td:nth-child(n+2){text-align:right}.check-box{margin-top:9px;padding:8px;border:1px solid #bfcdd6;background:#f7fafb}.check-box>strong{display:block;margin-bottom:6px}.check-grid{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:3px 10px}.check-grid span{color:#52616e}.check-grid b{text-align:right}.totals{margin:10px 0 0 auto;width:48%}.totals div{display:flex;justify-content:space-between;padding:4px}.totals .grand{font-size:16px;font-weight:bold;border-top:2px solid #17365c}.foot{margin-top:14px;border-top:1px solid #ccd6dc;padding-top:7px;font-size:10px;color:#52616e}.signature{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:28px}.signature div{border-top:1px solid #222;text-align:center;padding-top:4px}</style></head><body>${body}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);win.document.close();win.focus();}
function formatOperationNumber(value){
  const raw=String(value||"").trim(),match=raw.match(/^([^0-9]*?)[-\s]*(\d+)$/);
  if(!match)return raw;
  const prefix=(match[1]||"R").replace(/[-\s]+$/g,"").trim()||"R";
  return `${prefix} 0001-${match[2].padStart(8,"0").slice(-8)}`;
}
function canonicalOperationNumber(value,type){const raw=String(value||""),match=raw.match(/(\d+)\s*$/),prefix=({REMITO:"R",PROFORMA:"FPF",NOTA_VENTA:"NDV",NOTA_CREDITO:"NC"})[String(type||"").toUpperCase()];return prefix&&match?`${prefix}-${match[1].padStart(8,"0").slice(-8)}`:raw}
function operationTypeLabel(value){return ({REMITO:"Remito",PROFORMA:"Factura pro forma",NOTA_VENTA:"Nota de venta",NOTA_CREDITO:"Nota de crédito"})[String(value||"").toUpperCase()]||String(value||"Comprobante").replace(/_/g," ")}
function displayDocumentNumber(type,value){
  const operationTypes=["REMITO","PROFORMA","NOTA_VENTA","NOTA_CREDITO","COMPROBANTE"];
  return operationTypes.includes(String(type||"").toUpperCase())?formatOperationNumber(canonicalOperationNumber(value,type)):String(value||"");
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
  const credit=String(operation.tipo).toUpperCase()==="NOTA_CREDITO",payment=credit?{condition:`Ajuste sobre remito ${formatOperationNumber(operation.referencia_numero||"")}`,paid:0,saldo:0}:operationPaymentInfo(operation);
  const printable={
    title:`${operationTypeLabel(operation.tipo)} ${formatOperationNumber(operation.numero)}`,
    kind:operationTypeLabel(operation.tipo),
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
    notes:String(operation.credito_concepto||operation.observaciones||"")
  };
  const data=JSON.stringify(printable).replace(/</g,"\\u003c");
  win.document.open();
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(printable.title)}</title><style>
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#d8dde1;color:#171b20;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
#pages{padding:12px 0}.sheet{width:210mm;height:297mm;margin:0 auto 12px;background:#fff;box-shadow:0 2px 14px #0003;display:grid;grid-template-rows:148.5mm 148.5mm;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}
.half{height:148.5mm;padding:7mm 10mm 5mm;overflow:hidden;position:relative}.half:first-child{border-bottom:.25mm dashed #aeb5bb}.blank{background:#fff}
.voucher{height:100%;display:flex;flex-direction:column}.voucher-head{display:grid;grid-template-columns:1fr auto;gap:8mm;align-items:end;padding-bottom:2mm;border-bottom:.5mm solid #20262b}.eyebrow{font-size:6.8pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#4b555d}.client{font-size:13pt;font-weight:800;line-height:1.02;margin-top:.8mm}.doc{text-align:right}.doc strong{display:block;font-size:10.5pt;white-space:nowrap}.doc span{display:block;font-size:7.5pt;margin-top:.7mm}.part{font-size:6.5pt;color:#68727a;margin-top:.5mm}
.lines{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:2mm;font-size:7.4pt}.lines col.qty{width:13mm}.lines col.code{width:25mm}.lines col.unit{width:28mm}.lines col.amount{width:30mm}.lines th{background:#2f3940;color:#fff;padding:1.25mm 1.4mm;text-transform:uppercase;font-size:6.5pt;letter-spacing:.035em;text-align:left}.lines th.num,.lines td.num{text-align:right}.lines td{padding:.65mm 1.4mm;border-bottom:.16mm solid #d6dadd;vertical-align:top;line-height:1.08;overflow-wrap:anywhere}.lines tbody tr:nth-child(odd) td{background:#eef1f3}.lines td.description{font-weight:600}
.footer{margin-top:auto;padding-top:1.6mm;border-top:.35mm solid #40484e;display:grid;grid-template-columns:minmax(0,1fr) 63mm;gap:6mm;align-items:end;font-size:7.3pt}.condition strong{display:block;font-size:8pt;margin-bottom:.5mm}.notes{margin-top:1mm;color:#41484e;line-height:1.15}.summary div{display:flex;justify-content:space-between;gap:5mm;padding:.35mm 0}.summary .grand{border-top:.4mm solid #20262b;margin-top:.4mm;padding-top:.7mm;font-size:9.5pt;font-weight:800}.summary .balance{font-weight:700}.legal{font-size:6pt;color:#6d7479;line-height:1}.voucher:not(.has-footer) .legal{margin-top:auto}.voucher.has-footer .legal{margin-top:1.2mm}
#measure{position:fixed;left:-10000px;top:0;visibility:hidden}.measure-half{width:210mm;height:148.5mm;padding:7mm 10mm 5mm;overflow:hidden;position:relative;background:#fff}
@media print{html,body{background:#fff}#pages{padding:0}.sheet{margin:0;box-shadow:none}.half:first-child{border-bottom:.25mm dashed #aeb5bb}}
</style></head><body><main id="pages"></main><div id="measure"></div><script>
const data=${data};
const rowMarkup=item=>\`<tr><td class="num">\${item.quantity}</td><td>\${escapeHtml(item.code)}</td><td class="description">\${escapeHtml(item.description)}</td><td class="num">\${item.unit}</td><td class="num">\${item.amount}</td></tr>\`;
function escapeHtml(value){return String(value??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;"}[c]))}
function headerMarkup(part,total){return \`<header class="voucher-head"><div><div class="eyebrow">\${escapeHtml(data.kind)} · Comprobante interno</div><div class="client">\${escapeHtml(data.client)}</div></div><div class="doc"><strong>\${escapeHtml(data.number)}</strong><span>\${escapeHtml(data.date)}</span><div class="part">Parte \${part} de \${total}</div></div></header>\`}
function tableMarkup(rows){return \`<table class="lines"><colgroup><col class="qty"><col class="code"><col><col class="unit"><col class="amount"></colgroup><thead><tr><th class="num">Cant.</th><th>Código</th><th>Descripción</th><th class="num">P. unitario</th><th class="num">Importe</th></tr></thead><tbody>\${rows.map(rowMarkup).join("")}</tbody></table>\`}
function footerMarkup(){return \`<footer class="footer"><div class="condition"><strong>Condición de pago: \${escapeHtml(data.condition)}</strong>\${data.notes?\`<div class="notes"><b>Observaciones:</b> \${escapeHtml(data.notes)}</div>\`:""}</div><div class="summary"><div><span>Subtotal</span><b>\${data.subtotal}</b></div>\${data.discountPct?\`<div><span>Descuento \${data.discountPct}%</span><b>-\${data.discount}</b></div>\`:""}<div class="grand"><span>Total</span><b>\${data.total}</b></div>\${data.paidValue>.005?\`<div><span>Pagado</span><b>\${data.paid}</b></div>\`:""}<div class="balance"><span>Saldo</span><b>\${data.balance}</b></div></div></footer>\`}
function voucherMarkup(rows,part,total,final){return \`<article class="voucher \${final?"has-footer":""}">\${headerMarkup(part,total)}\${tableMarkup(rows)}\${final?footerMarkup():""}<div class="legal">Comprobante interno — no válido como factura.</div></article>\`}
function fits(rows,withFooter){const holder=document.getElementById("measure");holder.innerHTML=\`<div class="measure-half">\${voucherMarkup(rows,1,1,withFooter)}</div>\`;const half=holder.firstElementChild;return half.scrollHeight<=half.clientHeight+.5}
function greedySplit(){const chunks=[];let cursor=0;if(!data.items.length)return [{rows:[],final:true}];while(cursor<data.items.length){let rows=[];while(cursor+rows.length<data.items.length){const candidate=[...rows,data.items[cursor+rows.length]];if(rows.length&&!fits(candidate,false))break;rows=candidate;if(cursor+rows.length===data.items.length)break}let final=cursor+rows.length===data.items.length;if(final&&!fits(rows,true)){while(rows.length>1&&!fits(rows,true))rows.pop();final=cursor+rows.length===data.items.length}chunks.push({rows,final});cursor+=rows.length}return chunks}
function balancedSplit(parts){const chunks=[];let cursor=0;for(let i=0;i<parts;i++){const remaining=data.items.length-cursor,slots=parts-i,size=Math.ceil(remaining/slots),rows=data.items.slice(cursor,cursor+size),final=i===parts-1;if(!fits(rows,final))return null;chunks.push({rows,final});cursor+=size}return chunks}
function splitRows(){const greedy=greedySplit();if(greedy.length<2)return greedy;return balancedSplit(greedy.length)||greedy}
function render(){const chunks=splitRows(),pages=document.getElementById("pages");for(let i=0;i<chunks.length;i+=2){const sheet=document.createElement("section");sheet.className="sheet";[i,i+1].forEach(index=>{const half=document.createElement("div");half.className="half"+(index>=chunks.length?" blank":" ");if(index<chunks.length)half.innerHTML=voucherMarkup(chunks[index].rows,index+1,chunks.length,chunks[index].final);sheet.appendChild(half)});pages.appendChild(sheet)}document.getElementById("measure").remove();setTimeout(()=>window.print(),450)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",render);else render();
<\/script></body></html>`);
  win.document.close();win.focus();
}
function printReceipt(id){const r=state.gestion.recibos.find(x=>String(x.recibo_id)===String(id));if(!r)return;const pays=receiptPayments(id),checks=pays.map(p=>({payment:p,check:paymentCheck(p)})).filter(x=>x.check);const checkBlocks=checks.map(({payment:p,check:c})=>`<div class="check-box"><strong>Datos del cheque · ${money(p.importe)}</strong><div class="check-grid"><span>Banco</span><b>${esc(c.banco||"—")}</b><span>Número</span><b>${esc(c.numero||"—")}</b><span>Librador</span><b>${esc(c.librador||"—")}</b><span>Vencimiento</span><b>${formatDate(c.fecha_vencimiento)}</b><span>Estado</span><b>${esc(c.estado||"EN_CARTERA")}</b></div></div>`).join("");const body=`<div class="head"><div><h1>${esc(state.gestion.config.empresa_nombre||"Distribuidora D9")}</h1><p>Recibo de pago</p></div><div class="doc"><strong>RECIBO ${esc(r.numero)}</strong><p>${formatDate(r.fecha)}</p></div></div><div class="meta"><div><span>Recibimos de</span><b>${esc(r.cliente)}</b></div><div><span>Importe</span><b>${money(r.total)}</b></div></div><p>En concepto de pago${r.operacion_numero?` aplicado al comprobante ${esc(formatOperationNumber(r.operacion_numero))}`:" a cuenta"}.</p><table><thead><tr><th>Medio</th><th>Referencia</th><th>Importe</th></tr></thead><tbody>${pays.map(p=>`<tr><td>${esc(p.medio)}</td><td>${esc(p.referencia||"")}</td><td>${money(p.importe)}</td></tr>`).join("")}</tbody></table>${checkBlocks}${r.observaciones?`<p><b>Observaciones:</b> ${esc(r.observaciones)}</p>`:""}<div class="totals"><div class="grand"><span>Total recibido</span><b>${money(r.total)}</b></div></div><div class="signature"><div>Firma y aclaración</div><div>Recibí conforme</div></div><div class="foot">Recibo interno de cobranza.</div>`;printWindow(`Recibo ${r.numero}`,body,state.gestion.config.impresion||"A5")}
function formatDate(value){const s=String(value||"");if(/^\d{4}-\d{2}-\d{2}/.test(s)){const [y,m,d]=s.slice(0,10).split("-");return `${d}/${m}/${y}`;}return s;}
function hydrateConfig(){const f=$("#configForm"),c=state.gestion.config;[...f.elements].forEach(el=>{if(el.name&&c[el.name]!==undefined)el.value=c[el.name]})}
async function saveConfig(event){event.preventDefault();const config=Object.fromEntries(new FormData(event.currentTarget));try{await apiPost("update_config",{config});toast("Configuración guardada");await loadAll()}catch(err){toast(err.message,"error")}}

async function annulOperation(id){if(!isAdmin())return toast("Sólo administración puede anular comprobantes.","error");if(!confirm("¿Anular este comprobante? No se borrará: se generarán los movimientos de reversión."))return;try{await apiPost("anular_operacion",{operacion_id:id});toast("Comprobante anulado");await loadAll()}catch(err){toast(err.message,"error")}}
async function updateCheck(id,status){if(!isAdmin())return toast("Sólo administración puede cambiar cheques.","error");if(!confirm(`¿Marcar el cheque como ${status.toLowerCase()}?`))return;try{await apiPost("update_cheque_status",{cheque_id:id,estado:status});toast("Cheque actualizado");await loadAll()}catch(err){toast(err.message,"error")}}

function bindEvents(){
  initOperationsUI();
  $("#btnConfirmOrderReuse").addEventListener("click",confirmOrderReuse);
  $("#orderReuseDialog").addEventListener("close",()=>{state.pendingOrderReuseId=""});
  $("#btnCreateOperationClient").addEventListener("click",()=>openClientEditor("","operation"));
  $("#clientDialog").addEventListener("close",()=>{state.clientEditorOrigin=""});
  $("#loginForm").addEventListener("submit",login);$("#btnLogout").addEventListener("click",()=>{clearSession();showLogin()});$("#btnRefresh").addEventListener("click",loadAll);$("#homeLogo").addEventListener("click",()=>showView("home"));
  $("#nav").addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(b)showView(b.dataset.view)});document.addEventListener("click",e=>{const go=e.target.closest("[data-go]");if(go){$("#moreDialog")?.close();showView(go.dataset.go)}const close=e.target.closest("[data-close]");if(close)document.getElementById(close.dataset.close)?.close();const editProduct=e.target.closest("[data-edit-product]");if(editProduct)openProductEditor(editProduct.dataset.editProduct);const editClient=e.target.closest("[data-edit-client]");if(editClient)openClientEditor(editClient.dataset.editClient);const editUser=e.target.closest("[data-edit-user]");if(editUser)openUserEditor(editUser.dataset.editUser);const editCommission=e.target.closest("[data-user-commission]");if(editCommission)openCommissionEditor(editCommission.dataset.userCommission);const clientAccount=e.target.closest("[data-client-account]");if(clientAccount)openClientAccount(clientAccount.dataset.clientAccount);const editOffer=e.target.closest("[data-edit-offer]");if(editOffer)openOfferEditor(editOffer.dataset.editOffer);const draftOffer=e.target.closest("[data-draft-offer]");if(draftOffer)toggleDraftOffer(Number(draftOffer.dataset.draftOffer));const changeClient=e.target.closest("[data-receipt-client-change]");if(changeClient)startReceiptClientSearch();const rc=e.target.closest("[data-receipt-client]");if(rc)selectReceiptClient(rc.dataset.receiptClient);const oi=e.target.closest("[data-order-import]");if(oi){$("#detailDialog")?.close();openOperation(state.source.pedidos.find(o=>String(o.pedido_id)===String(oi.dataset.orderImport)))}const od=e.target.closest("[data-order-detail]");if(od)showOrderDetail(od.dataset.orderDetail);const op=e.target.closest("[data-operation-detail]");if(op){if($("#detailDialog")?.open)$("#detailDialog").close();showOperationDetail(op.dataset.operationDetail)}const credit=e.target.closest("[data-credit-note]");if(credit){if($("#detailDialog")?.open)$("#detailDialog").close();openCreditNote(credit.dataset.creditNote)}const closure=e.target.closest("[data-commission-closure]");if(closure)openCommissionClosure(closure.dataset.commissionClosure);const pp=e.target.closest("[data-operation-print]");if(pp)printOperation(pp.dataset.operationPrint);const oa=e.target.closest("[data-operation-annul]");if(oa)annulOperation(oa.dataset.operationAnnul);const ad=e.target.closest("[data-account-detail]");if(ad)showAccountDetail(ad.dataset.accountDetail);const ar=e.target.closest("[data-account-receipt]");if(ar){$("#detailDialog")?.close();openReceipt(ar.dataset.accountReceipt)}const rd=e.target.closest("[data-receipt-detail]");if(rd)showReceiptDetail(rd.dataset.receiptDetail);const rp=e.target.closest("[data-receipt-print]");if(rp)printReceipt(rp.dataset.receiptPrint);const cs=e.target.closest("[data-check-status]");if(cs)updateCheck(cs.dataset.checkStatus,cs.dataset.status)});
  document.addEventListener("click",e=>{const financial=e.target.closest("[data-financial-credit]");if(financial)openFinancialCredit(financial.dataset.financialCredit);const resolve=e.target.closest("[data-resolve-commission]");if(resolve)openCommissionResolution(resolve.dataset.resolveCommission);const report=e.target.closest("[data-report-open]");if(report)openReport(report.dataset.reportOpen);if(e.target.closest("[data-report-back]"))showReportsHub()});
  document.addEventListener("click",e=>{const card=e.target.closest("[data-receipt-card]");if(card&&!e.target.closest("button"))showReceiptDetail(card.dataset.receiptCard)});
  document.addEventListener("click",e=>{const editAd=e.target.closest("[data-edit-ad]");if(editAd)openAdEditor(editAd.dataset.editAd)});
  document.addEventListener("keydown",e=>{const card=e.target.closest?.("[data-receipt-card]");if(card&&(e.key==="Enter"||e.key===" ")){e.preventDefault();showReceiptDetail(card.dataset.receiptCard)}});
  ["#btnNewOperation","#btnNewOperation2"].forEach(s=>$(s).addEventListener("click",()=>openOperation()));$("#btnNewReceipt").addEventListener("click",()=>openReceipt());$("#operationForm").addEventListener("submit",saveOperation);$("#productQuantityForm").addEventListener("submit",confirmProductQuantity);$("#productQuantityDialog").addEventListener("close",()=>{if($("#operationDialog").open)setTimeout(()=>$("#opProductSearch").focus(),30)});$("#receiptForm").addEventListener("submit",saveReceipt);$("#configForm").addEventListener("submit",saveConfig);
  $("#opType").addEventListener("change",e=>{if(e.target.value==="NOTA_CREDITO"){if(!isAdmin()){e.target.value="REMITO";return toast("Los ajustes sin remito requieren permisos de administrador.","error")}openGeneralCredit()}});$("#financialCreditAmount").addEventListener("input",updateOperationTotal);
  $("#opClientSearch").addEventListener("input",()=>{state.clientSearchIndex=0;renderOperationClientResults()});$("#opClientSearch").addEventListener("keydown",e=>{if(e.key==="ArrowDown"){e.preventDefault();moveClientSearchSelection(1)}else if(e.key==="ArrowUp"){e.preventDefault();moveClientSearchSelection(-1)}else if(e.key==="Enter"){e.preventDefault();const client=state.clientSearchResults[state.clientSearchIndex];if(client)selectOperationClient(client.id);else if($("#opClientSearch").value.trim())toast("No encontré ese cliente.","error")}else if(e.key==="Escape"){$("#opClientSearch").value="";renderOperationClientResults()}});$("#opClientResults").addEventListener("click",e=>{const row=e.target.closest("[data-op-client]");if(row)selectOperationClient(row.dataset.opClient)});$("#btnChangeOperationClient").addEventListener("click",startOperationClientSearch);$("#btnOccasionalClient").addEventListener("click",startOccasionalClient);$("#btnCancelOccasionalClient").addEventListener("click",startOperationClientSearch);
  $("#opOccasionalName").addEventListener("input",e=>{const profile=occasionalProfiles().find(item=>occasionalIdentityKey(item.nombre)===occasionalIdentityKey(e.target.value));state.occasionalClientId=profile?.id||newOccasionalId()});
  $("#opProductSearch").addEventListener("input",()=>{state.productSearchIndex=0;renderOperationProductResults()});$("#opProductSearch").addEventListener("keydown",e=>{if(e.key==="ArrowDown"){e.preventDefault();moveProductSearchSelection(1)}else if(e.key==="ArrowUp"){e.preventDefault();moveProductSearchSelection(-1)}else if(e.key==="Enter"){e.preventDefault();const product=state.productSearchResults[state.productSearchIndex];if(product)addQuickProduct(product.id);else if($("#opProductSearch").value.trim())toast("No encontré ese producto.","error")}else if(e.key==="Escape"){$("#opProductSearch").value="";renderOperationProductResults()}});$("#opProductResults").addEventListener("click",e=>{const row=e.target.closest("[data-op-product]");if(row)addQuickProduct(row.dataset.opProduct)});$("#opItems").addEventListener("input",updateOperationTotal);$("#opItems").addEventListener("click",e=>{if(e.target.matches("[data-item-remove]")){syncDraftFromDom();state.draftItems.splice(Number(e.target.closest(".item-row").dataset.itemIndex),1);renderDraftItems();updateOperationTotal()}});
  ["#opDiscount","#opMixedCash","#opMixedTransfer","#opMixedCheck"].forEach(s=>$(s).addEventListener("input",updateOperationTotal));$("#opPaidAmount").addEventListener("input",()=>{state.autoPaidAmount=false;updateOperationTotal()});$("#opPaymentMethod").addEventListener("change",e=>{const method=e.target.value,mixed=method==="MIXTO",check=method==="CHEQUE"||mixed,fullPayment=["EFECTIVO","TRANSFERENCIA"].includes(method);state.autoPaidAmount=fullPayment;if(method==="CUENTA_CORRIENTE")$("#opPaidAmount").value="0";$("#opMixedFields").classList.toggle("hidden",!mixed);$("#opCheckFields").classList.toggle("hidden",!check);$("#opPaidAmount").readOnly=mixed;updateOperationTotal()});$("#receiptMethod").addEventListener("change",e=>{const mixed=e.target.value==="MIXTO",check=e.target.value==="CHEQUE"||mixed;$("#receiptMixedFields").classList.toggle("hidden",!mixed);$("#receiptCheckFields").classList.toggle("hidden",!check);$("#receiptAmount").readOnly=mixed;updateReceiptMixed()});["#receiptMixedCash","#receiptMixedTransfer","#receiptMixedCheck"].forEach(s=>$(s).addEventListener("input",updateReceiptMixed));$("#receiptOperation").addEventListener("change",e=>{const op=activeOperations().find(o=>String(o.operacion_id)===String(e.target.value));if(op)$("#receiptAmount").value=numeric(op.saldo).toFixed(2)});$("#receiptClientSearch").addEventListener("input",e=>{$("#receiptClient").value="";$("#receiptClientSelected").classList.add("hidden");updateReceiptOperations();renderReceiptClientPicker(e.target.value);setReceiptMessage()});
  [["#ordersSearch",renderOrders],["#ordersSeller",renderOrders],["#ordersStatus",renderOrders],["#operationsSearch",renderOperations],["#operationsType",renderOperations],["#operationsStatus",renderOperations],["#accountsSearch",renderAccounts],["#accountsFilter",renderAccounts],["#receiptDebtsSearch",renderReceiptDebtors],["#receiptsSearch",renderReceipts],["#checksSearch",renderChecks],["#checksStatus",renderChecks],["#mastersSearch",renderMasters],["#clientsSearch",renderClients],["#clientsPriceList",renderClients],["#clientsSeller",renderClients],["#clientsStatus",renderClients],["#clientsFiscal",renderClients]].forEach(([s,fn])=>$(s).addEventListener("input",fn));
  $("#btnMore").addEventListener("click",()=>$("#moreDialog").showModal());$("#btnNewProduct").addEventListener("click",()=>openProductEditor());$("#btnBulkPrices").addEventListener("click",openBulkPrices);$("#productForm").addEventListener("submit",saveProduct);$("#bulkPriceForm").addEventListener("submit",applyBulkPrices);$("#btnRefreshBulkPreview").addEventListener("click",calculateBulkPreview);$("#mastersPriceList").addEventListener("change",renderMasters);$("#btnNewClient").addEventListener("click",()=>openClientEditor());$("#clientForm").addEventListener("submit",saveClient);$("#btnDeleteClient").addEventListener("click",deleteClient);$("#btnAssignSellers").addEventListener("click",openSellerAssignment);$("#sellerAssignmentSearch").addEventListener("input",renderSellerAssignments);$("#sellerAssignmentMissing").addEventListener("change",renderSellerAssignments);$("#btnApplySellerSuggestions").addEventListener("click",applySellerSuggestions);$("#btnSaveSellerAssignments").addEventListener("click",saveSellerAssignments);$("#sellerAssignmentList").addEventListener("change",event=>{const select=event.target.closest("[data-seller-assignment]");if(select){state.sellerAssignments[select.dataset.sellerAssignment]=select.value;renderSellerAssignments()}});$("#btnImportClients").addEventListener("click",openClientImportPicker);$("#clientImportFile").addEventListener("change",readClientImportPdf);$("#clientImportReviewList").addEventListener("change",changeClientImportDecision);$("#btnApplyClientImport").addEventListener("click",applyClientImport);$$("#clientFiscalDetails input, #clientFiscalDetails select").forEach(input=>input.addEventListener("input",updateClientFiscalStatus));$("#btnNewOffer").addEventListener("click",()=>openOfferEditor());$("#offerForm").addEventListener("submit",saveOffer);$("#offerProduct").addEventListener("input",updateOfferProductInfo);$("#btnDeleteOffer").addEventListener("click",deleteOffer);$("#offersSearch").addEventListener("input",renderOffers);$("#offersStatus").addEventListener("change",renderOffers);
  $("#btnNewAd").addEventListener("click",()=>openAdEditor());$("#adForm").addEventListener("submit",saveAd);$("#adMode").addEventListener("change",()=>{updateAdMode();updateAdPreview()});$$('#adForm input, #adForm select').forEach(input=>input.addEventListener("input",updateAdPreview));$("#adsSearch").addEventListener("input",renderPublicidad);$("#adsStatus").addEventListener("change",renderPublicidad);
  $("#btnNewUser").addEventListener("click",()=>openUserEditor());$("#userForm").addEventListener("submit",saveUser);$("#commissionForm").addEventListener("submit",saveCommission);$("#commissionResolveForm").addEventListener("submit",saveCommissionResolution);$("#commissionResolveMode").addEventListener("change",updateCommissionResolutionMode);$("#userRole").addEventListener("change",updateUserRoleFields);$("#userGestionRole").addEventListener("change",updateUserRoleFields);[["#usersSearch","input"],["#usersStatus","change"],["#usersGestionRole","change"]].forEach(([selector,eventName])=>$(selector).addEventListener(eventName,renderUsers));
  ["#ordersFrom","#ordersTo"].forEach(selector=>$(selector).addEventListener("change",loadOrdersHistory));$("#ordersList").addEventListener("click",event=>{if(event.target.closest(".order-quick-actions"))event.preventDefault()});$("#btnReloadOrders").addEventListener("click",loadOrdersHistory);$("#btnOrdersPdf").addEventListener("click",printOrdersReport);$("#btnOrdersWhatsApp").addEventListener("click",shareOrdersWhatsApp);
  ["#reportSalesFrom","#reportSalesTo","#reportSalesSeller"].forEach(selector=>$(selector).addEventListener("change",()=>$("#salesReportResults").classList.add("hidden")));$("#btnRunSalesReport").addEventListener("click",renderSalesReport);$("#btnPrintSalesReport").addEventListener("click",printSalesReport);["#reportCommissionFrom","#reportCommissionTo","#reportCommissionSeller"].forEach(selector=>$(selector).addEventListener("change",()=>$("#commissionReportResults").classList.add("hidden")));$("#btnRunCommissionReport").addEventListener("click",renderCommissionReport);$("#btnPrintCommissionReport").addEventListener("click",printCommissionReport);$("#btnCloseCommissions").addEventListener("click",closeCommissions);
  window.addEventListener("focus",()=>void pollOrders());
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")void pollOrders()});
}

async function boot(){bindEvents();if("serviceWorker" in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});if(!apiReady())return showLogin("Primero hay que configurar la URL del Apps Script de D9 Gestión en config.js.");if(!state.token)return showLogin();showApp();const cached=await showCachedData();await loadAll({silent:cached});startOrderPolling();}
boot();
