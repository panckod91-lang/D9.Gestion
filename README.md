# D9 Gestión v0.19.9 — UX y tiempos de respuesta

Paquete completo basado en v0.19.8. D9 Pedidos v1.5.43 no fue modificado. No se desplegó ni se ejecutó sobre datos reales.

## Diagnóstico y cambios

- Al arrancar con sesión existente, el frontend esperaba la lectura de IndexedDB antes de iniciar el único `bootstrap`. Ahora la lectura local y la solicitud comienzan juntas; la fotografía local sigue mostrándose mientras se espera la respuesta autoritativa. En móvil, el badge de sincronización estaba oculto: se agregó un estado breve visible durante la inicialización.
- El cambio REAL/TEST ya hacía un `bootstrap` completo necesario para confirmar el ámbito y aislar datos. Ahora muestra estado ocupado inmediatamente, evita doble toque, mantiene el aspecto del ámbito anterior y bloquea acciones hasta recibir la confirmación. Polling y lecturas históricas iniciadas antes del cambio no pueden aplicar respuestas tardías en el nuevo ámbito. No se introduce caché cruzada entre ámbitos.
- Guardar comprobante, recibo, cliente y producto ahora indica actividad con un spinner en los botones que ya impedían doble ejecución. Anular muestra estado ocupado y evita repetir el gesto durante la respuesta. El mensaje diferencia confirmación de guardado y actualización posterior. La identidad de intención, recuperación, controles backend y efecto económico permanecen iguales.
- Home → Pedidos recientes se ordena por fecha y hora descendente, sin alterar el período ni el contenido.
- Comprobantes: “Ver anulados” activa los filtros existentes sobre todo el historial; “Volver a vigentes” recupera Recientes. El detalle y las relaciones ya existentes se reutilizan. Los anulados no ofrecen anulación adicional.
- Los tiempos de `bootstrap` y principales escrituras vistos desde el navegador quedan disponibles en `window.D9_GESTION_TIMINGS` (últimas 30 mediciones en milisegundos, sin payload ni token). Miden red + Apps Script; no separan el costo interno de Sheets.

El backend ejecuta `d9gRequireSession_`, toma un `ScriptLock`, reconcilia `comprobantes_intenciones` y luego lee/valida/escribe Sheets. Son controles indispensables. Se conservaron. No se redujo el tiempo del backend por hipótesis. El eventual NetworkError transitorio no quedó reproducido ni atribuido a una causa concreta; se mantuvo el retry de lectura existente y no se escondieron errores.

## Archivos

Cambiaron `app.js`, `operations-ui.js`, `index.html`, `styles.css`, `config.js`, `sw.js`, identificador y este README. Se añadió `tests/ux-performance.js`. `apps-script/Code.gs` y `apps-script/Code.gs.txt` son copias idénticas y sin cambios respecto de v0.19.8. Otros archivos son copias del paquete anterior.

## Pruebas

Harness local: arranque paralelo y estado visible; cambio de ámbito con demora, doble gesto y fallo de red; orden horario; acceso a anulados y ausencia de acción de anular de nuevo. Pasaron las pruebas de recuperación/idempotencia y fault injection del Bloque 4, y las de Producto/Importación del Bloque 5. Sintaxis JS verificada. No se midieron tiempos representativos de Apps Script/Sheets ni se hizo validación visual en navegador o Android en este entorno.

## Instalación

1. Respaldar la versión v0.19.8 actual.
2. Reemplazar sólo el **frontend completo de D9 Gestión** con este ZIP y recargar forzadamente la PWA hasta ver v0.19.9.
3. Mantener sin cambios el Apps Script vigente de **D9 Gestión**. El archivo `apps-script/Code.gs.txt` está incluido únicamente como respaldo autocontenido; no hace falta copiarlo ni crear versión del despliegue web.
4. No ejecutar `setupD9Gestion()` ni otra función manual. No hay migraciones, columnas, hojas o contadores nuevos. Pedidos y Worker siguen sin cambios.

Prueba física corta: abrir en Android y comprobar el aviso inmediato; cambiar REAL→TEST→REAL y ver el estado ocupado; guardar un comprobante TEST y verificar una sola operación/movimiento; anularlo, comprobar estado y una sola reversión; probar NC/recibo TEST si se usan habitualmente; entrar a Comprobantes → Ver anulados y abrir el detalle; confirmar el orden horario de Pedidos recientes. Los tiempos anteriores de 12–16 segundos sólo podrán compararse de forma representativa en el dispositivo y con Sheets reales.
