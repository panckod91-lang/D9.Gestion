'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(path.join(__dirname,'..','apps-script','Code.gs'),'utf8');
let uuid=0;
class Sheet{
  constructor(rows=[]){this.rows=rows.map(row=>[...row])}
  getLastRow(){return this.rows.length}getLastColumn(){return Math.max(0,...this.rows.map(row=>row.length))}getMaxRows(){return 1000}getFrozenRows(){return 1}setFrozenRows(){}
  getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn())}
  getRange(r,c,n=1,m=1){const sheet=this;return {
    getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sheet.rows[r+i-1]?.[c+j-1]??''))},
    getDisplayValues(){return this.getValues().map(row=>row.map(String))},
    setValues(values){values.forEach((row,i)=>row.forEach((value,j)=>{sheet.rows[r+i-1]??=[];sheet.rows[r+i-1][c+j-1]=value}));return this},
    setValue(value){sheet.rows[r-1]??=[];sheet.rows[r-1][c-1]=value;return this}
  }}
  appendRow(row){this.rows.push([...row])}
}
class Book{constructor(){this.sheets={}}getSheetByName(name){return this.sheets[name]||null}insertSheet(name){this.sheets[name]=new Sheet();return this.sheets[name]}seed(name,rows){this.sheets[name]=new Sheet(rows)}}
const source=new Book(),gestion=new Book();
source.seed('productos',[
  ['id','nombre','categoria','lista_1','lista_2','lista_3','activo','marca'],
  ['A','A','R',121,200,300,'si','Marca A'],
  ['B','B','R',121,210,310,'si','Marca B'],
  ['FUERA','Fuera','R',50,220,320,'si','Marca F']
]);
gestion.seed('auditoria',[['auditoria_id','timestamp','usuario_id','usuario','accion','entidad','entidad_id','detalle']]);
const context=vm.createContext({Date,Math,JSON,Number,String,Set,Array,Error,Utilities:{getUuid:()=>String(++uuid),formatDate:()=> '2026-10-12 21:00:00'}});
vm.runInContext(code,context);
Object.assign(context,{d9gSource_:()=>source,d9gGestion_:()=>gestion,d9gRequireSourceWrites_:()=>{}});
const user={id:'U',nombre:'Tincho'},incoming=[
  {id:'A',nombre:'A',categoria:'R',lista_1:122},
  {id:'B',nombre:'B',categoria:'R',lista_1:121},
  {id:'C',nombre:'C',categoria:'R',lista_1:150}
];
const first=context.d9gSourceImportProducts_(user,{listas:['lista_1'],productos:incoming});
assert.strictEqual(first.actualizados,2,'el contrato de respuesta conserva el conteo anterior');
assert.strictEqual(first.log.detalle,'3 productos · 1 con cambios · 1 sin cambios · 1 nuevos · 1 ausentes inactivos · Lista 1');
assert.strictEqual(context.d9gProductLogs_(gestion)[0].detalle,first.log.detalle,'el texto se guarda y vuelve a leerse desde auditoria');
assert.deepStrictEqual(source.getSheetByName('productos').rows[1].slice(4,6),[200,300],'listas ausentes preservadas');
const second=context.d9gSourceImportProducts_(user,{listas:['lista_1'],productos:incoming});
assert.strictEqual(second.log.detalle,'3 productos · 0 con cambios · 3 sin cambios · 0 nuevos · 0 ausentes inactivos · Lista 1');
assert.strictEqual(context.d9gProductLogs_(gestion).find(row=>row.auditoria_id===second.log.auditoria_id).detalle,second.log.detalle);
console.log('Registro: importación con cambios, sin cambios y lectura persistida del detalle OK');
