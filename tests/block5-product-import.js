'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const base=path.resolve(__dirname,'..');
const uiCode=fs.readFileSync(path.join(base,'app.js'),'utf8').replace(/\nboot\(\);\s*$/,'');
const storage=new Map();
const ui=vm.createContext({window:{D9_GESTION_CONFIG:{}},document:{querySelector:()=>({classList:{add(){},remove(){},toggle(){}},disabled:false}),querySelectorAll:()=>[]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},Intl,Date,Number,JSON,console,setTimeout,clearTimeout});
vm.runInContext(uiCode,ui);
function parsed(value){return vm.runInContext('parseProductImportPrice(value)',Object.assign(ui,{value}))}
for(const [value,want] of [[3025,3025],['3025',3025],['3025,00',3025],['3.025,00',3025],['3025.00',3025],['3,025.00',3025],['12.345.678,90',12345678.9],['12,345,678.90',12345678.9]]){const p=parsed(value);assert(p.ok,`rechazó ${value}`);assert.strictEqual(p.value,want,`precio ${value}`);assert.strictEqual(vm.runInContext('productImportFinalPrice(value)',Object.assign(ui,{value:p.value})),Math.round((want*1.21+Number.EPSILON)*100)/100)}
assert.strictEqual(vm.runInContext('productImportFinalPrice(3025)',ui),3660.25);
for(const value of ['3.025','3,025'])assert(parsed(value).ambiguous,`ambigüedad ${value}`);
for(const value of ['3,02,5','3.025.00','abc','-1'])assert(!parsed(value).ok);
const headers=['Código','Descripción','Rubro','Lista 1','Lista 2','Lista 3'];
function analyze(rows){ui.rows=rows;return vm.runInContext('analyzeProductImportRows(rows,"precios.xlsx")',ui)}
let m=analyze([headers,['F046','Anchoas','Rubro',3025,3025,3025]]);
assert.strictEqual(m.issues.length,0);assert.deepStrictEqual([m.products[0].lista_1,m.products[0].lista_2,m.products[0].lista_3],[3660.25,3660.25,3660.25]);
m=analyze([headers,['F046','Anchoas','Rubro','3.025,00','3,025.00','3025.00']]);
assert.strictEqual(m.issues.length,0);assert.deepStrictEqual([m.products[0].lista_1,m.products[0].lista_2,m.products[0].lista_3],[3660.25,3660.25,3660.25]);
m=analyze([headers,['F046','Anchoas','Rubro',3025,'3,025',3025]]);assert(m.issues.some(x=>x.includes('Lista 2')&&x.includes('ambiguo')));
m=analyze([headers.slice(0,4),['F046','Anchoas','Rubro',3025]]);assert.strictEqual(m.issues.length,0);assert.deepStrictEqual(Array.from(m.detectedLists),['lista_1']);assert.strictEqual(m.products[0].lista_1,3660.25);
console.log('Frontend: numéricos raw, textos AR/US, ambigüedad, IVA y 3 listas/opcionales OK');

const code=fs.readFileSync(path.join(base,'apps-script/Code.gs'),'utf8');let uuid=0;
class Sheet{
  constructor(rows=[]){this.rows=rows.map(r=>[...r])}getLastRow(){return this.rows.length}getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length))}getFrozenRows(){return 1}setFrozenRows(){}getMaxRows(){return 1000}getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn())}
  getRange(r,c,n=1,m=1){const sh=this;return {getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sh.rows[r+i-1]?.[c+j-1]??''))},getDisplayValues(){return this.getValues().map(row=>row.map(String))},setValues(values){values.forEach((row,i)=>row.forEach((v,j)=>{sh.rows[r+i-1]??=[];sh.rows[r+i-1][c+j-1]=v}));return this},setValue(value){sh.rows[r-1]??=[];sh.rows[r-1][c-1]=value;return this}}}
  appendRow(row){this.rows.push([...row])}
}
class Book{constructor(){this.sheets={}}getSheetByName(n){return this.sheets[n]||null}insertSheet(n){this.sheets[n]=new Sheet();return this.sheets[n]}seed(n,rows){this.sheets[n]=new Sheet(rows);return this.sheets[n]}}
const source=new Book(),gestion=new Book(),headersProduct=['id','nombre','categoria','marca','activo','lista_1','lista_2','lista_3','auxiliar'];
const original=['F046','Anchoas','Almacén','Braudracco','si',100,200,300,'NO CAMBIAR'];
source.seed('productos',[headersProduct,original]);gestion.seed('auditoria',[['auditoria_id','timestamp','usuario_id','usuario','accion','entidad','entidad_id','detalle']]);
const ctx=vm.createContext({Date,Math,JSON,Number,String,Set,Array,Error,Utilities:{getUuid:()=>String(++uuid),formatDate:()=> '2026-09-27 10:00:00'}});
vm.runInContext(code,ctx);Object.assign(ctx,{d9gSource_:()=>source,d9gGestion_:()=>gestion,d9gRequireSourceWrites_:()=>{}});
const user={id:'U',nombre:'Tincho'},product={id:'F046',nombre:'Otro',categoria:'Otra',marca:'Otra',activo:'no',lista_1:1,lista_2:'',lista_3:''};
const before=JSON.stringify(source.getSheetByName('productos').rows),auditBefore=gestion.getSheetByName('auditoria').rows.length;
assert.throws(()=>ctx.d9gSourceSaveProduct_(user,{modo:'CREAR',producto:product}),/Ya existe un producto/);
assert.strictEqual(JSON.stringify(source.getSheetByName('productos').rows),before);assert.strictEqual(gestion.getSheetByName('auditoria').rows.length,auditBefore);
assert.throws(()=>ctx.d9gSourceSaveProduct_(user,{producto:product}),/falta distinguir alta de edición/);
assert.strictEqual(JSON.stringify(source.getSheetByName('productos').rows),before);
let result=ctx.d9gSourceSaveProduct_(user,{modo:'CREAR',producto:{id:'NUEVO',nombre:'Nuevo',categoria:'Almacén',marca:'M',activo:'si',lista_1:50,lista_2:60,lista_3:70}});assert(result.created);assert.strictEqual(source.getSheetByName('productos').rows.length,3);
result=ctx.d9gSourceSaveProduct_(user,{modo:'EDITAR',producto:{id:'F046',nombre:'Anchoas editadas',lista_1:110}});assert(!result.created);
const edited=source.getSheetByName('productos').rows[1];assert.deepStrictEqual(edited,['F046','Anchoas editadas','Almacén','Braudracco','si',110,200,300,'NO CAMBIAR']);
assert.throws(()=>ctx.d9gSourceSaveProduct_(user,{modo:'EDITAR',producto:{id:'DESAPARECIDO',nombre:'Otro'}}),/ya no existe/);
console.log('Backend: alta, rechazo sin escrituras, edición deliberada y preservación Lista 2/3 OK');

source.seed('productos',[headersProduct,original]);
result=ctx.d9gSourceImportProducts_(user,{listas:['lista_1'],productos:[{id:'F046',nombre:'Anchoas',categoria:'Almacén',marca:'Braudracco',activo:'si',lista_1:3660.25}]});
assert.strictEqual(result.actualizados,1);assert.deepStrictEqual(source.getSheetByName('productos').rows[1],['F046','Anchoas','Almacén','Braudracco','si',3660.25,200,300,'NO CAMBIAR']);
source.seed('productos',[headersProduct,original]);
result=ctx.d9gSourceImportProducts_(user,{listas:['lista_1','lista_2','lista_3'],productos:[{id:'F046',nombre:'Anchoas',categoria:'Almacén',marca:'Braudracco',activo:'si',lista_1:3660.25,lista_2:3660.25,lista_3:3660.25}]});
assert.deepStrictEqual(source.getSheetByName('productos').rows[1].slice(5,8),[3660.25,3660.25,3660.25]);
console.log('Backend importación: Lista 1 sola preserva 2/3; archivo con 3 listas actualiza las 3 OK');

// El lector debe pedir .v en lugar de .w a SheetJS para una celda numérica.
const fakePriceCell={t:'n',v:3025,w:'3,025.00'};
let requestedRaw=[];
ui.fakeXlsx={read:()=>({SheetNames:['Hoja1'],Sheets:{Hoja1:{price:fakePriceCell}}}),utils:{sheet_to_json(_sheet,options){requestedRaw.push(options.raw);return [['Código','Descripción','Rubro','Lista 1'],[options.raw?1:'001','Precio numérico','Almacén',options.raw?fakePriceCell.v:fakePriceCell.w]]}}};
ui.fakeFile={name:'numérico.xlsx',arrayBuffer:async()=>new ArrayBuffer(0)};
vm.runInContext('loadProductImportXlsx=async()=>fakeXlsx;renderProductImport=()=>{}',ui);
(async()=>{await vm.runInContext('readProductImportFile({target:{files:[fakeFile]}})',ui);assert.deepStrictEqual(requestedRaw,[false,true]);assert.strictEqual(vm.runInContext('state.productImport.products[0].id',ui),'001');assert.strictEqual(vm.runInContext('state.productImport.products[0].lista_1',ui),3660.25);console.log('Lectura SheetJS simulada: .v=3025 y .w="3,025.00" => 3660.25 OK')})().catch(error=>{console.error(error);process.exit(1)});
