const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(require('path').join(__dirname,'../apps-script/Code.gs'),'utf8');
let uuid=0,armed=null,writeLog=[];
function hit(sheet,operation){writeLog.push(sheet+':'+operation);if(armed&&armed.sheet===sheet&&--armed.left===0){const after=armed.after;armed=null;if(!after)throw Error('INJECT '+sheet+' '+operation);return true}return false}
class Sheet{
 constructor(name,rows=[]){this.name=name;this.rows=rows.map(row=>[...row])}
 getFrozenRows(){return 1}setFrozenRows(){}getLastRow(){return this.rows.length}getLastColumn(){return Math.max(0,...this.rows.map(row=>row.length))}
 getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn())}
 getRange(r,c,n=1,m=1){const sh=this;return {getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sh.rows[r+i-1]?.[c+j-1]??''))},getDisplayValues(){return this.getValues().map(row=>row.map(String))},getDisplayValue(){return String(sh.rows[r-1]?.[c-1]??'')},setValues(values){const after=hit(sh.name,'setValues');values.forEach((row,i)=>row.forEach((value,j)=>{sh.rows[r+i-1]??=[];sh.rows[r+i-1][c+j-1]=value}));if(after)throw Error('INJECT '+sh.name+' setValues');return this},setValue(value){const after=hit(sh.name,'setValue');sh.rows[r-1]??=[];sh.rows[r-1][c-1]=value;if(after)throw Error('INJECT '+sh.name+' setValue');return this}}}
 appendRow(row){const after=hit(this.name,'appendRow');this.rows.push([...row]);if(after)throw Error('INJECT '+this.name+' appendRow')}
}
class Book{constructor(){this.sheets={}}getSheetByName(n){return this.sheets[n]||null}insertSheet(n){this.sheets[n]=new Sheet(n);return this.sheets[n]}seed(n,headers,rows){this.sheets[n]=new Sheet(n,[headers,...rows])}}
const gestion=new Book(),source=new Book();const ctx=vm.createContext({Date,Math,JSON,Number,String,Set,Array,Error,Utilities:{getUuid:()=>String(++uuid),formatDate:(_,tz,fmt)=>fmt==='yyyy-MM-dd'?'2026-09-27':fmt==='dd/MM/yyyy HH:mm:ss'?'27/09/2026 10:00:00':'2026-09-27 10:00:00'}});vm.runInContext(code,ctx);
Object.assign(ctx,{d9gGestion_:()=>gestion,d9gSource_:()=>source,d9gRequireCanIssueDocuments_:()=>{},d9gRequireAdmin_:()=>{},d9gResolveActiveSeller_:(_source,id)=>({id:id||'V',nombre:'Vendedor'})});
function setup(){uuid=0;armed=null;writeLog=[];gestion.sheets={};source.sheets={};gestion.seed('contadores',['tipo','ultimo','prefijo'],[]); for(const [name,headers] of Object.entries(vm.runInContext('D9G_HEADERS',ctx))) if(name!=='contadores')gestion.seed(name,headers,[]);source.seed('clientes',['id','nombre','activo','ambito'],[['C','Cliente','si',''],['T','Test','si','TEST']]);source.seed('productos',['id','nombre','marca'],[['P','Producto','General']]);source.seed('pedidos',['fecha','pedido_id','vendedor_id','vendedor','cliente','detalle','total','precio','total_item','total_pedido','id_producto','cliente_id','estado'],[['27/09/2026 10:00:00','A','V','Vendedor','Cliente','Producto',1,100,100,100,'P','C','']]);}
const user={id:'U',nombre:'Ale',rol_gestion:'super_admin',permiso_comprobantes:'si'};
function payload(id='DOCI-123456789012',more={}){return {intencion_id:id,tipo:'REMITO',fecha:'2026-09-27',cliente_id:'C',cliente:'Cliente',vendedor_id:'V',vendedor:'Vendedor',items:[{id_producto:'P',cantidad:1,precio:100}],ambito:'REAL',...more}}
function call(data){return ctx.d9gCreateOperation_(user,data)}
function rows(name){return ctx.d9gReadObjects_(gestion,name,false)}
function assertSingle(result,opts={}){assert(result.ok&&!result.cancelada);assert.strictEqual(rows('operaciones').length,1);assert.strictEqual(rows('operacion_items').length,1);assert.strictEqual(rows('movimientos').length,opts.paid?2:1);assert.strictEqual(rows('comprobantes_intenciones')[0].estado,'COMPLETA');assert.strictEqual(rows('operaciones')[0].estado,'VIGENTE');}
function attemptFailure(data,sheet,left=1,after=false){armed={sheet,left,after};try{call(data)}catch(e){assert.match(e.message,/INJECT/);return}throw Error('Injection not triggered '+sheet)}
// Recorrido API completo: serializar sólo las validaciones explícitas previas.
Object.assign(ctx,{LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},d9gRequireSession_:()=>user,d9gJson_:x=>x});
function post(data){return ctx.doPost({postData:{contents:JSON.stringify({action:'create_operacion',token:'T',...data})}})}
function seedSale(){
 source.seed('ventas',['venta_id','fecha','cliente_id','cliente','usuario_id','usuario','id_producto','producto','cantidad','precio_unitario','subtotal','total_venta','finanzas_id','medio_pago'],[['S','14/10/2026 16:00:00','C','Cliente','V','Vendedor','P','Producto',1,100,100,100,'S','CUENTA_CORRIENTE']]);
 gestion.seed('finanzas_intenciones',vm.runInContext('D9G_HEADERS.finanzas_intenciones',ctx),[['S','V','C','VENTA','CONFIRMADA',JSON.stringify({result:{cliente_id:'C',importe:100}}),'2026-10-14','2026-10-14']]);
}
setup();seedSale();let originalSales=JSON.stringify(source.getSheetByName('ventas').rows),originalFinance=JSON.stringify(gestion.getSheetByName('finanzas_intenciones').rows);
let result=post(payload('DOCI-SALEVALID001',{origen_venta_id:'S'}));assert(result.ok);assert.equal(result.finanzas_venta_id,'S');assert.equal(rows('movimientos').length,0);assert.equal(rows('recibos').length,0);assert.equal(rows('pagos').length,0);
assert.equal(JSON.stringify(source.getSheetByName('ventas').rows),originalSales);assert.equal(JSON.stringify(gestion.getSheetByName('finanzas_intenciones').rows),originalFinance);
setup();seedSale();writeLog=[];
let rejected=post(payload('DOCI-SALEINVALID1',{origen_venta_id:'S',items:[{id_producto:'P',cantidad:1,precio:120}]}));
assert(!rejected.ok);assert.equal(rejected.code,'D9G_VALIDACION_NO_APLICADA');assert.equal(rejected.no_aplicado,true);assert.equal(rejected.intencion_id,'DOCI-SALEINVALID1');assert.equal(writeLog.length,0);assert.equal(rows('comprobantes_intenciones').length,0);
source.seed('clientes',['id','nombre','activo','ambito'],[['C','Cliente','si',''],['C2','Otro','si','']]);
rejected=post(payload('DOCI-CLIENTINVALID',{origen_venta_id:'S',cliente_id:'C2',cliente:'Otro'}));assert.equal(rejected.no_aplicado,true);assert.equal(writeLog.length,0);
// Un fallo una vez iniciada la numeración jamás tiene la marca de no aplicación.
setup();seedSale();armed={sheet:'contadores',left:1,after:true};result=post(payload('DOCI-NUMBERERROR1'));assert(!result.ok);assert.equal(result.no_aplicado,undefined);
setup();seedSale();armed={sheet:'operaciones',left:1,after:true};const uncertain=payload('DOCI-POSTWRITE001');result=post(uncertain);assert(!result.ok);assert.equal(result.no_aplicado,undefined);assert.equal(rows('operaciones').length,1);result=post(uncertain);assert(result.ok);assert.equal(rows('operaciones').length,1);
// Conflicto con identidad ya existente tampoco se convierte en validación no aplicada.
result=post({...uncertain,observaciones:'distinto'});assert(!result.ok);assert.equal(result.no_aplicado,undefined);
console.log('Backend: venta vinculada sin doble deuda/pago, validación previa sin escrituras, numeración y post-escritura protegidos OK');

// Frontend real con DOM simulado; usa la API de backend anterior para guardar.
const crypto=require('crypto'),storage=new Map(),nodes=new Map(),messages=[],sent=[];
function node(selector){if(!nodes.has(selector)){const classes=new Set();nodes.set(selector,{value:'',textContent:'',innerHTML:'',disabled:false,open:false,classList:{add(...x){x.forEach(v=>classes.add(v))},remove(...x){x.forEach(v=>classes.delete(v))},toggle(x,on){if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x)},contains:x=>classes.has(x)},closest(){return node(selector+' parent')},setAttribute(){},focus(){},showModal(){this.open=true},close(){this.open=false},reset(){for(const [key,v] of nodes)if(key.startsWith('#op'))v.value='';node('#opPaymentMethod').value='CUENTA_CORRIENTE';node('#opDiscount').value='0';node('#opNotes').value=''}})}return nodes.get(selector)}
const front=vm.createContext({window:{D9_GESTION_CONFIG:{}},document:{querySelector:s=>node(s),querySelectorAll:()=>[],getElementById:s=>node('#'+s)},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},crypto:crypto.webcrypto,Uint8Array,Intl,Date,Number,JSON,console,setTimeout(){},clearTimeout(){}});
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../app.js'),'utf8').replace(/\nboot\(\);\s*$/,''),front);
Object.assign(front,{toast:(m)=>messages.push(m)});
vm.runInContext("renderOperationClientResults=()=>{};renderDraftItems=()=>{};renderProductSuggestions=()=>{};readPayments=()=>[];stageCreatedOperation=()=>{};showOperationDetail=()=>{};refreshAfterMutation=()=>{};loadAll=async()=>{};state.user={id:'U',rol_gestion:'super_admin',permiso_comprobantes:'si'};state.token='T';state.source.clientes=[{id:'C',nombre:'Cliente',activo:'si'}];state.source.usuarios=[{id:'V',nombre:'Vendedor',rol:'vendedor'}];state.gestion.config={documento_default:'REMITO'};",front);
const sale={venta_id:'S',finanzas_id:'S',cliente_id:'C',cliente:'Cliente',usuario_id:'V',usuario:'Vendedor',medio_pago:'CUENTA_CORRIENTE',total_venta:100,items:[{id_producto:'P',nombre:'Producto',cantidad:1,precio_unitario:100,subtotal:100,item_id:'IT-OLD',operacion_id:'OP-OLD'}],operacion_id:'OP-OLD',intencion_id:'DOCI-OLD00000000',referencia_operacion_id:'OP-OLD',numero:'R-OLD',estado:'CONFIRMADA'};
front.fixtureSale=sale;vm.runInContext('state.salesHistory=[fixtureSale];state.source.ventas=[fixtureSale];',front);
const saleBytes=JSON.stringify(sale);
front.send=async (action,p)=>{sent.push({action,p:JSON.parse(JSON.stringify(p))});const response=post({...p,ambito:'REAL'});return front.parseResponse({text:async()=>JSON.stringify(response)})};vm.runInContext('apiPost=send',front);
const event={preventDefault(){}};
(async()=>{
 setup();seedSale();vm.runInContext('openOperation(null,true,fixtureSale);state.draftItems[0].precio=120;',front);
 await front.saveOperation(event);assert(node('#operationDialog').open,'validación mantiene formulario abierto');assert.equal(vm.runInContext('pendingDocumentIntent()',front),null);assert.equal(vm.runInContext('state.draftItems[0].precio',front),120);assert(messages.at(-1).includes('conservar el cliente y total'));const invalidId=sent.at(-1).p.intencion_id;
 vm.runInContext('state.draftItems[0].precio=100;',front);await front.saveOperation(event);assert.notEqual(sent.at(-1).p.intencion_id,invalidId);assert.equal(rows('operaciones')[0].finanzas_venta_id,'S');assert.equal(rows('movimientos').length,0);
 assert(front.saleActionButtons(sale).includes('data-sale-base'));assert(front.saleActionButtons(sale,false).includes('data-sale-base'));
 vm.runInContext("state.pendingSourceReuse={type:'VENTA',id:'S'};openSaleAsBase('S');",front);
 assert(node('#operationDialog').open);assert.equal(node('#opClient').value,'C');assert.equal(node('#opSourceSale').value,'');assert.equal(node('#opSourceOrder').value,'');assert.equal(node('#opReferenceOperation').value,'');assert.equal(node('#opSeller').disabled,false);
 assert.equal(vm.runInContext('state.currentSale',front),null);assert.equal(vm.runInContext('state.currentOrder',front),null);assert.equal(vm.runInContext('state.currentCreditOperation',front),null);assert.equal(vm.runInContext('state.pendingSourceReuse',front),null);assert.equal(vm.runInContext('pendingDocumentIntent()',front),null);
 assert.equal(vm.runInContext('state.draftItems[0].precio',front),100);assert.equal(vm.runInContext('state.draftItems[0].cantidad',front),1);
 vm.runInContext('state.draftItems[0].precio=130;state.draftItems[0].cantidad=2;',front);await front.saveOperation(event);
 const copied=sent.at(-1).p;assert.equal(copied.origen_venta_id,'');assert.equal(copied.origen_pedido_id,'');assert.equal(copied.referencia_operacion_id,'');assert.equal(copied.finanzas_id,undefined);assert.equal(copied.finanzas_venta_id,undefined);assert.equal(copied.operacion_id,undefined);assert.equal(copied.numero,undefined);assert.equal(copied.estado,undefined);assert.equal(copied.items[0].precio,130);assert.equal(copied.items[0].cantidad,2);assert.equal(copied.items[0].item_id,undefined);assert.equal(copied.items[0].operacion_id,undefined);
 const operations=rows('operaciones');assert.equal(operations.length,2);assert.notEqual(operations[0].operacion_id,operations[1].operacion_id);assert.equal(operations[1].finanzas_venta_id,'');assert.equal(operations[1].origen_venta_id,'');assert.equal(operations[1].referencia_operacion_id,'');assert.equal(operations[1].total,260);assert.equal(rows('movimientos').length,1);assert.equal(JSON.stringify(sale),saleBytes);assert.equal(JSON.stringify(source.getSheetByName('ventas').rows),originalSales);assert.equal(JSON.stringify(gestion.getSheetByName('finanzas_intenciones').rows),originalFinance);
 // Error real posterior a escritura: intención conservada y recuperable una sola vez.
 vm.runInContext("openSaleAsBase('S');",front);armed={sheet:'operaciones',left:1,after:true};await front.saveOperation(event);assert(!node('#operationDialog').open);const pending=vm.runInContext('pendingDocumentIntent()',front);assert(pending);assert(messages.at(-1).startsWith('Resultado no confirmado'));await front.recoverPendingDocumentIntent();assert.equal(vm.runInContext('pendingDocumentIntent()',front),null);assert.equal(rows('operaciones').length,3);
 // Red ambigua y marca de otro ID: ambos conservan el intento.
 vm.runInContext("openSaleAsBase('S');",front);front.send=async()=>{throw Error('timeout')};vm.runInContext('apiPost=send',front);await front.saveOperation(event);assert(vm.runInContext('pendingDocumentIntent()',front));
 vm.runInContext('clearDocumentIntent(pendingDocumentIntent().payload.intencion_id);openSaleAsBase(\"S\");',front);front.send=async()=>{const e=Error('validación ajena');e.code='D9G_VALIDACION_NO_APLICADA';e.no_aplicado=true;e.intencion_id='DOCI-OTROID000000';throw e};vm.runInContext('apiPost=send',front);await front.saveOperation(event);assert(vm.runInContext('pendingDocumentIntent()',front));
 console.log('Frontend: rechazo claro con formulario abierto, nueva identidad editable e independiente, original intacto y recuperación post-escritura/red OK');
})().catch(e=>{console.error(e);process.exitCode=1});
