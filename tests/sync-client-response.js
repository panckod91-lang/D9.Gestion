'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace(/\nboot\(\);\s*$/,'');
function harness(){
 const nodes=new Map(),storage=new Map(),calls=[],messages=[];let handler;
 function node(s){if(!nodes.has(s)){const flags=new Set();nodes.set(s,{value:'',textContent:'',innerHTML:'',title:'',className:'',disabled:false,dataset:{},open:true,classList:{add(...keys){keys.forEach(k=>flags.add(k))},remove(...keys){keys.forEach(k=>flags.delete(k))},toggle(k,on){if(on===undefined)on=!flags.has(k);on?flags.add(k):flags.delete(k)},contains:k=>flags.has(k)},setAttribute(){},showModal(){this.open=true},close(){this.open=false},focus(){},reset(){}})}return nodes.get(s)}
 const context=vm.createContext({window:{D9_GESTION_CONFIG:{API_URL:'https://script.google.com/macros/s/test/exec'}},navigator:{onLine:true},document:{querySelector:node,querySelectorAll:()=>[],visibilityState:'visible'},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},URL,performance:{now:()=>Date.now()},Date,Intl,JSON,Number,console,setTimeout,clearTimeout,confirm:()=>false,fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push(body.action);return handler(body,url)}});
 vm.runInContext(code,context);Object.assign(context,{toast:m=>messages.push(m)});
 vm.runInContext("state.user={id:'U',rol_gestion:'super_admin'};state.token='T';state.source.usuarios=[{id:'V',nombre:'Ale',rol:'vendedor'}];state.permissions.gestion_admin=true;state.permissions.source_writes_enabled=true;saveCurrentCache=()=>{};renderClients=()=>{};hydrateClientFilters=()=>{};refreshAfterMutation=()=>{};readClientFiscalForm=()=>({});",context);
 for(const [id,value] of Object.entries({clientId:'10164',clientName:'Cliente de prueba',clientPhone:'',clientAddress:'',clientCity:'',clientPriceList:'lista_1',clientSeller:'V',clientActive:'si'}))node('#'+id).value=value;
 node('#clientForm').dataset.mode='new';node('#operationDialog').open=false;
 return {context,node,calls,messages,setHandler(fn){handler=fn},run:s=>vm.runInContext(s,context),save:()=>context.saveClient({preventDefault(){}})};
}
const response=(data,status=200)=>({ok:status>=200&&status<300,status,text:async()=>typeof data==='string'?data:JSON.stringify(data)});
const bootstrap=clients=>response({ok:true,permissions:{ambito:'REAL',gestion_admin:true},source:{clientes_admin:clients}});
const tick=()=>new Promise(setImmediate);
(async()=>{
 // 1. Alta escrita pero respuesta HTML: sólo una escritura y una lectura central.
 const a=harness();let clients=[];
 a.setHandler(body=>{if(body.action==='source_save_client'){clients.push({...body.cliente});return response('<!DOCTYPE html><html>ppConfig</html>')}assert.equal(body.action,'bootstrap');return bootstrap(clients)});
 await a.save();assert.deepEqual(a.calls,['source_save_client','bootstrap']);assert(!a.node('#clientDialog').open);assert(a.messages.at(-1).includes('verificado en central'));assert.equal(a.run('state.source.clientes_admin[0].id'),'10164');assert.equal(a.context.window.D9_GESTION_TIMINGS[0].tipo_error,'RESPUESTA_INVALIDA');assert.equal(a.context.window.D9_GESTION_TIMINGS[0].accion,'source_save_client');
 // 2. Respuesta inválida sin alta: no reenvía y mantiene el formulario.
 const b=harness();b.setHandler(body=>body.action==='bootstrap'?bootstrap([]):response('respuesta no JSON'));await b.save();assert.deepEqual(b.calls,['source_save_client','bootstrap']);assert(b.node('#clientDialog').open);assert(b.node('#clientFormMessage').textContent.includes('no figura en central'));assert.equal(b.node('#btnSaveClient').textContent,'Guardar cliente');
 // 3. Verificación interrumpida: el botón reintenta sólo la lectura.
 const c=harness();let central=null,available=false;
 c.setHandler(body=>{if(body.action==='source_save_client'){central={...body.cliente};return response('<html>respuesta inválida</html>')}if(!available)throw new TypeError('Failed to fetch');return bootstrap([central])});
 await c.save();assert.equal(c.calls.filter(x=>x==='source_save_client').length,1);assert(c.node('#btnSaveClient').textContent.startsWith('Verificar cliente'));assert(c.node('#clientFormMessage').textContent.includes('no se reenviará'));available=true;await c.save();assert.equal(c.calls.filter(x=>x==='source_save_client').length,1);assert(!c.node('#clientDialog').open);
 // 4. ID existente con datos distintos: no lo sobrescribe ni lo atribuye a este envío.
 const d=harness();d.setHandler(body=>body.action==='bootstrap'?bootstrap([{id:'10164',nombre:'Otro comercio',activo:'si',lista_precio:'lista_1'}]):response('<html>error</html>'));await d.save();assert(d.node('#clientFormMessage').textContent.includes('datos distintos'));assert.equal(d.node('#btnSaveClient').textContent,'Ver ficha central');
 d.run('openClientEditor=(id)=>{openedCentralClient=id}');await d.save();assert.equal(d.run('openedCentralClient'),'10164');assert.equal(d.calls.filter(x=>x==='source_save_client').length,1);
 // 5. Validación concreta: mantiene su error, sin consultar ni reenviar innecesariamente.
 const e=harness();e.setHandler(()=>response({ok:false,error:'La lista de precios asignada no existe en productos.'}));await e.save();assert.deepEqual(e.calls,['source_save_client']);assert(e.node('#clientFormMessage').textContent.includes('source_save_client'));assert(e.node('#clientFormMessage').textContent.includes('lista de precios'));
 // 6. HTTP y errores de aplicación se diferencian de una respuesta HTML inválida.
 await assert.rejects(e.context.parseResponse(response('<html>503</html>',503),'bootstrap'),err=>err.apiKind==='HTTP'&&err.httpStatus===503&&err.apiAction==='bootstrap');
 await assert.rejects(e.context.parseResponse(response(null),'bootstrap'),err=>err.apiKind==='RESPUESTA_INVALIDA');
 // 7. Bootstrap fallido con Internet: nunca lo llama dispositivo sin conexión.
 const f=harness();f.run('state.cacheLoaded=true;');f.setHandler(()=>response({ok:false,error:'La intención DOCI-X requiere revisión.'}));await f.context.loadAll({silent:true});assert.equal(f.node('#syncBadge').textContent,'Datos locales · actualización pendiente');assert(f.node('#syncBadge').title.includes('bootstrap'));assert(f.node('#syncBadge').title.includes('DOC I'.replace(' ','')));
 // Un fallo local de renderizado tampoco se presenta como pérdida de Internet.
 f.run('applyBootstrap=()=>{throw Error("fallo de representación")};');await f.context.loadAll({silent:true,request:Promise.resolve({ok:true})});assert(f.node('#syncBadge').title.includes('error al aplicar datos'));
 // 8. Sin red informada por el navegador: etiqueta separada, sin afirmar que una operación no se guardó.
 f.context.navigator.onLine=false;await f.context.loadAll({silent:true,request:Promise.reject(f.context.apiFailure('bootstrap','TRANSPORTE','Failed to fetch'))});assert(f.node('#syncBadge').textContent.startsWith('Navegador sin red'));
 // 9. Inicio con caché y backend pendiente: indica consulta central y limpia el flag al terminar.
 const g=harness();let rejectRequest;g.run('renderTestModeD9=()=>{};');g.context.showCachedData=async()=>{g.run('state.cacheLoaded=true');return true};g.context.apiRead=()=>new Promise((_,reject)=>rejectRequest=reject);
 const initializing=g.context.initializeAppData();await tick();assert.equal(g.node('#appBusyStatus').textContent,'Consultando datos actualizados en central…');assert(g.run('appInitializing'));rejectRequest(g.context.apiFailure('bootstrap','HTTP','HTTP 503',503));await initializing;assert(!g.run('appInitializing'));assert(g.node('#appBusyStatus').classList.contains('hidden'));
 // 10. La marca determinística de comprobantes continúa atravesando parseResponse intacta.
 await assert.rejects(g.context.parseResponse(response({ok:false,error:'Total distinto',code:'D9G_VALIDACION_NO_APLICADA',no_aplicado:true,intencion_id:'DOCI-EXAMPLE00001'}),'create_operacion'),err=>err.no_aplicado===true&&err.intencion_id==='DOCI-EXAMPLE00001');
 // Una revisión de actividad exitosa limpia su error anterior, pero no oculta un bootstrap fallido.
 const h=harness();h.run("state.ordersRevision='R';state.salesRevision='S';");h.setHandler(()=>response({ok:true,pedidos_revision:'R',ventas_revision:'S'}));
 h.context.setSync('Actividad pendiente',true,'actividad_revision · fallo');await h.context.pollOrders();assert.equal(h.node('#syncBadge').textContent,'Actividad verificada · sin novedades');
 h.context.setSync('Datos locales · actualización pendiente',true,'bootstrap · fallo');await h.context.pollOrders();assert.equal(h.node('#syncBadge').textContent,'Datos locales · actualización pendiente');
 console.log('OK: alta con respuesta perdida, verificación sin reenvío, ausencia, conflicto, validación, HTTP/HTML/transporte/local, estados de inicio y contrato DOCI preservado');
})().catch(error=>{console.error(error);process.exitCode=1});
