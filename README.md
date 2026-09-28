# D9 Gestión v0.20.0 — Estadísticas

Base exacta: D9 Gestión v0.19.9. D9 Pedidos y D9 Admin no cambian. No se modificaron comprobantes, intenciones, movimientos, Cuenta Corriente, autenticación ni circuitos de escritura.

## Qué hace

Reportes → Estadísticas ofrece dos fuentes independientes: **Pedidos** y **Ventas directas**. Nunca suma ambas. Cada fuente tiene Hoy, Últimos 7 días, Mes actual, Año actual y Todo; importe, cantidad de registros, ticket promedio, líneas, evolución y rankings de productos por importe/cantidad, vendedores/usuarios y clientes. Los Pedidos muestran además cuántos anulados quedaron fuera. La cantidad de Pedido se denomina «cantidad» porque puede indicar un bulto previo al pesaje; no se infieren kilos ni unidades finales.

Las estadísticas siguen el ámbito REAL/TEST ya autorizado y filtrado en backend. Las consultas de historial ocurren sólo al abrir Estadísticas y se conservan en memoria por usuario y ámbito durante la sesión; cambiar período o fuente no vuelve a leer Sheets. «Actualizar» fuerza una nueva lectura. No hay polling de Estadísticas ni nueva Sheet. Una respuesta tardía de otro ámbito se descarta. Si falla la actualización, se conservan los datos anteriores y el error queda visible.

## Fuentes y comparación con Admin

`pedidos` ya agrupaba los renglones por `pedido_id`, incluía `total_pedido` histórico, estado y vendedor. `ventas` ya agrupaba por `venta_id`, con importe, usuario e items históricos. El Apps Script vigente filtraba REAL/TEST en ambos endpoints. Se amplió **únicamente lectura** de `pedidos` con `history:true`, simétrica al historial existente de `ventas`, para devolver todo el período solicitado sin depender del bootstrap de tres días.

La vieja Admin usa suma de `total_item` por renglón y agrupa productos/vendedores/clientes mayormente por nombre. La nueva pantalla utiliza `total_pedido` agrupado cuando existe y el ID histórico como clave de ranking cuando está disponible. Cuando ambos importes coinciden y los nombres no cambiaron, cantidad de pedidos, líneas, anulados y rankings deberían ser comparables en período Todo. Descuentos, importes históricos de cabecera o cambios de nombre/ID pueden explicar diferencias. No se hizo comparación numérica con la Sheet real en este entorno.

Un registro sin fecha interpretable participa sólo en «Todo» y no puede ubicarse en la evolución; la pantalla indica cuántos hay. Una venta ocasional sin ID de cliente se agrupa por nombre descriptivo; no se inventa una identidad permanente.

## Archivos y estructura

- Modificados: `app.js` (abrir Reportes), `index.html`, `styles.css`, `config.js`, `sw.js`, `apps-script/Code.gs`.
- Nuevo: `statistics.js`, `tests/statistics.js`.
- `apps-script/Code.gs.txt` es copia idéntica del Code.gs final. El resto del frontend y pruebas anteriores provienen del ZIP v0.19.9.
- Hojas, columnas, contadores, propiedades, secretos y URL: **sin cambios**. No ejecutar `setupD9Gestion()` ni otra función de migración.

## Despliegue seguro

1. Reemplazar Código.gs **sólo en el proyecto D9 Gestión** por `apps-script/Code.gs` (o el mismo contenido TXT). Guardar y actualizar la implementación web existente a una versión nueva; mantener su URL y configuración. No ejecutar setup.
2. Reemplazar el frontend completo de D9 Gestión con este ZIP. Actualizar PWA/caché hasta ver `v0.20.0`.
3. No actualizar D9 Pedidos, Admin, Worker ni Fiscal.

La v0.19.9 de frontend con backend nuevo conserva su flujo anterior. El frontend v0.20.0 con backend anterior muestra un error claro al intentar abrir Estadísticas por no confirmar `history:true`; las demás secciones no dependen de esa lectura. Por eso el backend va primero.

## Pruebas

Sintaxis JS de frontend y Apps Script; `node tests/statistics.js` (períodos, anulados, rankings, cantidad decimal, separación de fuentes, ámbito REAL/TEST en ambos endpoints y 10.400 renglones simulados); `node tests/ux-performance.js` (regresión focalizada del módulo Reportes y cambio de ámbito): aprobados. El cálculo local de la muestra de 10.400 líneas tardó aproximadamente 14 ms en este equipo; no representa tiempo de red/Sheets reales. No hubo pruebas visuales en navegador/Android ni lecturas de la Sheet real.

Prueba física sugerida en Gestión: en REAL abrir Reportes → Estadísticas, revisar Pedidos Todo contra Admin (considerando criterios anteriores); cambiar período y fuente; actualizar; cambiar a TEST y verificar que los números sean exclusivamente TEST; regresar a REAL; comprobar escritorio y móvil. La primera carga del historial puede tardar más que el cambio posterior de período.
