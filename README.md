# D9 Gestión v0.19.7-rc1 — Bloque 4 F/G/H

Candidata completa basada en v0.19.6. D9 Pedidos v1.5.43 permanece sin cambios. **No desplegada ni probada físicamente.**

## Diagnóstico confirmado en v0.19.6

- **F:** `create_operacion` no recibía una identidad de intención. Si se perdía la respuesta tras el OK del backend, repetir Guardar generaba otra operación, número y movimiento, aun con el mismo contenido.
- **G:** la creación incrementaba el contador, escribía una operación `VIGENTE`, después ítems, movimiento, pago inicial y auditoría. Una interrupción intermedia dejaba filas parciales y podía exhibir una operación vigente sin deuda.
- **H:** `anular_operacion` marcaba primero la operación `ANULADO` y después agregaba la reversión. Si fallaba entre ambos pasos, un reintento respondía `already_annulled` sin completar el movimiento.

## Solución

El navegador genera un `intencion_id` aleatorio antes de Guardar y persiste en `localStorage` el mismo payload por usuario y ámbito REAL/TEST antes del primer envío. Hasta obtener una respuesta confirmada conserva el intento tras timeout, recarga o cierre. Un banner permite **Verificar y recuperar** con el mismo ID/payload; **Cancelar si no comenzó** pide cancelación autoritativa al servidor. No se compara contenido para decidir identidad: dos intentos comerciales con iguales datos usan IDs diferentes.

El Apps Script añade la hoja técnica `comprobantes_intenciones` y guarda un plan estable con IDs de operación, ítems, movimiento, recibo, pagos, cheques y auditoría. Crea la operación en estado `PREPARANDO`, completa sólo filas ausentes verificando las presentes contra el plan y al final la marca `VIGENTE` y cierra la intención `COMPLETA`. En cada acción relevante bajo el mismo `ScriptLock` reconcilia intenciones incompletas antes de exponer datos o continuar. Un estado incompatible queda `REVISION` y bloquea nuevas escrituras automáticas para requerir revisión humana. `movimientos` sigue siendo la única fuente de saldo; el journal no representa dinero.

La anulación usa la identidad determinista `ANN-<operacion_id>`, exige verificar el movimiento original y la ausencia de reversión previa, guarda un plan, escribe una única reversión identificada y recién después marca el documento `ANULADO`. Repetir o reanudar no duplica el crédito/débito. Si el documento proviene de una Venta financiera, mantiene su regla: la documentación y su anulación no generan ni revierten dinero de esa Venta. La Nota de Crédito conserva el signo y referencia financiera existentes.

`finanzas_intenciones` continúa intacta para Venta/Mostrador; el journal nuevo es sólo de comprobantes convencionales. Las funciones de recibos y cheques independientes tampoco fueron reescritas. La protección del Bloque 3 vuelve a leer autoritativamente un Pedido antes de numerar; si se anula después de guardar el plan pero antes de aparecer la operación, cancela la intención sin operación, ítems ni movimientos. Manual y Venta mantienen sus orígenes y ámbitos.

## Esquema y transición

Una sola hoja nueva en el archivo de Gestión: `comprobantes_intenciones`, columnas en este orden:

`intencion_id | accion | operacion_id | usuario_id | cliente_id | ambito | estado | plan | created_at | updated_at`

Estados: `PREPARADA`, `EN_PROCESO`, `COMPLETA`, `CANCELADA`, `REVISION`. No cambian columnas existentes ni se modifican históricos al instalar. La función aislada `migrarJournalComprobantesD9()` crea sólo esta hoja y encabezados; es idempotente y no consume contadores ni reconstruye operaciones. **No ejecutar `setupD9Gestion()`.**

Los comprobantes históricos completos siguen legibles. Una anulación histórica ya completada reconoce una única reversión compatible. Si un documento histórico presenta datos parciales o reversión ambigua sin journal, la aplicación exige revisión individual y no inventa filas ni dinero. Una intención cuyo número se consumió antes de persistir el plan puede dejar un salto de numeración al reintentar; no produce duplicado documental/económico. Una fila `REVISION` detiene las operaciones relevantes hasta inspección manual; no se autorrepara un dato divergente.

## Instalación candidata (tras aprobar las pruebas)

1. Detener temporalmente la emisión en Gestión en todos los dispositivos y guardar copia de la Sheet de Gestión.
2. En el proyecto Apps Script **D9 Gestión**, reemplazar el contenido de `Code.gs` por `apps-script/Code.gs.txt`. Guardar.
3. Ejecutar una única vez `migrarJournalComprobantesD9()` desde el editor con la cuenta propietaria, concediendo permisos habituales si se solicitan. Comprobar que existe la hoja con sus diez encabezados; no tocar contadores ni datos.
4. Crear una nueva versión del despliegue web **existente** de Gestión, apuntando a ese código. Mantener la misma URL, propiedades, secretos y ejecutor.
5. Reemplazar el frontend completo de Gestión, recargar forzadamente/PWA para obtener `v0.19.7-rc1` y luego reanudar la emisión. El ZIP incluye una copia idéntica del Apps Script en `apps-script/Code.gs.txt`.

Orden obligatorio: **backend y hoja, después frontend**. Durante la transición, el frontend antiguo contra el backend nuevo recibe rechazo al intentar crear por falta de `intencion_id`, sin escribir un comprobante; el frontend nuevo contra el backend antiguo **no** ofrece la garantía de idempotencia y debe evitarse. No crear otro deployment, no cambiar URL, no ejecutar setup. Pedidos y su Apps Script/Worker permanecen en v1.5.43.

## Pruebas de laboratorio realizadas

Harness Node con Sheets falsas, sin datos reales: creación normal; respuesta perdida; dos intenciones iguales con IDs distintos; inyecciones antes/después de contador, journal, operación, ítems, movimiento y auditoría; pagos iniciales en recibos, pagos y cheques; reintentos convergentes; anulación normal, repetida y fallos antes/después de reversión, estado y auditoría; Pedido vigente/anulado y anulación posterior al plan; ámbito TEST/REAL; creación manual; Proforma, Nota de Venta; NC con devolución y anulación; origen Venta no financiera y Venta financiera sin doble incidencia; divergencia deliberada de fila bloqueada. Sintaxis JS verificada. Harness de frontend con `localStorage` simulado: ID persistido antes del envío, separación REAL/TEST, recuperación, conservación tras timeout. **No hubo prueba visual ni Apps Script/Sheets reales** en esta ejecución.

## Prueba física mínima en Modo TEST

1. Crear un Remito desde Pedido TEST vigente; verificar número TEST, ítems, deuda y un solo movimiento; intentar usar Pedido anulado desde formulario desactualizado y comprobar rechazo sin escrituras.
2. Antes de recibir la respuesta de otro Remito TEST, interrumpir la conexión, volver a abrir Gestión y usar **Verificar y recuperar**. Debe quedar una sola operación, número y movimiento.
3. Crear dos Remitos TEST genuinos de contenido idéntico mediante Guardar separado: ambos deben existir con números diferentes.
4. Anular un Remito TEST, repetir el gesto y verificar una sola reversión y saldo correcto. Probar una NC/devolución TEST y su anulación.
5. Crear comprobante documental desde Venta financiera TEST, anularlo y confirmar que la incidencia económica original de la Venta no cambia. Verificar que los contadores REAL no se mueven durante estas pruebas.

Limitación: Google Sheets no ofrece una transacción atómica entre varias hojas. La recuperación está diseñada para converger bajo el lock de este proyecto; no coordina otro proyecto Apps Script que escriba directamente estas hojas. La pérdida del almacenamiento local del dispositivo antes de recuperar una respuesta incierta obliga a verificar manualmente por historial, pues no se debe inventar una segunda intención. Una intervención manual en filas planificadas puede dejar `REVISION` y exigir análisis antes de operar.
