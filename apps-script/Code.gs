/*******************************************************
 * D9 GESTIÓN — APPS SCRIPT
 * Versión: 0.20.1
 * NO CONFUNDIR CON D9 PEDIDOS
 *******************************************************/

const D9G = Object.freeze({
  TZ: "America/Argentina/Buenos_Aires",
  SOURCE_SHEET_ID_DEFAULT: "1wHdgm_V0mloLaIsVPIIqbmTYBomx8DIUmXEplClCMz8",
  TOKEN_HOURS: 12,
  SOURCE_ORDER_DAYS: 3
});

const D9G_HEADERS = Object.freeze({
  config: ["clave","valor"],
  contadores: ["tipo","ultimo","prefijo"],
  operaciones: ["operacion_id","numero","tipo","fecha","cliente_id","cliente","origen_tipo","origen_pedido_id","usuario_id","usuario","estado","subtotal","descuento_pct","total","observaciones","created_at","updated_at","anulada_at","anulada_por","vendedor_id","vendedor","referencia_operacion_id","referencia_numero","credito_tipo","credito_concepto","comision_estado","comision_motivo","origen_venta_id","finanzas_venta_id"],
  operacion_items: ["item_id","operacion_id","orden","producto_id","producto","cantidad","precio_unitario","descuento_pct","subtotal","marca","comision_regla_id","comision_porcentaje","comision_base","comision_importe"],
  recibos: ["recibo_id","numero","fecha","cliente_id","cliente","operacion_id","operacion_numero","medio_principal","total","observaciones","estado","usuario_id","usuario","created_at","anulado_at","anulado_por"],
  pagos: ["pago_id","recibo_id","operacion_id","cliente_id","fecha","medio","importe","referencia","cheque_id","estado","usuario_id","usuario","created_at"],
  cheques: ["cheque_id","pago_id","recibo_id","operacion_id","cliente_id","cliente","banco","numero","librador","fecha_ingreso","fecha_vencimiento","importe","estado","usuario_id","usuario","updated_at"],
  movimientos: ["movimiento_id","fecha","cliente_id","cliente","tipo","documento_tipo","documento_id","documento_numero","operacion_id","debe","haber","estado","usuario_id","usuario","detalle","created_at"],
  comisiones_reglas: ["regla_id","vendedor_id","marca","porcentaje","vigente_desde","vigente_hasta","activo"],
  comisiones_cierres: ["cierre_id","desde","hasta","estado","ventas_brutas","notas_credito","base_neta","comision_total","cerrado_at","cerrado_por_id","cerrado_por"],
  comisiones_detalle: ["detalle_id","cierre_id","vendedor_id","vendedor","fecha","operacion_id","tipo","numero","cliente","referencia_operacion_id","referencia_numero","producto_id","producto","marca","base","regla_id","porcentaje","comision"],
  auditoria: ["auditoria_id","timestamp","usuario_id","usuario","accion","entidad","entidad_id","detalle"],
  finanzas_intenciones: ["intencion_id","usuario_id","cliente_id","tipo","estado","plan","created_at","updated_at"],
  comprobantes_intenciones: ["intencion_id","accion","operacion_id","usuario_id","cliente_id","ambito","estado","plan","created_at","updated_at"]
});

function doGet(e) {
  try {
    const action = d9gText_(e && e.parameter && e.parameter.action).toLowerCase();
    if (!action || action === "status") return d9gJson_({ok:true,status:"D9 Gestión Script activo",version:"0.20.1"});
    return d9gJson_({ok:false,error:"Las lecturas autenticadas de D9 Gestión requieren POST."});
  } catch (err) { return d9gJson_({ok:false,error:String(err && err.message || err)}); }
}

function doPost(e) {
  try {
    const data = d9gParseBody_(e);
    const action = d9gText_(data.action || (e && e.parameter && e.parameter.action)).toLowerCase();
    if (action === "login") return d9gJson_(d9gLogin_(data));
    if (action.indexOf("mostrador_") === 0) return d9gJson_(d9gMostradorRequest_(action,data));
    const session = d9gRequireSession_(data.token);
    if(d9gTestScope_(session,data)==="TEST"&&(/^(source_)/.test(action)||["update_config","save_commission_rule"].includes(action)))throw new Error("Esta herramienta modifica maestros comerciales compartidos. Salí del modo pruebas para usarla.");
    if (action === "test_preview") return d9gJson_(d9gTestPreview_(session));
    if (action === "pedidos_revision") return d9gJson_(Object.assign({ok:true,timestamp:d9gNow_()},d9gSourceOrdersRevision_(d9gSource_())));
    if (action === "actividad_revision") return d9gJson_(d9gSourceActivityRevision_(d9gSource_()));
    if (action === "pedidos") return d9gJson_(d9gOrdersResponse_(session,data));
    if (action === "ventas") return d9gJson_(d9gSalesResponse_(session,data));
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (action === "cancelar_intencion_comprobante") return d9gJson_(d9gCancelDocumentIntent_(session,data));
      if(action === "bootstrap" || action.indexOf("source_")===0)d9gCatalogRecover_();
      d9gReconcileDocumentIntents_(d9gGestion_());
      if (action === "bootstrap") return d9gJson_(d9gBootstrap_(session,data));
      if (action === "finanzas") return d9gJson_(d9gFinancialData_(session,data));
      if (action === "test_classify") return d9gJson_(d9gTestClassify_(session,data));
      if (action === "create_operacion") return d9gJson_(d9gCreateOperation_(session,data));
      if (action === "create_recibo") return d9gJson_(d9gCreateReceipt_(session,data));
      if (action === "anular_operacion") return d9gJson_(d9gAnnulOperation_(session,data));
      if (action === "update_cheque_status") return d9gJson_(d9gUpdateCheck_(session,data));
      if (action === "update_config") return d9gJson_(d9gUpdateConfig_(session,data));
      if (action === "save_commission_rule") return d9gJson_(d9gSaveCommissionRule_(session,data));
      if (action === "close_commissions") return d9gJson_(d9gCloseCommissions_(session,data));
      if (action === "resolve_operation_commission") return d9gJson_(d9gResolveOperationCommission_(session,data));
      if (action === "source_save_product") return d9gJson_(d9gSourceSaveProduct_(session,data));
      if (action === "source_bulk_prices") return d9gJson_(d9gSourceBulkPrices_(session,data));
      if (action === "source_catalog_history") return d9gJson_(d9gCatalogHistory_(session));
      if (action === "source_catalog_preview") return d9gJson_(d9gCatalogPreview_(session,data));
      if (action === "source_catalog_restore") return d9gJson_(d9gCatalogRestore_(session,data));
      if (action === "source_catalog_result") return d9gJson_(d9gCatalogResult_(session,data));
      if (action === "source_import_products") return d9gJson_(d9gSourceImportProducts_(session,data));
      if (action === "source_save_client") return d9gJson_(d9gSourceSaveClient_(session,data));
      if (action === "source_save_user") return d9gJson_(d9gSourceSaveUser_(session,data));
      if (action === "source_import_clients") return d9gJson_(d9gSourceImportClients_(session,data));
      if (action === "source_seller_suggestions") return d9gJson_(d9gSourceSellerSuggestions_(session,data));
      if (action === "source_assign_client_sellers") return d9gJson_(d9gSourceAssignClientSellers_(session,data));
      if (action === "source_client_delete_impact") return d9gJson_(d9gSourceClientDeleteImpact_(session,data));
      if (action === "source_delete_client") return d9gJson_(d9gSourceDeleteClient_(session,data));
      if (action === "source_save_offer") return d9gJson_(d9gSourceSaveOffer_(session,data));
      if (action === "source_delete_offer") return d9gJson_(d9gSourceDeleteOffer_(session,data));
      if (action === "source_save_publicidad") return d9gJson_(d9gSourceSavePublicidad_(session,data));
      return d9gJson_({ok:false,error:"Acción POST no válida"});
    } finally { lock.releaseLock(); }
  } catch (err) { return d9gJson_({ok:false,error:String(err && err.message || err)}); }
}

function d9gOrdersResponse_(session,data){
  const from=d9gText_(data&&data.from),to=d9gText_(data&&data.to),history=!!(data&&data.history===true);
  if(from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))throw new Error("Fecha desde inválida.");
  if(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))throw new Error("Fecha hasta inválida.");
  if(from&&to&&from>to)throw new Error("La fecha desde no puede ser posterior a la fecha hasta.");
  const source=d9gSource_(),revision=d9gSourceOrdersRevision_(source);
  let orders=d9gReadSourceOrders_(source,history||from||to?0:D9G.SOURCE_ORDER_DAYS);
  if(from||to)orders=orders.filter(order=>(!from||d9gText_(order.fecha_iso)>=from)&&(!to||d9gText_(order.fecha_iso)<=to));
  const ids=d9gTestClientIds_(source),refs=d9gTestReferences_(source,d9gGestion_(),ids);orders=d9gTestFilter_(orders,d9gTestScope_(session,data),ids,refs);
  if(!d9gIsAdminUser_(session)&&!d9gCanIssueDocuments_(session))orders=orders.filter(order=>d9gOrderBelongsToUser_(order,session));
  return {ok:true,pedidos:orders,revision:revision.revision,timestamp:d9gNow_(),range:{from:from,to:to,history:history,default_days:history||from||to?0:D9G.SOURCE_ORDER_DAYS}};
}

function d9gSalesResponse_(session,data){
  const from=d9gText_(data&&data.from),to=d9gText_(data&&data.to),history=!!(data&&data.history===true);
  if(from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))throw new Error("Fecha desde inválida.");
  if(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))throw new Error("Fecha hasta inválida.");
  if(from&&to&&from>to)throw new Error("La fecha desde no puede ser posterior a la fecha hasta.");
  const source=d9gSource_(),revision=d9gSourceSalesRevision_(source);
  let sales=d9gReadSourceSales_(source,history||from||to?0:D9G.SOURCE_ORDER_DAYS);
  if(from||to)sales=sales.filter(sale=>(!from||d9gText_(sale.fecha_iso)>=from)&&(!to||d9gText_(sale.fecha_iso)<=to));
  const ids=d9gTestClientIds_(source),refs=d9gTestReferences_(source,d9gGestion_(),ids);sales=d9gTestFilter_(sales,d9gTestScope_(session,data),ids,refs);
  if(!d9gIsAdminUser_(session)&&!d9gCanIssueDocuments_(session))sales=sales.filter(sale=>d9gSaleBelongsToUser_(sale,session));
  return {ok:true,ventas:sales,revision:revision.revision,timestamp:d9gNow_(),range:{from:from,to:to,history:history,default_days:history||from||to?0:D9G.SOURCE_ORDER_DAYS}};
}

/**
 * Ejecutar una sola vez desde un Apps Script vinculado a la NUEVA Sheet D9 Gestión.
 * Crea las pestañas, guarda IDs/secretos y habilita inicialmente al usuario D9 con ID 1 (Ale).
 */
function setupD9Gestion() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Abrí el Apps Script desde la nueva Sheet D9 Gestión.");
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    SOURCE_SHEET_ID: D9G.SOURCE_SHEET_ID_DEFAULT,
    GESTION_SHEET_ID: ss.getId(),
    ALLOWED_USER_IDS: props.getProperty("ALLOWED_USER_IDS") || "1",
    ADMIN_USER_IDS: props.getProperty("ADMIN_USER_IDS") || "1",
    SOURCE_WRITES_ENABLED: props.getProperty("SOURCE_WRITES_ENABLED") || "false",
    TOKEN_SECRET: props.getProperty("TOKEN_SECRET") || Utilities.getUuid() + Utilities.getUuid()
  }, false);
  Object.keys(D9G_HEADERS).forEach(name => d9gEnsureSheet_(ss,name,D9G_HEADERS[name]));
  d9gEnsureSourceClientColumns_(d9gSource_());
  d9gEnsureSourceOffersSheet_(d9gSource_());
  d9gEnsureSourceAdColumns_(d9gSource_());
  d9gSeedConfig_(ss);
  d9gSeedCounters_(ss);
  return {ok:true,gestion_sheet_id:ss.getId(),allowed_user_ids:props.getProperty("ALLOWED_USER_IDS")};
}

function d9gSeedConfig_(ss) {
  const sh=ss.getSheetByName("config"); if(sh.getLastRow()>1)return;
  sh.getRange(2,1,5,2).setValues([
    ["empresa_nombre","Distribuidora D9"],["documento_default","REMITO"],["documento_prefijo","R"],["impresion","A5"],["leyenda","Comprobante interno no válido como factura."]
  ]);
}
function d9gSeedCounters_(ss) {
  const sh=ss.getSheetByName("contadores"),existing=d9gReadObjects_(ss,"contadores",true).map(r=>d9gText_(r.tipo));
  const missing=[];
  // Los contadores de comprobantes se crean al primer uso, tomando el máximo histórico
  // de su tipo. Así una actualización no reinicia ni duplica la numeración existente.
  [["RECIBO",0,"RC"]].forEach(row=>{if(!existing.includes(row[0]))missing.push(row)});
  if(missing.length)sh.getRange(sh.getLastRow()+1,1,missing.length,3).setValues(missing);
}

function d9gLogin_(data) {
  const usuario=d9gText_(data.usuario).toLowerCase(), clave=d9gText_(data.clave);
  if(!usuario||!clave)throw new Error("Ingresá usuario y clave.");
  const source=d9gSource_();
  const users=d9gReadObjects_(source,"usuarios",false);
  const found=users.find(u=>d9gText_(u.usuario).toLowerCase()===usuario && d9gIsActive_(u.activo));
  if(!found || d9gText_(found.clave)!==clave)throw new Error("Usuario o clave incorrectos.");
  if(!d9gCanAccessGestion_(found))throw new Error("Este usuario no está autorizado para D9 Gestión.");
  const user=d9gPublicUser_(found);
  return {ok:true,token:d9gCreateToken_(user),user:user};
}

function d9gCreateToken_(user) {
  const payload=Utilities.base64EncodeWebSafe(JSON.stringify({uid:d9gText_(user.id),name:d9gText_(user.nombre),exp:Date.now()+D9G.TOKEN_HOURS*3600000}),Utilities.Charset.UTF_8).replace(/=+$/g,"");
  return payload+"."+d9gSign_(payload);
}
function d9gRequireSession_(token) {
  const parts=d9gText_(token).split("."); if(parts.length!==2||d9gSign_(parts[0])!==parts[1])throw new Error("Sesión inválida o vencida.");
  let data;try{let encoded=parts[0];while(encoded.length%4)encoded+="=";data=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(encoded)).getDataAsString("UTF-8"));}catch(_){throw new Error("Sesión inválida o vencida.");}
  if(!data.exp||Date.now()>Number(data.exp))throw new Error("La sesión venció.");
  const users=d9gReadObjects_(d9gSource_(),"usuarios",false);const found=users.find(u=>d9gText_(u.id)===d9gText_(data.uid)&&d9gIsActive_(u.activo));if(!found||!d9gCanAccessGestion_(found))throw new Error("Usuario no autorizado.");
  return d9gPublicUser_(found);
}
function d9gSign_(payload){const secret=PropertiesService.getScriptProperties().getProperty("TOKEN_SECRET");if(!secret)throw new Error("Falta ejecutar setupD9Gestion.");return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload,secret)).replace(/=+$/g,"");}
function d9gAdminIds_(){return (PropertiesService.getScriptProperties().getProperty("ADMIN_USER_IDS")||"1").split(",").map(d9gText_).filter(Boolean);}
function d9gAllowedIds_(){return (PropertiesService.getScriptProperties().getProperty("ALLOWED_USER_IDS")||"").split(",").map(d9gText_).filter(Boolean);}
function d9gGestionRole_(u){
  const raw=d9gText_(u&&u.rol_gestion).toLowerCase().replace(/[áàä]/g,"a").replace(/\s+/g,"_");
  if(["super_admin","superadmin"].includes(raw))return "super_admin";
  if(["admin","administrador"].includes(raw))return "admin";
  if(["vendedor","operador"].includes(raw))return "vendedor";
  if(["sin_acceso","ninguno","no"].includes(raw))return "sin_acceso";
  if(raw)return "sin_acceso";
  if(d9gAdminIds_().includes(d9gText_(u&&u.id)))return "admin";
  if(d9gAllowedIds_().includes(d9gText_(u&&u.id)))return "vendedor";
  return "sin_acceso";
}
function d9gIsAdminUser_(u){return ["admin","super_admin"].includes(d9gGestionRole_(u));}
function d9gIsSuperAdminUser_(u){return d9gGestionRole_(u)==="super_admin";}
function d9gCanIssueDocuments_(u){return d9gIsAdminUser_(u)||d9gIsActive_(u&&u.permiso_comprobantes);}
function d9gCanAccessGestion_(u){return d9gGestionRole_(u)!=="sin_acceso"||d9gCanIssueDocuments_(u);}
function d9gRequireAdmin_(u){if(!d9gIsAdminUser_(u))throw new Error("Esta acción requiere permisos de administrador de D9 Gestión.");}
function d9gRequireCanIssueDocuments_(u){if(!d9gCanIssueDocuments_(u))throw new Error("Este usuario no tiene permiso para emitir comprobantes.");}
function d9gSourceWritesEnabled_(){return d9gText_(PropertiesService.getScriptProperties().getProperty("SOURCE_WRITES_ENABLED")).toLowerCase()==="true";}
function d9gRequireSourceWrites_(u){d9gRequireAdmin_(u);if(!d9gSourceWritesEnabled_())throw new Error("Las escrituras sobre D9_pedidos están bloqueadas. Activá SOURCE_WRITES_ENABLED=true cuando termines la prueba segura.");}
function d9gDefaultClientScope_(role){return d9gText_(role).toLowerCase()==="mostrador"||d9gText_(role).toLowerCase()==="cliente"?"PROPIOS":"TODOS";}
function d9gClientScope_(user){const value=d9gText_(user&&user.alcance_clientes).toUpperCase();return ["PROPIOS","TODOS"].includes(value)?value:d9gDefaultClientScope_(user&&user.rol);}
function d9gHasAdditionalClientAccess_(source,userId,clientId){return d9gReadObjects_(source,"clientes_accesos",false).some(row=>d9gText_(row.usuario_id)===d9gText_(userId)&&d9gText_(row.cliente_id)===d9gText_(clientId));}
function d9gPublicUser_(u){return {id:d9gText_(u.id),usuario:d9gText_(u.usuario),nombre:d9gText_(u.nombre),rol:d9gText_(u.rol),wasap_report:d9gText_(u.wasap_report),cliente_id:d9gText_(u.cliente_id),color_1:d9gText_(u.color_1),color_2:d9gText_(u.color_2),activo:d9gIsActive_(u.activo)?"si":"no",rol_gestion:d9gGestionRole_(u),permiso_comprobantes:d9gCanIssueDocuments_(u)?"si":"no",alcance_clientes:d9gClientScope_(u)};}

// Ámbito lógico: se clasifica únicamente por ID de cliente persistido o por referencia inequívoca.
// La ausencia de clasificación histórica nunca se resuelve por nombre en tiempo de consulta.
function d9gTestClientIds_(source){const ids={};d9gReadObjects_(source,"clientes",false).forEach(c=>{if(d9gText_(c.ambito).toUpperCase()==="TEST")ids[d9gText_(c.id)]=true});return ids;}
function d9gTestScope_(user,data){const requested=d9gText_(data&&data.ambito).toUpperCase();if(requested==="TEST"&&!d9gIsSuperAdminUser_(user))throw new Error("El laboratorio requiere superadministrador.");return requested==="TEST"?"TEST":"REAL";}
function d9gTestIsClient_(ids,id){return !!ids[d9gText_(id)];}
function d9gTestAssertClient_(source,user,data,id){const ids=d9gTestClientIds_(source),actual=d9gTestIsClient_(ids,id)?"TEST":"REAL",selected=d9gTestScope_(user,data);if(actual!==selected)throw new Error("El cliente pertenece al ámbito "+actual+". Cambiá de ámbito antes de operar.");return actual;}
function d9gTestReferences_(source,ss,ids){
  const refs={},owners={};if(!Object.keys(ids).length)return refs;
  const add=(key,id)=>{key=d9gText_(key);id=d9gText_(id);if(!key||!id)return;(owners[key]||(owners[key]=new Set())).add(d9gTestIsClient_(ids,id)?"TEST":"REAL")};
  d9gReadObjects_(source,"pedidos",false).forEach(r=>{const id=r.pedido_id||r["id_comp."]||r.id_pedido;add(id,r.cliente_id);add("PEDIDO:"+d9gText_(id),r.cliente_id)});
  d9gReadObjects_(source,"ventas",false).forEach(r=>{add(r.venta_id,r.cliente_id);add("VENTA:"+d9gText_(r.venta_id),r.cliente_id);add("VTA-"+d9gText_(r.venta_id),r.cliente_id)});
  ["operaciones","recibos","pagos","cheques","finanzas_intenciones"].forEach(name=>d9gReadObjects_(ss,name,false).forEach(r=>{const id=r.operacion_id||r.recibo_id||r.pago_id||r.cheque_id||r.intencion_id;add(id,r.cliente_id);if(name==="finanzas_intenciones"&&d9gText_(r.tipo)==="VENTA")add("VTA-"+d9gText_(id),r.cliente_id)}));
  Object.keys(owners).forEach(key=>{if(owners[key].size===1&&owners[key].has("TEST"))refs[key]=true});return refs;
}
function d9gTestIsRow_(row,ids,refs){
  const id=d9gText_(row&&row.cliente_id);
  if(id)return d9gTestIsClient_(ids,id);
  return !!(refs[d9gText_(row&&row.operacion_id)]||refs[d9gText_(row&&row.documento_id)]||refs[d9gText_(row&&row.recibo_id)]||refs[d9gText_(row&&row.pago_id)]||refs["PEDIDO:"+d9gText_(row&&row.pedido_id)]||refs["VENTA:"+d9gText_(row&&row.venta_id)]||refs["PEDIDO:"+d9gText_(row&&row.origen_pedido_id)]||refs["VENTA:"+d9gText_(row&&row.origen_venta_id)]);
}
function d9gTestFilter_(rows,scope,ids,refs){const test=scope==="TEST";return (rows||[]).filter(row=>d9gTestIsRow_(row,ids,refs)===test);}
function d9gTestVisibleClosures_(ss,ids,refs){const affected=new Set(d9gReadObjects_(ss,"comisiones_detalle",false).filter(line=>d9gTestIsRow_(line,ids,refs)).map(line=>d9gText_(line.cierre_id)));return d9gReadObjects_(ss,"comisiones_cierres",false).filter(c=>!affected.has(d9gText_(c.cierre_id)));}
function d9gTestWord_(name){return /(^|[^\p{L}\p{N}])test($|[^\p{L}\p{N}])/iu.test(d9gText_(name));}
function d9gTestPreview_(user){
  if(!d9gIsSuperAdminUser_(user))throw new Error("Sólo superadministración puede revisar la migración TEST.");
  const source=d9gSource_(),ss=d9gGestion_(),clients=d9gReadObjects_(source,"clientes",false),candidates=clients.filter(c=>d9gTestWord_(c.nombre)||d9gText_(c.ambito).toUpperCase()==="TEST"),known=d9gTestClientIds_(source),ids={...known};candidates.forEach(c=>ids[d9gText_(c.id)]=true);
  const refs=d9gTestReferences_(source,ss,ids),counts={},ambiguous=[];
  const tables=[{ss:source,name:"pedidos"},{ss:source,name:"ventas"},...(["operaciones","recibos","pagos","cheques","movimientos","finanzas_intenciones","comisiones_detalle"].map(name=>({ss,name})))];
  tables.forEach(({ss:book,name})=>{const rows=d9gReadObjects_(book,name,false);counts[name]={total:rows.length,identificables:rows.filter(r=>d9gTestIsRow_(r,ids,refs)).length};rows.forEach((r,index)=>{const ref=d9gText_(r.operacion_id||r.documento_id||r.recibo_id||r.pedido_id||r.venta_id),cross=!!r.cliente_id&&!d9gTestIsClient_(ids,r.cliente_id)&&!!refs[ref];if(cross||(!d9gTestIsRow_(r,ids,refs)&&!d9gText_(r.cliente_id)&&d9gText_(r.cliente))||(!d9gTestIsRow_(r,ids,refs)&&d9gTestWord_(r.cliente))){ambiguous.push({hoja:name,fila:index+2,cliente:d9gText_(r.cliente),cliente_id:d9gText_(r.cliente_id),referencia:ref,motivo:cross?"ID_REAL_CON_REFERENCIA_TEST":"SIN_IDENTIDAD_SEGURA"});}})});
  const closureLines=d9gReadObjects_(ss,"comisiones_detalle",false);const closures=d9gReadObjects_(ss,"comisiones_cierres",false).map(c=>({cierre_id:d9gText_(c.cierre_id),desde:d9gDateCell_(c.desde),hasta:d9gDateCell_(c.hasta),lineas_test:closureLines.filter(line=>d9gText_(line.cierre_id)===d9gText_(c.cierre_id)&&d9gTestIsRow_(line,ids,refs)).length})).filter(c=>c.lineas_test);
  const movementRows=d9gReadObjects_(ss,"movimientos",false).filter(m=>!d9gIsAnnulled_(m.estado)),knownRefs=d9gTestReferences_(source,ss,known),sum=filter=>(d9gRound_(movementRows.filter(filter).reduce((total,m)=>total+d9gNumber_(m.debe)-d9gNumber_(m.haber),0)));
  return {ok:true,candidatos:candidates.map(c=>({id:d9gText_(c.id),nombre:d9gText_(c.nombre),telefono:d9gText_(c.telefono),ciudad:d9gText_(c.ciudad),ambito:d9gText_(c.ambito)||"REAL"})),conteos:counts,saldo_identificado_test:sum(m=>d9gTestIsRow_(m,known,knownRefs)),saldo_estimado_candidatos:sum(m=>d9gTestIsRow_(m,ids,refs)),ambiguos:ambiguous,cierres_a_revisar:closures,nota:"Vista previa: ninguna clasificación ni movimiento fue modificado. El saldo estimado sólo incluye referencias inequívocas."};
}
function d9gTestClassify_(user,data){
  if(!d9gIsSuperAdminUser_(user))throw new Error("Sólo superadministración puede clasificar clientes TEST.");
  if(data.confirmacion!=="CLASIFICAR CLIENTES TEST")throw new Error("Falta la confirmación explícita de la clasificación.");
  const selected=Array.isArray(data.clientes)?data.clientes:[];if(!selected.length||selected.length>100)throw new Error("Elegí entre 1 y 100 clientes revisados.");
  const source=d9gSource_(),sh=source.getSheetByName("clientes"),header=d9gHeaders_(sh),idCol=header.indexOf("id"),nameCol=header.indexOf("nombre");if(idCol<0||nameCol<0)throw new Error("Faltan columnas ID o nombre en clientes.");
  const rows=d9gReadObjects_(source,"clientes",false),seen=new Set();selected.forEach(item=>{const id=d9gText_(item.id),name=d9gText_(item.nombre);if(!id||seen.has(id))throw new Error("ID TEST vacío o duplicado.");seen.add(id);const actual=rows.find(c=>d9gText_(c.id)===id);if(!actual||d9gText_(actual.nombre)!==name||(!d9gTestWord_(name)&&d9gText_(actual.ambito).toUpperCase()!=="TEST"))throw new Error("La ficha "+id+" cambió o no cumple el criterio inicial; volvé a revisar la vista previa.");});
  // No se crea ni se altera columna alguna hasta completar todas las validaciones.
  let col=header.indexOf("ambito");if(col<0){col=sh.getLastColumn();sh.getRange(1,col+1).setValue("ambito");}
  const values=sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues(),updated=[];
  values.forEach((row,index)=>{const id=d9gText_(row[idCol]);if(!seen.has(id)||d9gText_(row[col]).toUpperCase()==="TEST")return;sh.getRange(index+2,col+1).setValue("TEST");updated.push(id)});
  if(updated.length)d9gAudit_(d9gGestion_(),user,"CLASIFICAR","CLIENTES_TEST",updated.join(","),{cliente_ids:updated});
  return {ok:true,clasificados:updated,ya_clasificados:selected.length-updated.length,nota:"La historia se segrega por ID y referencias sin borrar ni cambiar operaciones."};
}

function d9gBootstrap_(session,data) {
  const scope=d9gTestScope_(session,data);
  const source=d9gSource_(), gestion=d9gGestion_();
  const allClients=d9gReadObjects_(source,"clientes",false);
  const testIds=d9gTestClientIds_(source),refs=d9gTestReferences_(source,gestion,testIds);
  const visibleClients=allClients.filter(c=>d9gTestIsClient_(testIds,c.id)===(scope==="TEST")),clients=visibleClients.filter(x=>d9gIsActive_(x.activo));
  const allProducts=d9gReadObjects_(source,"productos",false);
  const priceLists=d9gSourcePriceLists_(source);
  const products=allProducts.filter(x=>d9gIsActive_(x.activo)&&priceLists.some(list=>d9gNumber_(x[list.id])>0));
  const allUsers=d9gReadObjects_(source,"usuarios",false),users=allUsers.filter(x=>d9gIsActive_(x.activo)).map(d9gPublicUser_);
  const admin=d9gIsAdminUser_(session),canIssue=d9gCanIssueDocuments_(session);
  const ordersRevision=d9gSourceOrdersRevision_(source),salesRevision=d9gSourceSalesRevision_(source);
  let orders=d9gTestFilter_(d9gReadSourceOrders_(source),scope,testIds,refs);
  let sales=d9gTestFilter_(d9gReadSourceSales_(source,D9G.SOURCE_ORDER_DAYS),scope,testIds,refs);
  const offers=d9gReadObjects_(source,"ofertas",false);
  const publicidad=d9gReadObjects_(source,"publicidad",false);
  let operations=d9gReadObjects_(gestion,"operaciones",false), items=d9gReadObjects_(gestion,"operacion_items",false), receipts=d9gReadObjects_(gestion,"recibos",false), payments=d9gReadObjects_(gestion,"pagos",false), checks=d9gReadObjects_(gestion,"cheques",false), movements=d9gReadObjects_(gestion,"movimientos",false);
  operations=d9gTestFilter_(operations,scope,testIds,refs);items=items.filter(x=>operations.some(op=>d9gText_(op.operacion_id)===d9gText_(x.operacion_id)));
  receipts=d9gTestFilter_(receipts,scope,testIds,refs);payments=d9gTestFilter_(payments,scope,testIds,refs);checks=d9gTestFilter_(checks,scope,testIds,refs);movements=d9gTestFilter_(movements,scope,testIds,refs);
  d9gSetOperationBalances_(operations,movements);
  if(!admin&&!canIssue){
    const uid=d9gText_(session.id);orders=orders.filter(o=>d9gOrderBelongsToUser_(o,session));sales=sales.filter(sale=>d9gSaleBelongsToUser_(sale,session));
    operations=operations.filter(o=>d9gText_(o.vendedor_id)===uid||d9gText_(o.usuario_id)===uid);
    const opIds={};operations.forEach(o=>opIds[d9gText_(o.operacion_id)]=true);items=items.filter(i=>opIds[d9gText_(i.operacion_id)]);
    receipts=receipts.filter(r=>opIds[d9gText_(r.operacion_id)]);const receiptIds={};receipts.forEach(r=>receiptIds[d9gText_(r.recibo_id)]=true);
    payments=payments.filter(p=>receiptIds[d9gText_(p.recibo_id)]);const paymentIds={};payments.forEach(p=>paymentIds[d9gText_(p.pago_id)]=true);
    checks=checks.filter(c=>paymentIds[d9gText_(c.pago_id)]);movements=[];
  }
  return {ok:true,timestamp:d9gNow_(),user:session,permissions:{source_admin:admin,gestion_admin:admin,super_admin:d9gIsSuperAdminUser_(session),can_issue_documents:canIssue,source_writes_enabled:d9gSourceWritesEnabled_(),ambito:scope,ambito_revision:d9gTestScopeRevision_(source)},source:{clientes:clients,clientes_admin:admin?visibleClients:clients,productos:products,productos_admin:admin?allProducts:products,price_lists:priceLists,usuarios:users,usuarios_admin:admin?allUsers.map(d9gPublicUser_):users,pedidos:orders,pedidos_revision:ordersRevision.revision,ventas:sales,ventas_revision:salesRevision.revision,ofertas:offers,publicidad:publicidad},gestion:{operaciones:operations,items:items,recibos:receipts,pagos:payments,cheques:checks,movimientos:movements,comisiones_reglas:admin?d9gReadObjects_(gestion,"comisiones_reglas",false):[],comisiones_cierres:admin&&scope==="REAL"?d9gTestVisibleClosures_(gestion,testIds,refs):[],comisiones_detalle:admin?d9gTestFilter_(d9gReadObjects_(gestion,"comisiones_detalle",false),scope,testIds,refs):[],productos_log:admin?d9gProductLogs_(gestion):[],config:d9gReadKeyValue_(gestion,"config")}};
}

function d9gOrderBelongsToUser_(order,user){
  const orderId=d9gText_(order&&order.vendedor_id),userId=d9gText_(user&&user.id);
  if(orderId)return orderId===userId;
  const orderSeller=d9gMatchText_(order&&order.vendedor);
  return !!orderSeller&&[d9gMatchText_(user&&user.nombre),d9gMatchText_(user&&user.usuario)].filter(Boolean).includes(orderSeller);
}
function d9gSaleBelongsToUser_(sale,user){
  const saleUserId=d9gText_(sale&&sale.usuario_id),userId=d9gText_(user&&user.id);
  if(saleUserId)return saleUserId===userId;
  const saleUser=d9gMatchText_(sale&&sale.usuario);
  return !!saleUser&&[d9gMatchText_(user&&user.nombre),d9gMatchText_(user&&user.usuario)].filter(Boolean).includes(saleUser);
}

// ─── PUBLICIDAD DE D9 PEDIDOS ──────────────────────────────────────
const D9G_SOURCE_AD_HEADERS=Object.freeze(["id","orden","activo","modo","texto","titulo","texto_1","texto_2","imagen_url","imagen_url_full","link_url"]);
function d9gEnsureSourceAdColumns_(source){
  let sh=source.getSheetByName("publicidad");if(!sh)sh=source.insertSheet("publicidad");
  const headers=sh.getLastColumn()?d9gHeaders_(sh):[],missing=D9G_SOURCE_AD_HEADERS.filter(key=>headers.indexOf(key)<0);
  if(missing.length)sh.getRange(1,sh.getLastColumn()+1,1,missing.length).setValues([missing]);
  sh.setFrozenRows(1);return sh;
}
function d9gSourceSavePublicidad_(user,data){
  d9gRequireSourceWrites_(user);
  const source=d9gSource_(),sh=d9gEnsureSourceAdColumns_(source),incoming=data.publicidad||{},id=d9gText_(incoming.id||incoming.orden),mode=d9gText_(incoming.modo).toLowerCase()||"full";
  if(!id)throw new Error("El banner necesita un ID.");if(id.length>60)throw new Error("El ID del banner es demasiado largo.");
  if(!["full","producto"].includes(mode))throw new Error("El tipo de banner no es válido.");
  const normalized={id:id,orden:d9gText_(incoming.orden||id),activo:d9gIsActive_(incoming.activo)?"si":"no",modo:mode,texto:d9gText_(incoming.texto),titulo:d9gText_(incoming.titulo),texto_1:d9gText_(incoming.texto_1),texto_2:d9gText_(incoming.texto_2),imagen_url:d9gText_(incoming.imagen_url),imagen_url_full:d9gText_(incoming.imagen_url_full),link_url:d9gText_(incoming.link_url)};
  if(mode==="full"&&!normalized.imagen_url_full)throw new Error("Cargá la URL de la imagen horizontal.");
  if(mode==="producto"&&!normalized.titulo&&!normalized.imagen_url)throw new Error("Cargá al menos un título o una imagen de producto.");
  [normalized.imagen_url,normalized.imagen_url_full,normalized.link_url].filter(Boolean).forEach(url=>{if(!/^https?:\/\//i.test(url))throw new Error("Las imágenes y enlaces deben comenzar con http:// o https://.")});
  const headers=d9gHeaders_(sh),idCol=headers.indexOf("id"),lastRow=sh.getLastRow(),rows=lastRow>1?sh.getRange(2,1,lastRow-1,sh.getLastColumn()).getValues():[];
  let rowIndex=rows.findIndex(row=>d9gText_(row[idCol])===id),created=rowIndex<0;if(created){rows.push(new Array(headers.length).fill(""));rowIndex=rows.length-1;}
  if(!created)d9gTestAssertClient_(source,user,data,id);else if(d9gTestScope_(user,data)==="TEST")throw new Error("La creación de clientes TEST requiere clasificación supervisada; usá una ficha existente.");
  const before={};headers.forEach((header,index)=>{if(header)before[header]=rows[rowIndex][index]});
  D9G_SOURCE_AD_HEADERS.forEach(key=>{const col=headers.indexOf(key);if(col>=0)rows[rowIndex][col]=normalized[key]});
  sh.getRange(rowIndex+2,1,1,headers.length).setValues([rows[rowIndex]]);
  d9gAudit_(d9gGestion_(),user,created?"CREAR":"ACTUALIZAR","PUBLICIDAD_FUENTE",id,{antes:before,despues:normalized});
  return {ok:true,id:id,created:created,publicidad:normalized,message:created?"Banner creado.":"Banner actualizado."};
}

// Una fila por producto. Las listas normales nunca se modifican.
const D9G_SOURCE_OFFER_HEADERS = Object.freeze(["oferta_id","producto_id","precio_oferta","fecha_desde","fecha_hasta","activo","titulo","created_at","updated_at"]);
function d9gEnsureSourceOffersSheet_(source){return d9gEnsureSheet_(source,"ofertas",D9G_SOURCE_OFFER_HEADERS);}
function d9gSourceSaveOffer_(user,data){
  d9gRequireSourceWrites_(user);
  const source=d9gSource_(),sh=d9gEnsureSourceOffersSheet_(source),incoming=data.oferta||{};
  const productId=d9gText_(incoming.producto_id),price=d9gRound_(d9gNumber_(incoming.precio_oferta));
  if(!productId)throw new Error("Elegí un producto.");
  if(price<=0)throw new Error("El precio de oferta debe ser mayor que cero.");
  const product=d9gReadObjects_(source,"productos",false).find(p=>d9gText_(p.id)===productId);
  if(!product)throw new Error("El producto ya no existe en la Sheet central.");
  const from=d9gText_(incoming.fecha_desde),to=d9gText_(incoming.fecha_hasta);
  if(from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))throw new Error("La fecha desde no es válida.");
  if(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))throw new Error("La fecha hasta no es válida.");
  if(from&&to&&from>to)throw new Error("La fecha hasta no puede ser anterior a la fecha desde.");
  const rows=d9gReadObjects_(source,"ofertas",false),found=rows.findIndex(o=>d9gText_(o.producto_id)===productId),now=d9gNow_();
  const previous=found>=0?rows[found]:{},id=d9gText_(previous.oferta_id)||("OF-"+Utilities.getUuid());
  const row=[id,productId,price,from,to,d9gIsActive_(incoming.activo)?"si":"no",d9gText_(incoming.titulo),d9gText_(previous.created_at)||now,now];
  if(found>=0)sh.getRange(found+2,1,1,row.length).setValues([row]);else sh.getRange(sh.getLastRow()+1,1,1,row.length).setValues([row]);
  d9gAudit_(d9gGestion_(),user,found>=0?"ACTUALIZAR":"CREAR","OFERTA",id,{producto_id:productId,precio_oferta:price,fecha_desde:from,fecha_hasta:to,activo:row[5]});
  return {ok:true,oferta_id:id,message:found>=0?"Oferta actualizada":"Oferta creada"};
}

function d9gSourceDeleteOffer_(user,data){
  d9gRequireSourceWrites_(user);
  const source=d9gSource_(),sh=d9gEnsureSourceOffersSheet_(source),productId=d9gText_(data.producto_id),offerId=d9gText_(data.oferta_id);
  if(!productId&&!offerId)throw new Error("No se indicó la oferta a eliminar.");
  const rows=d9gReadObjects_(source,"ofertas",false),found=rows.findIndex(offer=>(offerId&&d9gText_(offer.oferta_id)===offerId)||(productId&&d9gText_(offer.producto_id)===productId));
  if(found<0)throw new Error("La oferta ya no existe. Sincronizá y volvé a intentar.");
  const previous=rows[found],id=d9gText_(previous.oferta_id)||offerId||productId;
  sh.deleteRow(found+2);
  d9gAudit_(d9gGestion_(),user,"ELIMINAR","OFERTA",id,{producto_id:d9gText_(previous.producto_id),precio_oferta:d9gNumber_(previous.precio_oferta),activo:d9gText_(previous.activo)});
  return {ok:true,oferta_id:id,message:"Oferta eliminada definitivamente"};
}

function d9gSourceOrdersRevision_(ss){
  const sh=ss.getSheetByName("pedidos");
  if(!sh)return {revision:"0",rows:0};
  const lastRow=sh.getLastRow(),lastColumn=sh.getLastColumn();
  if(lastRow<2||lastColumn<1)return {revision:"0",rows:0};
  const lastValues=sh.getRange(lastRow,1,1,lastColumn).getDisplayValues()[0];
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,lastValues.join("\u001f"));
  const digest=Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g,"");
  return {revision:String(lastRow)+":"+digest,rows:lastRow-1};
}

function d9gSourceSalesRevision_(ss){
  const sh=ss.getSheetByName("ventas");
  if(!sh)return {revision:"0",rows:0};
  const lastRow=sh.getLastRow(),lastColumn=sh.getLastColumn();
  if(lastRow<2||lastColumn<1)return {revision:"0",rows:0};
  const lastValues=sh.getRange(lastRow,1,1,lastColumn).getDisplayValues()[0];
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,lastValues.join("\u001f"));
  const digest=Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g,"");
  return {revision:String(lastRow)+":"+digest,rows:lastRow-1};
}

function d9gTestScopeRevision_(ss){const rows=d9gReadObjects_(ss,"clientes",false);return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,rows.map(c=>d9gText_(c.id)+":"+d9gText_(c.ambito)).join("|"))).replace(/=+$/g,"");}
function d9gSourceActivityRevision_(ss){
  const orders=d9gSourceOrdersRevision_(ss),sales=d9gSourceSalesRevision_(ss);
  return {ok:true,timestamp:d9gNow_(),pedidos_revision:orders.revision,pedidos_filas:orders.rows,ventas_revision:sales.revision,ventas_filas:sales.rows,ambito_revision:d9gTestScopeRevision_(ss),finanzas_revision:d9gFinancialRevision_(d9gGestion_())};
}

function d9gReadSourceOrders_(ss,days) {
  const rows=d9gReadObjects_(ss,"pedidos",true), groups={}, order=[];
  const historyDays=days===undefined?D9G.SOURCE_ORDER_DAYS:Number(days),cutoff=historyDays>0?new Date():null;if(cutoff)cutoff.setDate(cutoff.getDate()-historyDays);
  rows.forEach(r=>{
    const id=d9gText_(r.pedido_id||r["id_comp."]||r.id_comp_||r.id_comp||r.id_pedido);if(!id)return;
    const parsed=d9gParseSourceDate_(r.fecha);if(cutoff&&parsed&&parsed<cutoff)return;
    if(!groups[id]){groups[id]={pedido_id:id,fecha:d9gText_(r.fecha),fecha_iso:parsed?Utilities.formatDate(parsed,D9G.TZ,"yyyy-MM-dd"):"",vendedor_id:d9gText_(r.vendedor_id),vendedor:d9gText_(r.vendedor),cliente_id:d9gText_(r.cliente_id),cliente:d9gText_(r.cliente),estado:d9gText_(r.estado),total:d9gNumber_(r.total_pedido),nota_pedido:d9gText_(r.nota_pedido),items:[]};order.push(groups[id]);}
    groups[id].items.push({id_producto:d9gText_(r.id_producto),nombre:d9gText_(r.detalle||r.producto),cantidad:d9gNumber_(r.total||r.cantidad),precio:d9gNumber_(r.precio),subtotal:d9gNumber_(r.total_item),nota_item:d9gText_(r.nota_item)});
    if(d9gIsAnnulled_(r.estado))groups[id].estado=d9gText_(r.estado);
  });
  return order.sort((a,b)=>d9gText_(b.fecha_iso||b.fecha).localeCompare(d9gText_(a.fecha_iso||a.fecha)));
}

function d9gReadSourceSales_(ss,days){
  const rows=d9gReadObjects_(ss,"ventas",true),groups={},sales=[];
  const historyDays=days===undefined?D9G.SOURCE_ORDER_DAYS:Number(days),cutoff=historyDays>0?new Date():null;if(cutoff)cutoff.setDate(cutoff.getDate()-historyDays);
  rows.forEach(row=>{
    const id=d9gText_(row.venta_id),parsed=d9gParseSourceDate_(row.fecha);if(!id)return;if(cutoff&&parsed&&parsed<cutoff)return;
    if(!groups[id]){groups[id]={venta_id:id,fecha:d9gText_(row.fecha),fecha_iso:parsed?Utilities.formatDate(parsed,D9G.TZ,"yyyy-MM-dd"):"",usuario_id:d9gText_(row.usuario_id),usuario:d9gText_(row.usuario),rol:d9gText_(row.rol),cliente_id:d9gText_(row.cliente_id),cliente:d9gText_(row.cliente),cliente_ocasional:d9gText_(row.cliente_ocasional).toLowerCase()==="si",telefono:d9gText_(row.telefono),direccion:d9gText_(row.direccion),total_venta:d9gNumber_(row.total_venta),_has_total:d9gText_(row.total_venta)!=="",items:[]};sales.push(groups[id]);}
    groups[id].medio_pago=d9gText_(row.medio_pago);groups[id].finanzas_id=d9gText_(row.finanzas_id);
    groups[id].items.push({id_producto:d9gText_(row.id_producto),nombre:d9gText_(row.producto),cantidad:d9gNumber_(row.cantidad),precio_unitario:d9gNumber_(row.precio_unitario),subtotal:d9gNumber_(row.subtotal)});
  });
  sales.forEach(sale=>{if(!sale._has_total)sale.total_venta=d9gRound_(sale.items.reduce((sum,item)=>sum+d9gNumber_(item.subtotal),0));delete sale._has_total;});
  return sales.sort((a,b)=>{const dateDiff=d9gText_(b.fecha_iso).localeCompare(d9gText_(a.fecha_iso));if(dateDiff)return dateDiff;const pa=d9gParseSourceDate_(a.fecha),pb=d9gParseSourceDate_(b.fecha);return (pb?pb.getTime():0)-(pa?pa.getTime():0);});
}

function d9gDateCell_(value){if(value instanceof Date)return Utilities.formatDate(value,D9G.TZ,"yyyy-MM-dd");const text=d9gText_(value),iso=text.match(/^(\d{4}-\d{2}-\d{2})/);if(iso)return iso[1];const local=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);return local?local[3]+"-"+local[2].padStart(2,"0")+"-"+local[1].padStart(2,"0"):text;}
function d9gPreviousDate_(iso){const date=new Date(iso+"T12:00:00Z");date.setUTCDate(date.getUTCDate()-1);return Utilities.formatDate(date,"UTC","yyyy-MM-dd");}
function d9gCommissionRuleAt_(rules,sellerId,brand,date){const normalizedBrand=d9gText_(brand).toUpperCase(),day=d9gDateCell_(date);return (rules||[]).filter(rule=>{const from=d9gDateCell_(rule.vigente_desde),to=d9gDateCell_(rule.vigente_hasta),ruleBrand=d9gText_(rule.marca||"GENERAL").toUpperCase()||"GENERAL";return d9gText_(rule.vendedor_id)===d9gText_(sellerId)&&d9gIsActive_(rule.activo)&&(!from||from<=day)&&(!to||to>=day)&&(ruleBrand==="GENERAL"||ruleBrand===normalizedBrand);}).sort((a,b)=>{const aBrand=d9gText_(a.marca||"GENERAL").toUpperCase()===normalizedBrand?1:0,bBrand=d9gText_(b.marca||"GENERAL").toUpperCase()===normalizedBrand?1:0;return bBrand-aBrand||d9gDateCell_(b.vigente_desde).localeCompare(d9gDateCell_(a.vigente_desde));})[0]||null;}
function d9gClosedCommissionForDate_(ss,date){const day=d9gDateCell_(date);return d9gReadObjects_(ss,"comisiones_cierres",false).find(row=>d9gText_(row.estado).toUpperCase()==="CERRADO"&&d9gDateCell_(row.desde)<=day&&d9gDateCell_(row.hasta)>=day)||null;}

function d9gAssertSourceOrderUsable_(source,orderId,clientId){
  const order=d9gReadSourceOrders_(source,0).find(row=>d9gText_(row.pedido_id)===orderId);
  if(!order)throw new Error("El pedido de origen ya no existe. Actualizá Pedidos antes de crear el comprobante.");
  if(d9gIsAnnulled_(order.estado))throw new Error("El pedido de origen fue anulado. Actualizá Pedidos antes de crear el comprobante.");
  if(d9gText_(order.cliente_id)!==clientId)throw new Error("El origen pertenece a otro cliente o ámbito.");
  return order;
}

function d9gCreateOperation_(user,data) {
  d9gRequireCanIssueDocuments_(user);
  const intentionId=d9gDocumentIntentId_(data.intencion_id);
  const request=d9gDocumentRequest_(data);
  const ss=d9gGestion_(),source=d9gSource_(),type=d9gText_(data.tipo||"REMITO").toUpperCase();
  const existing=d9gFindById_(ss,"comprobantes_intenciones","intencion_id",intentionId);
  if(existing){
    d9gAssertDocumentRequest_(existing,user,request,"CREAR");
    return d9gApplyDocumentIntent_(ss,existing);
  }
  if(!["REMITO","PROFORMA","NOTA_VENTA","NOTA_CREDITO"].includes(type))throw new Error("Tipo de comprobante inválido.");
  const date=d9gISODate_(data.fecha);if(["REMITO","NOTA_CREDITO"].includes(type)&&d9gClosedCommissionForDate_(ss,date))throw new Error("Ese período de comisiones ya está cerrado. Usá una fecha de un período abierto.");
  const creditType=type==="NOTA_CREDITO"?(d9gText_(data.credito_tipo)||"DEVOLUCION_PRODUCTOS").toUpperCase():"",financialCredit=["BONIFICACION_REMITO","CREDITO_GENERAL"].includes(creditType);
  if(type==="NOTA_CREDITO"&&!["DEVOLUCION_PRODUCTOS","BONIFICACION_REMITO","CREDITO_GENERAL"].includes(creditType))throw new Error("Tipo de nota de crédito inválido.");
  if(financialCredit&&!d9gIsAdminUser_(user))throw new Error("Los ajustes financieros sólo pueden ser creados por administración.");
  let clientId=d9gText_(data.cliente_id),clientName=d9gText_(data.cliente),reference=null,referenceItems=[],referenceId=d9gText_(data.referencia_operacion_id),referenceNumber="";
  if(type==="NOTA_CREDITO"&&creditType!=="CREDITO_GENERAL"){
    reference=d9gFindById_(ss,"operaciones","operacion_id",referenceId);
    if(!reference||d9gText_(reference.tipo).toUpperCase()!=="REMITO"||d9gIsAnnulled_(reference.estado))throw new Error("La nota de crédito debe referenciar un remito vigente.");
    clientId=d9gText_(reference.cliente_id);clientName=d9gText_(reference.cliente);referenceNumber=d9gText_(reference.numero);referenceItems=d9gReadObjects_(ss,"operacion_items",false).filter(x=>d9gText_(x.operacion_id)===referenceId);
  }
  if(!clientId||!clientName)throw new Error("Falta seleccionar el cliente.");
  d9gTestAssertClient_(source,user,data,clientId);
  d9gFinanceAssertReady_(ss,clientId,"");
  const occasional=/^OCASIONAL-[A-Z0-9-]{6,80}$/i.test(clientId);let validClient=null;
  if(!occasional&&(!reference)){validClient=d9gReadObjects_(source,"clientes",false).find(c=>d9gText_(c.id)===clientId&&d9gIsActive_(c.activo));if(!validClient)throw new Error("El cliente ya no está activo en D9.");}
  if(occasional&&clientName.length>120)throw new Error("El nombre del cliente ocasional es demasiado largo.");
  const concept=d9gText_(data.credito_concepto),creditAmount=d9gRound_(d9gNumber_(data.credito_importe));if(financialCredit&&(!concept||creditAmount<=0))throw new Error("Ingresá el motivo y el importe del crédito.");
  const rawItems=Array.isArray(data.items)?data.items:[];if(!financialCredit&&!rawItems.length)throw new Error("El comprobante no tiene productos.");
  const productMap={};d9gReadObjects_(source,"productos",false).forEach(p=>productMap[d9gText_(p.id)]=p);
  const referenceMap={};referenceItems.forEach(item=>{const id=d9gText_(item.producto_id);if(!referenceMap[id])referenceMap[id]={cantidad:0,precio:d9gNumber_(item.precio_unitario),descuento:d9gNumber_(item.descuento_pct),item:item};referenceMap[id].cantidad+=d9gNumber_(item.cantidad)});
  const allOperations=d9gReadObjects_(ss,"operaciones",false),allItems=d9gReadObjects_(ss,"operacion_items",false),creditReferences=new Set([referenceId]),credited={};if(reference&&d9gText_(reference.finanzas_venta_id))allOperations.filter(op=>d9gText_(op.finanzas_venta_id)===d9gText_(reference.finanzas_venta_id)).forEach(op=>creditReferences.add(d9gText_(op.operacion_id)));
  if(type==="NOTA_CREDITO"&&creditType==="DEVOLUCION_PRODUCTOS")allOperations.filter(op=>d9gText_(op.tipo).toUpperCase()==="NOTA_CREDITO"&&!["BONIFICACION_REMITO","CREDITO_GENERAL"].includes(d9gText_(op.credito_tipo).toUpperCase())&&creditReferences.has(d9gText_(op.referencia_operacion_id))&&!d9gIsAnnulled_(op.estado)).forEach(op=>allItems.filter(item=>d9gText_(item.operacion_id)===d9gText_(op.operacion_id)).forEach(item=>{const id=d9gText_(item.producto_id);credited[id]=(credited[id]||0)+d9gNumber_(item.cantidad)}));
  const requestedCredit={};let items=financialCredit?[{id:"AJUSTE-FINANCIERO",nombre:creditType==="BONIFICACION_REMITO"?"Bonificación comercial":"Crédito general",marca:"GENERAL",cantidad:1,precio:creditAmount,descuento:0,subtotal:creditAmount,orden:1,original:null}]:rawItems.map((x,i)=>{const id=d9gText_(x.id_producto),p=productMap[id],original=referenceMap[id],qty=d9gNumber_(x.cantidad),price=d9gNumber_(x.precio),rawLineDiscount=d9gText_(x.descuento_pct).replace(",","."),requestedLineDiscount=rawLineDiscount===""?0:Number(rawLineDiscount);if(!Number.isFinite(requestedLineDiscount)||requestedLineDiscount<0||requestedLineDiscount>100)throw new Error("El descuento de cada línea debe estar entre 0% y 100%.");if(qty<=0||price<0||(!p&&type!=="NOTA_CREDITO"))throw new Error("Hay un producto, cantidad o precio inválido.");if(type==="NOTA_CREDITO"){const available=(original?original.cantidad:0)-(credited[id]||0);requestedCredit[id]=(requestedCredit[id]||0)+qty;if(!original||requestedCredit[id]>available+.0001)throw new Error("La cantidad acreditada supera lo disponible en el remito original.");if(Math.abs(price-original.precio)>.01)throw new Error("La nota de crédito debe conservar el precio del remito original.");}const lineDiscount=type==="NOTA_CREDITO"?original.descuento:requestedLineDiscount;return {id:id,nombre:type==="NOTA_CREDITO"?d9gText_(original.item.producto):d9gText_(p.nombre),marca:d9gText_(original&&original.item.marca)||d9gText_(p&&p.marca),cantidad:qty,precio:price,descuento:lineDiscount,subtotal:d9gRound_(qty*price*(1-lineDiscount/100)),orden:i+1,original:original&&original.item};});
  const subtotal=d9gRound_(items.reduce((s,x)=>s+x.subtotal,0)),discount=financialCredit?0:(type==="NOTA_CREDITO"?d9gNumber_(reference.descuento_pct):Math.max(0,Math.min(100,d9gNumber_(data.descuento_pct)))),total=d9gRound_(subtotal*(1-discount/100));if(total<=0)throw new Error("El total debe ser mayor que cero.");
  if(reference){const previousCredits=allOperations.filter(op=>d9gText_(op.tipo).toUpperCase()==="NOTA_CREDITO"&&creditReferences.has(d9gText_(op.referencia_operacion_id))&&!d9gIsAnnulled_(op.estado)).reduce((sum,op)=>sum+d9gNumber_(op.total),0);if(previousCredits+total>d9gNumber_(reference.total)+.01)throw new Error("El crédito total supera el importe disponible de la venta original.");}
  const initialPayments=type==="NOTA_CREDITO"?[]:d9gNormalizePayments_(data.pagos_iniciales||[]),paid=d9gRound_(initialPayments.reduce((s,p)=>s+p.importe,0));if(paid<0||paid>total+.01)throw new Error("El pago inicial es inválido.");
  const numbering=d9gOperationNumbering_(type),scope=d9gTestScope_(user,data),counterType=scope==="TEST"?"TEST_"+numbering.counter:numbering.counter,counterPrefix=scope==="TEST"?"TEST-"+numbering.prefix:numbering.prefix;
  const originOrderId=type==="NOTA_CREDITO"?"":d9gText_(data.origen_pedido_id),originSaleId=type==="NOTA_CREDITO"?"":d9gText_(data.origen_venta_id);if(originOrderId&&originSaleId)throw new Error("El comprobante no puede tener pedido y venta como origen al mismo tiempo.");
  const referenceOrderId=reference?d9gText_(reference.origen_pedido_id):"",sourceOrders=referenceOrderId?d9gReadSourceOrders_(source,0):[],originOrder=originOrderId?d9gAssertSourceOrderUsable_(source,originOrderId,clientId):null,referenceOrder=referenceOrderId?sourceOrders.find(order=>d9gText_(order.pedido_id)===referenceOrderId):null,sourceSales=originSaleId?d9gReadSourceSales_(source,0):[],originSale=originSaleId?sourceSales.find(sale=>d9gText_(sale.venta_id)===originSaleId):null;if(originSaleId&&!originSale)throw new Error("La venta de origen ya no existe. Actualizá Gestión y volvé a intentar.");
  if((originOrder&&d9gText_(originOrder.cliente_id)!==clientId)||(originSale&&d9gText_(originSale.cliente_id)!==clientId))throw new Error("El origen pertenece a otro cliente o ámbito.");
  const financialSale=originSaleId?d9gFinanceSale_(ss,originSaleId):null,financialSaleId=financialSale?originSaleId:"";
  if(financialSale){if(financialSale.tipo!=="VENTA"||financialSale.estado!=="CONFIRMADA")throw new Error("La Venta tiene un resultado financiero pendiente de verificar.");const salePlan=JSON.parse(financialSale.plan);if(salePlan.result.cliente_id!==clientId||Math.abs(salePlan.result.importe-total)>.01)throw new Error("Este documento debe conservar el cliente y total de la Venta financiera. Usá los circuitos de corrección existentes para ajustar dinero.");if(initialPayments.length)throw new Error("La condición de pago ya fue registrada en la Venta. No vuelvas a registrar un pago inicial.");}
  const requestedStatus=d9gText_(data.comision_estado).toUpperCase(),referenceSellerId=reference?(d9gText_(reference.vendedor_id)||d9gText_(referenceOrder&&referenceOrder.vendedor_id)):"",referenceSellerName=reference?(d9gText_(reference.vendedor)||d9gText_(referenceOrder&&referenceOrder.vendedor)):"",referenceStatus=reference?(d9gText_(reference.comision_estado).toUpperCase()||(referenceSellerId?"APLICA":"PENDIENTE")):"",commissionStatus=creditType==="CREDITO_GENERAL"?"NO_APLICA":(reference?referenceStatus:(requestedStatus==="NO_APLICA"?"NO_APLICA":"APLICA"));if(commissionStatus==="NO_APLICA"&&!reference&&!d9gIsAdminUser_(user))throw new Error("Sólo administración puede marcar una venta sin comisión.");
  const requestedSeller=reference?referenceSellerId:(originOrder?d9gText_(originOrder.vendedor_id):(originSale?d9gText_(originSale.usuario_id):d9gText_(data.vendedor_id)||(validClient&&d9gText_(validClient.vendedor_id)))),seller=commissionStatus==="NO_APLICA"?{id:"",nombre:"Venta directa / sin comisión"}:d9gResolveActiveSeller_(source,requestedSeller,reference?referenceSellerName:(originOrder?d9gText_(originOrder.vendedor):(originSale?d9gText_(originSale.usuario):d9gText_(data.vendedor))));if(commissionStatus==="APLICA"&&!seller.id)throw new Error("Seleccioná el vendedor del comprobante.");
  const rules=d9gReadObjects_(ss,"comisiones_reglas",false);let proportionalRule=null;if(creditType==="BONIFICACION_REMITO"&&commissionStatus==="APLICA"){let weightedBase=0,weightedCommission=0,complete=true;referenceItems.forEach(original=>{const base=d9gText_(original.comision_base)!==""?d9gNumber_(original.comision_base):d9gNumber_(original.subtotal)*(1-d9gNumber_(reference.descuento_pct)/100),stored=d9gText_(original.comision_porcentaje),rule=stored!==""?{regla_id:d9gText_(original.comision_regla_id),porcentaje:d9gNumber_(stored)}:d9gCommissionRuleAt_(rules,seller.id,d9gText_(original.marca),reference.fecha);if(!rule){complete=false;return}weightedBase+=base;weightedCommission+=base*d9gNumber_(rule.porcentaje)/100});if(complete&&weightedBase>0)proportionalRule={regla_id:"PROPORCIONAL",porcentaje:weightedCommission/weightedBase*100};}
  items.forEach(item=>{const original=item.original||{},ruleId=d9gText_(original.comision_regla_id),rawPct=d9gText_(original.comision_porcentaje),rule=commissionStatus==="NO_APLICA"?{regla_id:"NO_APLICA",porcentaje:0}:(creditType==="BONIFICACION_REMITO"?proportionalRule:(type==="NOTA_CREDITO"&&rawPct!==""?{regla_id:ruleId,porcentaje:d9gNumber_(rawPct)}:d9gCommissionRuleAt_(rules,seller.id,item.marca,type==="NOTA_CREDITO"&&reference?d9gDateCell_(reference.fecha):date)));item.comision_base=d9gRound_(item.subtotal*(1-discount/100));item.comision_regla_id=rule?d9gText_(rule.regla_id):"";item.comision_porcentaje=rule?d9gNumber_(rule.porcentaje):"";item.comision_importe=rule?d9gRound_(item.comision_base*d9gNumber_(rule.porcentaje)/100)*(type==="NOTA_CREDITO"?-1:1):"";});
  if(items.length){const last=items[items.length-1],difference=d9gRound_(total-items.reduce((sum,item)=>sum+d9gNumber_(item.comision_base),0));last.comision_base=d9gRound_(last.comision_base+difference);if(last.comision_porcentaje!=="")last.comision_importe=d9gRound_(last.comision_base*d9gNumber_(last.comision_porcentaje)/100)*(type==="NOTA_CREDITO"?-1:1);}
  // El origen puede haberse anulado mientras se preparaban importes y comisiones.
  // Ésta es la última lectura antes de cualquier escritura, incluida la numeración.
  if(originOrderId)d9gAssertSourceOrderUsable_(source,originOrderId,clientId);
  d9gEnsureOperationCounter_(ss,type,counterType,counterPrefix);
  const opId="OP-"+Utilities.getUuid(),counter=d9gNextNumber_(ss,counterType,counterPrefix),now=d9gNow_();
  const tables={
    operaciones:[[opId,counter.numero,type,date,clientId,clientName,type==="NOTA_CREDITO"?"NOTA_CREDITO":(originOrderId?"PEDIDO":(originSaleId?"VENTA":"MANUAL")),originOrderId,user.id,user.nombre,"PREPARANDO",subtotal,discount,total,d9gText_(data.observaciones),now,now,"","",seller.id,seller.nombre,referenceId,referenceNumber,creditType,concept,commissionStatus,d9gText_(data.comision_motivo),originSaleId,financialSaleId]],
    operacion_items:items.map(x=>["IT-"+Utilities.getUuid(),opId,x.orden,x.id,x.nombre,x.cantidad,x.precio,x.descuento,x.subtotal,x.marca,x.comision_regla_id,x.comision_porcentaje,x.comision_base,x.comision_importe]),
    movimientos:[],recibos:[],pagos:[],cheques:[],auditoria:[]
  };
  if(!financialSaleId)tables.movimientos.push(d9gDocumentMovementRow_(user,{fecha:date,cliente_id:clientId,cliente:clientName,tipo:type==="NOTA_CREDITO"?"NOTA_CREDITO":"COMPROBANTE",documento_tipo:type,documento_id:opId,documento_numero:counter.numero,operacion_id:type==="NOTA_CREDITO"?d9gFinancialReference_(ss,referenceId||opId):opId,debe:type==="NOTA_CREDITO"?0:total,haber:type==="NOTA_CREDITO"?total:0,detalle:type==="NOTA_CREDITO"?(concept||"Crédito sobre "+referenceNumber):(originOrderId?"Desde pedido "+originOrderId:(originSaleId?"Desde venta "+originSaleId:"Carga manual"))},now));
  let receiptId="";
  if(paid>0){
    const receiptNumber=d9gNextNumber_(ss,scope==="TEST"?"TEST_RECIBO":"RECIBO",scope==="TEST"?"TEST-RC":"RC").numero;
    receiptId="RC-"+Utilities.getUuid();
    const receiptRows=d9gReceiptRows_(user,{fecha:date,cliente_id:clientId,cliente:clientName,operacion_id:opId,operacion_numero:counter.numero,pagos:initialPayments,observaciones:"Pago inicial de "+type+" "+counter.numero},receiptNumber,receiptId,now);
    ["recibos","pagos","cheques","movimientos"].forEach(name=>tables[name].push(...receiptRows[name]));
  }
  const audit={numero:counter.numero,tipo:type,credito_tipo:creditType,total:total,origen_pedido_id:originOrderId,origen_venta_id:originSaleId,referencia_operacion_id:referenceId,vendedor_id:seller.id,vendedor:seller.nombre,comision_estado:commissionStatus};
  tables.auditoria.push(["AU-"+Utilities.getUuid(),now,user.id,user.nombre,"CREAR","OPERACION",opId,JSON.stringify(audit).slice(0,3000)]);
  const result={ok:true,operacion_id:opId,numero:counter.numero,recibo_id:receiptId,referencia_operacion_id:referenceId,credito_tipo:creditType,comision_estado:commissionStatus,finanzas_venta_id:financialSaleId,saldo:financialSaleId?null:Math.max(0,total-paid)};
  const plan={request,result,tables,originOrderId};
  const serialized=JSON.stringify(plan);if(serialized.length>45000)throw new Error("El comprobante tiene demasiados renglones para recuperarse de forma segura.");
  d9gAppend_(ss,"comprobantes_intenciones",[[intentionId,"CREAR",opId,user.id,clientId,scope,"PREPARADA",serialized,now,now]]);
  return d9gApplyDocumentIntent_(ss,d9gFindById_(ss,"comprobantes_intenciones","intencion_id",intentionId));
}

function d9gCreateReceipt_(user,data) {
  d9gRequireCanIssueDocuments_(user);
  const ss=d9gGestion_(),clientId=d9gText_(data.cliente_id),client=d9gText_(data.cliente),payments=d9gNormalizePayments_(data.pagos||[]),amount=d9gRound_(payments.reduce((s,p)=>s+p.importe,0));if(!clientId||!client||amount<=0)throw new Error("Cliente e importe son obligatorios.");
  d9gTestAssertClient_(d9gSource_(),user,data,clientId);
  d9gFinanceAssertReady_(ss,clientId,"");
  let opNumber="";const opId=d9gText_(data.operacion_id);if(opId){const op=d9gFindById_(ss,"operaciones","operacion_id",opId);if(!op||d9gIsAnnulled_(op.estado))throw new Error("El comprobante no está vigente.");if(d9gText_(op.cliente_id)!==clientId)throw new Error("El comprobante pertenece a otro cliente.");opNumber=d9gText_(op.numero);const bal=d9gOperationBalance_(ss,opId);if(amount>bal+.01)throw new Error("El pago supera el saldo del comprobante. Para dejar crédito, elegí ‘A cuenta’.");}
  const receipt=d9gCreateReceiptCore_(ss,user,{fecha:d9gISODate_(data.fecha),cliente_id:clientId,cliente:client,operacion_id:opId,movimiento_operacion_id:d9gFinancialReference_(ss,opId),operacion_numero:opNumber,pagos:payments,observaciones:d9gText_(data.observaciones)});
  d9gAudit_(ss,user,"CREAR","RECIBO",receipt.recibo_id,{numero:receipt.numero,total:amount,operacion_id:opId});return {ok:true,recibo_id:receipt.recibo_id,numero:receipt.numero};
}

function d9gCreateReceiptCore_(ss,user,x) {
  const payments=d9gNormalizePayments_(x.pagos||[]),total=d9gRound_(payments.reduce((s,p)=>s+p.importe,0));if(total<=0)throw new Error("El recibo no tiene pagos válidos.");
  const test=d9gTestIsClient_(d9gTestClientIds_(d9gSource_()),x.cliente_id),counter=d9gNextNumber_(ss,test?"TEST_RECIBO":"RECIBO",test?"TEST-RC":"RC"),receiptId="RC-"+Utilities.getUuid(),now=d9gNow_(),rows=d9gReceiptRows_(user,x,counter.numero,receiptId,now);
  d9gAppend_(ss,"recibos",rows.recibos);d9gAppend_(ss,"pagos",rows.pagos);if(rows.cheques.length)d9gAppend_(ss,"cheques",rows.cheques);d9gAppend_(ss,"movimientos",rows.movimientos);
  return {recibo_id:receiptId,numero:counter.numero};
}
function d9gReceiptRows_(user,x,number,receiptId,now){
  const payments=d9gNormalizePayments_(x.pagos||[]),total=d9gRound_(payments.reduce((s,p)=>s+p.importe,0)),method=payments.length>1?"MIXTO":payments[0].medio;
  const paymentRows=[],checkRows=[];
  payments.forEach(p=>{const paymentId="PG-"+Utilities.getUuid(),checkId=p.medio==="CHEQUE"?"CH-"+Utilities.getUuid():"";paymentRows.push([paymentId,receiptId,x.operacion_id||"",x.cliente_id,x.fecha,p.medio,p.importe,p.referencia||"",checkId,"VIGENTE",user.id,user.nombre,now]);if(checkId){const c=p.cheque;checkRows.push([checkId,paymentId,receiptId,x.operacion_id||"",x.cliente_id,x.cliente,c.banco,c.numero,c.librador,x.fecha,c.fecha_vencimiento,p.importe,"EN_CARTERA",user.id,user.nombre,now]);}});
  return {recibos:[[receiptId,number,x.fecha,x.cliente_id,x.cliente,x.operacion_id||"",x.operacion_numero||"",method,total,x.observaciones||"","VIGENTE",user.id,user.nombre,now,"",""]],pagos:paymentRows,cheques:checkRows,movimientos:[["MV-"+Utilities.getUuid(),x.fecha,x.cliente_id,x.cliente,"PAGO","RECIBO",receiptId,number,x.movimiento_operacion_id||x.operacion_id||"",0,total,"VIGENTE",user.id,user.nombre,payments.map(p=>p.medio+" "+p.importe).join(" + "),now]]};
}

// Journal técnico de comprobantes. Los saldos se calculan exclusivamente de movimientos.
function migrarJournalComprobantesD9(){
  d9gEnsureSheet_(d9gGestion_(),"comprobantes_intenciones",D9G_HEADERS.comprobantes_intenciones);
  return "Journal de comprobantes disponible; no se modificaron operaciones ni contadores.";
}
function d9gDocumentIntentId_(value){
  const id=d9gText_(value);
  if(!/^DOCI-[A-Za-z0-9_-]{12,100}$/.test(id))throw new Error("Falta una identidad persistente válida del comprobante. Actualizá D9 Gestión antes de guardar.");
  return id;
}
function d9gDocumentRequest_(data){
  const request=Object.assign({},data);delete request.token;delete request.action;
  return request;
}
function d9gAssertDocumentRequest_(journal,user,request,action){
  if(d9gText_(journal.accion)!==action||d9gText_(journal.usuario_id)!==d9gText_(user.id)||d9gText_(journal.ambito)!==d9gTestScope_(user,request))throw new Error("La intención pertenece a otra operación, usuario o ámbito.");
  const saved=JSON.parse(journal.plan);
  if(JSON.stringify(saved.request)!==JSON.stringify(request))throw new Error("El identificador ya corresponde a otro comprobante. No se volvió a escribir.");
}
function d9gDocumentMovementRow_(user,x,now){
  return ["MV-"+Utilities.getUuid(),x.fecha,x.cliente_id,x.cliente,x.tipo,x.documento_tipo,x.documento_id,x.documento_numero,x.operacion_id||"",d9gRound_(x.debe),d9gRound_(x.haber),"VIGENTE",user.id,user.nombre,x.detalle||"",now];
}
function d9gDocumentSetJournalState_(ss,id,state){
  const found=d9gFindRowById_(ss,"comprobantes_intenciones","intencion_id",id);
  if(!found)throw new Error("Falta la intención técnica del comprobante. Requiere revisión.");
  const sh=ss.getSheetByName("comprobantes_intenciones");
  sh.getRange(found.row,7).setValue(state);
  sh.getRange(found.row,10).setValue(d9gNow_());
}
function d9gDocumentCanonicalCell_(value,header){
  if(value instanceof Date)return Utilities.formatDate(value,D9G.TZ,["fecha","fecha_ingreso","fecha_vencimiento"].includes(header)?"yyyy-MM-dd":"yyyy-MM-dd HH:mm:ss");
  const text=d9gText_(value);
  if(["fecha","fecha_ingreso","fecha_vencimiento"].includes(header))return d9gDateCell_(value);
  if(["orden","cantidad","precio_unitario","precio","descuento_pct","subtotal","total","debe","haber","importe","comision_porcentaje","comision_base","comision_importe"].includes(header)&&text!=="")return String(Number(d9gNumber_(value).toFixed(8)));
  return text;
}
function d9gDocumentEnsureRows_(ss,name,planned){
  if(!planned||!planned.length)return;
  const headers=D9G_HEADERS[name],key=headers[0];
  planned.forEach(row=>{
    const matches=d9gReadObjects_(ss,name,false).filter(item=>d9gText_(item[key])===d9gText_(row[0]));
    if(matches.length>1)throw new Error("ID duplicado en "+name+": "+row[0]+". Requiere revisión.");
    if(matches.length){
      const current=matches[0];
      headers.forEach((header,index)=>{
        const expected=d9gDocumentCanonicalCell_(row[index],header),actual=d9gDocumentCanonicalCell_(current[header],header);
        if(name==="operaciones"&&header==="estado"&&expected==="PREPARANDO"&&actual==="VIGENTE")return;
        if(expected!==actual)throw new Error("Fila incompatible con el plan en "+name+" ("+row[0]+", "+header+"). Requiere revisión.");
      });
      return;
    }
    d9gAppend_(ss,name,[row]);
  });
}
function d9gDocumentAnyRows_(ss,plan){
  return Object.keys(plan.tables||{}).some(name=>(plan.tables[name]||[]).some(row=>d9gReadObjects_(ss,name,false).some(item=>d9gText_(item[D9G_HEADERS[name][0]])===d9gText_(row[0]))));
}
function d9gDocumentOriginalMovement_(ss,operation){
  if(d9gText_(operation.finanzas_venta_id))return null;
  const rows=d9gReadObjects_(ss,"movimientos",false).filter(m=>d9gText_(m.documento_id)===d9gText_(operation.operacion_id)&&d9gText_(m.tipo)===(d9gText_(operation.tipo).toUpperCase()==="NOTA_CREDITO"?"NOTA_CREDITO":"COMPROBANTE"));
  if(rows.length>1)throw new Error("El comprobante tiene movimientos originales duplicados. Requiere revisión.");
  const row=rows[0]||null,credit=d9gText_(operation.tipo).toUpperCase()==="NOTA_CREDITO";
  if(row&&(d9gIsAnnulled_(row.estado)||d9gText_(row.cliente_id)!==d9gText_(operation.cliente_id)||d9gText_(row.documento_tipo)!==d9gText_(operation.tipo)||d9gText_(row.documento_numero)!==d9gText_(operation.numero)||Math.abs(d9gNumber_(credit?row.haber:row.debe)-d9gNumber_(operation.total))>.01||d9gNumber_(credit?row.debe:row.haber)>.01))throw new Error("El movimiento original no coincide con el comprobante. Requiere revisión.");
  return row;
}
function d9gDocumentReverseMovements_(ss,id){
  return d9gReadObjects_(ss,"movimientos",false).filter(m=>d9gText_(m.documento_id)===id&&d9gText_(m.tipo)==="ANULACION_COMPROBANTE");
}
function d9gDocumentValidReverse_(operation,original,reverse){
  const credit=d9gText_(operation.tipo).toUpperCase()==="NOTA_CREDITO";
  return !!original&&!!reverse&&!d9gIsAnnulled_(reverse.estado)&&d9gText_(reverse.cliente_id)===d9gText_(operation.cliente_id)&&Math.abs(d9gNumber_(credit?reverse.debe:reverse.haber)-d9gNumber_(operation.total))<=.01&&d9gNumber_(credit?reverse.haber:reverse.debe)<=.01;
}
function d9gDocumentResult_(ss,plan,duplicate){
  const result=Object.assign({},plan.result);
  if(duplicate)result.duplicated=true;
  if(result.finanzas_venta_id){
    const operations=d9gReadObjects_(ss,"operaciones",false),index=operations.findIndex(op=>d9gText_(op.operacion_id)===result.operacion_id);
    const earlier=operations.slice(0,index<0?operations.length:index).some(op=>d9gText_(op.finanzas_venta_id)===result.finanzas_venta_id&&!d9gIsAnnulled_(op.estado));
    result.saldo=earlier?0:Math.max(0,d9gOperationBalance_(ss,result.operacion_id));
  }
  return result;
}
function d9gApplyDocumentIntent_(ss,journal){
  if(!journal)throw new Error("No se pudo leer la intención técnica del comprobante.");
  const state=d9gText_(journal.estado),plan=JSON.parse(journal.plan),id=d9gText_(journal.intencion_id);
  if(state==="COMPLETA")return d9gDocumentResult_(ss,plan,true);
  if(state==="CANCELADA")return {ok:true,cancelada:true,message:"La intención se canceló sin crear un comprobante."};
  if(state==="REVISION")throw new Error("La intención "+id+" requiere revisión. No se hicieron escrituras adicionales.");
  try{
    if(journal.accion==="CREAR"){
      const existing=d9gFindById_(ss,"operaciones","operacion_id",journal.operacion_id);
      if(!existing&&plan.originOrderId){
        if(d9gDocumentAnyRows_(ss,plan))throw new Error("Hay filas parciales sin operación. Requiere revisión.");
        try{d9gAssertSourceOrderUsable_(d9gSource_(),plan.originOrderId,journal.cliente_id)}
        catch(error){
          if(/^El pedido de origen (fue anulado|ya no existe)\./.test(error.message)){
            d9gDocumentSetJournalState_(ss,id,"CANCELADA");
            return {ok:true,cancelada:true,message:error.message};
          }
          throw error;
        }
      }
      if(!existing&&d9gDocumentAnyRows_(ss,plan))throw new Error("Hay filas parciales sin operación. Requiere revisión.");
      d9gDocumentEnsureRows_(ss,"operaciones",plan.tables.operaciones);
      d9gDocumentSetJournalState_(ss,id,"EN_PROCESO");
      ["operacion_items","movimientos","recibos","pagos","cheques","auditoria"].forEach(name=>d9gDocumentEnsureRows_(ss,name,plan.tables[name]));
      const found=d9gFindRowById_(ss,"operaciones","operacion_id",journal.operacion_id);
      if(!found)throw new Error("La operación planificada no existe. Requiere revisión.");
      if(d9gText_(found.obj.estado)==="PREPARANDO")ss.getSheetByName("operaciones").getRange(found.row,D9G_HEADERS.operaciones.indexOf("estado")+1).setValue("VIGENTE");
      else if(d9gText_(found.obj.estado)!=="VIGENTE")throw new Error("El comprobante cambió de estado durante su preparación. Requiere revisión.");
      d9gDocumentSetJournalState_(ss,id,"COMPLETA");
      return d9gDocumentResult_(ss,plan,false);
    }
    if(journal.accion==="ANULAR"){
      const found=d9gFindRowById_(ss,"operaciones","operacion_id",journal.operacion_id);
      if(!found)throw new Error("Desapareció el comprobante durante la anulación. Requiere revisión.");
      if(plan.originalId){
        const original=d9gDocumentOriginalMovement_(ss,found.obj);
        if(!original||d9gText_(original.movimiento_id)!==plan.originalId)throw new Error("El movimiento original cambió durante la anulación. Requiere revisión.");
      }else if(!d9gText_(found.obj.finanzas_venta_id))throw new Error("Falta la procedencia financiera de la anulación. Requiere revisión.");
      d9gDocumentEnsureRows_(ss,"movimientos",plan.tables.movimientos);
      const sh=ss.getSheetByName("operaciones"),headers=D9G_HEADERS.operaciones;
      if(!d9gIsAnnulled_(found.obj.estado))sh.getRange(found.row,headers.indexOf("estado")+1).setValue("ANULADO");
      sh.getRange(found.row,headers.indexOf("updated_at")+1).setValue(plan.annulledAt);
      sh.getRange(found.row,headers.indexOf("anulada_at")+1).setValue(plan.annulledAt);
      sh.getRange(found.row,headers.indexOf("anulada_por")+1).setValue(plan.annulledBy);
      d9gDocumentSetJournalState_(ss,id,"EN_PROCESO");
      d9gDocumentEnsureRows_(ss,"auditoria",plan.tables.auditoria);
      d9gDocumentSetJournalState_(ss,id,"COMPLETA");
      return plan.result;
    }
    throw new Error("Acción de journal desconocida. Requiere revisión.");
  }catch(error){
    if(/Requiere revisión|Fila incompatible|ID duplicado/.test(error.message))d9gDocumentSetJournalState_(ss,id,"REVISION");
    throw error;
  }
}
function d9gReconcileDocumentIntents_(ss){
  d9gReadObjects_(ss,"comprobantes_intenciones",false).forEach(journal=>{
    if(!["COMPLETA","CANCELADA"].includes(d9gText_(journal.estado)))d9gApplyDocumentIntent_(ss,journal);
  });
}
function d9gCancelDocumentIntent_(user,data){
  const ss=d9gGestion_(),id=d9gDocumentIntentId_(data.intencion_id),existing=d9gFindById_(ss,"comprobantes_intenciones","intencion_id",id);
  if(existing){
    if(d9gText_(existing.usuario_id)!==d9gText_(user.id)||d9gText_(existing.ambito)!==d9gTestScope_(user,data)||existing.accion!=="CREAR")throw new Error("La intención no pertenece a este usuario y ámbito.");
    if(existing.estado==="CANCELADA")return {ok:true,cancelada:true};
    if(existing.estado==="COMPLETA"||d9gDocumentAnyRows_(ss,JSON.parse(existing.plan)))throw new Error("El comprobante ya comenzó o se completó. Verificá el resultado; no puede cancelarse.");
    d9gDocumentSetJournalState_(ss,id,"CANCELADA");return {ok:true,cancelada:true};
  }
  const now=d9gNow_(),scope=d9gTestScope_(user,data);
  d9gAppend_(ss,"comprobantes_intenciones",[[id,"CREAR","",user.id,"",scope,"CANCELADA",JSON.stringify({request:null,result:null,tables:{}}),now,now]]);
  return {ok:true,cancelada:true};
}

function d9gNormalizePayments_(incoming) {
  if(!Array.isArray(incoming))return[];
  return incoming.map(raw=>{const method=d9gText_(raw.medio).toUpperCase(),amount=d9gRound_(d9gNumber_(raw.importe));if(!["EFECTIVO","TRANSFERENCIA","CHEQUE"].includes(method)||amount<=0)throw new Error("Hay un medio o importe de pago inválido.");let check=null;if(method==="CHEQUE"){const c=raw.cheque||{};if(!d9gText_(c.banco)||!d9gText_(c.numero)||!d9gText_(c.fecha_vencimiento))throw new Error("Completá banco, número y vencimiento del cheque.");check={banco:d9gText_(c.banco),numero:d9gText_(c.numero),librador:d9gText_(c.librador),fecha_vencimiento:d9gISODate_(c.fecha_vencimiento)};}return {medio:method,importe:amount,referencia:d9gText_(raw.referencia),cheque:check};});
}

function d9gAnnulOperation_(user,data) {
  d9gRequireAdmin_(user);
  const ss=d9gGestion_(),id=d9gText_(data.operacion_id),found=d9gFindRowById_(ss,"operaciones","operacion_id",id);if(!found)throw new Error("No se encontró el comprobante.");
  d9gTestAssertClient_(d9gSource_(),user,data,found.obj.cliente_id);
  const intentionId="ANN-"+id,existing=d9gFindById_(ss,"comprobantes_intenciones","intencion_id",intentionId);
  if(existing){if(d9gText_(existing.accion)!=="ANULAR"||d9gText_(existing.operacion_id)!==id||d9gText_(existing.cliente_id)!==d9gText_(found.obj.cliente_id))throw new Error("Conflicto de intención de anulación.");return d9gApplyDocumentIntent_(ss,existing);}
  const original=d9gDocumentOriginalMovement_(ss,found.obj),reverse=d9gDocumentReverseMovements_(ss,id);
  if(d9gIsAnnulled_(found.obj.estado)){
    if(original&&reverse.length===1&&d9gDocumentValidReverse_(found.obj,original,reverse[0]))return {ok:true,already_annulled:true,operacion_id:id};
    if(!original&&!reverse.length&&!d9gText_(found.obj.finanzas_venta_id))throw new Error("Comprobante histórico anulado sin movimiento original verificable. Requiere revisión individual; no se inventó una reversión.");
    if(d9gText_(found.obj.finanzas_venta_id)&&!reverse.length)return {ok:true,already_annulled:true,operacion_id:id};
    throw new Error("Anulación histórica incompleta o incompatible. Requiere revisión individual.");
  }
  d9gFinanceAssertReady_(ss,found.obj.cliente_id,"");
  const type=d9gText_(found.obj.tipo).toUpperCase();if(["REMITO","NOTA_CREDITO"].includes(type)&&d9gClosedCommissionForDate_(ss,found.obj.fecha))throw new Error("No se puede anular un comprobante incluido en un cierre de comisiones. Emití la corrección en un período abierto.");
  if(type==="REMITO"&&d9gReadObjects_(ss,"operaciones",false).some(op=>d9gText_(op.tipo).toUpperCase()==="NOTA_CREDITO"&&d9gText_(op.referencia_operacion_id)===id&&!d9gIsAnnulled_(op.estado)))throw new Error("El remito tiene notas de crédito vigentes. Anulalas primero si realmente necesitás anular la venta completa.");
  if(reverse.length)throw new Error("Existe una reversión previa no trazada. Revisá el comprobante antes de anularlo.");
  if(!d9gText_(found.obj.finanzas_venta_id)&&!original)throw new Error("Falta el movimiento original del comprobante. Requiere revisión individual antes de anular.");
  const now=d9gNow_(),credit=type==="NOTA_CREDITO",tables={movimientos:[],auditoria:[]};
  if(original)tables.movimientos.push(d9gDocumentMovementRow_(user,{fecha:d9gToday_(),cliente_id:found.obj.cliente_id,cliente:found.obj.cliente,tipo:"ANULACION_COMPROBANTE",documento_tipo:found.obj.tipo,documento_id:id,documento_numero:found.obj.numero,operacion_id:credit?d9gFinancialReference_(ss,d9gText_(found.obj.referencia_operacion_id)):id,debe:credit?d9gNumber_(found.obj.total):0,haber:credit?0:d9gNumber_(found.obj.total),detalle:"Reversión del comprobante anulado"},now));
  tables.auditoria.push(["AU-"+Utilities.getUuid(),now,user.id,user.nombre,"ANULAR","OPERACION",id,JSON.stringify({numero:found.obj.numero,total:found.obj.total}).slice(0,3000)]);
  const plan={result:{ok:true,operacion_id:id},originalId:original?d9gText_(original.movimiento_id):"",tables,annulledAt:now,annulledBy:user.nombre};
  d9gAppend_(ss,"comprobantes_intenciones",[[intentionId,"ANULAR",id,user.id,found.obj.cliente_id,d9gTestScope_(user,data),"PREPARADA",JSON.stringify(plan),now,now]]);
  return d9gApplyDocumentIntent_(ss,d9gFindById_(ss,"comprobantes_intenciones","intencion_id",intentionId));
}

function d9gUpdateCheck_(user,data) {
  d9gRequireAdmin_(user);
  const ss=d9gGestion_(),id=d9gText_(data.cheque_id),next=d9gText_(data.estado).toUpperCase();if(!["EN_CARTERA","DEPOSITADO","COBRADO","RECHAZADO","ENTREGADO","ANULADO"].includes(next))throw new Error("Estado de cheque inválido.");
  const found=d9gFindRowById_(ss,"cheques","cheque_id",id);if(!found)throw new Error("No se encontró el cheque.");const old=d9gText_(found.obj.estado).toUpperCase();if(old===next)return {ok:true,unchanged:true};
  d9gTestAssertClient_(d9gSource_(),user,data,found.obj.cliente_id);
  d9gFinanceAssertReady_(ss,found.obj.cliente_id,"");
  const sh=ss.getSheetByName("cheques"),h=d9gHeaders_(sh);sh.getRange(found.row,h.indexOf("estado")+1).setValue(next);sh.getRange(found.row,h.indexOf("updated_at")+1).setValue(d9gNow_());
  if(old!=="RECHAZADO"&&next==="RECHAZADO")d9gAddMovement_(ss,{fecha:d9gToday_(),cliente_id:found.obj.cliente_id,cliente:found.obj.cliente,tipo:"CHEQUE_RECHAZADO",documento_tipo:"CHEQUE",documento_id:id,documento_numero:found.obj.numero,operacion_id:d9gFinancialReference_(ss,found.obj.operacion_id),debe:d9gNumber_(found.obj.importe),haber:0,usuario:user,detalle:"Cheque rechazado · "+found.obj.banco});
  if(old==="RECHAZADO"&&next!=="RECHAZADO")d9gAddMovement_(ss,{fecha:d9gToday_(),cliente_id:found.obj.cliente_id,cliente:found.obj.cliente,tipo:"REVERSA_RECHAZO_CHEQUE",documento_tipo:"CHEQUE",documento_id:id,documento_numero:found.obj.numero,operacion_id:d9gFinancialReference_(ss,found.obj.operacion_id),debe:0,haber:d9gNumber_(found.obj.importe),usuario:user,detalle:"Se revierte el rechazo · nuevo estado "+next});
  d9gAudit_(ss,user,"CAMBIAR_ESTADO","CHEQUE",id,{anterior:old,nuevo:next});return {ok:true,cheque_id:id,estado:next};
}

function d9gUpdateConfig_(user,data) {
  d9gRequireAdmin_(user);
  const ss=d9gGestion_(),incoming=data.config||{},allowed=["empresa_nombre","documento_default","documento_prefijo","impresion","leyenda"],sh=ss.getSheetByName("config"),rows=d9gReadObjects_(ss,"config",true),map={};rows.forEach((r,i)=>map[d9gText_(r.clave)]=i+2);
  allowed.forEach(k=>{if(incoming[k]===undefined)return;const v=d9gText_(incoming[k]);if(map[k])sh.getRange(map[k],2).setValue(v);else sh.appendRow([k,v]);});d9gAudit_(ss,user,"ACTUALIZAR","CONFIG","config",incoming);return {ok:true};
}

// ─── REGLAS DE COMISIÓN ───────────────────────────────────────────
function d9gSaveCommissionRule_(user,data){
  d9gRequireAdmin_(user);
  const incoming=data.regla||{},sellerId=d9gText_(incoming.vendedor_id),brand=d9gText_(incoming.marca||"GENERAL").toUpperCase()||"GENERAL";
  if(!sellerId)throw new Error("Falta seleccionar el vendedor.");
  const seller=d9gReadObjects_(d9gSource_(),"usuarios",false).find(item=>d9gText_(item.id)===sellerId&&d9gIsActive_(item.activo));
  if(!seller||d9gText_(seller.rol).toLowerCase()!=="vendedor")throw new Error("El usuario ya no es un vendedor activo.");
  const rawPercentage=d9gText_(incoming.porcentaje);if(rawPercentage==="")throw new Error("Ingresá el porcentaje de comisión.");if(!/^\d+(?:[.,]\d+)?$/.test(rawPercentage))throw new Error("El porcentaje de comisión no es válido.");
  const percentage=d9gNumber_(rawPercentage);if(percentage<0||percentage>100)throw new Error("El porcentaje debe estar entre 0 y 100.");
  const from=d9gISODate_(incoming.vigente_desde||d9gToday_()),to=d9gText_(incoming.vigente_hasta);if(to)d9gISODate_(to);if(to&&to<from)throw new Error("La vigencia hasta no puede ser anterior a la vigencia desde.");
  const ss=d9gGestion_(),sh=d9gEnsureSheet_(ss,"comisiones_reglas",D9G_HEADERS.comisiones_reglas),rows=d9gReadObjects_(ss,"comisiones_reglas",false),requestedId=d9gText_(incoming.regla_id),active=d9gIsActive_(incoming.activo)?"si":"no";
  let found=requestedId?d9gFindRowById_(ss,"comisiones_reglas","regla_id",requestedId):null;
  if(requestedId&&!found)throw new Error("La regla cambió o ya no existe. Actualizá Gestión y volvé a intentar.");
  if(found&&(d9gText_(found.obj.vendedor_id)!==sellerId||(d9gText_(found.obj.marca||"GENERAL").toUpperCase()||"GENERAL")!==brand))throw new Error("La regla indicada no corresponde a ese vendedor y marca.");
  if(found&&d9gDateCell_(found.obj.vigente_desde)!==from&&active==="si"){const oldFrom=d9gDateCell_(found.obj.vigente_desde);if(from<=oldFrom)throw new Error("La nueva vigencia debe comenzar después de la regla anterior.");const headers=d9gHeaders_(sh);sh.getRange(found.row,headers.indexOf("vigente_hasta")+1).setValue(d9gPreviousDate_(from));found=null;}
  if(!found&&!requestedId){const current=rows.find(item=>d9gText_(item.vendedor_id)===sellerId&&["","GENERAL"].includes(d9gText_(item.marca).toUpperCase())&&d9gIsActive_(item.activo));if(current)found=d9gFindRowById_(ss,"comisiones_reglas","regla_id",d9gText_(current.regla_id));}
  const id=found?d9gText_(found.obj.regla_id):"CR-"+Utilities.getUuid(),row=[id,sellerId,brand,d9gRound_(percentage),from,to,active];
  if(found)sh.getRange(found.row,1,1,row.length).setValues([row]);else sh.appendRow(row);
  const rule={regla_id:id,vendedor_id:sellerId,marca:brand,porcentaje:d9gRound_(percentage),vigente_desde:from,vigente_hasta:to,activo:active};
  d9gAudit_(ss,user,found?"ACTUALIZAR":"CREAR","COMISION_REGLA",id,{vendedor_id:sellerId,vendedor:d9gText_(seller.nombre||seller.usuario),marca:brand,porcentaje:rule.porcentaje,vigente_desde:from,vigente_hasta:to,activo:active});
  return {ok:true,regla:rule,message:"Comisión general de "+d9gText_(seller.nombre||seller.usuario)+" guardada."};
}

function d9gOperationCommissionInfo_(operation,orderMap,operationMap,visited){
  if(!operation)return {estado:"PENDIENTE",id:"",nombre:"Pendiente de definir"};
  const id=d9gText_(operation.operacion_id),seen=visited||{};if(id&&seen[id])return {estado:"PENDIENTE",id:"",nombre:"Pendiente de definir"};if(id)seen[id]=true;
  const explicit=d9gText_(operation.comision_estado).toUpperCase();if(explicit==="NO_APLICA")return {estado:"NO_APLICA",id:"__NO_COMMISSION__",nombre:"Venta directa / sin comisión"};
  let sellerId=d9gText_(operation.vendedor_id),sellerName=d9gText_(operation.vendedor);
  if(!sellerId){const reference=operationMap&&operationMap[d9gText_(operation.referencia_operacion_id)];if(reference){const inherited=d9gOperationCommissionInfo_(reference,orderMap,operationMap,seen);if(inherited.estado==="NO_APLICA")return inherited;if(inherited.id){sellerId=inherited.id;sellerName=inherited.nombre;}}}
  if(!sellerId){const order=orderMap&&orderMap[d9gText_(operation.origen_pedido_id)];if(order){sellerId=d9gText_(order.vendedor_id);sellerName=d9gText_(order.vendedor);}}
  return sellerId?{estado:"APLICA",id:sellerId,nombre:sellerName||sellerId}:{estado:explicit||"PENDIENTE",id:"",nombre:"Pendiente de definir"};
}
function d9gOperationCommissionStatus_(operation){return d9gOperationCommissionInfo_(operation,null,null).estado;}
function d9gResolveOperationCommission_(user,data){
  d9gRequireAdmin_(user);const ss=d9gGestion_();d9gEnsureSheet_(ss,"operaciones",D9G_HEADERS.operaciones);const id=d9gText_(data.operacion_id),mode=d9gText_(data.modo).toUpperCase(),found=d9gFindRowById_(ss,"operaciones","operacion_id",id);if(!found||d9gText_(found.obj.tipo).toUpperCase()!=="REMITO"||d9gIsAnnulled_(found.obj.estado))throw new Error("El remito ya no está vigente.");if(d9gClosedCommissionForDate_(ss,found.obj.fecha))throw new Error("Ese comprobante pertenece a un cierre de comisiones.");
  let seller={id:"",nombre:"Venta directa / sin comisión"},status="NO_APLICA";if(mode==="ASIGNAR"){seller=d9gResolveActiveSeller_(d9gSource_(),d9gText_(data.vendedor_id),"");if(!seller.id)throw new Error("Elegí el vendedor.");status="APLICA";}else if(mode!=="NO_APLICA")throw new Error("Elegí asignar un vendedor o marcar la venta sin comisión.");
  const sh=ss.getSheetByName("operaciones"),headers=d9gHeaders_(sh),values={vendedor_id:seller.id,vendedor:seller.nombre,comision_estado:status,comision_motivo:d9gText_(data.motivo),updated_at:d9gNow_()};Object.keys(values).forEach(key=>sh.getRange(found.row,headers.indexOf(key)+1).setValue(values[key]));
  let linked=0;d9gReadObjects_(ss,"operaciones",false).filter(op=>d9gText_(op.tipo).toUpperCase()==="NOTA_CREDITO"&&d9gText_(op.referencia_operacion_id)===id&&!d9gIsAnnulled_(op.estado)).forEach(op=>{const credit=d9gFindRowById_(ss,"operaciones","operacion_id",op.operacion_id);if(!credit)return;Object.keys(values).forEach(key=>sh.getRange(credit.row,headers.indexOf(key)+1).setValue(values[key]));linked++});
  d9gAudit_(ss,user,"RESOLVER","COMISION_OPERACION",id,{numero:found.obj.numero,modo:status,vendedor_id:seller.id,vendedor:seller.nombre,motivo:values.comision_motivo,notas_credito_vinculadas:linked});return {ok:true,operacion_id:id,vendedor_id:seller.id,vendedor:seller.nombre,comision_estado:status,comision_motivo:values.comision_motivo,message:status==="NO_APLICA"?"Venta marcada como directa y sin comisión.":"Vendedor asignado al comprobante."};
}

function d9gCommissionCalculation_(ss,from,to){
  const sourceForScope=d9gSource_(),testIds=d9gTestClientIds_(sourceForScope),refs=d9gTestReferences_(sourceForScope,ss,testIds);
  const operations=d9gReadObjects_(ss,"operaciones",false).filter(op=>!d9gTestIsRow_(op,testIds,refs)).filter(op=>{const type=d9gText_(op.tipo).toUpperCase(),date=d9gDateCell_(op.fecha),creditType=d9gText_(op.credito_tipo).toUpperCase();return ["REMITO","NOTA_CREDITO"].includes(type)&&creditType!=="CREDITO_GENERAL"&&!d9gIsAnnulled_(op.estado)&&date>=from&&date<=to;});
  const allOperations=d9gReadObjects_(ss,"operaciones",false),operationMap={};allOperations.forEach(op=>operationMap[d9gText_(op.operacion_id)]=op);
  const allItems=d9gReadObjects_(ss,"operacion_items",false),itemsByOperation={};allItems.forEach(item=>{const id=d9gText_(item.operacion_id);(itemsByOperation[id]||(itemsByOperation[id]=[])).push(item)});
  const rules=d9gReadObjects_(ss,"comisiones_reglas",false),source=d9gSource_(),sourceProducts=d9gReadObjects_(source,"productos",false),sourceOrders=d9gReadSourceOrders_(source,0),orderMap={},brands={};sourceProducts.forEach(p=>brands[d9gText_(p.id)]=d9gText_(p.marca));sourceOrders.forEach(order=>orderMap[d9gText_(order.pedido_id)]=order);
  const lines=[],missing=[];let sales=0,credits=0;
  operations.forEach(op=>{
    const type=d9gText_(op.tipo).toUpperCase(),sign=type==="NOTA_CREDITO"?-1:1,opId=d9gText_(op.operacion_id),commissionInfo=d9gOperationCommissionInfo_(op,orderMap,operationMap),commissionStatus=commissionInfo.estado,sellerId=commissionInfo.id,sellerName=commissionInfo.nombre,date=d9gDateCell_(op.fecha),reference=operationMap[d9gText_(op.referencia_operacion_id)],referenceItems=reference?(itemsByOperation[d9gText_(reference.operacion_id)]||[]):[];
    if(sign>0)sales=d9gRound_(sales+d9gNumber_(op.total));else credits=d9gRound_(credits+d9gNumber_(op.total));
    const opItems=itemsByOperation[opId]||[],discount=d9gNumber_(op.descuento_pct),fallbackItems=opItems.length?opItems:[{producto_id:"",producto:"Total del comprobante",subtotal:op.total,comision_base:op.total,marca:"GENERAL"}];
    fallbackItems.forEach((item,index)=>{
      const productId=d9gText_(item.producto_id),brand=d9gText_(item.marca)||brands[productId]||"GENERAL",original=referenceItems.find(x=>d9gText_(x.producto_id)===productId)||{},storedPct=d9gText_(item.comision_porcentaje),originalPct=d9gText_(original.comision_porcentaje),lookupDate=reference?d9gDateCell_(reference.fecha):date;
      const rule=commissionStatus==="NO_APLICA"?{regla_id:"NO_APLICA",porcentaje:0}:(storedPct!==""?{regla_id:d9gText_(item.comision_regla_id),porcentaje:d9gNumber_(storedPct)}:(originalPct!==""?{regla_id:d9gText_(original.comision_regla_id),porcentaje:d9gNumber_(originalPct)}:d9gCommissionRuleAt_(rules,sellerId,brand,lookupDate)));
      let base=d9gText_(item.comision_base)!==""?d9gNumber_(item.comision_base):d9gRound_(d9gNumber_(item.subtotal)*(1-discount/100));if(index===fallbackItems.length-1){const prior=fallbackItems.slice(0,index).reduce((sum,previous)=>sum+(d9gText_(previous.comision_base)!==""?d9gNumber_(previous.comision_base):d9gRound_(d9gNumber_(previous.subtotal)*(1-discount/100))),0);base=d9gRound_(d9gNumber_(op.total)-prior);}
      if(commissionStatus==="PENDIENTE"||!sellerId||!rule){missing.push({operacion_id:opId,numero:d9gText_(op.numero),vendedor_id:sellerId,vendedor:sellerName,producto_id:productId,producto:d9gText_(item.producto),motivo:commissionStatus==="PENDIENTE"?"PENDIENTE":"SIN_REGLA"});return;}
      const signedBase=d9gRound_(base*sign),commission=d9gRound_(signedBase*d9gNumber_(rule.porcentaje)/100);
      lines.push({vendedor_id:sellerId,vendedor:sellerName,fecha:date,operacion_id:opId,tipo:type,numero:d9gText_(op.numero),cliente:d9gText_(op.cliente),referencia_operacion_id:d9gText_(op.referencia_operacion_id),referencia_numero:d9gText_(op.referencia_numero),producto_id:productId,producto:d9gText_(item.producto),marca:brand,base:signedBase,regla_id:d9gText_(rule.regla_id),porcentaje:d9gNumber_(rule.porcentaje),comision:commission});
    });
  });
  return {lines:lines,missing:missing,ventas_brutas:d9gRound_(sales),notas_credito:d9gRound_(credits),base_neta:d9gRound_(sales-credits),comision_total:d9gRound_(lines.reduce((sum,line)=>sum+line.comision,0))};
}

function d9gCloseCommissions_(user,data){
  d9gRequireAdmin_(user);if(d9gTestScope_(user,data)==="TEST")throw new Error("Los cierres de comisiones TEST no se registran como cierres comerciales.");const ss=d9gGestion_(),from=d9gISODate_(data.desde),to=d9gISODate_(data.hasta);if(from>to)throw new Error("La fecha desde no puede ser posterior a la fecha hasta.");if(to>d9gToday_())throw new Error("No se puede cerrar un período que todavía no terminó.");
  const overlap=d9gReadObjects_(ss,"comisiones_cierres",false).find(row=>d9gText_(row.estado).toUpperCase()==="CERRADO"&&d9gDateCell_(row.desde)<=to&&d9gDateCell_(row.hasta)>=from);if(overlap)throw new Error("El período se superpone con un cierre existente del "+d9gDateCell_(overlap.desde)+" al "+d9gDateCell_(overlap.hasta)+".");
  const calculation=d9gCommissionCalculation_(ss,from,to);if(!calculation.lines.length&&!calculation.missing.length)throw new Error("No hay remitos ni notas de crédito para cerrar en ese período.");if(calculation.missing.length){const names=[...new Set(calculation.missing.map(item=>item.vendedor||item.vendedor_id||"Sin vendedor"))];throw new Error("No se puede cerrar: faltan reglas de comisión para "+names.join(", ")+".");}
  const id="CC-"+Utilities.getUuid(),now=d9gNow_();d9gAppend_(ss,"comisiones_cierres",[[id,from,to,"CERRADO",calculation.ventas_brutas,calculation.notas_credito,calculation.base_neta,calculation.comision_total,now,user.id,user.nombre]]);
  d9gAppend_(ss,"comisiones_detalle",calculation.lines.map(line=>["CD-"+Utilities.getUuid(),id,line.vendedor_id,line.vendedor,line.fecha,line.operacion_id,line.tipo,line.numero,line.cliente,line.referencia_operacion_id,line.referencia_numero,line.producto_id,line.producto,line.marca,line.base,line.regla_id,line.porcentaje,line.comision]));
  d9gAudit_(ss,user,"CERRAR","COMISIONES",id,{desde:from,hasta:to,ventas_brutas:calculation.ventas_brutas,notas_credito:calculation.notas_credito,base_neta:calculation.base_neta,comision_total:calculation.comision_total,lineas:calculation.lines.length});return {ok:true,cierre:{cierre_id:id,desde:from,hasta:to,estado:"CERRADO",ventas_brutas:calculation.ventas_brutas,notas_credito:calculation.notas_credito,base_neta:calculation.base_neta,comision_total:calculation.comision_total,cerrado_at:now,cerrado_por_id:user.id,cerrado_por:user.nombre},detalle:calculation.lines,message:"Período de comisiones cerrado."};
}

// ─── USUARIOS CENTRALES Y PERMISOS DE GESTIÓN ─────────────────────
const D9G_SOURCE_USER_EXTRA_HEADERS=Object.freeze(["rol_gestion","permiso_comprobantes","alcance_clientes"]);
function d9gEnsureSourceUserColumns_(source){
  const sh=source.getSheetByName("usuarios");if(!sh)throw new Error("No existe la hoja usuarios en D9_pedidos.");
  const headers=d9gHeaders_(sh),missing=D9G_SOURCE_USER_EXTRA_HEADERS.filter(key=>headers.indexOf(key)<0);
  if(missing.length)sh.getRange(1,sh.getLastColumn()+1,1,missing.length).setValues([missing]);
  const currentHeaders=d9gHeaders_(sh),scopeCol=currentHeaders.indexOf("alcance_clientes"),roleCol=currentHeaders.indexOf("rol");
  if(scopeCol>=0&&roleCol>=0&&sh.getLastRow()>1){
    const count=sh.getLastRow()-1,roles=sh.getRange(2,roleCol+1,count,1).getValues(),scopeRange=sh.getRange(2,scopeCol+1,count,1),scopes=scopeRange.getValues();let changed=false;
    scopes.forEach((row,index)=>{if(!d9gText_(row[0])){row[0]=d9gDefaultClientScope_(roles[index][0]);changed=true;}});
    if(changed)scopeRange.setValues(scopes);
  }
  return missing;
}
function d9gNormalizeGestionRole_(value){
  const role=d9gText_(value).toLowerCase().replace(/[áàä]/g,"a").replace(/\s+/g,"_");
  if(["super_admin","superadmin"].includes(role))return "super_admin";
  if(["admin","administrador"].includes(role))return "admin";
  if(["vendedor","operador"].includes(role))return "vendedor";
  return "sin_acceso";
}
function d9gNextSourceUserId_(rows){
  const numbers=rows.map(row=>Number(d9gText_(row.id).replace(/\D+/g,""))).filter(value=>isFinite(value)&&value>0);
  return d9gText_(numbers.length?Math.max.apply(null,numbers)+1:1);
}
function d9gSourceSaveUser_(user,data){
  d9gRequireSourceWrites_(user);
  const source=d9gSource_(),addedHeaders=d9gEnsureSourceUserColumns_(source),sh=source.getSheetByName("usuarios"),incoming=data.usuario||{},isNew=data.nuevo===true;
  const headers=d9gHeaders_(sh),idCol=headers.indexOf("id"),usernameCol=headers.indexOf("usuario");
  if(idCol<0||usernameCol<0)throw new Error("La hoja usuarios debe tener las columnas id y usuario.");
  const rows=d9gReadObjects_(source,"usuarios",false),id=isNew?d9gNextSourceUserId_(rows):d9gText_(incoming.id),username=d9gText_(incoming.usuario).toLowerCase(),name=d9gText_(incoming.nombre);
  if(!id||!username||!name)throw new Error("Usuario y nombre son obligatorios.");
  if(id.length>60||username.length>80||name.length>160)throw new Error("El ID, usuario o nombre es demasiado largo.");
  if(rows.some(row=>d9gText_(row.usuario).toLowerCase()===username&&d9gText_(row.id)!==id))throw new Error("Ya existe otro usuario con ese nombre de acceso.");
  const found=d9gFindRowById_(source,"usuarios","id",id);if(isNew&&found)throw new Error("El ID propuesto ya existe. Volvé a intentar.");if(!isNew&&!found)throw new Error("El usuario ya no existe.");
  const current=found?found.obj:{},password=d9gText_(incoming.clave),role=d9gText_(incoming.rol||current.rol||"vendedor").toLowerCase();
  if(!["vendedor","mostrador","cliente","admin"].includes(role))throw new Error("El rol de D9 Pedidos no es válido.");
  if(isNew&&!password)throw new Error("Ingresá una clave para el usuario nuevo.");
  let gestionRole=d9gNormalizeGestionRole_(incoming.rol_gestion),canIssue=d9gIsActive_(incoming.permiso_comprobantes)||["admin","super_admin"].includes(gestionRole);
  if(canIssue&&gestionRole==="sin_acceso")gestionRole="vendedor";
  if(d9gText_(user.id)===id&&(!d9gIsActive_(incoming.activo)||!["admin","super_admin"].includes(gestionRole)))throw new Error("No podés desactivar tu propio usuario ni quitarte el acceso administrativo.");
  const requestedScope=d9gText_(incoming.alcance_clientes||current.alcance_clientes).toUpperCase(),clientScope=["PROPIOS","TODOS"].includes(requestedScope)?requestedScope:d9gDefaultClientScope_(role);
  const normalized={id:id,usuario:username,nombre:name,rol:role,wasap_report:d9gText_(incoming.wasap_report),cliente_id:role==="cliente"?d9gText_(incoming.cliente_id):"",color_1:d9gNormalizeColor_(incoming.color_1||current.color_1,"#DDEEFF"),color_2:d9gNormalizeColor_(incoming.color_2||current.color_2,"#FFFFFF"),activo:d9gIsActive_(incoming.activo)?"si":"no",rol_gestion:gestionRole,permiso_comprobantes:canIssue?"si":"no",alcance_clientes:clientScope};
  if(password)normalized.clave=password;
  const row=found?sh.getRange(found.row,1,1,headers.length).getValues()[0]:new Array(headers.length).fill("");
  Object.keys(normalized).forEach(key=>{const index=headers.indexOf(key);if(index>=0)row[index]=normalized[key]});
  if(found){
    // Sólo escribe las columnas administradas. Las auxiliares y sus fórmulas
    // permanecen intactas aunque Pedidos o Admin agreguen campos en el futuro.
    Object.keys(normalized).forEach(key=>{const index=headers.indexOf(key);if(index>=0)sh.getRange(found.row,index+1).setValue(row[index])});
  }else sh.appendRow(row);
  const publicUser=d9gPublicUser_(normalized);d9gAudit_(d9gGestion_(),user,isNew?"CREAR":"ACTUALIZAR","USUARIO_FUENTE",id,{columnas_agregadas:addedHeaders,usuario:username,nombre:name,rol:role,rol_gestion:gestionRole,permiso_comprobantes:normalized.permiso_comprobantes,alcance_clientes:normalized.alcance_clientes,activo:normalized.activo});
  return {ok:true,usuario:publicUser,message:isNew?"Usuario creado en la Sheet central.":"Usuario actualizado en la Sheet central."};
}
function d9gNormalizeColor_(value,fallback){const color=d9gText_(value);return /^#[0-9a-f]{6}$/i.test(color)?color.toUpperCase():fallback;}

// ─── ADMINISTRACIÓN DE CLIENTES EN LA SHEET CENTRAL ─────────────────

const D9G_SOURCE_CLIENT_EXTRA_HEADERS = Object.freeze([
  "vendedor_id","vendedor",
  "razon_social","tipo_documento","numero_documento","cuit","condicion_iva",
  "domicilio_fiscal","localidad_fiscal","provincia_fiscal","codigo_postal","email_facturacion"
]);

function d9gEnsureSourceClientColumns_(source) {
  const sh=source.getSheetByName("clientes");
  if(!sh)throw new Error("No existe la hoja clientes en D9_pedidos.");
  const headers=d9gHeaders_(sh),missing=D9G_SOURCE_CLIENT_EXTRA_HEADERS.filter(key=>headers.indexOf(key)<0);
  if(missing.length)sh.getRange(1,sh.getLastColumn()+1,1,missing.length).setValues([missing]);
  return missing;
}

function d9gClientDuplicateCandidate_(clients,incoming){
  const name=d9gMatchText_(incoming.nombre),phone=d9gDigits_(incoming.telefono),address=d9gMatchText_(incoming.direccion),city=d9gMatchText_(incoming.ciudad),document=d9gDigits_(incoming.numero_documento||incoming.cuit),matches=[];
  (clients||[]).forEach(client=>{
    if(!d9gIsActive_(client.activo)||d9gText_(client.id)===d9gText_(incoming.id))return;
    const sameName=!!name&&d9gMatchText_(client.nombre)===name,samePhone=!!phone&&d9gDigits_(client.telefono)===phone,sameAddress=!!address&&d9gMatchText_(client.direccion)===address,sameCity=!!city&&d9gMatchText_(client.ciudad)===city,sameDocument=!!document&&d9gDigits_(client.numero_documento||client.cuit)===document;
    let level="",reason="";if(sameDocument){level="FUERTE";reason="mismo documento";}else if(sameName&&samePhone){level="FUERTE";reason="mismo nombre y teléfono";}else if(sameName&&sameAddress&&(!city||sameCity)){level="FUERTE";reason="mismo nombre y domicilio";}else if(samePhone){level="POSIBLE";reason="mismo teléfono";}else if(sameName){level="POSIBLE";reason="mismo nombre";}
    if(level)matches.push({nivel:level,motivo:reason,cliente:{id:d9gText_(client.id),nombre:d9gText_(client.nombre),telefono:d9gText_(client.telefono),direccion:d9gText_(client.direccion),ciudad:d9gText_(client.ciudad),vendedor_id:d9gText_(client.vendedor_id),vendedor:d9gText_(client.vendedor)}});
  });
  return matches.sort((a,b)=>a.nivel===b.nivel?0:(a.nivel==="FUERTE"?-1:1))[0]||null;
}

function d9gSourceSaveClient_(user,data) {
  d9gRequireSourceWrites_(user);
  const source=d9gSource_(),addedHeaders=d9gEnsureSourceClientColumns_(source),sh=source.getSheetByName("clientes");
  const incoming=data.cliente||{},id=d9gText_(incoming.id),name=d9gText_(incoming.nombre),isNew=data.nuevo===true;
  if(!id||!name)throw new Error("ID y nombre comercial son obligatorios.");
  if(id.length>60||name.length>180)throw new Error("El ID o el nombre son demasiado largos.");
  const headers=d9gHeaders_(sh),idCol=headers.indexOf("id");
  if(idCol<0)throw new Error("La hoja clientes no tiene columna id.");
  const priceList=d9gText_(incoming.lista_precio||"lista_1").toLowerCase(),validLists=d9gSourcePriceLists_(source).map(list=>list.id);
  if(!validLists.includes(priceList))throw new Error("La lista de precios asignada no existe en productos.");
  const seller=d9gResolveActiveSeller_(source,d9gText_(incoming.vendedor_id),d9gText_(incoming.vendedor));
  const documentType=d9gText_(incoming.tipo_documento).toUpperCase(),documentNumber=d9gText_(incoming.numero_documento);
  const documentTypes=["","CUIT","CUIL","CDI","DNI","PASAPORTE","OTRO"];
  if(!documentTypes.includes(documentType))throw new Error("El tipo de documento no es válido.");
  const vatCondition=d9gText_(incoming.condicion_iva).toUpperCase();
  const vatConditions=["","RESPONSABLE_INSCRIPTO","MONOTRIBUTO","EXENTO","CONSUMIDOR_FINAL","NO_CATEGORIZADO","MONOTRIBUTO_SOCIAL"];
  if(!vatConditions.includes(vatCondition))throw new Error("La condición frente al IVA no es válida.");
  const email=d9gText_(incoming.email_facturacion);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("El email de facturación no es válido.");
  const lastRow=sh.getLastRow(),rows=lastRow>1?sh.getRange(2,1,lastRow-1,sh.getLastColumn()).getValues():[];
  let rowIndex=rows.findIndex(row=>d9gText_(row[idCol])===id),created=rowIndex<0;
  if(isNew&&!created)throw new Error("Ya existe un cliente con el ID "+id+".");
  if(!isNew&&created)throw new Error("El cliente ya no existe. Sincronizá y volvé a intentar.");
  if(isNew){const candidate=d9gClientDuplicateCandidate_(d9gReadObjects_(source,"clientes",false),incoming);if(candidate&&(!data.confirmar_distinto||candidate.nivel==="FUERTE"))return {ok:true,requiere_confirmacion:true,cliente_existente:true,coincidencia:candidate};}
  if(created){rows.push(new Array(headers.length).fill(""));rowIndex=rows.length-1;}
  const before={};headers.forEach((header,index)=>{if(header)before[header]=rows[rowIndex][index]});
  const allowed=["id","nombre","telefono","direccion","ciudad","lista_precio","activo"].concat(D9G_SOURCE_CLIENT_EXTRA_HEADERS);
  const normalized={
    id:id,nombre:name,telefono:d9gText_(incoming.telefono),direccion:d9gText_(incoming.direccion),ciudad:d9gText_(incoming.ciudad),
    lista_precio:priceList,activo:d9gIsActive_(incoming.activo)?"si":"no",vendedor_id:seller.id,vendedor:seller.nombre,razon_social:d9gText_(incoming.razon_social),
    tipo_documento:documentType,numero_documento:documentNumber,cuit:documentType==="CUIT"?d9gDigits_(documentNumber):"",
    condicion_iva:vatCondition,domicilio_fiscal:d9gText_(incoming.domicilio_fiscal),localidad_fiscal:d9gText_(incoming.localidad_fiscal),
    provincia_fiscal:d9gText_(incoming.provincia_fiscal),codigo_postal:d9gText_(incoming.codigo_postal),email_facturacion:email
  };
  allowed.forEach(key=>{const col=headers.indexOf(key);if(col>=0)rows[rowIndex][col]=normalized[key]===undefined?"":normalized[key]});
  if(created)sh.getRange(rowIndex+2,1,1,headers.length).setValues([rows[rowIndex]]);
  else allowed.forEach(key=>{const col=headers.indexOf(key);if(col>=0)sh.getRange(rowIndex+2,col+1).setValue(rows[rowIndex][col])});
  const after={};headers.forEach((header,index)=>{if(header)after[header]=rows[rowIndex][index]});
  d9gAudit_(d9gGestion_(),user,created?"CREAR":"ACTUALIZAR","CLIENTE_FUENTE",id,{columnas_agregadas:addedHeaders,antes:before,despues:after});
  return {ok:true,id:id,created:created,columns_added:addedHeaders,message:created?"Cliente creado.":"Cliente actualizado."};
}

const D9G_CLIENT_FISCAL_HEADERS = Object.freeze([
  "razon_social","tipo_documento","numero_documento","cuit","condicion_iva",
  "domicilio_fiscal","localidad_fiscal","provincia_fiscal","codigo_postal","email_facturacion"
]);

function d9gNormalizeImportedFiscal_(raw){
  const incoming=raw||{},documentType=d9gText_(incoming.tipo_documento).toUpperCase(),documentNumber=d9gDigits_(incoming.numero_documento);
  if(!["","CUIT","CUIL","CDI","DNI","PASAPORTE","OTRO"].includes(documentType))throw new Error("El PDF contiene un tipo de documento no válido.");
  if((documentType==="CUIT"||documentType==="CUIL")&&!d9gValidCuit_(documentNumber))throw new Error("El PDF contiene un CUIT/CUIL inválido.");
  if(documentType==="DNI"&&(documentNumber.length<7||documentNumber.length>9))throw new Error("El PDF contiene un DNI inválido.");
  const vat=d9gText_(incoming.condicion_iva).toUpperCase();
  if(!["RESPONSABLE_INSCRIPTO","MONOTRIBUTO","EXENTO","CONSUMIDOR_FINAL","NO_CATEGORIZADO","MONOTRIBUTO_SOCIAL"].includes(vat))throw new Error("El PDF contiene una condición de IVA no válida.");
  if(vat!=="CONSUMIDOR_FINAL"&&!documentNumber)throw new Error("Hay un cliente fiscal sin CUIT o documento.");
  const email=d9gText_(incoming.email_facturacion);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Hay un email de facturación no válido.");
  const normalized={
    razon_social:d9gText_(incoming.razon_social),tipo_documento:documentType,numero_documento:documentNumber,
    cuit:documentType==="CUIT"?documentNumber:"",condicion_iva:vat,domicilio_fiscal:d9gText_(incoming.domicilio_fiscal),
    localidad_fiscal:d9gText_(incoming.localidad_fiscal),provincia_fiscal:d9gText_(incoming.provincia_fiscal),
    codigo_postal:d9gText_(incoming.codigo_postal),email_facturacion:email
  };
  if(!normalized.razon_social)throw new Error("Hay un registro sin razón social.");
  ["razon_social","domicilio_fiscal"].forEach(key=>{if(normalized[key].length>220)throw new Error("Hay un dato fiscal demasiado largo.")});
  ["localidad_fiscal","provincia_fiscal"].forEach(key=>{if(normalized[key].length>120)throw new Error("Hay una localidad o provincia demasiado larga.")});
  return normalized;
}

function d9gFiscalSnapshotFromRow_(headers,row){const out={};D9G_CLIENT_FISCAL_HEADERS.forEach(key=>{const col=headers.indexOf(key);out[key]=col>=0?d9gText_(row[col]):""});return out;}
function d9gSameFiscalSnapshot_(left,right){return D9G_CLIENT_FISCAL_HEADERS.every(key=>d9gText_(left&&left[key])===d9gText_(right&&right[key]));}
function d9gWriteImportedFiscalRows_(sh,headers,values,rowIndexes){
  const indexes=[...new Set(rowIndexes)].sort((a,b)=>a-b);if(!indexes.length)return;
  const columns=D9G_CLIENT_FISCAL_HEADERS.map(key=>headers.indexOf(key)),first=Math.min.apply(null,columns),last=Math.max.apply(null,columns),contiguous=columns.every((col,index)=>col===first+index);
  if(contiguous){
    const groups=[];indexes.forEach(index=>{const group=groups[groups.length-1];if(group&&index===group[group.length-1]+1)group.push(index);else groups.push([index])});
    groups.forEach(group=>sh.getRange(group[0]+2,first+1,group.length,last-first+1).setValues(group.map(index=>values[index].slice(first,last+1))));return;
  }
  columns.forEach(col=>sh.getRange(2,col+1,values.length,1).setValues(values.map(row=>[row[col]])));
}

function d9gSourceImportClients_(user,data){
  d9gRequireSourceWrites_(user);const request=data.importacion||{},updates=Array.isArray(request.actualizaciones)?request.actualizaciones:[],creates=Array.isArray(request.altas)?request.altas:[];
  if(!updates.length&&!creates.length)throw new Error("La importación no contiene cambios.");
  if(updates.length+creates.length>500)throw new Error("La importación supera el límite de 500 clientes.");
  const file=request.archivo||{},fileName=d9gText_(file.nombre).slice(0,180),fileHash=d9gText_(file.sha256).slice(0,180);if(!fileName||!fileHash)throw new Error("Falta identificar el archivo importado.");
  const source=d9gSource_(),addedHeaders=d9gEnsureSourceClientColumns_(source),sh=source.getSheetByName("clientes"),headers=d9gHeaders_(sh),idCol=headers.indexOf("id"),nameCol=headers.indexOf("nombre");
  if(idCol<0||nameCol<0)throw new Error("La hoja clientes no tiene columnas id y nombre.");
  const originalCount=Math.max(0,sh.getLastRow()-1),originalValues=originalCount?sh.getRange(2,1,originalCount,sh.getLastColumn()).getValues():[],values=originalValues.map(row=>row.slice()),rowById={};
  values.forEach((row,index)=>{const id=d9gText_(row[idCol]);if(!id)return;if(rowById[id]!==undefined)throw new Error("La Sheet central repite el ID "+id+". Corregilo antes de importar.");rowById[id]=index;});
  const usedTargets={},changedIndexes=[],applied=[],unchanged=[];
  updates.forEach(item=>{
    const id=d9gText_(item.cliente_id);if(!id||rowById[id]===undefined)throw new Error("El cliente "+id+" ya no existe. Sincronizá y analizá el PDF otra vez.");
    if(usedTargets[id])throw new Error("La importación intenta usar dos registros del PDF sobre el cliente "+id+".");usedTargets[id]=true;
    const index=rowById[id],row=values[index],expectedName=d9gText_(item.expected_nombre);if(d9gText_(row[nameCol])!==expectedName)throw new Error("El nombre del cliente "+id+" cambió después del análisis. Volvé a cargar el PDF.");
    const currentFiscal=d9gFiscalSnapshotFromRow_(headers,row);if(!d9gSameFiscalSnapshot_(currentFiscal,item.expected_fiscal||{}))throw new Error("Los datos fiscales de "+expectedName+" cambiaron después del análisis. Volvé a cargar el PDF.");
    const fiscal=d9gNormalizeImportedFiscal_(item.fiscal);if(d9gSameFiscalSnapshot_(currentFiscal,fiscal)){unchanged.push(id);return;}
    D9G_CLIENT_FISCAL_HEADERS.forEach(key=>row[headers.indexOf(key)]=fiscal[key]);changedIndexes.push(index);applied.push({cliente_id:id,origen_codigo:d9gText_(item.origen_codigo),decision:d9gText_(item.decision)||"REVISADO"});
  });
  const validLists=d9gSourcePriceLists_(source).map(list=>list.id),newRows=[];
  creates.forEach(item=>{
    const incoming=item.cliente||{},id=d9gText_(incoming.id),name=d9gText_(incoming.nombre);if(!id||!name)throw new Error("Hay un alta sin ID o nombre.");if(rowById[id]!==undefined)throw new Error("El ID "+id+" ya existe. Volvé a analizar el PDF.");if(usedTargets[id])throw new Error("El ID "+id+" está repetido dentro de la importación.");usedTargets[id]=true;
    const list=d9gText_(incoming.lista_precio||"lista_1").toLowerCase();if(!validLists.includes(list))throw new Error("La lista de precios para "+name+" no existe.");
    const seller=d9gResolveActiveSeller_(source,d9gText_(incoming.vendedor_id),d9gText_(incoming.vendedor)),fiscal=d9gNormalizeImportedFiscal_(incoming),row=new Array(headers.length).fill("");
    const base={id:id,nombre:name,telefono:d9gText_(incoming.telefono),direccion:d9gText_(incoming.direccion),ciudad:d9gText_(incoming.ciudad),lista_precio:list,activo:d9gIsActive_(incoming.activo)?"si":"no",vendedor_id:seller.id,vendedor:seller.nombre};
    Object.keys(base).forEach(key=>{const col=headers.indexOf(key);if(col>=0)row[col]=base[key]});D9G_CLIENT_FISCAL_HEADERS.forEach(key=>row[headers.indexOf(key)]=fiscal[key]);newRows.push(row);applied.push({cliente_id:id,origen_codigo:d9gText_(item.origen_codigo),decision:"REVISADO_CREAR"});rowById[id]=values.length+newRows.length-1;
  });
  try{
    d9gWriteImportedFiscalRows_(sh,headers,values,changedIndexes);
    if(newRows.length)sh.getRange(sh.getLastRow()+1,1,newRows.length,headers.length).setValues(newRows);
  }catch(writeError){
    try{d9gWriteImportedFiscalRows_(sh,headers,originalValues,changedIndexes);}catch(_rollback){}
    throw new Error("No se pudo completar el lote; se restauraron los datos anteriores. "+String(writeError&&writeError.message||writeError));
  }
  const pendingCount=Math.max(0,d9gNumber_(request.pendientes)),omittedCount=Math.max(0,d9gNumber_(request.omitidos));
  let auditWarning=false;try{d9gAudit_(d9gGestion_(),user,"IMPORTAR_PDF","CLIENTES_FUENTE",fileHash,{archivo:fileName,sha256:fileHash,filas:d9gNumber_(file.filas),actualizados:changedIndexes.length,creados:newRows.length,sin_cambios:unchanged.length,omitidos:omittedCount,pendientes:pendingCount,columnas_agregadas:addedHeaders,decisiones:applied.slice(0,180)});}catch(_audit){auditWarning=true;}
  const changed=changedIndexes.length+newRows.length,parts=[];if(changedIndexes.length)parts.push(changedIndexes.length+" cliente"+(changedIndexes.length===1?" actualizado":"s actualizados"));if(newRows.length)parts.push(newRows.length+" cliente"+(newRows.length===1?" creado":"s creados"));
  const message=(changed?parts.join(" y ")+"."+(unchanged.length?` ${unchanged.length} ya estaban al día.`:""):`No había datos nuevos: ${unchanged.length} cliente${unchanged.length===1?"":"s"} ya ${unchanged.length===1?"estaba":"estaban"} al día.`)+(pendingCount?` ${pendingCount} caso${pendingCount===1?" quedó":"s quedaron"} pendiente${pendingCount===1?"":"s"} para después.`:"");
  return {ok:true,actualizados:changedIndexes.length,creados:newRows.length,sin_cambios:unchanged.length,omitidos:omittedCount,pendientes:pendingCount,audit_warning:auditWarning,message:message+(auditWarning?" La importación se aplicó, pero no pudo registrarse en la auditoría.":"")};
}

function d9gResolveActiveSeller_(source,id,name){
  const sellers=d9gReadObjects_(source,"usuarios",false).filter(u=>d9gIsActive_(u.activo));
  if(!id&&!name)return {id:"",nombre:""};
  const found=sellers.find(u=>d9gText_(u.id)===id)||(name?sellers.find(u=>d9gText_(u.nombre).toLowerCase()===name.toLowerCase()):null);
  if(!found)throw new Error("El vendedor seleccionado no existe o está inactivo.");
  return {id:d9gText_(found.id),nombre:d9gText_(found.nombre||found.usuario)};
}

function d9gSourceSellerSuggestions_(user){
  d9gRequireAdmin_(user);const source=d9gSource_(),sellerIds={},sellerNames={};
  d9gReadObjects_(source,"usuarios",false).filter(u=>d9gIsActive_(u.activo)).forEach(u=>{const seller={id:d9gText_(u.id),nombre:d9gText_(u.nombre||u.usuario)};sellerIds[seller.id]=seller;sellerNames[d9gMatchText_(seller.nombre)]=seller;});
  const allowedIds=d9gTestClientIds_(source),clients=d9gReadObjects_(source,"clientes",false).filter(c=>!d9gTestIsClient_(allowedIds,c.id)),clientsById={},clientsByName={};
  clients.forEach(client=>{const id=d9gText_(client.id),name=d9gMatchText_(client.nombre);if(!id)return;if(!clientsById[id])clientsById[id]=[];clientsById[id].push(client);if(name){if(!clientsByName[name])clientsByName[name]=[];clientsByName[name].push(client);}});
  const stats={filas:0,pedidos:0,por_id:0,por_nombre:0,ambiguos:0,sin_cliente:0,sin_vendedor:0},seenOrders={},counts={};
  d9gReadObjects_(source,"pedidos",true).forEach(row=>{
    if(d9gTestIsClient_(allowedIds,row.cliente_id))return;
    stats.filas++;const orderId=d9gText_(row.pedido_id||row["id_comp."]||row.id_comp_||row.id_comp||row.id_pedido);if(!orderId||d9gIsAnnulled_(row.estado))return;
    const seller=sellerIds[d9gText_(row.vendedor_id)]||sellerNames[d9gMatchText_(row.vendedor)];if(!seller){stats.sin_vendedor++;return;}
    const rawClientId=d9gText_(row.cliente_id),byId=rawClientId&&clientsById[rawClientId]||[];let client=null,matchKind="";
    if(byId.length===1){client=byId[0];matchKind="id";}
    else if(byId.length>1){stats.ambiguos++;return;}
    else {
      const parts=d9gText_(row.cliente).split("|").map(d9gText_).filter(Boolean),name=d9gMatchText_(parts[0]),byName=name&&clientsByName[name]||[];
      if(byName.length===1){client=byName[0];matchKind="nombre";}
      else if(byName.length>1){const clues=parts.slice(1).map(d9gMatchText_).filter(Boolean),matched=clues.length?byName.filter(candidate=>d9gClientMatchesClues_(candidate,clues)):[];if(matched.length===1){client=matched[0];matchKind="nombre";}else{stats.ambiguos++;return;}}
    }
    if(!client){stats.sin_cliente++;return;}
    const uniqueOrder=d9gText_(client.id)+"|"+orderId;if(!seenOrders[uniqueOrder]){seenOrders[uniqueOrder]=true;stats.pedidos++;stats[matchKind==="id"?"por_id":"por_nombre"]++;}
    const key=d9gText_(client.id)+"|"+seller.id;if(!counts[key])counts[key]={cliente_id:d9gText_(client.id),vendedor_id:seller.id,vendedor:seller.nombre,orders:{}};counts[key].orders[orderId]=true;
  });
  const best={};Object.keys(counts).forEach(key=>{const item=counts[key],quantity=Object.keys(item.orders).length,current=best[item.cliente_id];if(!current||quantity>current.pedidos)best[item.cliente_id]={cliente_id:item.cliente_id,vendedor_id:item.vendedor_id,vendedor:item.vendedor,pedidos:quantity};});
  const suggestions=Object.keys(best).map(id=>best[id]);stats.sugerencias=suggestions.length;return {ok:true,suggestions:suggestions,stats:stats};
}

function d9gMatchText_(value){return d9gText_(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function d9gClientMatchesClues_(client,clues){const metadata=d9gMatchText_([client.direccion,client.ciudad,client.localidad,client.telefono].filter(Boolean).join(" "));return !!clues.length&&clues.every(clue=>clue.split(" ").filter(Boolean).every(token=>metadata.indexOf(token)>=0));}

function d9gSourceAssignClientSellers_(user,data){
  d9gRequireSourceWrites_(user);const incoming=Array.isArray(data.asignaciones)?data.asignaciones:[];if(!incoming.length)throw new Error("No hay asignaciones para guardar.");if(incoming.length>700)throw new Error("Hay demasiadas asignaciones en una sola operación.");
  const source=d9gSource_(),addedHeaders=d9gEnsureSourceClientColumns_(source),sh=source.getSheetByName("clientes"),headers=d9gHeaders_(sh),idCol=headers.indexOf("id"),sellerIdCol=headers.indexOf("vendedor_id"),sellerNameCol=headers.indexOf("vendedor");
  const sellerMap={};d9gReadObjects_(source,"usuarios",false).filter(u=>d9gIsActive_(u.activo)).forEach(u=>sellerMap[d9gText_(u.id)]={id:d9gText_(u.id),nombre:d9gText_(u.nombre||u.usuario)});
  const requested={};incoming.forEach(item=>{const clientId=d9gText_(item.cliente_id),sellerId=d9gText_(item.vendedor_id);if(!clientId)throw new Error("Hay una asignación sin cliente.");if(sellerId&&!sellerMap[sellerId])throw new Error("Uno de los vendedores ya no está activo.");d9gTestAssertClient_(source,user,data,clientId);requested[clientId]=sellerId;});
  const rowCount=Math.max(0,sh.getLastRow()-1),values=rowCount?sh.getRange(2,1,rowCount,sh.getLastColumn()).getValues():[],changed=[];values.forEach(row=>{const clientId=d9gText_(row[idCol]);if(!Object.prototype.hasOwnProperty.call(requested,clientId))return;const seller=sellerMap[requested[clientId]]||{id:"",nombre:""};row[sellerIdCol]=seller.id;row[sellerNameCol]=seller.nombre;changed.push({cliente_id:clientId,vendedor_id:seller.id,vendedor:seller.nombre});});
  if(changed.length){sh.getRange(2,sellerIdCol+1,rowCount,1).setValues(values.map(row=>[row[sellerIdCol]]));sh.getRange(2,sellerNameCol+1,rowCount,1).setValues(values.map(row=>[row[sellerNameCol]]));}
  d9gAudit_(d9gGestion_(),user,"ASIGNAR_MASIVO","VENDEDORES_CLIENTES",d9gNow_(),{cantidad:changed.length,columnas_agregadas:addedHeaders,cambios:changed.slice(0,300)});return {ok:true,actualizados:changed.length,asignaciones:changed,message:changed.length+" clientes actualizados."};
}

function d9gClientDeleteImpact_(id){
  const source=d9gSource_(),gestion=d9gGestion_(),found=d9gFindRowById_(source,"clientes","id",id);
  if(!found)throw new Error("El cliente ya no existe. Sincronizá y volvé a intentar.");
  const orderIds={};d9gReadObjects_(source,"pedidos",true).forEach(row=>{if(d9gText_(row.cliente_id)===id){const orderId=d9gText_(row.pedido_id||row["id_comp."]||row.id_comp_||row.id_comp||row.id_pedido);if(orderId)orderIds[orderId]=true;}});
  const operationIds={};d9gReadObjects_(gestion,"operaciones",true).forEach(row=>{if(d9gText_(row.cliente_id)===id&& !d9gIsAnnulled_(row.estado)){const operationId=d9gText_(row.operacion_id);if(operationId)operationIds[operationId]=true;}});
  const receiptIds={};d9gReadObjects_(gestion,"recibos",true).forEach(row=>{if(d9gText_(row.cliente_id)===id&& !d9gIsAnnulled_(row.estado)){const receiptId=d9gText_(row.recibo_id);if(receiptId)receiptIds[receiptId]=true;}});
  const movementCount=d9gReadObjects_(gestion,"movimientos",true).filter(row=>d9gText_(row.cliente_id)===id&&!d9gIsAnnulled_(row.estado)).length;
  const operations=Object.keys(operationIds).length,receipts=Object.keys(receiptIds).length;
  return {ok:true,id:id,nombre:d9gText_(found.obj.nombre),pedidos:Object.keys(orderIds).length,operaciones:operations,recibos:receipts,movimientos:movementCount,blocked:operations>0||receipts>0||movementCount>0};
}

function d9gSourceClientDeleteImpact_(user,data){d9gRequireSourceWrites_(user);const id=d9gText_(data.cliente_id);if(!id)throw new Error("No se indicó el cliente.");d9gTestAssertClient_(d9gSource_(),user,data,id);return d9gClientDeleteImpact_(id);}

function d9gSourceDeleteClient_(user,data){
  d9gRequireSourceWrites_(user);const id=d9gText_(data.cliente_id);if(!id)throw new Error("No se indicó el cliente.");d9gTestAssertClient_(d9gSource_(),user,data,id);
  const impact=d9gClientDeleteImpact_(id);if(impact.blocked)throw new Error("Este cliente ya tiene comprobantes o movimientos de cuenta corriente. No se puede eliminar: primero hay que fusionar su historial.");
  const source=d9gSource_(),found=d9gFindRowById_(source,"clientes","id",id),sh=source.getSheetByName("clientes");
  sh.deleteRow(found.row);d9gAudit_(d9gGestion_(),user,"ELIMINAR","CLIENTE_FUENTE",id,{nombre:impact.nombre,pedidos_historicos:impact.pedidos});
  return {ok:true,id:id,pedidos:impact.pedidos,message:"Cliente eliminado definitivamente."};
}

function d9gDigits_(value){return d9gText_(value).replace(/\D/g,"");}
function d9gValidCuit_(value){
  const digits=d9gDigits_(value);if(digits.length!==11)return false;
  const weights=[5,4,3,2,7,6,5,4,3,2];let sum=0;
  for(let i=0;i<10;i++)sum+=Number(digits.charAt(i))*weights[i];
  let check=11-(sum%11);if(check===11)check=0;else if(check===10)check=9;
  return check===Number(digits.charAt(10));
}

// ─── ADMINISTRACIÓN DE PRODUCTOS EN LA SHEET CENTRAL ────────────────

function d9gSourcePriceLists_(ss) {
  const sh=ss.getSheetByName("productos");
  if(!sh)return [];
  return d9gHeaders_(sh)
    .filter(h=>/^lista_\d+$/.test(h))
    .sort((a,b)=>Number(a.split("_")[1])-Number(b.split("_")[1]))
    .map(id=>({id:id,nombre:"Lista "+Number(id.split("_")[1])}));
}

function d9gSourceSaveProduct_(user,data) {
  d9gRequireSourceWrites_(user);
  const source=d9gSource_(),sh=source.getSheetByName("productos");
  if(!sh)throw new Error("No existe la hoja productos en D9_pedidos.");
  const mode=d9gText_(data.modo).toUpperCase();
  if(!["CREAR","EDITAR"].includes(mode))throw new Error("Actualizá D9 Gestión antes de guardar productos: falta distinguir alta de edición.");
  const incoming=data.producto||{},id=d9gText_(incoming.id),name=d9gText_(incoming.nombre);
  if(!id||!name)throw new Error("Código y descripción son obligatorios.");
  if(id.length>60||name.length>180)throw new Error("El código o la descripción son demasiado largos.");
  const headers=d9gHeaders_(sh),idCol=headers.indexOf("id");
  if(idCol<0)throw new Error("La hoja productos no tiene columna id.");
  const priceLists=headers.filter(h=>/^lista_\d+$/.test(h));
  if(!priceLists.length)throw new Error("No encontré columnas de listas de precios.");
  const rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues():[];
  const matches=rows.map((row,index)=>d9gText_(row[idCol])===id?index:-1).filter(index=>index>=0);
  if(matches.length>1)throw new Error("El código "+id+" aparece más de una vez en la hoja. Revisalo antes de guardar.");
  if(mode==="CREAR"&&matches.length)throw new Error("Ya existe un producto con el código "+id+". Usá Editar para modificarlo; no se cambió ninguna celda.");
  if(mode==="EDITAR"&&!matches.length)throw new Error("El producto "+id+" ya no existe. Actualizá la lista antes de editarlo.");
  let rowIndex=matches.length?matches[0]:rows.length,created=mode==="CREAR";
  if(created){rows.push(new Array(headers.length).fill(""));rowIndex=rows.length-1;}
  const allowed=["id","nombre","categoria","marca","activo"].concat(priceLists);
  allowed.forEach(key=>{
    const col=headers.indexOf(key);if(col<0||incoming[key]===undefined)return;
    if(/^lista_\d+$/.test(key))rows[rowIndex][col]=d9gPriceValue_(incoming[key]);
    else if(key==="activo")rows[rowIndex][col]=d9gIsActive_(incoming[key])?"si":"no";
    else rows[rowIndex][col]=d9gText_(incoming[key]);
  });
  if(created){
    sh.getRange(rowIndex+2,1,1,headers.length).setValues([rows[rowIndex]]);
  }else{
    // En una edición individual solo se tocan los campos administrados.
    // Así se preservan fórmulas o columnas auxiliares que Gestión no conoce.
    allowed.forEach(key=>{
      const col=headers.indexOf(key);
      if(col>=0&&incoming[key]!==undefined)sh.getRange(rowIndex+2,col+1).setValue(rows[rowIndex][col]);
    });
  }
  const log=d9gProductLog_(d9gGestion_(),user,"MODIFICACION_INDIVIDUAL",id,name,created?"Producto creado":"Producto modificado",{creado:created});
  return {ok:true,id:id,created:created,log:log,message:created?"Producto creado.":"Producto actualizado."};
}

function d9gSourceBulkPrices_(user,data) {
  d9gRequireSourceWrites_(user);
  const changes=Array.isArray(data.cambios)?data.cambios:[];
  if(!changes.length)throw new Error("No llegaron cambios de precios.");
  if(changes.length>5000)throw new Error("La actualización supera el máximo de 5000 productos.");
  const source=d9gSource_(),sh=source.getSheetByName("productos");
  if(!sh)throw new Error("No existe la hoja productos.");
  const headers=d9gHeaders_(sh),idCol=headers.indexOf("id");
  if(idCol<0)throw new Error("La hoja productos no tiene columna id.");
  const lastRow=sh.getLastRow();if(lastRow<2)throw new Error("La hoja productos está vacía.");
  const values=sh.getRange(2,1,lastRow-1,sh.getLastColumn()).getValues(),index={};
  values.forEach((row,i)=>{const id=d9gText_(row[idCol]);if(id)index[id]=i});
  const conflicts=[],applied=[],touchedColumns={};
  changes.forEach(raw=>{
    const id=d9gText_(raw.id),field=d9gText_(raw.lista);
    if(!/^lista_\d+$/.test(field)||headers.indexOf(field)<0)throw new Error("Lista de precios inválida: "+field);
    if(index[id]===undefined)throw new Error("No se encontró el producto "+id+".");
    const col=headers.indexOf(field),current=d9gNumber_(values[index[id]][col]),expected=d9gNumber_(raw.anterior),next=d9gPriceValue_(raw.nuevo);
    if(Math.abs(current-expected)>.011){conflicts.push({id:id,esperado:expected,actual:current});return;}
    values[index[id]][col]=next;touchedColumns[col]=true;applied.push({id:id,lista:field,anterior:current,nuevo:next});
  });
  if(conflicts.length)throw new Error("Algunos precios cambiaron después de la vista previa. Actualizá los datos y volvé a intentar.");
  // Escribe solo las columnas de precios realmente afectadas. Nunca regraba
  // la tabla completa ni pisa columnas de descripción, marca o auxiliares.
  Object.keys(touchedColumns).map(Number).forEach(col=>{
    sh.getRange(2,col+1,values.length,1).setValues(values.map(row=>[row[col]]));
  });
  const touchedLists=Object.keys(applied.reduce((out,item)=>{out[item.lista]=true;return out},{})),listNames=touchedLists.map(list=>"Lista "+Number(list.split("_")[1])).join(", "),detail=applied.length+" precios actualizados"+(listNames?" · "+listNames:"");
  const log=d9gProductLog_(d9gGestion_(),user,"ACTUALIZACION_MASIVA","","",detail,{cantidad:applied.length,listas:touchedLists});
  return {ok:true,actualizados:applied.length,log:log};
}

function d9gSourceImportProducts_(user,data) {
  d9gRequireSourceWrites_(user);
  if(!data.operacion_id)data.operacion_id="CAT-"+Utilities.getUuid();
  const prior=d9gCatalogExisting_(data.operacion_id,user,"IMPORTACION");if(prior)return prior;
  const incoming=Array.isArray(data.productos)?data.productos:[],requestedLists=Array.isArray(data.listas)?data.listas.map(d9gText_):[];
  if(!incoming.length)throw new Error("No llegaron productos para importar.");
  if(incoming.length>5000)throw new Error("La importación supera el máximo de 5000 productos.");
  const source=d9gSource_(),sh=source.getSheetByName("productos");
  if(!sh)throw new Error("No existe la hoja productos en D9_pedidos.");
  const headers=d9gHeaders_(sh),required=["id","nombre","categoria","activo","lista_1"];
  required.forEach(header=>{if(headers.indexOf(header)<0)throw new Error("La hoja productos no tiene columna "+header+".")});
  const availableLists=headers.filter(header=>/^lista_\d+$/.test(header));
  const lists=requestedLists.filter((list,index,array)=>array.indexOf(list)===index);
  if(lists.indexOf("lista_1")<0)throw new Error("La importación debe incluir Lista 1.");
  lists.forEach(list=>{if(!/^lista_[123]$/.test(list)||availableLists.indexOf(list)<0)throw new Error("Lista de precios inválida o inexistente: "+list)});
  const lastRow=sh.getLastRow(),values=lastRow>1?sh.getRange(2,1,lastRow-1,sh.getLastColumn()).getValues():[],idCol=headers.indexOf("id"),index={},duplicateSheet=[];
  values.forEach((row,rowIndex)=>{const id=d9gText_(row[idCol]);if(!id)return;if(index[id]!==undefined)duplicateSheet.push(id);else index[id]=rowIndex});
  if(duplicateSheet.length)throw new Error("La hoja productos contiene códigos duplicados: "+duplicateSheet.slice(0,10).join(", ")+".");
  const normalized=[],seen={};
  incoming.forEach((raw,position)=>{
    const id=d9gText_(raw.id),name=d9gText_(raw.nombre),category=d9gText_(raw.categoria);
    if(!id||!name||!category)throw new Error("Fila "+(position+2)+": Código, Descripción y Rubro/Categoría son obligatorios.");
    if(id.length>60||name.length>180)throw new Error("Fila "+(position+2)+": código o descripción demasiado largos.");
    if(seen[id])throw new Error("El archivo contiene el código duplicado "+id+".");seen[id]=true;
    const product={id:id,nombre:name,categoria:category};
    if(Object.prototype.hasOwnProperty.call(raw,"marca"))product.marca=d9gText_(raw.marca);
    lists.forEach(list=>{product[list]=d9gImportPriceValue_(raw[list],id,list)});
    product.lista_1=d9gNumber_(product.lista_1)>0?product.lista_1:0;product.activo=d9gNumber_(product.lista_1)>0?"si":"no";normalized.push(product);
  });
  const original=d9gCatalogCapture_(),originalById={};original.rows.forEach(row=>{originalById[d9gText_(row[idCol])]=row});
  const incomingIds={};normalized.forEach(product=>{incomingIds[product.id]=true});
  let created=0,updated=0,hiddenAbsent=0;
  normalized.forEach(product=>{
    let rowIndex=index[product.id];
    if(rowIndex===undefined){values.push(new Array(headers.length).fill(""));rowIndex=values.length-1;index[product.id]=rowIndex;created++;}else updated++;
    ["id","nombre","categoria","activo"].concat(lists).forEach(key=>{values[rowIndex][headers.indexOf(key)]=product[key]});
    if(Object.prototype.hasOwnProperty.call(product,"marca")&&headers.indexOf("marca")>=0)values[rowIndex][headers.indexOf("marca")]=product.marca;
  });
  values.forEach(row=>{
    const id=d9gText_(row[idCol]);if(!id||incomingIds[id])return;
    const activeCol=headers.indexOf("activo"),list1Col=headers.indexOf("lista_1");
    if(d9gIsActive_(row[activeCol])||d9gNumber_(row[list1Col])!==0)hiddenAbsent++;
    row[activeCol]="no";row[list1Col]=0;
  });
  const changed=normalized.filter(product=>index[product.id]!==undefined&&!!originalById[product.id]&&["nombre","categoria","activo"].concat(lists).concat(Object.prototype.hasOwnProperty.call(product,"marca")&&headers.indexOf("marca")>=0?["marca"]:[]).some(key=>d9gCatalogValue_(key,originalById[product.id][headers.indexOf(key)])!==d9gCatalogValue_(key,product[key]))).length;
  const active=normalized.filter(product=>d9gIsActive_(product.activo)).length;
  const result={recibidos:normalized.length,creados:created,actualizados:updated,con_cambios:changed,sin_cambios:updated-changed,activos:active,ocultos_por_precio:normalized.length-active,ocultos_ausentes:hiddenAbsent,listas:lists};
  const target=Object.assign({},original,{rows:values.map((row,i)=>row.map((v,j)=>{const h=headers[j],managed=["id","nombre","categoria","activo"].concat(lists).includes(h)||(h==="marca"&&normalized.some(p=>Object.prototype.hasOwnProperty.call(p,"marca")));return managed?v:(original.rows[i]?.[j]??v)}))});
  if(d9gCatalogHash_(target)===d9gCatalogHash_(original)){d9gCatalogSave_(user,"DESTINO_IMPORTACION",target,data,"APLICADA","",result);d9gCatalogPrune_();return Object.assign({ok:true,sin_modificaciones:true},result);}
  target.columnas=["id","nombre","categoria","activo"].concat(lists).concat(headers.includes("marca")&&normalized.some(p=>Object.prototype.hasOwnProperty.call(p,"marca"))?["marca"]:[]);
  return d9gCatalogExecute_(user,data,"IMPORTACION",original,target,result);

}

function d9gImportPriceValue_(value,id,list){
  if(value===""||value===null||value===undefined)return "";
  if(typeof value!=="number"||!isFinite(value)||value<0)throw new Error("Precio inválido para "+id+" en "+list+".");
  return d9gRound_(value);
}

function d9gPriceValue_(value){
  if(value===""||value===null||value===undefined)return "";
  const n=d9gNumber_(value);if(n<0)throw new Error("Los precios no pueden ser negativos.");
  return d9gRound_(n);
}

function d9gOperationBalance_(ss,id){const ref=d9gFinancialReference_(ss,id);return d9gRound_(d9gReadObjects_(ss,"movimientos",true).filter(m=>d9gText_(m.operacion_id)===ref&&!d9gIsAnnulled_(m.estado)).reduce((s,m)=>s+d9gNumber_(m.debe)-d9gNumber_(m.haber),0));}
function d9gAddMovement_(ss,x){d9gAppend_(ss,"movimientos",[["MV-"+Utilities.getUuid(),x.fecha,x.cliente_id,x.cliente,x.tipo,x.documento_tipo,x.documento_id,x.documento_numero,x.operacion_id||"",d9gRound_(x.debe),d9gRound_(x.haber),"VIGENTE",x.usuario.id,x.usuario.nombre,x.detalle||"",d9gNow_()]]);}
function d9gProductLog_(ss,user,type,productId,product,detail,extra){
  const id="AU-"+Utilities.getUuid(),timestamp=d9gNow_(),payload=Object.assign({},extra||{},{producto:d9gText_(product),detalle:d9gText_(detail)});
  d9gAppend_(ss,"auditoria",[[id,timestamp,user.id,user.nombre,type,"PRODUCTOS",d9gText_(productId),JSON.stringify(payload).slice(0,3000)]]);
  return {auditoria_id:id,fecha:timestamp,usuario_id:d9gText_(user.id),usuario:d9gText_(user.nombre),tipo:type,producto_id:d9gText_(productId),producto:d9gText_(product),detalle:d9gText_(detail)};
}
function d9gProductLogs_(ss){
  const allowed={CATALOGO_PREPARADO:true,CATALOGO_APLICADO:true,RESTAURACION_LISTA:true,IMPORTACION_PREPARADA:true,RESTAURACION_PREPARADA:true,IMPORTACION_LISTA:true,ACTUALIZACION_MASIVA:true,MODIFICACION_INDIVIDUAL:true};
  return d9gReadObjects_(ss,"auditoria",false).filter(row=>allowed[d9gText_(row.accion).toUpperCase()]&&d9gText_(row.entidad).toUpperCase()==="PRODUCTOS").map(row=>{
    let detail={};try{detail=JSON.parse(d9gText_(row.detalle)||"{}")}catch(_){}
    const rawDate=row.timestamp,textDate=d9gText_(rawDate),parsedDate=rawDate instanceof Date?rawDate:d9gParseSourceDate_(rawDate),timestamp=/^\d{4}-\d{2}-\d{2}/.test(textDate)?textDate:(parsedDate?Utilities.formatDate(parsedDate,D9G.TZ,"yyyy-MM-dd HH:mm:ss"):textDate);
    return {auditoria_id:d9gText_(row.auditoria_id),fecha:timestamp,usuario_id:d9gText_(row.usuario_id),usuario:d9gText_(row.usuario),tipo:d9gText_(row.accion).toUpperCase(),producto_id:d9gText_(row.entidad_id),producto:d9gText_(detail.producto),detalle:d9gText_(detail.detalle)};
  }).sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,100);
}
function d9gAudit_(ss,user,action,entity,id,detail){d9gAppend_(ss,"auditoria",[["AU-"+Utilities.getUuid(),d9gNow_(),user.id,user.nombre,action,entity,id,JSON.stringify(detail||{}).slice(0,3000)]]);}

function d9gNextNumber_(ss,type,prefix) {
  const found=d9gFindRowById_(ss,"contadores","tipo",type),sh=ss.getSheetByName("contadores");let n=1,row;
  if(found){n=d9gNumber_(found.obj.ultimo)+1;row=found.row;sh.getRange(row,2).setValue(n);if(prefix)sh.getRange(row,3).setValue(prefix);}else{sh.appendRow([type,n,prefix]);}
  return {value:n,numero:(prefix||"")+"-"+String(n).padStart(8,"0")};
}
function d9gOperationNumbering_(type){
  const map={REMITO:{counter:"OPERACION_REMITO",prefix:"R"},PROFORMA:{counter:"OPERACION_PROFORMA",prefix:"FPF"},NOTA_VENTA:{counter:"OPERACION_NOTA_VENTA",prefix:"NDV"},NOTA_CREDITO:{counter:"OPERACION_NOTA_CREDITO",prefix:"NC"}};
  return map[d9gText_(type).toUpperCase()]||{counter:"OPERACION_OTRO",prefix:"CP"};
}
function d9gEnsureOperationCounter_(ss,operationType,counterType,prefix){
  const found=d9gFindRowById_(ss,"contadores","tipo",counterType);
  if(found&&d9gNumber_(found.obj.ultimo)>0)return;
  let maximum=0;
  d9gReadObjects_(ss,"operaciones",true).filter(o=>d9gText_(o.tipo).toUpperCase()===d9gText_(operationType).toUpperCase()&&(d9gText_(counterType).startsWith("TEST_")?d9gText_(o.numero).startsWith("TEST-"):!d9gText_(o.numero).startsWith("TEST-"))).forEach(o=>{
    const match=d9gText_(o.numero).match(/(\d+)\s*$/);if(match)maximum=Math.max(maximum,Number(match[1])||0);
  });
  const sh=ss.getSheetByName("contadores");if(found){if(d9gNumber_(found.obj.ultimo)<maximum)sh.getRange(found.row,2,1,2).setValues([[maximum,prefix]]);return;}
  sh.appendRow([counterType,maximum,prefix]);
}
function d9gFindById_(ss,sheet,key,id){const found=d9gFindRowById_(ss,sheet,key,id);return found&&found.obj;}
function d9gFindRowById_(ss,sheet,key,id){const rows=d9gReadObjects_(ss,sheet,true);for(let i=0;i<rows.length;i++)if(d9gText_(rows[i][key])===d9gText_(id))return {obj:rows[i],row:i+2};return null;}

function d9gSource_(){const id=PropertiesService.getScriptProperties().getProperty("SOURCE_SHEET_ID")||D9G.SOURCE_SHEET_ID_DEFAULT;return SpreadsheetApp.openById(id);}
function d9gGestion_(){const id=PropertiesService.getScriptProperties().getProperty("GESTION_SHEET_ID");if(!id)throw new Error("Falta ejecutar setupD9Gestion.");return SpreadsheetApp.openById(id);}
function d9gEnsureSheet_(ss,name,headers){
  let sh=ss.getSheetByName(name),created=false;if(!sh){sh=ss.insertSheet(name);created=true;}
  const current=!created&&sh.getLastColumn()>0?sh.getRange(1,1,1,Math.max(headers.length,sh.getLastColumn())).getDisplayValues()[0].slice(0,headers.length):[];
  if(created||headers.some((header,index)=>d9gHeader_(current[index])!==d9gHeader_(header)))sh.getRange(1,1,1,headers.length).setValues([headers]);
  if(sh.getFrozenRows()!==1)sh.setFrozenRows(1);return sh;
}
function d9gAppend_(ss,name,rows){if(!rows||!rows.length)return;const sh=d9gEnsureSheet_(ss,name,D9G_HEADERS[name]),start=sh.getLastRow()+1;sh.getRange(start,1,rows.length,D9G_HEADERS[name].length).setValues(rows);}
function d9gHeaders_(sh){return sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getDisplayValues()[0].map(d9gHeader_);}
function d9gReadObjects_(ss,name,display){const sh=ss.getSheetByName(name);if(!sh||sh.getLastRow()<2)return[];const values=(display?sh.getDataRange().getDisplayValues():sh.getDataRange().getValues()),headers=values[0].map(d9gHeader_);return values.slice(1).filter(r=>r.some(v=>v!==""&&v!==null)).map(r=>{const o={};headers.forEach((h,i)=>{if(h)o[h]=r[i]});return o;});}
function d9gReadKeyValue_(ss,name){const out={};d9gReadObjects_(ss,name,true).forEach(r=>{if(r.clave)out[d9gText_(r.clave)]=r.valor});return out;}
function d9gHeader_(v){return d9gText_(v).toLowerCase().replace(/\s+/g,"_");}
function d9gText_(v){return String(v===null||v===undefined?"":v).trim();}
function d9gNumber_(v){if(typeof v==="number")return Number.isFinite(v)?v:0;let s=d9gText_(v).replace(/\s/g,"").replace(/\$/g,"");if(s.includes(",")&&s.includes("."))s=s.replace(/\./g,"").replace(",",".");else if(s.includes(","))s=s.replace(",",".");const n=Number(s);return Number.isFinite(n)?n:0;}
function d9gRound_(v){return Math.round((Number(v)||0)*100)/100;}
function d9gIsActive_(v){return v===true||["true","si","sí","1","activo","yes"].includes(d9gText_(v).toLowerCase());}
function d9gIsAnnulled_(v){return d9gText_(v).toLowerCase().indexOf("anulad")>=0;}
function d9gNow_(){return Utilities.formatDate(new Date(),D9G.TZ,"yyyy-MM-dd HH:mm:ss");}
function d9gToday_(){return Utilities.formatDate(new Date(),D9G.TZ,"yyyy-MM-dd");}
function d9gISODate_(v){const s=d9gText_(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error("Fecha inválida.");return s;}
function d9gParseSourceDate_(v){if(v instanceof Date)return v;const s=d9gText_(v),m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);if(!m)return null;return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4]||0),Number(m[5]||0),Number(m[6]||0));}
function d9gParseBody_(e){const raw=e&&e.postData&&e.postData.contents||"";if(!raw)return e&&e.parameter||{};try{return JSON.parse(raw);}catch(_){const p=e&&e.parameter&&e.parameter.payload;try{return p?JSON.parse(p):{};}catch(__){return{};}}}
function d9gJson_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}

// API financiera limitada a mostrador. El token es de Pedidos y se verifica
// contra su backend; nunca se convierte en una sesión administrativa de Gestión.
const D9G_PEDIDOS_API_DEFAULT="https://script.google.com/macros/s/AKfycbwg8YQ7lqtLFbxnmtHnM3TxHaCaVoHQ_7AJHKPhiQRyrX6OyqO004F2pSABjI5df3yI/exec";
function d9gMostradorUser_(token){
  const url=PropertiesService.getScriptProperties().getProperty("PEDIDOS_API_URL")||D9G_PEDIDOS_API_DEFAULT;
  const response=UrlFetchApp.fetch(url,{method:"post",contentType:"text/plain;charset=utf-8",payload:JSON.stringify({action:"session",token:token}),muteHttpExceptions:true});
  let verified;try{verified=JSON.parse(response.getContentText());}catch(_){throw new Error("No se pudo validar la sesión de Pedidos.");}
  if(!verified.ok||!verified.user)throw new Error(verified.error||"Ingresá nuevamente en Pedidos.");
  const user=d9gReadObjects_(d9gSource_(),"usuarios",false).find(u=>d9gText_(u.id)===d9gText_(verified.user.id)&&d9gIsActive_(u.activo));
  if(!user||d9gText_(user.rol).toLowerCase()!=="mostrador")throw new Error("Esta función requiere un usuario mostrador activo.");
  return d9gPublicUser_(user);
}
function d9gMostradorClient_(user,id){
  const source=d9gSource_(),client=d9gReadObjects_(source,"clientes",false).find(c=>d9gText_(c.id)===d9gText_(id)&&d9gIsActive_(c.activo));
  if(!client)throw new Error("El cliente no está activo.");
  const owner=d9gText_(client.vendedor_id),same=owner?owner===d9gText_(user.id):d9gMatchText_(client.vendedor)===d9gMatchText_(user.nombre);
  if(d9gClientScope_(user)!=="TODOS"&&!same&&!d9gHasAdditionalClientAccess_(source,user.id,client.id))throw new Error("El cliente no pertenece a tu cartera autorizada.");return client;
}
function d9gMostradorRequest_(action,data){
  if(!["mostrador_cuenta","mostrador_venta","mostrador_cobro","mostrador_estado","mostrador_reconciliar"].includes(action))throw new Error("Acción de mostrador no válida.");
  const user=d9gMostradorUser_(data.token),lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const ss=d9gGestion_();
    d9gReconcileDocumentIntents_(ss);
    if(action==="mostrador_estado"||action==="mostrador_reconciliar"){
      const found=d9gFindById_(ss,"finanzas_intenciones","intencion_id",d9gText_(data.intencion_id));
      if(!found)return {ok:true,exists:false};
      if(d9gText_(found.usuario_id)!==d9gText_(user.id))throw new Error("La intención pertenece a otro usuario.");
      if(!d9gText_(found.cliente_id)){
        const saved=JSON.parse(found.plan);
        if(found.tipo!=="VENTA"||saved.request?.ocasional!==true||saved.request.medio_pago!=="EFECTIVO"||d9gText_(saved.request.cliente_id))throw new Error("La intención no tiene un cliente válido.");
      }else d9gMostradorClient_(user,found.cliente_id);
      if(action==="mostrador_reconciliar")return d9gFinanceApply_(ss,found);
      const plan=JSON.parse(found.plan);return {ok:true,exists:true,confirmed:found.estado==="CONFIRMADA",intencion_id:found.intencion_id,result:found.estado==="CONFIRMADA"?plan.result:null};
    }
    const occasional=action==="mostrador_venta"&&data.cliente_ocasional===true;
    const client=occasional?{id:"",nombre:d9gText_(data.cliente),telefono:d9gText_(data.telefono),direccion:d9gText_(data.direccion),ocasional:true}:d9gMostradorClient_(user,data.cliente_id);
    if(action==="mostrador_cuenta"){d9gFinanceAssertReady_(ss,client.id,"");return {ok:true,cuenta:d9gFinanceAccount_(ss,client)};}
    return d9gFinancePrepare_(ss,user,client,data,action==="mostrador_venta"?"VENTA":"COBRO");
  }finally{lock.releaseLock();}
}
function d9gFinanceAccount_(ss,client){
  const all=d9gReadObjects_(ss,"movimientos",false).filter(m=>d9gText_(m.cliente_id)===d9gText_(client.id)&&!d9gIsAnnulled_(m.estado)).sort((a,b)=>d9gDateCell_(a.fecha).localeCompare(d9gDateCell_(b.fecha))||d9gText_(a.created_at).localeCompare(d9gText_(b.created_at)));
  let balance=0;const debts={};all.forEach(m=>{balance=d9gRound_(balance+d9gNumber_(m.debe)-d9gNumber_(m.haber));m.saldo=balance;const ref=d9gText_(m.operacion_id);if(ref){if(!debts[ref])debts[ref]={id:ref,numero:d9gText_(m.documento_numero),tipo:d9gText_(m.documento_tipo),saldo:0};debts[ref].saldo=d9gRound_(debts[ref].saldo+d9gNumber_(m.debe)-d9gNumber_(m.haber));}});
  return {cliente:{id:d9gText_(client.id),nombre:d9gText_(client.nombre),telefono:d9gText_(client.telefono)},saldo:balance,movimientos:all.slice(-20).reverse(),aplicaciones:Object.keys(debts).map(id=>debts[id]).filter(d=>d.saldo>.005),timestamp:d9gNow_()};
}
function d9gFinanceAssertReady_(ss,clientId,currentId){
  const pending=d9gReadObjects_(ss,"finanzas_intenciones",false).find(x=>d9gText_(x.cliente_id)===d9gText_(clientId)&&x.estado!=="CONFIRMADA"&&d9gText_(x.intencion_id)!==currentId);
  if(pending)throw new Error("Hay una operación financiera pendiente de verificar para este cliente: "+pending.intencion_id+". Verificá su resultado antes de continuar.");
  const documentPending=d9gReadObjects_(ss,"comprobantes_intenciones",false).find(x=>d9gText_(x.cliente_id)===d9gText_(clientId)&&!["COMPLETA","CANCELADA"].includes(d9gText_(x.estado))&&d9gText_(x.intencion_id)!==currentId);
  if(documentPending)throw new Error("Hay un comprobante pendiente de verificar para este cliente: "+documentPending.intencion_id+". Recuperá su resultado antes de continuar.");
}
function d9gFinanceRequest_(data,type){
  const method=d9gText_(data.medio_pago).toUpperCase();if(!["EFECTIVO","TRANSFERENCIA","CHEQUE",...(type==="VENTA"?["CUENTA_CORRIENTE"]:[])].includes(method))throw new Error("Elegí un medio/condición de pago válido.");
  const request={tipo:type,cliente_id:d9gText_(data.cliente_id),medio_pago:method,importe:type==="COBRO"?d9gRound_(d9gNumber_(data.importe)):0,aplicacion:d9gText_(data.aplicacion),referencia:d9gText_(data.referencia),cheque:method==="CHEQUE"?data.cheque||{}:null};
  if(type==="VENTA"){
    if(!Array.isArray(data.items)||!data.items.length)throw new Error("La Venta no tiene productos.");
    request.items=data.items.map(item=>{const quantity=d9gNumber_(item.cantidad),price=d9gNumber_(item.precio??item.precio_unitario);if(quantity<=0||price<0)throw new Error("Cantidad o precio inválido.");return {id_producto:d9gText_(item.id_producto||item.id),nombre:d9gText_(item.nombre),cantidad:quantity,precio:price,subtotal:d9gRound_(quantity*price)};});
    request.importe=d9gRound_(request.items.reduce((sum,item)=>sum+item.subtotal,0));
    if(Math.abs(request.importe-d9gNumber_(data.total??data.total_venta))>.01)throw new Error("El total no coincide con los productos.");
  }
  if(request.importe<=0)throw new Error("El importe debe ser mayor que cero.");
  if(data.cliente_ocasional===true){
    if(type!=="VENTA"||request.cliente_id||method!=="EFECTIVO"||!d9gText_(data.cliente)||d9gText_(data.cliente).length>120||d9gText_(data.telefono).length>40||d9gText_(data.direccion).length>250)throw new Error("El cliente ocasional sólo admite Venta totalmente cobrada en efectivo y sin cliente_id maestro.");
    if((data.condicion_pago&&d9gText_(data.condicion_pago).toUpperCase()!=="EFECTIVO")||["saldo","saldo_pendiente","pendiente"].some(key=>data[key]!==undefined&&Math.abs(d9gNumber_(data[key]))>.005)||["importe_pagado","importe_cobrado","pagado","importe"].some(key=>data[key]!==undefined&&Math.abs(d9gNumber_(data[key])-request.importe)>.005))throw new Error("El cliente ocasional no admite deuda ni cobro parcial. Creá una ficha real para otros medios.");
    for(const key of ["pagos","pagos_iniciales"]){if(data[key]!==undefined&&(!Array.isArray(data[key])||data[key].length!==1||d9gText_(data[key][0].medio).toUpperCase()!=="EFECTIVO"||Math.abs(d9gNumber_(data[key][0].importe)-request.importe)>.005))throw new Error("El cliente ocasional sólo admite un pago completo en efectivo.");}
    request.ocasional=true;request.cliente=d9gText_(data.cliente);request.telefono=d9gText_(data.telefono);request.direccion=d9gText_(data.direccion);
  }
  if(method!=="CUENTA_CORRIENTE")request.pagos=d9gNormalizePayments_([{medio:method,importe:request.importe,referencia:request.referencia,cheque:request.cheque}]);
  return request;
}
function d9gFinancePrepare_(ss,user,client,data,type){
  const id=d9gText_(type==="VENTA"?data.venta_id:data.intencion_id);
  if(!/^[A-Za-z0-9_-]{6,100}$/.test(id))throw new Error("Identificador de operación inválido.");
  const request=d9gFinanceRequest_(data,type),existing=d9gFindById_(ss,"finanzas_intenciones","intencion_id",id);
  if(existing){const plan=JSON.parse(existing.plan);if(d9gText_(existing.usuario_id)!==d9gText_(user.id)||JSON.stringify(plan.request)!==JSON.stringify(request))throw new Error("El identificador ya corresponde a otra operación. No se volvió a escribir.");return d9gFinanceApply_(ss,existing);}
  if(!request.ocasional)d9gFinanceAssertReady_(ss,client.id,id);
  const source=d9gSource_(),account=request.ocasional?{saldo:0,aplicaciones:[]}:d9gFinanceAccount_(ss,client),date=d9gToday_(),now=d9gNow_(),ref=type==="VENTA"?"VTA-"+id:request.aplicacion;
  if(type==="VENTA"){
    if(d9gReadObjects_(source,"ventas",false).some(s=>d9gText_(s.venta_id)===id))throw new Error("La Venta ya existe sin esta intención financiera. No se le asignó condición ni efecto retroactivo.");
    const products=d9gReadObjects_(source,"productos",false);request.items.forEach(i=>{if(!products.some(p=>d9gText_(p.id)===i.id_producto))throw new Error("Un producto ya no está disponible en el maestro.");});
  }else if(ref){const target=account.aplicaciones.find(x=>x.id===ref);if(!target||request.importe>target.saldo+.01)throw new Error("El cobro supera el saldo de la operación elegida. Elegí A cuenta para dejar crédito.");}
  const tables={recibos:[],pagos:[],cheques:[],movimientos:[]},result={intencion_id:id,venta_id:type==="VENTA"?id:"",cliente_id:d9gText_(client.id),cliente:d9gText_(client.nombre),telefono:d9gText_(client.telefono),fecha:now,usuario:user.nombre,medio_pago:request.medio_pago,importe:request.importe,saldo_anterior:account.saldo,saldo_actual:d9gRound_(account.saldo+(type==="VENTA"&&request.medio_pago==="CUENTA_CORRIENTE"?request.importe:type==="COBRO"?-request.importe:0)),cheque:request.cheque};if(request.ocasional)result.cliente_ocasional=true;
  if(request.pagos){
    const test=d9gTestIsClient_(d9gTestClientIds_(source),client.id),number=d9gNextNumber_(ss,test?"TEST_RECIBO":"RECIBO",test?"TEST-RC":"RC").numero,receiptId="RC-"+Utilities.getUuid(),rows=d9gReceiptRows_(user,{fecha:date,cliente_id:client.id,cliente:client.nombre,operacion_id:ref,operacion_numero:type==="VENTA"?id:(account.aplicaciones.find(a=>a.id===ref)?.numero||""),pagos:request.pagos,observaciones:(type==="VENTA"?"Cobro de Venta ":"Cobrado desde Mostrador · ")+id},number,receiptId,now);
    Object.keys(tables).forEach(key=>tables[key]=request.ocasional&&key==="movimientos"?[]:rows[key]);result.recibo_id=receiptId;result.numero=number;
  }
  if(type==="VENTA"&&!request.ocasional)tables.movimientos.unshift(["MV-"+Utilities.getUuid(),date,client.id,client.nombre,"VENTA","VENTA",id,id,ref,request.importe,0,"VIGENTE",user.id,user.nombre,"Desde Venta · "+id,now]);
  const plan={request,result,tables,user:{id:user.id,nombre:user.nombre},sourceRows:type==="VENTA"?request.items.map((i,index)=>[Utilities.formatDate(new Date(),D9G.TZ,"dd/MM/yyyy HH:mm:ss"),id,user.id,user.nombre,"mostrador",client.id,client.nombre,d9gText_(client.telefono),d9gText_(client.direccion),i.nombre,i.id_producto,i.cantidad,i.precio,i.subtotal,request.importe,request.medio_pago,id,index+1,...(request.ocasional?["si"]:[])]):[]};
  const serialized=JSON.stringify(plan);if(serialized.length>45000)throw new Error("La operación tiene demasiados productos para registrarse de forma segura.");
  d9gAppend_(ss,"finanzas_intenciones",[[id,user.id,client.id,type,"PREPARADA",serialized,now,now]]);
  return d9gFinanceApply_(ss,{intencion_id:id,usuario_id:user.id,cliente_id:client.id,tipo:type,estado:"PREPARADA",plan:serialized},true);
}
function d9gFinancePutRows_(ss,name,rows){
  if(!rows.length)return;const keys=new Set(d9gReadObjects_(ss,name,false).map(row=>d9gText_(row[D9G_HEADERS[name][0]]))),missing=rows.filter(row=>!keys.has(d9gText_(row[0])));if(missing.length)d9gAppend_(ss,name,missing);
}
function d9gFinanceApply_(ss,intention,fresh){
  const plan=JSON.parse(intention.plan);if(intention.estado==="CONFIRMADA")return Object.assign({ok:true,confirmed:true,duplicated:true},plan.result);
  // IDs y número de recibo se asignaron antes de cualquier escritura económica.
  if(plan.sourceRows.length){
    const source=d9gSource_(),headers=["fecha","venta_id","usuario_id","usuario","rol","cliente_id","cliente","telefono","direccion","producto","id_producto","cantidad","precio_unitario","subtotal","total_venta","medio_pago","finanzas_id","finanzas_item"];
    const sh=d9gEnsureSheet_(source,"ventas",plan.request.ocasional?headers.concat("cliente_ocasional"):headers),existing=d9gReadObjects_(source,"ventas",false).filter(row=>d9gText_(row.venta_id)===d9gText_(intention.intencion_id));
    if(existing.some(row=>d9gText_(row.finanzas_id)!==d9gText_(intention.intencion_id)))throw new Error("Existe una Venta incompatible con la intención financiera.");
    const seen=new Set(existing.map(row=>Number(row.finanzas_item))),missing=plan.sourceRows.filter(row=>!seen.has(row[17]));if(missing.length)sh.getRange(sh.getLastRow()+1,1,missing.length,headers.length+(plan.request.ocasional?1:0)).setValues(missing);
  }
  ["recibos","pagos","cheques","movimientos"].forEach(name=>{if(fresh){if(plan.tables[name].length)d9gAppend_(ss,name,plan.tables[name]);}else d9gFinancePutRows_(ss,name,plan.tables[name]);});
  const found=d9gFindRowById_(ss,"finanzas_intenciones","intencion_id",intention.intencion_id),sh=ss.getSheetByName("finanzas_intenciones");sh.getRange(found.row,5).setValue("CONFIRMADA");sh.getRange(found.row,8).setValue(d9gNow_());
  return Object.assign({ok:true,confirmed:true},plan.result);
}
function d9gFinanceSale_(ss,id){return id?d9gFindById_(ss,"finanzas_intenciones","intencion_id",id):null;}
function d9gFinancialReference_(ss,operationId){const op=d9gFindById_(ss,"operaciones","operacion_id",operationId);return op&&d9gText_(op.finanzas_venta_id)?"VTA-"+d9gText_(op.finanzas_venta_id):operationId;}
function d9gSetOperationBalances_(operations,movements){
  const balances={},display={};movements.filter(m=>!d9gIsAnnulled_(m.estado)&&d9gText_(m.operacion_id)).forEach(m=>{const id=d9gText_(m.operacion_id);balances[id]=(balances[id]||0)+d9gNumber_(m.debe)-d9gNumber_(m.haber);});
  operations.filter(o=>!d9gIsAnnulled_(o.estado)&&d9gText_(o.finanzas_venta_id)).sort((a,b)=>d9gText_(a.created_at).localeCompare(d9gText_(b.created_at))).forEach(o=>{const id=d9gText_(o.finanzas_venta_id);if(!display[id])display[id]=d9gText_(o.operacion_id);});
  operations.forEach(o=>{const sale=d9gText_(o.finanzas_venta_id),ref=sale?"VTA-"+sale:d9gText_(o.operacion_id);o.saldo=d9gIsAnnulled_(o.estado)||(sale&&display[sale]!==d9gText_(o.operacion_id))?0:Math.max(0,d9gRound_(balances[ref]||0));});
}
function d9gFinancialRevision_(ss){
  const parts=["operaciones","operacion_items","recibos","pagos","cheques","movimientos"].map(name=>{const sh=ss.getSheetByName(name);return name+":"+(sh?sh.getLastRow():0)+":"+(sh&&sh.getLastRow()>1?sh.getRange(sh.getLastRow(),1,1,sh.getLastColumn()).getDisplayValues()[0].join("|"):"");});
  const journal=ss.getSheetByName("finanzas_intenciones");if(journal&&journal.getLastRow()>1)parts.push(JSON.stringify(journal.getRange(2,1,journal.getLastRow()-1,5).getDisplayValues()));
  const documents=ss.getSheetByName("comprobantes_intenciones");if(documents&&documents.getLastRow()>1)parts.push(JSON.stringify(documents.getRange(2,1,documents.getLastRow()-1,7).getDisplayValues()));
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,parts.join("\u001f"))).replace(/=+$/g,"");
}
function d9gFinancialData_(user,request){
  d9gRequireCanIssueDocuments_(user);const ss=d9gGestion_(),source=d9gSource_(),scope=d9gTestScope_(user,request),ids=d9gTestClientIds_(source),refs=d9gTestReferences_(source,ss,ids),data={};["operaciones","items","recibos","pagos","cheques","movimientos"].forEach(name=>data[name]=d9gReadObjects_(ss,name==="items"?"operacion_items":name,false));
  data.operaciones=d9gTestFilter_(data.operaciones,scope,ids,refs);const opIds=new Set(data.operaciones.map(o=>d9gText_(o.operacion_id)));data.items=data.items.filter(i=>opIds.has(d9gText_(i.operacion_id)));
  ["recibos","pagos","cheques","movimientos"].forEach(name=>data[name]=d9gTestFilter_(data[name],scope,ids,refs));
  d9gSetOperationBalances_(data.operaciones,data.movimientos);return {ok:true,gestion:data,revision:d9gFinancialRevision_(ss)};
}

// Catálogo: snapshots comprimidos y journal recuperable, separados de datos económicos.
const D9G_CATALOG_META=["id","fecha","usuario_id","usuario","motivo","archivo","productos","listas","version","sha256","partes","estado","operacion_id","snapshot_previo","resultado"];
const D9G_CATALOG_PARTS=["id","parte","contenido"];
function d9gCatalogSheets_(){const ss=d9gGestion_();return {meta:d9gEnsureSheet_(ss,"listas_snapshots",D9G_CATALOG_META),parts:d9gEnsureSheet_(ss,"listas_snapshot_partes",D9G_CATALOG_PARTS)};}
function d9gCatalogRows_(){d9gCatalogSheets_();return d9gReadObjects_(d9gGestion_(),"listas_snapshots",false);}
function d9gCatalogHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value),Utilities.Charset.UTF_8).map(b=>(b&255).toString(16).padStart(2,"0")).join("");}
function d9gCatalogCapture_(){const sh=d9gSource_().getSheetByName("productos"),headers=d9gHeaders_(sh),n=Math.max(0,sh.getLastRow()-1),rows=n?sh.getRange(2,1,n,headers.length).getValues():[],formulas=n?sh.getRange(2,1,n,headers.length).getFormulas():[];rows.forEach((r,i)=>r.forEach((v,j)=>{if(formulas[i][j])r[j]={formula:formulas[i][j]};else if(v instanceof Date)r[j]={fecha:v.toISOString()}}));return {headers,rows};}
function d9gCatalogValue_(key,v){if(/^lista_/.test(key))return v===""||v==null?"":String(d9gRound_(d9gNumber_(v)));if(key==="activo")return d9gIsActive_(v)?"si":"no";return d9gText_(v);}
function d9gCatalogRead_(id,allowIncomplete){const m=d9gCatalogRows_().find(x=>x.id===id&&(allowIncomplete||x.estado!=="INCOMPLETO"));if(!m)throw new Error("Snapshot no disponible o incompleto.");const parts=d9gReadObjects_(d9gGestion_(),"listas_snapshot_partes",false).filter(x=>x.id===id).sort((a,b)=>a.parte-b.parte);if(parts.length!==Number(m.partes)||parts.some((x,i)=>Number(x.parte)!==i))throw new Error("Snapshot incompleto.");const payload=JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(parts.map(x=>x.contenido).join("")))).getDataAsString());if(d9gCatalogHash_(payload)!==m.sha256)throw new Error("Falló la verificación del snapshot.");return payload;}
function d9gCatalogSet_(id,key,value){const sh=d9gCatalogSheets_().meta,rows=d9gCatalogRows_(),i=rows.findIndex(x=>x.id===id);if(i<0)throw new Error("Registro no encontrado.");sh.getRange(i+2,D9G_CATALOG_META.indexOf(key)+1).setValue(value);SpreadsheetApp.flush();}
function d9gCatalogSave_(user,reason,payload,data,state,previous,result){const sheets=d9gCatalogSheets_(),id="LS-"+Utilities.getUuid(),encoded=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(payload),"application/json")).getBytes()),parts=[];for(let i=0;i<encoded.length;i+=25000)parts.push([id,parts.length,encoded.slice(i,i+25000)]);sheets.meta.appendRow([id,d9gNow_(),user.id,user.nombre,reason,d9gText_(data.archivo).slice(0,180),payload.rows.filter(r=>d9gText_(r[payload.headers.indexOf("id")])).length,payload.headers.filter(h=>/^lista_[123]$/.test(h)).join(","),"0.20.1",d9gCatalogHash_(payload),parts.length,"INCOMPLETO",d9gText_(data.operacion_id),previous||"",JSON.stringify(result||{})]);sheets.parts.getRange(sheets.parts.getLastRow()+1,1,parts.length,3).setValues(parts);SpreadsheetApp.flush();d9gCatalogRead_(id,true);d9gCatalogSet_(id,"estado",state);return id;}
function d9gCatalogApply_(target){const sh=d9gSource_().getSheetByName("productos");if(JSON.stringify(d9gHeaders_(sh))!==JSON.stringify(target.headers))throw new Error("Cambió la estructura del maestro. No se puede restaurar automáticamente.");const count=Math.max(target.rows.length,sh.getLastRow()-1);if(count>sh.getMaxRows()-1)sh.insertRowsAfter(sh.getMaxRows(),count-(sh.getMaxRows()-1));const rows=Array.from({length:count},(_,i)=>target.headers.map((h,j)=>{const v=target.rows[i]?.[j]??"";if(v&&typeof v==="object")return v.formula||new Date(v.fecha);return typeof v==="string"&&v.startsWith("=")?"'"+v:v}));if(count){if(target.columnas)target.columnas.forEach(h=>{const col=target.headers.indexOf(h);if(col<0)throw new Error("Columna de importación inválida.");sh.getRange(2,col+1,count,1).setValues(rows.map(r=>[r[col]]));});else sh.getRange(2,1,count,target.headers.length).setValues(rows);}SpreadsheetApp.flush();const actual=d9gCatalogCapture_();while(actual.rows.length&&actual.rows[actual.rows.length-1].every(v=>v===""))actual.rows.pop();const expected=JSON.parse(JSON.stringify(target));delete expected.columnas;while(expected.rows.length&&expected.rows[expected.rows.length-1].every(v=>v===""))expected.rows.pop();const projection=x=>target.columnas?{headers:target.columnas,rows:x.rows.map(r=>target.columnas.map(h=>r[target.headers.indexOf(h)]))}:x;if(d9gCatalogHash_(projection(actual))!==d9gCatalogHash_(projection(expected)))throw new Error("La escritura del maestro no pudo verificarse; se conserva la recuperación pendiente.");}
function d9gCatalogRecover_(){if(!d9gGestion_().getSheetByName("listas_snapshots"))return;const pending=d9gCatalogRows_().filter(x=>["PREPARADA","APLICANDO"].includes(x.estado));pending.forEach(m=>{const target=d9gCatalogRead_(m.id);d9gCatalogRead_(m.snapshot_previo);if(m.estado==="PREPARADA"){d9gProductLog_(d9gGestion_(),{id:m.usuario_id,nombre:m.usuario},"CATALOGO_PREPARADO","","","Snapshot y destino verificados",{operacion_id:m.operacion_id,snapshot_id:m.snapshot_previo});d9gCatalogSet_(m.id,"estado","APLICANDO");}d9gCatalogApply_(target);d9gProductLog_(d9gGestion_(),{id:m.usuario_id,nombre:m.usuario},"CATALOGO_APLICADO","","","Escritura verificada / recuperación",{operacion_id:m.operacion_id,snapshot_id:m.snapshot_previo});d9gCatalogSet_(m.id,"estado","APLICADA");});}
function d9gCatalogExisting_(id,user,reason){if(!/^CAT-[A-Za-z0-9-]{8,100}$/.test(d9gText_(id)))throw new Error("Falta el ID estable de la operación. Actualizá Gestión.");const m=d9gCatalogRows_().find(x=>x.operacion_id===id&&x.motivo==="DESTINO_"+reason);if(!m)return null;if(m.usuario_id!==user.id)throw new Error("La operación pertenece a otro usuario.");if(m.estado!=="APLICADA")throw new Error("La operación necesita recuperación; actualizá antes de reintentar.");return Object.assign({ok:true,reintento:true,snapshot_id:m.snapshot_previo},JSON.parse(m.resultado||"{}"));}
function d9gCatalogExecute_(user,data,reason,current,target,result){const previous=d9gCatalogSave_(user,reason==="RESTAURACION"?"PRE-RESTAURACIÓN":"IMPORTACIÓN",current,data,"DISPONIBLE");const journal=d9gCatalogSave_(user,"DESTINO_"+reason,target,data,"PREPARADA",previous,result);d9gProductLog_(d9gGestion_(),user,reason+"_PREPARADA","","","Snapshot verificado antes de aplicar",{operacion_id:data.operacion_id,snapshot_id:previous,destino:journal});d9gCatalogSet_(journal,"estado","APLICANDO");d9gCatalogRecover_();d9gProductLog_(d9gGestion_(),user,reason==="IMPORTACION"?"IMPORTACION_LISTA":"RESTAURACION_LISTA","","","Maestro aplicado y verificado",{operacion_id:data.operacion_id,snapshot_id:previous,...result});d9gCatalogPrune_();return Object.assign({ok:true,snapshot_id:previous},result);}
function d9gCatalogPrune_(){const all=d9gCatalogRows_(),available=all.filter(x=>x.estado==="DISPONIBLE").reverse(),keep=new Set(available.slice(0,20).map(x=>x.id));all.filter(x=>["APLICANDO","PREPARADA"].includes(x.estado)).forEach(x=>{keep.add(x.id);keep.add(x.snapshot_previo)});all.filter(x=>x.estado==="APLICADA").reverse().slice(0,20).forEach(x=>keep.add(x.id));const sheets=d9gCatalogSheets_();const remove=(sh,objects)=>{for(let i=objects.length-1;i>=0;i--)if(!keep.has(objects[i].id))sh.deleteRow(i+2)};remove(sheets.meta,all);const payloadKeep=new Set(all.filter(x=>keep.has(x.id)&&x.estado!=="APLICADA").map(x=>x.id));const parts=d9gReadObjects_(d9gGestion_(),"listas_snapshot_partes",false);for(let i=parts.length-1;i>=0;i--)if(!payloadKeep.has(parts[i].id))sheets.parts.deleteRow(i+2);}

function d9gCatalogHistory_(user){d9gRequireSourceWrites_(user);return {ok:true,snapshots:d9gCatalogRows_().filter(x=>x.estado==="DISPONIBLE").reverse().map(x=>({id:x.id,fecha:x.fecha,usuario:x.usuario,motivo:x.motivo,archivo:x.archivo,productos:x.productos,listas:x.listas,version:x.version}))};}
function d9gCatalogPreview_(user,data){d9gRequireSourceWrites_(user);const meta=d9gCatalogRows_().find(x=>x.id===data.snapshot_id&&x.estado==="DISPONIBLE");if(!meta)throw new Error("Snapshot no disponible.");const target=d9gCatalogRead_(meta.id),current=d9gCatalogCapture_();if(JSON.stringify(current.headers)!==JSON.stringify(target.headers))throw new Error("El maestro cambió de estructura; restauración bloqueada.");return {ok:true,snapshot:meta,actual:current.rows.length,destino:target.rows.length,revision:d9gCatalogHash_(current)};}
function d9gCatalogRestore_(user,data){d9gRequireSourceWrites_(user);const prior=d9gCatalogExisting_(data.operacion_id,user,"RESTAURACION");if(prior)return prior;const preview=d9gCatalogPreview_(user,data);if(data.confirmacion!=="RESTAURAR"||data.revision!==preview.revision)throw new Error("El maestro cambió o falta confirmación. Volvé a revisar la preview.");return d9gCatalogExecute_(user,data,"RESTAURACION",d9gCatalogCapture_(),d9gCatalogRead_(data.snapshot_id),{restaurado:data.snapshot_id,productos:preview.destino});}
function d9gCatalogResult_(user,data){d9gRequireSourceWrites_(user);const m=d9gCatalogRows_().find(x=>x.operacion_id===data.operacion_id&&/^DESTINO_/.test(x.motivo));return {ok:true,aplicada:!!m&&m.estado==="APLICADA",estado:m?m.estado:"NO_ENCONTRADA",snapshot_id:m?.snapshot_previo||""};}
