# Instalación segura de D9 Gestión v0.2.0-dev

Esta versión incorpora el primer bloque de absorción de D9 Admin: **productos y listas de precios**.

## Qué cambia

- Gestión lee todos los productos, incluso los ocultos.
- Detecta automáticamente todas las columnas existentes con nombre `lista_N`.
- Ale puede crear o editar un producto individual.
- Ale puede actualizar precios masivamente por porcentaje o importe.
- La actualización masiva admite filtros, lista de origen/destino, redondeo y vista previa.
- Cada escritura queda registrada en la pestaña `auditoria` de la Sheet D9 Gestión.

## Qué no cambia

- D9 Pedidos.
- D9 Admin.
- D9 Script PROD.
- El Worker.
- Los comprobantes, recibos, cheques y cuentas corrientes existentes.

## Paso 1 · Actualizar el Script de Gestión

1. Abrir la Sheet **D9 Gestión**.
2. Ir a **Extensiones → Apps Script**.
3. Reemplazar el código por `apps-script/Code.gs`.
4. Ejecutar una vez `setupD9Gestion()`.
5. Aceptar los permisos si Google los solicita.

Ese paso conserva los IDs y secretos existentes. También crea estas propiedades si faltan:

- `ADMIN_USER_IDS=1`
- `SOURCE_WRITES_ENABLED=false`

## Paso 2 · Publicar una versión nueva del Script

1. Ir a **Implementar → Administrar implementaciones**.
2. Editar la implementación web actual.
3. Elegir **Nueva versión**.
4. Implementar conservando la misma URL `/exec`.

## Paso 3 · Publicar el frontend en DEV

Subir el contenido de este ZIP al repositorio `D9.Gestion`. Cloudflare debe publicar la versión `v0.2.0-dev`, visible en la app.

## Paso 4 · Revisar sin riesgo

Con `SOURCE_WRITES_ENABLED=false`:

- la pantalla permite recorrer productos y preparar una vista previa masiva;
- los botones finales de guardar/aplicar quedan bloqueados;
- nada se escribe en la Sheet D9_pedidos.

## Paso 5 · Habilitar la escritura

Cuando la interfaz esté revisada:

1. Apps Script → **Configuración del proyecto**.
2. En **Propiedades del script**, cambiar `SOURCE_WRITES_ENABLED` a `true`.
3. Sincronizar D9 Gestión.
4. Probar primero con **un producto controlado**.
5. Confirmar en D9_pedidos que solo cambió ese producto.
6. Recién después probar una actualización masiva pequeña y bien filtrada.

## Importante sobre Lista 4 y superiores

Gestión ya reconoce columnas nuevas `lista_4`, `lista_5`, etc. Pero esta versión no las crea automáticamente porque D9 Pedidos también debe saber consumirlas correctamente. Antes de habilitar esa función hay que recuperar y auditar el código que está realmente publicado en producción.

## Próximo bloque

Después de validar productos y precios:

1. hoja `ofertas` en la Sheet original D9_pedidos;
2. administración de ofertas desde Gestión;
3. consumo de ofertas en D9 Pedidos;
4. consumo de ofertas al crear comprobantes en Gestión.
