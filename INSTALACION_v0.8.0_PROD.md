# Actualización segura de D9 Gestión v0.8.0-prod

Esta entrega agrega el asistente de importación fiscal de clientes. D9 Gestión no tiene un entorno DEV separado: primero se prueba localmente y luego se actualiza su despliegue de producción.

## Archivos que cambian

- Frontend de D9 Gestión: `index.html`, `styles.css`, `app.js`, `client-import.js`, `config.js`, `sw.js` y `vendor/`.
- Backend propio de Gestión: `apps-script/Code.gs`.

No se modifica D9 Pedidos, D9 Admin, D9 Script PROD ni el Worker.

## 1. Actualizar el Apps Script de Gestión

1. Abrir la Sheet **D9 Gestión**.
2. Ir a **Extensiones → Apps Script**.
3. Reemplazar el contenido del proyecto propio de Gestión por `apps-script/Code.gs`.
4. Guardar.
5. Ir a **Implementar → Administrar implementaciones**.
6. Editar la implementación web actual, elegir **Nueva versión** e implementar.
7. Conservar la misma URL `/exec`.

No hay que tocar **D9 Script PROD**. Tampoco es necesario volver a ejecutar `setupD9Gestion()` si la ficha de clientes ya muestra los campos fiscales; el importador agrega cualquier encabezado fiscal faltante al aplicarse.

## 2. Actualizar el frontend

Subir todo el contenido de este ZIP al repositorio de D9 Gestión, incluyendo:

- `client-import.js`
- `vendor/pdf.min.mjs`
- `vendor/pdf.worker.min.mjs`

Los archivos de PDF.js son locales. El listado fiscal no se envía a servicios externos para ser interpretado.

## 3. Primera prueba de Ale

1. Abrir Gestión y forzar una actualización con el botón de sincronizar.
2. Entrar en **Clientes → Importar PDF**.
3. Seleccionar `CLIENTES.pdf`.
4. Verificar el resumen esperado para el archivo del 1/9/2026:
   - 221 registros leídos.
   - 183 coincidencias seguras.
   - 38 casos para revisar.
   - 28 posibles clientes nuevos.
5. Resolver cada caso dudoso como **Completar ficha**, **Crear cliente** u **Omitir**.
6. Confirmar la importación.
7. Revisar algunas fichas fiscales y la pestaña `auditoria` de la Sheet propia de Gestión.

Los clientes creados desde el PDF quedan activos, con Lista 1 y sin vendedor. Luego pueden asignarse mediante **Asignar vendedores**. Los clientes existentes conservan nombre comercial, domicilio de entrega, lista, vendedor, estado e historial.

## Protección del lote

- Leer el PDF y revisar decisiones no escribe datos.
- Si una ficha cambió después del análisis, el backend cancela el lote y pide volver a cargar el PDF.
- Reimportar el mismo archivo no duplica clientes: las fichas ya actualizadas se reconocen como existentes y los datos iguales quedan sin cambios.
- Un CUIT compartido no fusiona fichas automáticamente.
