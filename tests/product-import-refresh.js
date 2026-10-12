'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8').replace(/\nboot\(\);\s*$/,'');

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function harness(){
  const elements=new Map(),calls=[],messages=[],seenAtSuccess=[],reads=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',className:'',disabled:false,checked:true,value:'',classList:{add(){},remove(){},toggle(){}},close(){this.closed=true}});
    return elements.get(id);
  };
  const storage=new Map();
  const context=vm.createContext({window:{D9_GESTION_CONFIG:{}},document:{querySelector:element,querySelectorAll:()=>[]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},Intl,Date,Number,JSON,console,setTimeout,clearTimeout,confirm:()=>true,calls,messages,seenAtSuccess,reads});
  vm.runInContext(code,context);
  vm.runInContext(`
    state.user={id:'A',rol_gestion:'admin'};
    state.permissions.gestion_admin=true;state.permissions.source_writes_enabled=true;
    state.productImport={products:[{id:'P1',lista_1:20}],detectedLists:['lista_1'],issues:[],summary:{hiddenAbsent:0}};
    state.source.productos_admin=[{id:'P1',lista_1:10}];
    apiPost=async (action,payload)=>{calls.push({action,payload});if(action==='source_import_products')return {ok:true,creados:0,actualizados:1,ocultos_ausentes:0};return reads.shift().promise};
    applyBootstrap=data=>{state.source.productos_admin=data.source.productos_admin;renderedPrice=state.source.productos_admin[0].lista_1};
    saveCurrentCache=()=>{};stageProductLog=()=>{};setSync=()=>{};
    toast=message=>{messages.push(message);if(message.startsWith('Lista importada'))seenAtSuccess.push({price:state.source.productos_admin[0].lista_1,renderedPrice})};
  `,context);
  return {context,calls,messages,seenAtSuccess,reads,element,run:()=>vm.runInContext('applyProductImport()',context),price:()=>vm.runInContext('state.source.productos_admin[0].lista_1',context)};
}
async function tick(){await new Promise(resolve=>setImmediate(resolve))}

(async()=>{
  const success=harness(),first=deferred();success.reads.push(first);
  const importing=success.run();await tick();
  assert.deepStrictEqual(success.calls.map(c=>c.action),['source_import_products','bootstrap']);
  assert.strictEqual(success.price(),10);
  assert.strictEqual(success.messages.length,0,'el éxito no puede aparecer antes de aplicar bootstrap');
  assert.strictEqual(success.element('#btnApplyProductImport').textContent,'Actualizando vista…');
  first.resolve({source:{productos_admin:[{id:'P1',lista_1:20}]}});await importing;
  assert.strictEqual(success.price(),20);
  assert.strictEqual(success.seenAtSuccess[0].renderedPrice,20,'la vista debe tener el precio nuevo antes del éxito');
  assert.strictEqual(success.element('#productImportDialog').closed,true);

  const failure=harness(),failed=deferred(),retry=deferred();failure.reads.push(failed,retry);
  const attempt=failure.run();await tick();failed.reject(new Error('Lectura fallida'));await attempt;
  assert.strictEqual(failure.price(),10);
  assert.strictEqual(failure.messages.length,0,'no hay éxito si falla la recarga');
  assert.strictEqual(failure.element('#productImportRefreshMessage').textContent,'La lista se guardó correctamente, pero no se pudo actualizar la vista.');
  assert.strictEqual(failure.element('#btnApplyProductImport').textContent,'Reintentar actualización');
  assert.strictEqual(failure.element('#productImportDialog').closed,undefined);
  const second=failure.run();await tick();
  assert.deepStrictEqual(failure.calls.map(c=>c.action),['source_import_products','bootstrap','bootstrap'],'el reintento nunca envía el XLS');
  assert.strictEqual(failure.messages.length,0);
  retry.resolve({source:{productos_admin:[{id:'P1',lista_1:20}]}});await second;
  assert.strictEqual(failure.seenAtSuccess[0].renderedPrice,20);
  assert.strictEqual(failure.element('#productImportDialog').closed,true);
  console.log('Importación confirmada, recarga demorada/fallida y reintento sólo bootstrap: OK');
})().catch(error=>{console.error(error);process.exitCode=1});
