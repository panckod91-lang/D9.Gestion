# D9 Gestión v0.19.5 · Venta ocasional en efectivo

Actualizar conjuntamente con D9 Pedidos v1.5.40. El ámbito TEST y sus reglas de v0.19.4 permanecen sin cambios.

## Venta Mostrador ocasional

El backend admite únicamente la Venta identificada expresamente como ocasional, sin `cliente_id` maestro, con un pago completo en EFECTIVO. Registra la Venta con nombre, teléfono, dirección y vendedor existentes; genera recibo/pago de efectivo asociados al `venta_id`, sin movimiento de Cuenta Corriente ni deuda. Rechaza Cuenta Corriente, transferencia, cheque, importes parciales y referencias de cliente maestro. Los reintentos conservan la intención financiera y la idempotencia existente.

La primera Venta ocasional agrega automáticamente **una columna `cliente_ocasional` a la hoja `ventas` de Pedidos** con valor `si` en esa Venta. No se crea una ficha de cliente ni una hoja nueva. El detalle e impresión de la Venta utilizan su histórico; para emitir después un comprobante es necesario crear/seleccionar un cliente real mediante el flujo habitual. Esta versión no convierte automáticamente la Venta ocasional en comprobante ni en deuda.

Para instalar esta mejora: actualizar primero el Apps Script de Gestión en el despliegue existente, luego el de Pedidos, y finalmente los dos frontends. No ejecutar `setupD9Gestion()` ni migraciones generales.

## Modelo y separación

La Sheet central de Pedidos conserva el maestro. Sólo los clientes cuyo `clientes.ambito` dice `TEST` pertenecen al laboratorio; vacío y `REAL` significan REAL. El nombre se utiliza una sola vez para proponer candidatos históricos; cada ID se confirma por separado. Las operaciones posteriores heredan ámbito del `cliente_id` persistido o de una referencia inequívoca. Las filas sin identidad segura permanecen sin reclasificar y se listan para revisión.

Gestión filtra en backend clientes, pedidos, ventas, operaciones, recibos, pagos, cheques, movimientos y líneas de comisiones. Admin opera siempre en REAL; sólo superadmin puede pedir TEST. En TEST se bloquean escrituras del maestro global (productos, usuarios, ofertas, publicidad y configuración). El modo TEST se indica de forma visible y no persiste al reiniciar la aplicación. El Mostrador existente puede seguir usando clientes TEST según su cartera PROPIOS/TODOS y `clientes_accesos`; la incidencia financiera se registra con el mismo motor actual y el ámbito del cliente.

La numeración futura de comprobantes y recibos TEST usa contadores distintos `TEST_OPERACION_*` y `TEST_RECIBO`; el PDF/impresión de comprobantes TEST lleva «PRUEBA — SIN VALOR OPERATIVO». No se renumeran comprobantes históricos ya emitidos. Los cierres históricos que contengan líneas TEST se retienen en la Sheet, se informan en la vista previa y se omiten de los cierres visibles REAL hasta revisión: sus importes congelados no pueden corregirse con una simple clasificación.

## Antes de activar

1. Respaldar la Sheet central D9 Pedidos **y** la Sheet D9 Gestión con copias fechadas. No ejecutar `setupD9Gestion()`.
2. Actualizar el proyecto Apps Script de D9 Gestión y su despliegue web existente (sin cambiar URL ni propiedades). Para esta versión también actualizar Pedidos según las instrucciones anteriores.
3. Iniciar como superadmin, entrar a 🧪 Modo pruebas → «Revisar histórico TEST». Esta vista no escribe nada. Revisar IDs, teléfono/ciudad, filas ambiguas, saldo estimado y cierres antiguos. El entorno de trabajo NO tuvo acceso a los datos reales: ninguna ficha fue clasificada durante la creación de esta versión.
4. Sólo tras verificar los respaldos y los IDs, marcar las fichas que correspondan y confirmar «CLASIFICAR CLIENTES TEST». La función valida ID+nombre, crea **únicamente** la columna `ambito` en `clientes` si falta y pone `TEST` sólo en los IDs seleccionados; la operación es idempotente. No toca históricos ni contadores REAL. Los contadores TEST se crean al emitir el primer documento de cada tipo.
5. Ejecutar otra vista previa; comparar los saldos identificados antes y después, visitar Cuenta Corriente TEST y el saldo REAL con Ale. Toda fila ambigua requiere revisión manual antes de dar la segregación histórica por cerrada. No inventar IDs a partir del nombre.

## Limitaciones deliberadas

- No se ofrece en esta versión alta general de clientes TEST ni reclasificación arbitraria. Se trabaja con fichas existentes revisadas.
- El histórico sin `cliente_id` o referencia única puede permanecer en REAL; la vista previa lo denuncia, pero no lo migra por nombre.
- Un cierre de comisiones ya congelado con líneas TEST exige conciliación manual de sus cifras históricas; no se reescribe.
- No hubo acceso de lectura a las Sheets productivas ni navegador Chromium para validar el aspecto final en dispositivo. Los escenarios descritos fueron simulados con fixtures.
- La separación TEST permanece como en v0.19.4; D9 Pedidos v1.5.40 incorpora solamente las funciones descritas arriba.
