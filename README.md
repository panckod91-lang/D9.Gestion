# D9 Gestión

Aplicación web independiente para la gestión comercial de Distribuidora D9.

Versión actual: `v0.9.0-prod`, conectada al despliegue propio de **D9 Gestión**.

## v0.9.0-prod

- Agrega en cada vendedor del módulo **Usuarios** la carga de su comisión general, visible como porcentaje o como pendiente de definir.
- Guarda las reglas exclusivamente en la nueva hoja `comisiones_reglas` de la Sheet de Gestión, vinculadas al `vendedor_id` central; no duplica usuarios ni agrega porcentajes a la hoja `usuarios`.
- La estructura incorpora marca, período de vigencia y estado para admitir más adelante excepciones por marca sin migrar el modelo.
- Sólo Admin y Super admin pueden consultar o modificar las reglas; cada cambio queda registrado en `auditoria`.
- Esta versión configura las reglas. Todavía no calcula ni liquida comisiones sobre comprobantes; esa etapa se incorporará junto con las fotografías históricas necesarias.
- No requiere cambios en D9 Pedidos, D9 Admin ni D9 Script PROD.

## v0.8.3-prod

- Convierte el permiso especial en acceso de reemplazo operativo: el autorizado puede consultar pedidos y comprobantes de todos los vendedores.
- Habilita el módulo Recibos y la carga de cobranzas para ese usuario, sin otorgarle administración de maestros, usuarios, configuración, anulaciones ni estados de cheques.
- Al convertir un pedido, conserva y bloquea el vendedor original aunque el comprobante sea generado por otra persona.
- En comprobantes creados desde cero, permite elegir el vendedor correspondiente.
- Los usuarios de Gestión sin permiso operativo conservan la vista limitada a su propia actividad.

## v0.8.2-prod

- Incorpora el módulo **Usuarios** para administrar el maestro único de la hoja `usuarios` de la Sheet principal.
- Mantiene intacto el campo `rol` que ya consumen D9 Pedidos y D9 Admin: vendedor, venta mostrador, cliente o admin.
- Agrega al final de esa misma hoja `rol_gestion` y `permiso_comprobantes`, sin duplicar usuarios ni cambiar IDs existentes.
- Define perfiles de Gestión: sin acceso, vendedor, admin y super admin. Admin y super admin tienen las mismas funciones operativas.
- Permite asignar a un vendedor el acceso operativo a comprobantes y recibos.
- Reserva recibos, cuentas corrientes, cheques, maestros, usuarios, reportes, configuración y anulaciones para administración.
- Protege al administrador contra la desactivación o pérdida accidental de su propio acceso.
- Las claves nunca se envían al navegador; al editar, una clave vacía conserva la existente.
- No requiere cambios en D9 Pedidos, D9 Admin ni D9 Script PROD: todos conservan compatibilidad por encabezados y preservan las columnas nuevas.

## v0.8.1-prod

- Permite aplicar inmediatamente las coincidencias seguras aunque queden casos dudosos pendientes.
- Incluye en el mismo lote los casos que Ale ya haya resuelto y deja intactos los restantes.
- Distingue entre **omitidos** y **pendientes** tanto en la confirmación como en la auditoría.
- Al volver a cargar el mismo PDF, separa las fichas que ya están actualizadas y evita ofrecerlas nuevamente como cambios.
- El botón informa exactamente qué aplicará: seguros y decisiones revisadas.

## v0.8.0-prod

- Agrega un asistente para importar el listado fiscal `CLIENTES.pdf` del sistema anterior.
- Lee el PDF localmente y no escribe nada durante el análisis.
- Completa automáticamente sólo clientes cuyo ID y nombre normalizado coinciden y cuyos datos fiscales no presentan conflictos.
- Deriva a revisión los códigos con nombres distintos, CUIT compartidos, datos fiscales diferentes y clientes que todavía no existen en D9.
- Permite a Ale completar una ficha elegida, crear un cliente nuevo cuando el ID está libre u omitir el registro.
- Exige resolver todos los casos dudosos antes de la confirmación final.
- El lote valida concurrencia, conserva intactos los datos comerciales y queda registrado en la auditoría de Gestión.
- Incorpora PDF.js dentro del proyecto: el análisis no depende de servicios externos ni modifica D9 Pedidos, D9 Admin, Worker o Script PROD.

## v0.7.2-dev

- Corrige la hora del reporte de ventas: los registros ISO/UTC se muestran explícitamente en `America/Argentina/Buenos_Aires`.
- El cambio es solamente visual; no modifica comprobantes ni datos históricos.

## v0.7.1-dev

- Corrige las sugerencias masivas de vendedor para pedidos históricos sin `cliente_id`: cruza primero por ID y luego, de forma segura, por nombre y dirección.
- Los clientes ambiguos quedan sin sugerencia para evitar asignaciones incorrectas.
- La pantalla informa cuántas sugerencias encontró antes de que el usuario decida aplicarlas y guardarlas.

## v0.7.0-dev

- Agrega vendedor asignado a la ficha de cada cliente y filtro por vendedor.
- Incorpora asignación rápida con sugerencias calculadas desde el historial de pedidos.
- Los comprobantes nuevos guardan una copia del vendedor para preservar futuras comisiones aunque cambie la asignación del cliente.
- Crea la pestaña Reportes y estrena Ventas por vendedor, con período, desglose de pagos iniciales, totales para caja e impresión/PDF A4.
- Los comprobantes anteriores intentan recuperar su vendedor desde el pedido de origen o desde la ficha actual del cliente.
- Actualiza el backend a `0.7.0`; las columnas nuevas se agregan automáticamente sin reordenar las existentes.

## v0.6.8-dev

- Corrige los botones Guardar y Eliminar cliente que podían quedar deshabilitados por un permiso antiguo cargado desde caché.
- La interfaz habilita las acciones al administrador y el Apps Script conserva la validación definitiva antes de escribir o eliminar.

## v0.6.7-dev

- Permite eliminar clientes desde el editor, con análisis previo de referencias.
- Bloquea la eliminación si el cliente tiene comprobantes, recibos o movimientos de cuenta corriente.
- Los pedidos históricos permanecen intactos y pueden revincularse por nombre y domicilio si su ID fue eliminado.
- Actualiza el backend a `0.6.3`.

## v0.6.6-dev

- Corrige las etiquetas responsive de los botones de pedidos recientes en Inicio.
- En PC muestra las acciones completas y reserva `Usar`, `✓ Usado` y `Reusar` para celular.

## v0.6.5-dev

- Los pedidos que ya originaron un comprobante se identifican como `Ya usado` y permiten abrirlo o reutilizar el pedido en uno nuevo.
- El editor de ofertas muestra el nombre completo del producto y su precio normal de Lista 1.
- Las ofertas ahora pueden eliminarse definitivamente, con confirmación y registro de auditoría.
- Actualiza el backend a `0.6.2` para admitir la eliminación real de ofertas.

## v0.6.4-dev

- Los pedidos históricos con clientes repetidos se vinculan usando también dirección, localidad o teléfono.
- Los pedidos de clientes sin ficha activa se cargan automáticamente como ocasionales.
- Las advertencias abiertas desde un diálogo ahora se muestran sobre ese diálogo y también quedan visibles junto al campo afectado.

## v0.6.3-dev

- Al usar un pedido, Gestión vincula el cliente por `cliente_id` cuando está disponible.
- Los pedidos históricos sin ID se reconocen por el nombre anterior al separador `|`.
- Si existe más de una coincidencia, no elige automáticamente y pide revisión.

## v0.6.2-dev

- Los clientes ocasionales históricos aparecen como sugerencia al generar un comprobante.
- Al reutilizar un ocasional se conserva su identidad y se acumula la cuenta corriente.
- Los ocasionales históricos con el mismo nombre normalizado se muestran como una sola cuenta.
- Ya se pueden emitir recibos para clientes ocasionales y aplicarlos a cualquiera de sus comprobantes pendientes.

## v0.6.1-dev

- Cambia el frontend a la nueva implementación web de D9 Gestión.
- Renueva la caché de la PWA para descartar la URL archivada.
- Conserva sin cambios el backend `v0.6.0` y el módulo completo de Publicidad.

## v0.6.0-dev

- Incorpora el módulo completo de Publicidad de D9 Admin.
- Lista, busca, crea y edita banners de imagen completa o producto con textos.
- Administra orden, estado, imágenes, enlace y vista previa responsive.
- Guarda por encabezado en la pestaña `publicidad` de D9_pedidos y actualiza la pantalla inmediatamente.

## v0.5.2-dev

- Pedidos muestra por defecto únicamente los últimos 3 días.
- Un rango de fechas consulta el período elegido bajo demanda.
- Comprobantes agrega filtro por Remito, Factura pro forma y Nota de venta.

## v0.5.1-dev

- Devuelve a cada pedido el acceso directo visible para crear un comprobante, sin tener que desplegar el detalle.

## v0.5.0-dev

- Numeración independiente y autocorrectiva por tipo: `R`, `FPF` y `NDV`.
- Historial de pedidos con búsqueda, rango de fechas, vendedor, estado y detalle desplegable.
- Reporte filtrado de pedidos para PDF A4 y WhatsApp.
- Productos, precios, clientes y ofertas se reflejan apenas el servidor confirma el guardado; la sincronización completa continúa en segundo plano.

## v0.4.2-dev

- Los productos con oferta se cargan en comprobantes con su precio normal.
- La oferta se aplica únicamente al pulsar el botón de la línea.

## v0.4.1-dev

- Agrega Productos en oferta al menú lateral de escritorio, igual que en el menú móvil Más.

## Primera base funcional

- Inicio con resumen diario.
- Lectura de pedidos, clientes, productos, listas y usuarios desde la Sheet central.
- Conversión de pedidos en remitos, proformas o notas de venta.
- Creación manual de comprobantes.
- Carga rápida de productos por código o descripción, con cantidad opcional (`3*F037`, `3xqueso`, `0,5*jamón`) y cantidad 1 por defecto.
- Si se busca solamente el producto, abre un diálogo compacto de cantidad: Enter vacío agrega 1 y un segundo Enter confirma.
- Suma automática de cantidades cuando se vuelve a cargar un producto ya agregado.
- Búsqueda de clientes por código o cualquier parte del nombre, sin desplegar listados interminables.
- Cliente ocasional con nombre propio y un identificador interno independiente.
- Efectivo y transferencia precargan el total como importe pagado; el valor sigue siendo editable.
- Impresión compacta en medias hojas de un A4 vertical, con encabezado repetido, partes equilibradas y continuación automática cuando no entran todos los productos.
- Pago inicial, pago mixto o saldo en cuenta corriente.
- Recibos posteriores y aplicación a comprobantes.
- Cobranza guiada desde clientes con saldo pendiente.
- Buscadores por cualquier fragmento del texto, sin distinguir tildes ni mayúsculas.
- Menú móvil “Más” para acceder a cheques, maestros y configuración.
- Cuentas corrientes basadas en movimientos Debe/Haber.
- Ingreso y seguimiento de cheques.
- Anulación con contramovimiento y auditoría.
- Numeración correlativa interna.
- PWA responsive, pensada principalmente para escritorio.
- Inicio inmediato desde la última copia local y actualización silenciosa en segundo plano.
- Apertura instantánea del detalle después de confirmar un comprobante o recibo.
- Versión visible en la sesión de escritorio y en el menú móvil “Más”.
- Ale queda identificado como administrador mediante `ADMIN_USER_IDS` en las propiedades del Script.
- Administración individual de productos sobre la Sheet central: alta, edición, categorías, marcas, estado y precios.
- Categoría y marca con sugerencias tomadas de los productos existentes, manteniendo la posibilidad de escribir una nueva.
- La pantalla Productos y precios muestra únicamente productos; Clientes y Usuarios se incorporarán luego como módulos separados.
- Una sesión vencida vuelve inmediatamente al ingreso aunque existan datos locales en pantalla.
- Detección automática de todas las columnas `lista_N` existentes en productos.
- Actualización masiva de precios por porcentaje o importe, con filtros, lista de origen/destino, redondeo y vista previa.
- Control de concurrencia optimista: si un precio cambió desde la vista previa, la actualización completa se cancela.
- Auditoría de altas, modificaciones individuales y cambios masivos en la Sheet propia de Gestión.
- Bloqueo de seguridad `SOURCE_WRITES_ENABLED`: la primera publicación permite revisar todo sin escribir en D9_pedidos.
- Al crear comprobantes manuales, Gestión toma la lista asignada al cliente y usa Lista 1 como respaldo.
- Módulo Clientes separado de Productos: alta, edición, búsqueda, activos/ocultos y asignación de `lista_precio`.
- Perfil fiscal opcional con razón social, documento, condición IVA, domicilio fiscal, localidad, provincia, código postal y email.
- Indicador calculado `Sin datos fiscales`, `Datos fiscales incompletos` o `Listo para facturar`.
- El Script agrega las columnas fiscales faltantes al final de `clientes`, sin insertar, mover ni renombrar las columnas que consume D9 Pedidos.
- Guardado defensivo por encabezado: solo se actualizan los campos administrados del cliente y se preservan columnas ajenas.
- Acceso directo desde cada ficha de cliente a su cuenta corriente.
- Administración de ofertas en una hoja `ofertas`, con precio, vigencia y estado, sin modificar las listas normales.
- En comprobantes, una oferta vigente se informa al agregar el producto y puede aplicarse o quitarse por línea.

## Arquitectura

```text
D9 Gestión (Cloudflare Pages)
        ↓
D9 Gestión Script (Apps Script separado)
        ├── lee → Sheet central D9
        ├── administra productos, precios y clientes → Sheet central D9
        └── registra comprobantes/cobranzas → Sheet D9 Gestión
```

No usa Firebase. Para publicar ofertas en D9 Pedidos se actualiza `D9 Script PROD`; el Worker no cambia.

## Archivos

- `index.html`: estructura de la interfaz.
- `styles.css`: estética D9 y adaptación escritorio/móvil.
- `app.js`: navegación, sincronización, comprobantes, recibos e impresión.
- `config.js`: URL del Apps Script de Gestión.
- `apps-script/Code.gs`: backend separado.
- `apps-script/README.md`: instalación del backend.

## Puesta en marcha

1. Instalar primero el backend siguiendo `apps-script/README.md`.
2. Pegar la URL `/exec` del despliegue en `config.js`.
3. Publicar estos archivos en un repositorio propio, por ejemplo `D9.Gestion`.
4. Conectar ese repositorio a Cloudflare Pages.

## Pendiente antes de producción

- Probar impresión en la impresora real de Ale y ajustar el A5.
- Incorporar estadísticas y usuarios de D9 Admin.
- Coordinar listas dinámicas nuevas con D9 Pedidos y D9 Script PROD antes de crear Lista 4 o superiores.
- Agregar exportación y respaldo.
- Hacer pruebas de concurrencia y recuperación ante una escritura incompleta.
