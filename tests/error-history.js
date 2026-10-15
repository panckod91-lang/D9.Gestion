'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace(/\nboot\(\);\s*$/,'');
function harness(storage=new Map(),blocked=false){
 const nodes=new Map(),listeners={},downloads=[];let copied='';
 const node=s=>{if(!nodes.has(s))nodes.set(s,{value:'',textContent:'',focus(){this.focused=true},select(){this.selected=true}});return nodes.get(s)};
 const context=vm.createContext({window:{D9_GESTION_CONFIG:{APP_VERSION:'0.20.11',API_URL:'https://script.google.com/macros/s/test/exec'},addEventListener:(name,fn)=>listeners[name]=fn},document:{querySelector:node},navigator:{onLine:true,clipboard:{writeText:async text=>{copied=text}}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(blocked)throw Error('QuotaExceeded');storage.set(k,v)}},Date,URL,Blob,Intl,console,performance:{now:()=>100},setTimeout,clearTimeout});
 vm.runInContext(source,context);context.toast=()=>{};context.downloadBlob=(blob,name)=>downloads.push({blob,name});
 return {context,storage,node,listeners,downloads,get copied(){return copied},run:s=>vm.runInContext(s,context)};
}
(async()=>{
 const h=harness();h.run('state.token="SECRET_SESSION_123"');
 h.context.rememberError('bootstrap','RESPUESTA_INVALIDA','HTML en lugar de JSON');
 assert.equal(h.run('errorHistory().length'),1);
 const reloaded=harness(h.storage);assert.equal(reloaded.run('errorHistory()[0].accion'),'bootstrap');
 h.context.rememberError('login','TRANSPORTE','token=abc password="hunter2" Authorization: Bearer xyz https://host.test/a?key=secret SECRET_SESSION_123');
 const report=h.context.errorHistoryReport();for(const secret of ['SECRET_SESSION_123','hunter2','abc','xyz','key=secret'])assert(!report.includes(secret),secret);assert(report.includes('[oculto]'));
 h.context.rememberError('login','TRANSPORTE','token=abc password="hunter2" Authorization: Bearer xyz https://host.test/a?key=secret SECRET_SESSION_123');
 assert.equal(h.run('errorHistory().length'),2);assert.equal(h.run('errorHistory()[1].repeticiones'),2);
 h.context.recordTiming('source_save_client',20,{resultado:'ERROR',tipo_error:'HTTP',http_status:503,detalle:'HTTP 503'});
 assert.equal(h.run('errorHistory().at(-1).http'),503);assert.equal(h.run('errorHistory().at(-1).ms'),80);
 h.context.recordTiming('bootstrap',20,{resultado:'OK'});assert.equal(h.run('errorHistory().length'),3);
 for(let i=0;i<110;i++)h.context.rememberError('consulta-'+i,'BACKEND','Error '+i);
 assert.equal(h.run('errorHistory().length'),100);assert.equal(h.run('errorHistory()[0].accion'),'consulta-10');
 h.context.renderErrorHistory();assert(h.node('#errorHistoryStatus').textContent.includes('100 de 100'));assert(h.node('#errorHistoryReport').value.includes('consulta-109'));
 await h.context.copyErrorHistory();assert(h.copied.includes('consulta-109'));assert(!h.copied.includes('SECRET_SESSION_123'));
 delete h.context.navigator.clipboard;await h.context.copyErrorHistory();assert(h.node('#errorHistoryReport').selected);
 h.context.downloadErrorHistory();assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].blob.type,'text/plain;charset=utf-8');assert((await h.downloads[0].blob.text()).includes('consulta-109'));
 const blocked=harness(new Map(),true);assert.doesNotThrow(()=>blocked.context.rememberError('bootstrap','HTTP','Error'));blocked.context.renderErrorHistory();assert(blocked.node('#errorHistoryStatus').textContent.includes('esta sesión'));
 // Registro de JS/promesas sin interceptar el error ni serializar objetos/payloads.
 for(const id of ['#btnCopyErrors','#btnDownloadErrors'])h.node(id).addEventListener=()=>{};
 h.context.bindErrorHistory();h.listeners.error({message:'Fallo de vista'});h.listeners.unhandledrejection({reason:{payload:{password:'DO_NOT_CAPTURE'},message:'Fallo local'}});assert(!h.context.errorHistoryReport().includes('DO_NOT_CAPTURE'));
 // Toast de error registra el aviso antes de tocar DOM; los avisos normales no registran.
 const toastBody=source.slice(source.indexOf('function toast(message'),source.indexOf('\nfunction apiReady'));
 assert(toastBody.includes('if(type==="error")rememberError'));
 assert(source.includes('config:renderErrorHistory'));
 assert(!source.slice(source.indexOf('const ERROR_HISTORY_KEY'),source.indexOf('function toast(message')).includes('fetch('));
 console.log('OK: historial persistente y limitado, API/avisos/JS, sanitización, copia y fallback, descarga, almacenamiento bloqueado; sin peticiones ni payloads.');
})().catch(error=>{console.error(error);process.exitCode=1});
