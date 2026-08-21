const D9G = Object.freeze({
  TZ: "America/Argentina/Buenos_Aires",
  SOURCE_SHEET_ID_DEFAULT: "1wHdgm_V0mloLaIsVPIIqbmTYBomx8DIUmXEplClCMz8",
  TOKEN_HOURS: 12,
  SOURCE_ORDER_DAYS: 120
});

const D9G_HEADERS = Object.freeze({
  config: ["clave","valor"],
  contadores: ["tipo","ultimo","prefijo"],
  operaciones: ["operacion_id","numero","tipo","fecha","cliente_id","cliente","origen_tipo","origen_pedido_id","usuario_id","usuario","estado","subtotal","descuento_pct","total","observaciones","created_at","updated_at","anulada_at","anulada_por"],
  operacion_items: ["item_id","operacion_id","orden","producto_id","producto","cantidad","precio_unitario","descuento_pct","subtotal"],
  recibos: ["recibo_id","numero","fecha","cliente_id","cliente","operacion_id","operacion_numero","medio_principal","total","observaciones","estado","usuario_id","usuario","created_at","anulado_at","anulado_por"],
  pagos: ["pago_id","recibo_id","operacion_id","cliente_id","fecha","medio","importe","referencia","cheque_id","estado","usuario_id","usuario","created_at"],
  cheques: ["cheque_id","pago_id","recibo_id","operacion_id","cliente_id","cliente","banco","numero","librador","fecha_ingreso","fecha_vencimiento","importe","estado","usuario_id","usuario","updated_at"],
  movimientos: ["movimiento_id","fecha","cliente_id","cliente","tipo","documento_tipo","documento_id","documento_numero","operacion_id","debe","haber","estado","usuario_id","usuario","detalle","created_at"],
  auditoria: ["auditoria_id","timestamp","usuario_id","usuario","accion","entidad","entidad_id","detalle"]
});

function doGet(e) {
  try {
    const action = d9gText_(e && e.parameter && e.parameter.action).toLowerCase();
    if (!action || action === "status") return d9gJson_({ok:true,status:"D9 Gestión Script activo",version:"0.1.0"});
    const session = d9gRequireSession_(e && e.parameter && e.parameter.token);
    if (action === "bootstrap") return d9gJson_(d9gBootstrap_(session));
    return d9gJson_({ok:false,error:"Acción GET no válida"});
  } catch (err) { return d9gJson_({ok:false,error:String(err && err.message || err)}); }
}

function doPost(e) {
  try {
    const data = d9gParseBody_(e);
    const action = d9gText_(data.action || (e && e.parameter && e.parameter.action)).toLowerCase();
    if (action === "login") return d9gJson_(d9gLogin_(data));
    const session = d9gRequireSession_(data.token);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (action === "create_operacion") return d9gJson_(d9gCreateOperation_(session,data));
      if (action === "create_recibo") return d9gJson_(d9gCreateReceipt_(session,data));
      if (action === "anular_operacion") return d9gJson_(d9gAnnulOperation_(session,data));
      if (action === "update_cheque_status") return d9gJson_(d9gUpdateCheck_(session,data));
      if (action === "update_config") return d9gJson_(d9gUpdateConfig_(session,data));
      return d9gJson_({ok:false,error:"Acción POST no válida"});
    } finally { lock.releaseLock(); }
  } catch (err) { return d9gJson_({ok:false,error:String(err && err.message || err)}); }
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
    TOKEN_SECRET: props.getProperty("TOKEN_SECRET") || Utilities.getUuid() + Utilities.getUuid()
  }, false);
  Object.keys(D9G_HEADERS).forEach(name => d9gEnsureSheet_(ss,name,D9G_HEADERS[name]));
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
  const sh=ss.getSheetByName("contadores"); if(sh.getLastRow()>1)return;
  sh.getRange(2,1,2,3).setValues([["OPERACION",0,"R"],["RECIBO",0,"RC"]]);
}

function d9gLogin_(data) {
  const usuario=d9gText_(data.usuario).toLowerCase(), clave=d9gText_(data.clave);
  if(!usuario||!clave)throw new Error("Ingresá usuario y clave.");
  const source=d9gSource_();
  const users=d9gReadObjects_(source,"usuarios",false);
  const found=users.find(u=>d9gText_(u.usuario).toLowerCase()===usuario && d9gIsActive_(u.activo));
  if(!found || d9gText_(found.clave)!==clave)throw new Error("Usuario o clave incorrectos.");
  const allowed=(PropertiesService.getScriptProperties().getProperty("ALLOWED_USER_IDS")||"").split(",").map(d9gText_).filter(Boolean);
  if(!allowed.includes(d9gText_(found.id)))throw new Error("Este usuario no está autorizado para D9 Gestión.");
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
  const users=d9gReadObjects_(d9gSource_(),"usuarios",false);const found=users.find(u=>d9gText_(u.id)===d9gText_(data.uid)&&d9gIsActive_(u.activo));if(!found)throw new Error("Usuario no autorizado.");
  const allowed=(PropertiesService.getScriptProperties().getProperty("ALLOWED_USER_IDS")||"").split(",").map(d9gText_);if(!allowed.includes(d9gText_(found.id)))throw new Error("Usuario no autorizado.");
  return d9gPublicUser_(found);
}
function d9gSign_(payload){const secret=PropertiesService.getScriptProperties().getProperty("TOKEN_SECRET");if(!secret)throw new Error("Falta ejecutar setupD9Gestion.");return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload,secret)).replace(/=+$/g,"");}
function d9gPublicUser_(u){return {id:d9gText_(u.id),usuario:d9gText_(u.usuario),nombre:d9gText_(u.nombre),rol:d9gText_(u.rol),rol_gestion:"operador"};}

function d9gBootstrap_(session) {
  const source=d9gSource_(), gestion=d9gGestion_();
  const clients=d9gReadObjects_(source,"clientes",false).filter(x=>d9gIsActive_(x.activo));
  const products=d9gReadObjects_(source,"productos",false).filter(x=>d9gIsActive_(x.activo)&&([x.lista_1,x.lista_2,x.lista_3].some(v=>d9gNumber_(v)>0)));
  const users=d9gReadObjects_(source,"usuarios",false).filter(x=>d9gIsActive_(x.activo)).map(d9gPublicUser_);
  const orders=d9gReadSourceOrders_(source);
  const operations=d9gReadObjects_(gestion,"operaciones",true), items=d9gReadObjects_(gestion,"operacion_items",true), receipts=d9gReadObjects_(gestion,"recibos",true), payments=d9gReadObjects_(gestion,"pagos",true), checks=d9gReadObjects_(gestion,"cheques",true), movements=d9gReadObjects_(gestion,"movimientos",true);
  const opBalance={};movements.filter(m=>!d9gIsAnnulled_(m.estado)&&d9gText_(m.operacion_id)).forEach(m=>{const id=d9gText_(m.operacion_id);opBalance[id]=(opBalance[id]||0)+d9gNumber_(m.debe)-d9gNumber_(m.haber);});
  operations.forEach(o=>o.saldo=d9gIsAnnulled_(o.estado)?0:Math.max(0,d9gRound_(opBalance[d9gText_(o.operacion_id)]||0)));
  return {ok:true,timestamp:d9gNow_(),user:session,source:{clientes:clients,productos:products,usuarios:users,pedidos:orders},gestion:{operaciones:operations,items:items,recibos:receipts,pagos:payments,cheques:checks,movimientos:movements,config:d9gReadKeyValue_(gestion,"config")}};
}

function d9gReadSourceOrders_(ss) {
  const rows=d9gReadObjects_(ss,"pedidos",true), groups={}, order=[];
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-D9G.SOURCE_ORDER_DAYS);
  rows.forEach(r=>{
    const id=d9gText_(r.pedido_id||r["id_comp."]||r.id_comp_||r.id_comp||r.id_pedido);if(!id)return;
    const parsed=d9gParseSourceDate_(r.fecha);if(parsed&&parsed<cutoff)return;
    if(!groups[id]){groups[id]={pedido_id:id,fecha:d9gText_(r.fecha),fecha_iso:parsed?Utilities.formatDate(parsed,D9G.TZ,"yyyy-MM-dd"):"",vendedor_id:d9gText_(r.vendedor_id),vendedor:d9gText_(r.vendedor),cliente:d9gText_(r.cliente),estado:d9gText_(r.estado),total:d9gNumber_(r.total_pedido),nota_pedido:d9gText_(r.nota_pedido),items:[]};order.push(groups[id]);}
    groups[id].items.push({id_producto:d9gText_(r.id_producto),nombre:d9gText_(r.detalle||r.producto),cantidad:d9gNumber_(r.total||r.cantidad),precio:d9gNumber_(r.precio),subtotal:d9gNumber_(r.total_item),nota_item:d9gText_(r.nota_item)});
    if(d9gIsAnnulled_(r.estado))groups[id].estado=d9gText_(r.estado);
  });
  return order.sort((a,b)=>d9gText_(b.fecha_iso||b.fecha).localeCompare(d9gText_(a.fecha_iso||a.fecha)));
}

function d9gCreateOperation_(user,data) {
  const ss=d9gGestion_(), source=d9gSource_();
  const type=d9gText_(data.tipo||"REMITO").toUpperCase();if(!["REMITO","PROFORMA","NOTA_VENTA"].includes(type))throw new Error("Tipo de comprobante inválido.");
  const date=d9gISODate_(data.fecha),clientId=d9gText_(data.cliente_id),clientName=d9gText_(data.cliente);if(!clientId||!clientName)throw new Error("Falta seleccionar el cliente.");
  const validClient=d9gReadObjects_(source,"clientes",false).find(c=>d9gText_(c.id)===clientId&&d9gIsActive_(c.activo));if(!validClient)throw new Error("El cliente ya no está activo en D9.");
  const rawItems=Array.isArray(data.items)?data.items:[];if(!rawItems.length)throw new Error("El comprobante no tiene productos.");
  const productMap={};d9gReadObjects_(source,"productos",false).forEach(p=>productMap[d9gText_(p.id)]=p);
  const items=rawItems.map((x,i)=>{const id=d9gText_(x.id_producto),p=productMap[id],qty=d9gNumber_(x.cantidad),price=d9gNumber_(x.precio);if(!p||qty<=0||price<0)throw new Error("Hay un producto, cantidad o precio inválido.");return {id:id,nombre:d9gText_(p.nombre),cantidad:qty,precio:price,subtotal:d9gRound_(qty*price),orden:i+1};});
  const subtotal=d9gRound_(items.reduce((s,x)=>s+x.subtotal,0)),discount=Math.max(0,Math.min(100,d9gNumber_(data.descuento_pct))),total=d9gRound_(subtotal*(1-discount/100));if(total<=0)throw new Error("El total debe ser mayor que cero.");
  const initialPayments=d9gNormalizePayments_(data.pagos_iniciales||[]),paid=d9gRound_(initialPayments.reduce((s,p)=>s+p.importe,0));if(paid<0||paid>total+.01)throw new Error("El pago inicial es inválido.");
  const opId="OP-"+Utilities.getUuid(),counter=d9gNextNumber_(ss,"OPERACION",d9gReadKeyValue_(ss,"config").documento_prefijo||"R"),now=d9gNow_();
  d9gAppend_(ss,"operaciones",[[opId,counter.numero,type,date,clientId,clientName,d9gText_(data.origen_pedido_id)?"PEDIDO":"MANUAL",d9gText_(data.origen_pedido_id),user.id,user.nombre,"VIGENTE",subtotal,discount,total,d9gText_(data.observaciones),now,now,"",""]]);
  d9gAppend_(ss,"operacion_items",items.map(x=>["IT-"+Utilities.getUuid(),opId,x.orden,x.id,x.nombre,x.cantidad,x.precio,0,x.subtotal]));
  d9gAddMovement_(ss,{fecha:date,cliente_id:clientId,cliente:clientName,tipo:"COMPROBANTE",documento_tipo:type,documento_id:opId,documento_numero:counter.numero,operacion_id:opId,debe:total,haber:0,usuario:user,detalle:d9gText_(data.origen_pedido_id)?"Desde pedido "+d9gText_(data.origen_pedido_id):"Carga manual"});
  let receipt=null;if(paid>0)receipt=d9gCreateReceiptCore_(ss,user,{fecha:date,cliente_id:clientId,cliente:clientName,operacion_id:opId,operacion_numero:counter.numero,pagos:initialPayments,observaciones:"Pago inicial de "+type+" "+counter.numero});
  d9gAudit_(ss,user,"CREAR","OPERACION",opId,{numero:counter.numero,total:total,origen_pedido_id:d9gText_(data.origen_pedido_id)});
  return {ok:true,operacion_id:opId,numero:counter.numero,recibo_id:receipt&&receipt.recibo_id};
}

function d9gCreateReceipt_(user,data) {
  const ss=d9gGestion_(),clientId=d9gText_(data.cliente_id),client=d9gText_(data.cliente),payments=d9gNormalizePayments_(data.pagos||[]),amount=d9gRound_(payments.reduce((s,p)=>s+p.importe,0));if(!clientId||!client||amount<=0)throw new Error("Cliente e importe son obligatorios.");
  let opNumber="";const opId=d9gText_(data.operacion_id);if(opId){const op=d9gFindById_(ss,"operaciones","operacion_id",opId);if(!op||d9gIsAnnulled_(op.estado))throw new Error("El comprobante no está vigente.");if(d9gText_(op.cliente_id)!==clientId)throw new Error("El comprobante pertenece a otro cliente.");opNumber=d9gText_(op.numero);const bal=d9gOperationBalance_(ss,opId);if(amount>bal+.01)throw new Error("El pago supera el saldo del comprobante. Para dejar crédito, elegí ‘A cuenta’.");}
  const receipt=d9gCreateReceiptCore_(ss,user,{fecha:d9gISODate_(data.fecha),cliente_id:clientId,cliente:client,operacion_id:opId,operacion_numero:opNumber,pagos:payments,observaciones:d9gText_(data.observaciones)});
  d9gAudit_(ss,user,"CREAR","RECIBO",receipt.recibo_id,{numero:receipt.numero,total:amount,operacion_id:opId});return {ok:true,recibo_id:receipt.recibo_id,numero:receipt.numero};
}

function d9gCreateReceiptCore_(ss,user,x) {
  const payments=d9gNormalizePayments_(x.pagos||[]),total=d9gRound_(payments.reduce((s,p)=>s+p.importe,0));if(total<=0)throw new Error("El recibo no tiene pagos válidos.");
  const method=payments.length>1?"MIXTO":payments[0].medio,counter=d9gNextNumber_(ss,"RECIBO","RC"),receiptId="RC-"+Utilities.getUuid(),now=d9gNow_();
  const paymentRows=[],checkRows=[];
  payments.forEach(p=>{const paymentId="PG-"+Utilities.getUuid(),checkId=p.medio==="CHEQUE"?"CH-"+Utilities.getUuid():"";paymentRows.push([paymentId,receiptId,x.operacion_id||"",x.cliente_id,x.fecha,p.medio,p.importe,p.referencia||"",checkId,"VIGENTE",user.id,user.nombre,now]);if(checkId){const c=p.cheque;checkRows.push([checkId,paymentId,receiptId,x.operacion_id||"",x.cliente_id,x.cliente,c.banco,c.numero,c.librador,x.fecha,c.fecha_vencimiento,p.importe,"EN_CARTERA",user.id,user.nombre,now]);}});
  d9gAppend_(ss,"recibos",[[receiptId,counter.numero,x.fecha,x.cliente_id,x.cliente,x.operacion_id||"",x.operacion_numero||"",method,total,x.observaciones||"","VIGENTE",user.id,user.nombre,now,"",""]]);
  d9gAppend_(ss,"pagos",paymentRows);if(checkRows.length)d9gAppend_(ss,"cheques",checkRows);
  d9gAddMovement_(ss,{fecha:x.fecha,cliente_id:x.cliente_id,cliente:x.cliente,tipo:"PAGO",documento_tipo:"RECIBO",documento_id:receiptId,documento_numero:counter.numero,operacion_id:x.operacion_id||"",debe:0,haber:total,usuario:user,detalle:payments.map(p=>p.medio+" "+p.importe).join(" + ")});
  return {recibo_id:receiptId,numero:counter.numero};
}

function d9gNormalizePayments_(incoming) {
  if(!Array.isArray(incoming))return[];
  return incoming.map(raw=>{const method=d9gText_(raw.medio).toUpperCase(),amount=d9gRound_(d9gNumber_(raw.importe));if(!["EFECTIVO","TRANSFERENCIA","CHEQUE"].includes(method)||amount<=0)throw new Error("Hay un medio o importe de pago inválido.");let check=null;if(method==="CHEQUE"){const c=raw.cheque||{};if(!d9gText_(c.banco)||!d9gText_(c.numero)||!d9gText_(c.fecha_vencimiento))throw new Error("Completá banco, número y vencimiento del cheque.");check={banco:d9gText_(c.banco),numero:d9gText_(c.numero),librador:d9gText_(c.librador),fecha_vencimiento:d9gISODate_(c.fecha_vencimiento)};}return {medio:method,importe:amount,referencia:d9gText_(raw.referencia),cheque:check};});
}

function d9gAnnulOperation_(user,data) {
  const ss=d9gGestion_(),id=d9gText_(data.operacion_id),found=d9gFindRowById_(ss,"operaciones","operacion_id",id);if(!found)throw new Error("No se encontró el comprobante.");if(d9gIsAnnulled_(found.obj.estado))return {ok:true,already_annulled:true};
  const sh=ss.getSheetByName("operaciones"),headers=d9gHeaders_(sh);sh.getRange(found.row,headers.indexOf("estado")+1).setValue("ANULADO");sh.getRange(found.row,headers.indexOf("updated_at")+1).setValue(d9gNow_());sh.getRange(found.row,headers.indexOf("anulada_at")+1).setValue(d9gNow_());sh.getRange(found.row,headers.indexOf("anulada_por")+1).setValue(user.nombre);
  d9gAddMovement_(ss,{fecha:d9gToday_(),cliente_id:found.obj.cliente_id,cliente:found.obj.cliente,tipo:"ANULACION_COMPROBANTE",documento_tipo:found.obj.tipo,documento_id:id,documento_numero:found.obj.numero,operacion_id:id,debe:0,haber:d9gNumber_(found.obj.total),usuario:user,detalle:"Reversión del comprobante anulado"});
  d9gAudit_(ss,user,"ANULAR","OPERACION",id,{numero:found.obj.numero,total:found.obj.total});return {ok:true,operacion_id:id};
}

function d9gUpdateCheck_(user,data) {
  const ss=d9gGestion_(),id=d9gText_(data.cheque_id),next=d9gText_(data.estado).toUpperCase();if(!["EN_CARTERA","DEPOSITADO","COBRADO","RECHAZADO","ENTREGADO","ANULADO"].includes(next))throw new Error("Estado de cheque inválido.");
  const found=d9gFindRowById_(ss,"cheques","cheque_id",id);if(!found)throw new Error("No se encontró el cheque.");const old=d9gText_(found.obj.estado).toUpperCase();if(old===next)return {ok:true,unchanged:true};
  const sh=ss.getSheetByName("cheques"),h=d9gHeaders_(sh);sh.getRange(found.row,h.indexOf("estado")+1).setValue(next);sh.getRange(found.row,h.indexOf("updated_at")+1).setValue(d9gNow_());
  if(old!=="RECHAZADO"&&next==="RECHAZADO")d9gAddMovement_(ss,{fecha:d9gToday_(),cliente_id:found.obj.cliente_id,cliente:found.obj.cliente,tipo:"CHEQUE_RECHAZADO",documento_tipo:"CHEQUE",documento_id:id,documento_numero:found.obj.numero,operacion_id:found.obj.operacion_id,debe:d9gNumber_(found.obj.importe),haber:0,usuario:user,detalle:"Cheque rechazado · "+found.obj.banco});
  if(old==="RECHAZADO"&&next!=="RECHAZADO")d9gAddMovement_(ss,{fecha:d9gToday_(),cliente_id:found.obj.cliente_id,cliente:found.obj.cliente,tipo:"REVERSA_RECHAZO_CHEQUE",documento_tipo:"CHEQUE",documento_id:id,documento_numero:found.obj.numero,operacion_id:found.obj.operacion_id,debe:0,haber:d9gNumber_(found.obj.importe),usuario:user,detalle:"Se revierte el rechazo · nuevo estado "+next});
  d9gAudit_(ss,user,"CAMBIAR_ESTADO","CHEQUE",id,{anterior:old,nuevo:next});return {ok:true,cheque_id:id,estado:next};
}

function d9gUpdateConfig_(user,data) {
  const ss=d9gGestion_(),incoming=data.config||{},allowed=["empresa_nombre","documento_default","documento_prefijo","impresion","leyenda"],sh=ss.getSheetByName("config"),rows=d9gReadObjects_(ss,"config",true),map={};rows.forEach((r,i)=>map[d9gText_(r.clave)]=i+2);
  allowed.forEach(k=>{if(incoming[k]===undefined)return;const v=d9gText_(incoming[k]);if(map[k])sh.getRange(map[k],2).setValue(v);else sh.appendRow([k,v]);});d9gAudit_(ss,user,"ACTUALIZAR","CONFIG","config",incoming);return {ok:true};
}

function d9gOperationBalance_(ss,id){return d9gRound_(d9gReadObjects_(ss,"movimientos",true).filter(m=>d9gText_(m.operacion_id)===id&&!d9gIsAnnulled_(m.estado)).reduce((s,m)=>s+d9gNumber_(m.debe)-d9gNumber_(m.haber),0));}
function d9gAddMovement_(ss,x){d9gAppend_(ss,"movimientos",[["MV-"+Utilities.getUuid(),x.fecha,x.cliente_id,x.cliente,x.tipo,x.documento_tipo,x.documento_id,x.documento_numero,x.operacion_id||"",d9gRound_(x.debe),d9gRound_(x.haber),"VIGENTE",x.usuario.id,x.usuario.nombre,x.detalle||"",d9gNow_()]]);}
function d9gAudit_(ss,user,action,entity,id,detail){d9gAppend_(ss,"auditoria",[["AU-"+Utilities.getUuid(),d9gNow_(),user.id,user.nombre,action,entity,id,JSON.stringify(detail||{}).slice(0,3000)]]);}

function d9gNextNumber_(ss,type,prefix) {
  const found=d9gFindRowById_(ss,"contadores","tipo",type),sh=ss.getSheetByName("contadores");let n=1,row;
  if(found){n=d9gNumber_(found.obj.ultimo)+1;row=found.row;sh.getRange(row,2).setValue(n);if(prefix)sh.getRange(row,3).setValue(prefix);}else{sh.appendRow([type,n,prefix]);}
  return {value:n,numero:(prefix||"")+"-"+String(n).padStart(8,"0")};
}
function d9gFindById_(ss,sheet,key,id){const found=d9gFindRowById_(ss,sheet,key,id);return found&&found.obj;}
function d9gFindRowById_(ss,sheet,key,id){const rows=d9gReadObjects_(ss,sheet,true);for(let i=0;i<rows.length;i++)if(d9gText_(rows[i][key])===d9gText_(id))return {obj:rows[i],row:i+2};return null;}

function d9gSource_(){const id=PropertiesService.getScriptProperties().getProperty("SOURCE_SHEET_ID")||D9G.SOURCE_SHEET_ID_DEFAULT;return SpreadsheetApp.openById(id);}
function d9gGestion_(){const id=PropertiesService.getScriptProperties().getProperty("GESTION_SHEET_ID");if(!id)throw new Error("Falta ejecutar setupD9Gestion.");return SpreadsheetApp.openById(id);}
function d9gEnsureSheet_(ss,name,headers){let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);sh.getRange(1,1,1,headers.length).setValues([headers]);sh.setFrozenRows(1);return sh;}
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
