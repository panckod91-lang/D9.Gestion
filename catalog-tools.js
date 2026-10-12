"use strict";
function catalogOperationId(){return "CAT-"+(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2))}
function catalogPendingKey(){return "d9g_catalog_pending_"+String(state.user?.id||state.user?.usuario_id||"user")}
function catalogPending(){try{return JSON.parse(localStorage.getItem(catalogPendingKey())||"null")}catch{return null}}
let catalogMutationBusy=false,catalogRefreshBusy=false;
function saveCatalogPending(pending){
  const key=catalogPendingKey(),encoded=JSON.stringify(pending);
  try{localStorage.setItem(key,encoded);if(localStorage.getItem(key)!==encoded)throw new Error("Verificación fallida");}
  catch{throw new Error("No se pudo guardar y verificar la operación en este dispositivo. No se enviaron cambios a central.");}
}
function catalogDialog(){let el=document.getElementById("catalogDialog");if(!el){el=document.createElement("dialog");el.id="catalogDialog";el.className="dialog";document.body.appendChild(el)}return el}
function showCatalogRefreshWarning(message){const el=catalogDialog();el.innerHTML=`<div class="dialog-head"><h2>Verificar actualización</h2><button class="dialog-close" onclick="document.getElementById('catalogDialog').close()">×</button></div><p>${esc(message)}</p><p>No vuelvas a importar el XLS para actualizar la pantalla. Se conserva el ID de la operación.</p><button id="catalogRefreshButton" class="btn primary" onclick="retryCatalogRefresh()">Reintentar actualización</button>`;if(!el.open)el.showModal()}
async function refreshCatalogAfterWrite(pending,message){
  if(catalogRefreshBusy)return false;
  catalogRefreshBusy=true;state.catalogEpoch=(state.catalogEpoch||0)+1;
  const refreshButton=document.getElementById("catalogRefreshButton");if(refreshButton){refreshButton.disabled=true;refreshButton.textContent="Verificando…";}setSync("Verificando maestro comercial…");
  const generation=scopeGeneration,token=state.token,key=catalogPendingKey(),epoch=state.catalogEpoch;
  const assertCurrent=()=>{if(generation!==scopeGeneration||token!==state.token||state.testMode)throw new Error("Cambió la sesión o el ámbito durante la verificación.");};
  try{
    // La consulta de resultado recupera escrituras interrumpidas antes de leer la vista.
    const status=await apiRead("source_catalog_result",{operacion_id:pending.operacion_id});assertCurrent();
    const data=await apiRead("bootstrap");assertCurrent();
    if(!status.catalogo_revision||status.catalogo_revision!==data.source?.productos_revision)throw new Error("No se pudo confirmar la misma versión del maestro en central y en la vista. Reintentá la actualización.");
    if(!status.aplicada){
      if(["NO_ENCONTRADA","INCOMPLETO"].includes(status.estado)){
        applyBootstrap(data);saveCurrentCache();
        const notApplied=status.estado==="INCOMPLETO";
        setSync(notApplied?"Vista actualizada · operación no aplicada":"Vista actualizada · resultado incierto",!notApplied);
        const el=catalogDialog();el.innerHTML=`<h2>${notApplied?"Operación no aplicada":"Resultado no disponible · estado incierto"}</h2><p>Se leyó el maestro actual de central. Este reintento no envió el XLS.</p><p>${notApplied?"La intención central quedó INCOMPLETA antes de habilitar la escritura de productos. Esa operación no se aplicó.":"No hay un resultado central disponible para confirmar qué ocurrió en el intento original. No se puede afirmar desde esta consulta que se haya aplicado o que no se haya aplicado."}</p><p>Revisá el producto que cambiaba y el snapshot de esa intención antes de otra importación.</p><button class="btn primary" id="catalogRelease">Cerrar verificación después de revisar</button>`;
        document.getElementById("catalogRelease").onclick=()=>{try{assertCurrent();localStorage.removeItem(key);renderMasters();el.close();toast("Verificación cerrada. Podés revisar e importar de nuevo si corresponde.")}catch(error){toast(error.message,"error")}};
        if(!el.open)el.showModal();return false;
      }
      throw new Error("La escritura sigue pendiente de recuperación: "+status.estado);
    }
    applyBootstrap(data);saveCurrentCache();localStorage.removeItem(key);renderMasters();catalogDialog().close();
    const r=status.resultado,summary=r&&pending.tipo==="IMPORTACION"?` ${r.creados} nuevos · ${r.con_cambios} existentes con cambios · ${r.sin_cambios} existentes sin cambios.`:"";
    setSync("Maestro confirmado · vista actualizada");toast(message+summary);return true;
  }catch(error){if(generation===scopeGeneration&&token===state.token){setSync("Actualización sin confirmar",true);showCatalogRefreshWarning("Los datos pudieron haberse enviado, pero no se pudo confirmar la actualización de la vista. "+error.message);}return false}
  finally{if(state.catalogEpoch===epoch)state.catalogEpoch++;catalogRefreshBusy=false;const button=document.getElementById("catalogRefreshButton");if(button){button.disabled=false;button.textContent="Reintentar actualización";}}
}
async function retryCatalogRefresh(){const pending=catalogPending();if(!pending)return toast("No hay una operación pendiente de verificar.","error");await refreshCatalogAfterWrite(pending,"Operación confirmada y vista actualizada.")}
async function openCatalogHistory(){if(!isAdmin()||state.testMode)return toast("El historial comercial requiere administrador y modo REAL.","error");try{const response=await apiRead("source_catalog_history"),el=catalogDialog();el.innerHTML=`<div class="dialog-head"><h2>Historial de listas</h2><button class="dialog-close" onclick="document.getElementById('catalogDialog').close()">×</button></div><p>Últimos 20 estados previos. Restaurar guarda primero el maestro actual.</p>${catalogPending()?'<button class="btn secondary" onclick="retryCatalogRefresh()">Verificar operación pendiente</button>':""}${response.snapshots.map(x=>`<section class="card"><strong>${esc(x.fecha)} · ${esc(x.motivo)}</strong><p>${esc(x.usuario)} · ${esc(x.archivo||"Sin archivo")}<br>${x.productos} productos · ${esc(x.listas)}<br><small>${esc(x.id)} · v${esc(x.version)}</small></p><button class="btn secondary" onclick="previewCatalogRestore('${esc(x.id)}')">Ver antes de restaurar</button></section>`).join("")||"<p>Todavía no hay snapshots.</p>"}`;if(!el.open)el.showModal()}catch(error){toast(error.message,"error")}}
async function previewCatalogRestore(id){if(catalogPending())return showCatalogRefreshWarning("Verificá primero la operación anterior.");try{const p=await apiRead("source_catalog_preview",{snapshot_id:id});const el=catalogDialog();el.innerHTML=`<div class="dialog-head"><h2>Preview de restauración</h2></div><p>Estado elegido: ${esc(p.snapshot.fecha)} · ${esc(p.snapshot.motivo)}</p><p>Maestro actual: ${p.actual} filas. Estado elegido: ${p.destino} filas.</p><p>Se reemplazará únicamente la tabla de productos completa: códigos, nombres, categorías, marcas, activo, listas y demás columnas del maestro. Los productos añadidos posteriormente dejarán de formar parte del maestro. Los históricos no se modificarán.</p><p>Primero se guardará un snapshot PRE-RESTAURACIÓN del estado actual.</p><label>Escribí RESTAURAR <input id="catalogConfirm" autocomplete="off"></label><div><button id="catalogRestoreButton" class="btn danger">Restaurar</button><button class="btn secondary" onclick="openCatalogHistory()">Volver</button></div>`;document.getElementById("catalogRestoreButton").onclick=async()=>{if(document.getElementById("catalogConfirm").value!=="RESTAURAR")return toast("Escribí RESTAURAR para confirmar.","error");if(catalogPending())return showCatalogRefreshWarning("Verificá primero la operación pendiente.");if(catalogMutationBusy)return;const pending={operacion_id:catalogOperationId(),tipo:"RESTAURACION"};try{saveCatalogPending(pending)}catch(error){return toast(error.message,"error")}catalogMutationBusy=true;state.catalogEpoch=(state.catalogEpoch||0)+1;document.getElementById("catalogRestoreButton").disabled=true;try{await apiPost("source_catalog_restore",{snapshot_id:id,revision:p.revision,confirmacion:"RESTAURAR",operacion_id:pending.operacion_id});await refreshCatalogAfterWrite(pending,"Maestro restaurado y vista actualizada.")}catch(error){showCatalogRefreshWarning("La restauración no quedó confirmada: "+error.message)}finally{catalogMutationBusy=false;state.catalogEpoch=(state.catalogEpoch||0)+1;}}}catch(error){toast(error.message,"error")}}
