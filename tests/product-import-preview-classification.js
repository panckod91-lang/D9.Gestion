'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8').replace(/\nboot\(\);\s*$/,'');
const elements=new Map();
function element(selector){if(!elements.has(selector))elements.set(selector,{classList:{add(){},remove(){}},innerHTML:'',className:'',checked:false,disabled:false});return elements.get(selector)}
const storage=new Map();
const ui=vm.createContext({window:{D9_GESTION_CONFIG:{}},document:{querySelector:element,querySelectorAll:()=>[]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},Intl,Date,Number,JSON,console,setTimeout,clearTimeout});
vm.runInContext(code,ui);
function analyze(headers,rows,current){ui.headers=headers;ui.rows=rows;ui.current=current;return vm.runInContext('state.source.productos_admin=current;analyzeProductImportRows([headers,...rows],"lista.xls")',ui)}
const base=['Código','Descripción','Rubro','Lista 1'];
const current=[
  {id:'A',nombre:'A',categoria:'R',marca:'Marca A',lista_1:121,lista_2:20,lista_3:30,activo:'si',auxiliar:'valor ajeno'},
  {id:'B',nombre:'B',categoria:'R',marca:'Marca B',lista_1:121,lista_2:20,lista_3:30,activo:'si'},
  {id:'FUERA',nombre:'Fuera',categoria:'R',marca:'M',lista_1:50,activo:'si'}
];
let model=analyze(base,[['A','A','R',100],['B','B','R',200],['C','C','R',100]],current);
assert.deepStrictEqual([model.summary.total,model.summary.created,model.summary.changed,model.summary.unchanged,model.summary.hiddenAbsent],[3,1,1,1,1]);
assert.strictEqual(model.summary.updated,2);
ui.model=model;vm.runInContext('state.productImport=model;renderProductImport()',ui);
const summary=element('#productImportSummary').innerHTML;
for(const label of ['Filas válidas','Nuevos','Existentes con cambios','Existentes sin cambios','Activos','Ocultos por precio','Ausentes a ocultar'])assert(summary.includes(label),label);
assert(!summary.includes('<small>Actualizados</small>'));
assert.deepStrictEqual(Array.from(model.detectedLists),['lista_1']);

model=analyze([...base,'Lista 2'],[['A','A','R',100,25]],current);
assert.deepStrictEqual([model.summary.changed,model.summary.unchanged],[1,0],'Lista 2 presente participa');
model=analyze([...base,'Lista 3'],[['A','A','R',100,24.79]],current);
assert.deepStrictEqual([model.summary.changed,model.summary.unchanged],[0,1],'Lista 3 presente pero igual no cambia');
model=analyze([...base,'Marca'],[['A','A','R',100,'Otra marca']],current);
assert.strictEqual(model.summary.changed,1,'marca presente en XLS y Sheet participa');
model=analyze([...base,'Marca'],[['A','A','R',100,'Otra marca']],[{id:'A',nombre:'A',categoria:'R',lista_1:121,activo:'si'}]);
assert.strictEqual(model.summary.unchanged,1,'marca sin columna en Sheet no participa');
model=analyze(base,[['A','A','R',0]],current);
assert.deepStrictEqual([model.summary.changed,model.summary.hiddenZero,model.products[0].activo],[1,1,'no'],'Lista 1 y activo participan');
model=analyze([...base,'Lista 2'],[['A','A','R',100,'']],[{...current[0],lista_2:0}]);
assert.strictEqual(model.summary.changed,1,'Lista 2 vacía escribe celda vacía si antes contenía cero');
console.log('Vista previa: nuevos, cambios reales, sin cambios, campos administrados y listas opcionales OK');
