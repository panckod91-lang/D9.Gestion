# D9 Gestión v0.19.0 PROD

Etapa financiera coordinada con Pedidos v1.5.35. Bases reales: Gestión v0.18.2 y Pedidos v1.5.34. Este ZIP contiene sólo Gestión y su Script; Pedidos tiene su entrega propia. No se publicó ni se modificó producción.

## Resultado e instalación

Venta Zonal y Cobrar de mostrador usan la Cuenta Corriente REAL de Gestión. Sin otra CC, recibera, pagos o cheques paralelos. Una Venta registra una vez su dinero; el comprobante posterior documenta, no vuelve a endeudar/cobrar.

Se preservan Home, Ventas, impresión, reutilización deliberada, precios históricos, Pedidos, listas, Ofertas y demás módulos. Sólo se adapta la procedencia financiera necesaria y el refresco de saldos/recibos con polling existente.

1. Conservar ZIPs anteriores y copias versionadas de ambas Sheets y Scripts. No borrar pendientes/intenciones locales.
2. Instalar **D9 Script PROD Pedidos** del ZIP Pedidos v1.5.35. Actualizar su despliegue existente conservando URL. No usar aquí el Script de Gestión.
3. Instalar **Script Gestión** con `apps-script/Code.txt` de ESTE ZIP, idéntico a Code.gs. Nueva versión del despliegue existente, misma URL, IDs, propiedades y contadores.
4. **NO ejecutar `setupD9Gestion()`** ni reiniciar secretos/numeraciones. Las columnas nuevas y diario técnico se incorporan al primer uso.
5. Autorizar `UrlFetchApp` en Gestión si se solicita: valida el token contra Pedidos. Verificar destino de propiedad opcional `PEDIDOS_API_URL` o URL Pedidos incluida en código; debe ser el despliegue actualizado.
6. Conservar SOURCE_SHEET_ID, GESTION_SHEET_ID, TOKEN_SECRET y permisos/escrituras existentes. Gestión → Usuarios sigue requiriendo SOURCE_WRITES_ENABLED=true, como antes; no se habilita automáticamente.
7. Reemplazar ambos frontends completos en alojamientos separados. Pedidos debe incluir finance.js y su D9_FINANCE_URL debe coincidir con Gestión; ésta conserva config.js. Subir sólo archivos web, no Apps Script/README/copias de datos.
8. Abrir online, comprobar v0.19.0 / v1.5.35 e ingresar en Pedidos para su sesión nueva. Se conservan trabajo offline y pendientes convencionales.
9. **Antes de operar dinero real, rotar desde Gestión → Usuarios las claves antes expuestas en bootstrap**, con claves nuevas y robustas. La corrección no borra copias antiguas; cambio de clave invalida tokens Pedidos anteriores.
10. Realizar piloto PC/móvil/financiero. No habilitar finanzas con sólo una mitad actualizada. Revisar con autorización despliegues antiguos públicos con rutas/claves inseguras: esta entrega local no los elimina.

Sin claves maestras, excepciones Admin ni secretos compartidos. El token Pedidos no es sesión administrativa de Gestión.

## Usuarios de Admin: compatibilidad deliberadamente retirada

**La única administración efectiva de usuarios es Gestión → Usuarios**, con autenticación, autorización admin, maestro central y salvaguardas existentes.

En Script Pedidos update_usuarios/upsert_usuarios están cerrados en backend y su helper también rechaza escritura. Se verificaron sólo rutas de maestro/autenticación: no queda otra equivalente habilitada para cambiar claves/roles/permisos. Rechazo también con token Pedidos de usuario admin. Bootstrap público sin claves/secretos de usuarios.

**D9 Admin → Usuarios queda obsoleto para escritura.** Su frontend no se tocó ni hay bypass. No se promete compatibilidad de autenticaciones antiguas que dependieran de claves públicas: ya no se distribuyen. Para administrar usuarios utilizar Gestión.

## Informe — 26 puntos

### 1. Cuenta Corriente antes del cambio

Saldo del cliente = suma debe menos haber de movimientos vigentes. Negativo = a favor. Saldos documentales por operacion_id. Un pago A cuenta sin referencia baja saldo global, no imputa documentos automáticamente. Se conserva.

### 2. Hojas participantes

Sheet central: usuarios, clientes, productos, ventas. Gestión: operaciones, operacion_items, movimientos, recibos, pagos, cheques, contadores y auditoria existentes. Nueva **finanzas_intenciones**, sólo diario TÉCNICO de idempotencia/recuperación: no calcula saldo ni es libro financiero paralelo.

Columnas diario: intencion_id, usuario_id, cliente_id, tipo, estado, plan, created_at, updated_at. Plan almacena IDs/filas/importes/resultado, sin claves/tokens.

### 3. Nacimiento de deuda

Antes crear comprobante agregaba débito COMPROBANTE; continúa para manuales, Pedido y Venta histórica. Venta financiera nueva crea débito VENTA con referencia VTA-<venta_id>; su documento posterior no agrega otro.

### 4. Registro de cobro

Recibo con pagos y crédito PAGO en movimientos por el importe total. Mostrador pide registrar a Gestión con sesión autorizada; no crea otro circuito en Pedidos. Resultado con número real y saldos anterior/posterior.

### 5. Recibos/Pagos

Constructor puro d9gReceiptRows_ extraído del existente y usado por ambos circuitos. Misma numeración, formatos, medios/validaciones. Gestión sigue admitiendo mixtos; mostrador usa un medio por confirmación. WhatsApp/finalizar no registran otro recibo.

Imputación como antes: operación específica o A cuenta. Mostrador propone la única deuda cuando hay una; con varias no inventa FIFO. **A cuenta baja saldo global, no saldos individuales no imputados**; diferencia global/documental no implica deuda duplicada.

### 6. Cheques

Cheques reales vinculados a pago_id/recibo_id. Banco/número/vencimiento obligatorios; librador opcional. Inicial EN_CARTERA; no supone cobro bancario. Estados/rechazo/reversión y permisos siguen en Gestión, resolviendo procedencia VTA cuando corresponde.

### 7. Campos nuevos

Al final de ventas: **medio_pago, finanzas_id, finanzas_item**. Ítem identifica renglón recuperable sin duplicar; se conservan primeras 15 columnas/precios históricos.

Al final de operaciones: **finanzas_venta_id**, vínculo a Venta financiera. Sin cambios a operacion_items, IVA o maestro/listas.

### 8. Representación de medios

EFECTIVO / TRANSFERENCIA / CHEQUE / CUENTA_CORRIENTE, selección obligatoria sin defecto antes de registrar. Referencia transferencia opcional. Cheque real. Históricos sin condición no se adivinan.

### 9. Venta CC: una deuda

Débito con ID estable reservado en plan, referencia VTA-venta_id e intención previa a escritura. Reintento/reconciliación agrega sólo IDs faltantes. Venta CC no genera recibo.

### 10. Venta cobrada: neto cero

Efectivo/Transferencia/Cheque: débito y crédito del recibo por mismo total y referencia. Neto cero de ESA Venta, no cancelación de otra deuda previa. Débito/crédito se escriben juntos en lote de movimientos de la intención.

### 11. Crear comprobante sin doble deuda y anular

Integración existente por origen_venta_id. Una intención VENTA confirmada determina finanzas_venta_id. Backend exige mismo cliente y total y rechaza cobro inicial nuevo; UI avisa y oculta ese segundo cobro. Crear documento no agrega deuda.

Generar otro deliberado conserva advertencia; tampoco duplica dinero. Sólo primer documento vigente muestra saldo del origen; aliases quedan sin saldo pendiente para no sumarlo dos veces visualmente. Anular el primero traslada esa presentación al siguiente vigente.

**Anular ese comprobante es documental: no revierte deuda que no creó; Venta/movimientos siguen vigentes.** Documentos que sí crearon dinero conservan anulación, NC y cierres actuales. NC/anulaciones resuelven origen financiero real; devoluciones agregadas entre todos los documentos del mismo origen impiden doble devolución de una Venta.

No se agregó anulación económica de Venta. No usar anulación documental para cancelar esa Venta financieramente.

### 12. venta_id

Generación sin cambios. Agrupa productos y vincula intención, movimientos/origen documental. Se mantiene origen_venta_id y no se revalorizan históricos con el maestro.

### 13. Idempotencia Venta

Intención por venta_id, autor/cliente/snapshot inmutables. Backend compara solicitud normalizada y plan; rechaza ID con distinto importe/cliente/medio. Confirmada devuelve resultado sin escritura. Doble gesto de Venta comparte selector/promesa y registro al imprimir/compartir.

### 14. Idempotencia Cobro

intencion_id CO-... estable por cobro, snapshot local previo al POST. Número/IDs reales se reservan una vez y se recuperan sin nuevo recibo/cheque.

Lock de Gestión protege escrituras financieras, no bloquea Pedido convencional. Una intención parcial bloquea nuevas mutaciones de ese cliente hasta reconciliarla; también comprobantes/recibos/anulaciones/cambios de cheque de Gestión para no operar sobre dinero incompleto.

### 15. Consulta de saldo desde Mostrador

mostrador_cuenta por POST; Gestión valida token firmado contra Pedidos y usuario central activo/rol mostrador/cartera. Devuelve saldo real y últimos 20 movimientos con saldo acumulado. Ignora autor financiero falseado por navegador; sin permisos admin.

### 16. Cobrar

Home → Cuenta corriente → cliente propio → Cobrar → importe/medio/imputación → confirmar online. Parcial y crédito a favor según Gestión. Recibo real sólo después de confirmar. Respuesta A no reemplaza/cierra trabajo B posterior.

### 17. Cheque desde Mostrador

Venta/Cobro CHEQUE usan constructor/validación actuales. Plan reserva cheque real y pago asociado; reconciliar añade sólo ID faltante. WhatsApp/impresión no agregan otro; estados posteriores sólo en Gestión.

### 18. Doble WhatsApp reutilizado

Modal existente ampliado con título/finalizar/compartición opcional en Cobro. Rojo pendiente, verde al ABRIR; no verifica envío. Cobro puede compartir interno/cliente/ambos/ninguno; finalizar no borra Venta nueva ni registra dinero. Destinos del snapshot y configuración interna, no selección mutable posterior.

### 19. Estado de cuenta sin cobrar

ENVIAR POR WHATSAPP vuelve a consultar cuenta, prepara cliente/fecha/movimientos/saldo para su teléfono. Sólo lectura/mensaje: cero recibos/pagos/cheques/movimientos.

### 20. Sin teléfono

Editor existente de Pedidos, sesión válida y cartera. Se guarda realmente en ficha o puede omitirse; destino cliente omitido no es pendiente obligatorio. No bloquea/revierte registro confirmado. Respuesta tardía no cambia cliente/modal de otra operación.

### 21. Timeout/error

Sin éxito/recibo prematuro. Snapshot/intención local → Verificar resultado → backend no existe/PREPARADA/CONFIRMADA. Confirmada recupera sin escribir; ausente/parcial pide acción explícita para reintentar/completar mismo ID/plan.

Sheets distintas NO son transacción atómica. Diario persiste plan antes de filas económicas; recuperación por finanzas_item e IDs de Gestión. Plan parcial bloquea nuevas mutaciones del cliente hasta reconciliar, no se oculta ni se reemplaza con otra intención.

Finanzas siempre online, sin cola de dinero. Offline conserva carrito y rechaza registro; Pedido convencional mantiene cola/sincronización. No borrar datos locales con intenciones inciertas. Recuperar desde Cuenta corriente → Verificación y comprobantes del dispositivo original.

### 22. Históricos

Sin intención/condición no se inventa medio/deuda/recibo. Consulta/impresión existentes conservadas y documento posterior con circuito anterior. Endpoint nuevo rechaza asignación financiera retroactiva de ID existente. Sin migración histórica automática.

### 23. Archivos modificados

Gestión: **app.js, config.js, sw.js, apps-script/Code.gs, apps-script/Code.txt, README.md**.

app.js: procedencia documental, pagos/saldo/NC vinculados a Venta, aviso anulación documental, etiquetas reales y refresco financiero localizado. config.js/sw.js: versión/cache. No cambiaron index.html/styles.css ni generadores PDF, precios, Ofertas/importador.

Pedidos, en SU ZIP: app.js, nuevo finance.js, styles.css, index.html, manifest.json, sw.js, sus dos Script y README. Allí se detalla el circuito propio.

Sin cambios a Admin/Worker/Fiscal, fix Pedido A→B→C, IDs/ofertas/búsqueda de los baselines.

### 24. Scripts modificados

**Sí, ambos requieren actualización.** Pedidos: login/token, bootstrap sin claves, clientes autenticados, Usuarios legacy bloqueados, rechazo de Venta financiera por ruta legacy. Gestión: APIs mostrador/autorización, registro financiero idempotente/recuperable, documentación/anulación por procedencia.

actividad_revision incorpora finanzas_revision y existe lectura autenticada finanzas de tablas ya visibles a usuarios autorizados para emitir. Mismo polling 15s refresca CC/Recibos/Cheques aunque sólo haya un cobro; sin timer nuevo ni reiniciar draft/modal/filtros. Token Pedidos no habilita esa administración ni Usuarios.

### 25. Versiones finales

**Pedidos v1.5.35 PROD / Gestión v0.19.0 PROD**, ZIPs completos separados y Scripts propios. Sólo un README informativo por ZIP; Code.txt es código, Gestión conserva licencia legal PDF.js.

### 26. Pruebas realizadas

Pasaron **23 pruebas backend** con Scripts reales/Sheets simuladas y **14 frontend/estado** con Pedidos real/respuestas controladas:

- Bootstrap sin claves, login/firma/token adulterado, clave incorrecta/revocación, rol/cartera/privilegios. update_usuarios/upsert_usuarios rechazados incluso token Pedidos admin. Gestión admin edita Usuarios; vendedor/sin token no.
- CC $50.000 + documento = $50.000; efectivo + documento = $0; CC $50.000 + cobro imputado $20.000 + documento = $30.000; cheque único sin doble deuda.
- Transferencia/referencias, parciales/crédito a favor, cheque/rechazo/reversión, IDs/importe/cliente inmutables, recibos normales/A cuenta.
- Documento financiero rechaza cambiar cliente/total/nuevo cobro, anularlo conserva saldo; NC reduce/restaura mismo origen y limita devoluciones entre documentos repetidos.
- Decimales/ofertas históricas, agrupación venta_id, histórico sin efecto retroactivo.
- Fallos parciales tras escribir ventas/recibos/pagos/cheques/movimientos/diario, reconciliación sin duplicar.
- Saldo real, revisión detecta cobro sin Venta nueva, token mostrador sin acceso administrativo.
- Caché saneada/pendientes preservados, cancelar cero escrituras, offline sin cola dinero, doble gesto un registro, WhatsApp reutilizado/optional Cobro, snapshot/destinos/recibo real.
- Cobro/consulta A tardía conserva B/nueva Venta, autor original del log tras cambiar usuario.
- **Pedido A → B → C; confirmar B y luego A: C mantiene exactamente cliente/productos/cantidades/notas/oferta-precio.** Código protegido de envío/callback/pendientes comparado con base.
- Tests existentes localizados contra carpetas nuevas: búsqueda (32 combinaciones y control Generar comprobante) e histórico/agrupación/filtros/acciones/navegación/responsive de Ventas.

Sin Sheets/dinero reales. Responsive validado estructuralmente; **sin prueba visual automatizada: entorno sin Chromium**. Pendientes revisión física PC/móvil y Android/WhatsApp, instalación/piloto. No se afirma auditoría/regresión general.

## Piloto controlado antes de dinero real

Cliente de prueba de cartera mostrador, movimientos identificables:

1. Login nuevo, Pedido offline/pendientes conservados, Usuarios Gestión admin funciona/editor viejo Admin rechaza.
2. Cuatro escenarios financieros indicados; misma CC en ambas apps y saldo antes/después de documento.
3. Cobros parciales por tres medios, recibo/pagos/cheque reales, A cuenta vs imputación específica.
4. Cancelación cero cambios, doble toque un registro, pérdida de respuesta verificar mismo ID sin nuevo envío comercial.
5. Crear/anular documento de Venta financiera no duplica/revierte saldo; histórico conserva circuito anterior.
6. Doble WhatsApp, omitir teléfono/recibo opcional, finalizar limpia sólo Venta correcta, impresión/precios/ofertas conservados.
7. PC/móvil: Home/cuenta/modales/cheque, retorno WhatsApp y respuestas tardías. Vendedor normal Pedido A→B→C con respuestas fuera de orden.

## Seguridad y vuelta atrás

Alcance limitado a autenticación Pedidos y funciones autorizadas. No migra almacenamiento histórico de claves en Sheet ni endurece todas las rutas legacy; no es seguridad general. Rotar claves expuestas/revisar despliegues viejos bajo autorización antes de dinero real.

**Con Ventas financieras reales, no reinstalar backend anterior sin coordinación:** podría reabrir rutas/contraseñas o duplicar/revertir dinero al documentar/anular. No restaurar automáticamente Sheets desde copia vieja: perdería cobros posteriores. Una reversión visual debe conservar backends seguros y trazabilidad o acordarse previamente.
