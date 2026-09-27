# D9 Gestión v0.19.8 — Bloque 5 Productos / Importación

Paquete completo basado en la candidata v0.19.7-rc1 suministrada para esta intervención. D9 Pedidos v1.5.43 no fue modificado. No se desplegó ni se ejecutó contra datos reales.

## Cambios

- Nuevo producto envía `modo: CREAR`; editar uno existente envía `modo: EDITAR`. El backend rechaza un código ya existente en CREAR antes de escribir cualquier celda o auditoría, y rechaza editar un código inexistente. La edición deliberada conserva el comportamiento previo.
- El importador lee el valor numérico real de las celdas de precios en las listas 1, 2 y 3. Conserva el texto formateado de códigos y demás columnas para no perder códigos con ceros iniciales. Así una celda numérica cuyo valor es 3025 y cuyo formato muestra `3,025.00` queda en 3025 antes de IVA y 3660.25 con IVA 21 %.
- Las celdas de precio realmente textuales aceptan `3025`, `3025,00`, `3.025,00`, `3025.00`, `3,025.00`. Textos con un único separador y tres dígitos a la derecha, como `3.025` o `3,025`, son ambiguos y se rechazan con indicación de fila y lista. No se adivina silenciosamente un precio.
- Lista 2 y 3 siguen siendo opcionales. La importación que trae sólo Lista 1 conserva las otras dos listas existentes.

## Archivos cambiados

`app.js`, `apps-script/Code.gs`, su copia idéntica `apps-script/Code.gs.txt`, `config.js`, `index.html`, `sw.js`, `ESTE_ES_D9_GESTION.txt`, `README.md`; prueba focalizada nueva `tests/block5-product-import.js`. Los demás archivos del paquete son copias de la base. `comprobantes_intenciones` y los mecanismos del Bloque 4 no fueron modificados funcionalmente.

## Pruebas

Harness Node con frontend y Sheets simuladas: alta de código nuevo, rechazo de duplicado sin escrituras ni cambios de Listas 1/2/3, edición deliberada, importación Lista 1 sola y de tres listas, precios numéricos y textos en formatos AR/US, rechazo de ambigüedad, IVA 21 % aplicado una vez. Prueba SheetJS simulada con `.v=3025`, `.w="3,025.00"` y código visual `001`. Sintaxis JS verificada. Se ejecutaron también las pruebas desde una extracción del ZIP final. No hubo importación de un XLSX físico ni prueba visual o sobre Sheets reales.

## Actualización

1. Guardar copia de los archivos actuales y suspender altas/importaciones durante la actualización.
2. En el proyecto Apps Script **D9 Gestión**, reemplazar `Code.gs` con `apps-script/Code.gs.txt`; guardar y crear una versión nueva del **despliegue existente**, conservando URL, propiedades y ejecutor. No ejecutar ninguna función manual ni `setupD9Gestion()`.
3. Reemplazar el frontend completo de Gestión con el contenido del ZIP y recargar la PWA para obtener v0.19.8.
4. Probar físicamente en entorno controlado: alta con código duplicado sin cambios en listas, edición de código existente, importación de un archivo pequeño con celda numérica 3025 formateada `3,025.00`, y conservación de Listas 2/3 si sólo se importa Lista 1.

No hay columnas, hojas ni migraciones nuevas. Durante la transición, el frontend anterior con el backend nuevo recibe rechazo seguro al guardar producto porque no envía `modo`; no hacer altas/importaciones hasta actualizar ambos. El frontend nuevo con backend anterior carece de la protección contra sobrescritura; por eso se actualiza backend primero. D9 Pedidos y su Apps Script/Worker no requieren actualización.
