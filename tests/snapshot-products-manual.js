'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert');
const code=fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8');
let uuid=0,sourceWrites=0,failChunks=false,flushes=0;
class Sheet{
  constructor(name,rows=[],formulas=[]){this.name=name;this.rows=rows.map(r=>[...r]);this.formulas=formulas.map(r=>[...r]);}
  getLastRow(){return this.rows.length}
  getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length))}
  getRange(r,c,n=1,m=1){const sh=this;return {
    getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sh.rows[r+i-1]?.[c+j-1]??''))},
    getFormulas(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sh.formulas[r+i-1]?.[c+j-1]??''))},
    setValues(values){if(sh.name==='productos')sourceWrites++;
      if(failChunks&&sh.name==='productos_snapshots'&&values[0][8]>0){failChunks=false;sh.rows[r-1]=[...values[0]];sh.rows[r-1][9]='\"cortado\"';throw Error('Fallo simulado al escribir fragmentos')}
      values.forEach((row,i)=>row.forEach((value,j)=>{sh.rows[r+i-1]??=[];sh.rows[r+i-1][c+j-1]=value}));return this},
    setValue(value){if(sh.name==='productos')sourceWrites++;sh.rows[r-1]??=[];sh.rows[r-1][c-1]=value;return this}
  }}
  deleteRow(row){if(this.name==='productos')sourceWrites++;this.rows.splice(row-1,1)}
}
class Book{
  constructor(){this.sheets={};this.insertions={}}
  getSheetByName(name){return this.sheets[name]||null}
  insertSheet(name){this.insertions[name]=(this.insertions[name]||0)+1;return this.sheets[name]=new Sheet(name)}
  seed(name,rows,formulas){this.sheets[name]=new Sheet(name,rows,formulas)}
}
const source=new Book(),gestion=new Book(),date=new Date('2026-10-12T18:42:00.000Z');
source.seed('productos',[
  ['id','codigo','nombre','categoria','marca','lista_1','lista_2','lista_3','activo','nota','fecha_auxiliar','calculado'],
  ['P-1','001','Pintura','Interior','Marca',121,155,170,'si','manual',date,242],
  ['P-2','002','Esmalte','Exterior','Marca',0,30,40,'no','=TEXTO_LITERAL',date,0]
],[[],['','','','','','','','','','','','=F2*2']]);
const original=JSON.stringify(source.getSheetByName('productos').rows);
const context=vm.createContext({Date,JSON,Number,String,Set,Array,Error,Utilities:{
  getUuid:()=>String(++uuid).padStart(8,'0'),formatDate:()=> '2026-10-12 22:00:00',
  DigestAlgorithm:{SHA_256:'SHA256'},Charset:{UTF_8:'UTF-8'},
  computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s,'utf8').digest()].map(n=>n>127?n-256:n)
},SpreadsheetApp:{flush(){flushes++}}});
vm.runInContext(code,context);
Object.assign(context,{d9gSource_:()=>source,d9gGestion_:()=>gestion,d9gRequireAdmin_:()=>{}});
const user={id:'admin'};
assert.strictEqual(context.d9gSnapshotProductosListar_(user).snapshots.length,0);
assert(!gestion.getSheetByName('productos_snapshots'),'listar no crea una hoja');
gestion.insertSheet('productos_snapshots'); // Hoja ya existente y vacía: se reutiliza sin recrearla.
let first=context.d9gSnapshotProductosCrear_(user);assert.strictEqual(first.snapshot.estado,'DISPONIBLE');
const sh=gestion.getSheetByName('productos_snapshots');assert.strictEqual(gestion.insertions.productos_snapshots,1);
let firstEntry=context.d9gSnapshotProductosRows_(sh).find(x=>x.row[0]===first.snapshot.id&&x.row[8]===0);
const meta=context.d9gSnapshotProductosRead_(sh,firstEntry);assert.strictEqual(meta.sha256,first.snapshot.sha256);
const pieces=context.d9gSnapshotProductosRows_(sh).filter(x=>x.row[0]===first.snapshot.id&&x.row[8]>0).sort((a,b)=>a.row[8]-b.row[8]);
const data=JSON.parse(pieces.map(x=>JSON.parse(x.row[9])).join(''));
assert.strictEqual(data.valores[1][10][0],'fecha');assert.strictEqual(data.valores[1][10][1],date.toISOString());
assert.strictEqual(data.formulas[1][11],'=F2*2');assert.strictEqual(data.valores[1][9][1],'manual');
assert.strictEqual(data.valores[2][8][1],'no');assert.strictEqual(data.valores[2][9][1],'=TEXTO_LITERAL');
assert.strictEqual(data.columnas,12);assert.strictEqual(data.filas,3);assert(flushes>0);
// La hoja previa se reutiliza y el contenido no se reinicializa.
context.d9gSnapshotProductosCrear_(user);assert.strictEqual(gestion.insertions.productos_snapshots,1);
source.getSheetByName('productos').rows[1][9]='Texto extenso '.repeat(1800);
const large=context.d9gSnapshotProductosCrear_(user).snapshot;
assert(large.partes>1,'se guardan múltiples fragmentos');
const largeEntry=context.d9gSnapshotProductosRows_(sh).find(x=>x.row[0]===large.id&&x.row[8]===0);
assert.strictEqual(context.d9gSnapshotProductosRead_(sh,largeEntry).sha256,large.sha256);
source.getSheetByName('productos').rows[1][9]='manual';
failChunks=true;assert.throws(()=>context.d9gSnapshotProductosCrear_(user),/INCOMPLETO/);
let all=context.d9gSnapshotProductosListar_(user).snapshots;let incomplete=all.find(x=>x.estado==='INCOMPLETO');assert(incomplete?.error.includes('Fallo simulado'));
assert.strictEqual(context.d9gSnapshotProductosVerificar_(user,{snapshot_id:incomplete.id}).snapshot.estado,'INCOMPLETO');
for(let i=0;i<21;i++)context.d9gSnapshotProductosCrear_(user);
all=context.d9gSnapshotProductosListar_(user).snapshots;
assert.strictEqual(all.filter(x=>x.estado==='DISPONIBLE').length,20);assert(all.find(x=>x.id===incomplete.id));
assert(!all.find(x=>x.id===first.snapshot.id),'el más antiguo DISPONIBLE fue retirado');
// Una copia disponible alterada queda INCOMPLETA y se conserva.
const latest=all.find(x=>x.estado==='DISPONIBLE');const p=context.d9gSnapshotProductosRows_(sh).find(x=>x.row[0]===latest.id&&x.row[8]===1);sh.rows[p.index-1][9]='"alterado"';
const verify=context.d9gSnapshotProductosVerificar_(user,{snapshot_id:latest.id});assert.strictEqual(verify.snapshot.estado,'INCOMPLETO');assert(verify.snapshot.error);
assert.strictEqual(sourceWrites,0);assert.strictEqual(JSON.stringify(source.getSheetByName('productos').rows),original);
console.log('OK: creación, reconstrucción, fórmula, fechas, auxiliares, inactivos, incompleto, retención 20, integridad y cero escrituras en productos');
