# Instalación segura de D9 Gestión v0.6.1-dev

Esta versión conecta el frontend con la nueva implementación web del Script de Gestión e incorpora el módulo completo de **Publicidad** de D9 Admin. Conserva Ofertas, Clientes, maestros, historial de pedidos y toda la operatoria comercial de la versión anterior, incluida la numeración independiente:

- Remito: `R 0001-00000001`
- Factura pro forma: `FPF 0001-00000001`
- Nota de venta: `NDV 0001-00000001`

Cada serie continúa desde el número máximo ya existente de ese mismo tipo. No hace falta modificar manualmente la hoja `contadores`.

## Qué cambia

- Gestión permite listar, buscar, crear y editar los banners de D9 Pedidos.
- Administra estado, orden, tipo `full` o `producto`, textos, imágenes, enlace y vista previa.
- El guardado crea la pestaña `publicidad` o agrega únicamente los encabezados faltantes, sin mover columnas existentes.
- El cambio aparece inmediatamente en Gestión y la sincronización completa continúa en segundo plano.
- Gestión muestra clientes activos e inactivos para administrarlos.
- Permite crear y editar clientes en la Sheet original D9_pedidos.
- Permite asignar cualquiera de las columnas `lista_N` existentes.
- Incorpora datos fiscales opcionales y un indicador de ficha completa/incompleta.
- El Script agrega al final de `clientes` únicamente las columnas fiscales que falten.
- Cada alta o modificación queda auditada en la Sheet D9 Gestión.
- Crea automáticamente la hoja `ofertas` en la Sheet original con una fila por producto.
- La oferta guarda precio, vigencia y estado sin tocar `lista_1`, `lista_2` ni `lista_3`.
- Los comprobantes de Gestión permiten aplicar o quitar la oferta por línea.

## Qué no cambia

- El Worker de D9 Pedidos.
- La estructura ni la posición de las columnas actuales de `clientes`.
- El funcionamiento de pedidos, productos, usuarios, comprobantes o cuentas corrientes.

## Paso 1 · Actualizar el Script de Gestión

1. Abrir la Sheet **D9 Gestión**.
2. Ir a **Extensiones → Apps Script**.
3. Reemplazar el código por `apps-script/Code.gs` de este ZIP.
4. Guardar.
5. Ejecutar una vez `setupD9Gestion()`.
6. Aceptar los permisos si Google los solicita.

`setupD9Gestion()` conserva las propiedades existentes y agrega al final de la hoja `clientes`, solo si faltan:

- `razon_social`
- `tipo_documento`
- `numero_documento`
- `cuit`
- `condicion_iva`
- `domicilio_fiscal`
- `localidad_fiscal`
- `provincia_fiscal`
- `codigo_postal`
- `email_facturacion`

No inserta columnas, no mueve las actuales y no modifica las filas de clientes.

Además crea, si todavía no existe, la pestaña `ofertas` en D9_pedidos. Si se omite este paso, la primera oferta guardada desde Gestión también la crea automáticamente.

También prepara la pestaña `publicidad` con estos encabezados, conservando cualquier columna adicional: `id`, `orden`, `activo`, `modo`, `texto`, `titulo`, `texto_1`, `texto_2`, `imagen_url`, `imagen_url_full` y `link_url`. Si se omite `setupD9Gestion()`, el primer banner guardado también hace esta preparación automáticamente.

## Paso 2 · Publicar una versión nueva del Script

1. Ir a **Implementar → Administrar implementaciones**.
2. Editar la implementación web actual.
3. Elegir **Nueva versión**.
4. Implementar conservando la misma URL `/exec`.

Este paso es obligatorio porque agrega lectura y guardado de Publicidad del lado del servidor. Guardar el archivo sin crear una nueva versión de la implementación no alcanza.

## Paso 3 · Publicar el frontend en DEV

Subir el contenido de este ZIP al repositorio `D9.Gestion`. La versión visible debe ser `v0.6.1-dev`. `config.js` ya contiene la URL nueva y no requiere edición manual.

## D9 Pedidos y su Script

Esta entrega no requiere cambiar D9 Pedidos, D9 Script PROD ni el Worker. Usa la estructura de `publicidad` que la aplicación ya consume.

## Prueba recomendada

1. Sincronizar Gestión y entrar a **Publicidad** en escritorio o **Más → Publicidad** en celular.
2. Editar un banner existente, cambiar solo el orden o un texto y guardar.
3. Confirmar que se modificó la fila correcta en `D9_pedidos → publicidad` y que las demás columnas quedaron intactas.
4. Crear un banner nuevo de tipo **Imagen completa**, revisar la vista previa y guardarlo desactivado.
5. Crear o editar uno de tipo **Producto**, completar textos e imagen y revisar su vista previa.
6. Activar el banner y sincronizar D9 Pedidos para confirmar el orden, la imagen y el enlace.

## Compatibilidad con D9 Pedidos

D9 Pedidos y D9 Script PROD leen las hojas por encabezado. Publicidad conserva los mismos nombres de campos que usaba D9 Admin, por lo que no cambia su contrato de lectura.

El guardado de D9 Admin actualmente conserva todas las columnas existentes de la fila, aunque su formulario no edite los datos fiscales.
