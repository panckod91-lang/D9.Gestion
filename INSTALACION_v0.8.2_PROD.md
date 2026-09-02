# Actualización segura de D9 Gestión v0.8.2-prod

Esta entrega incorpora la administración del maestro central de usuarios y los permisos propios de Gestión. D9 Gestión trabaja sobre producción: el paquete fue validado localmente y debe actualizarse conservando la implementación web existente.

## Alcance de la entrega

- Cambian el frontend de D9 Gestión y su `apps-script/Code.gs`.
- La hoja `usuarios` continúa viviendo solamente en la Sheet principal D9.
- No cambian D9 Pedidos, D9 Admin, D9 Script PROD, Worker ni ninguna Sheet durante la instalación del código.
- La primera alta o edición desde el nuevo módulo agrega al final de `usuarios` los encabezados `rol_gestion` y `permiso_comprobantes`, si todavía no existen.

## 1. Actualizar el Apps Script de Gestión

1. Abrir la Sheet **D9 Gestión**.
2. Ir a **Extensiones → Apps Script**.
3. Reemplazar el contenido del proyecto propio de Gestión por `apps-script/Code.gs`.
4. Guardar.
5. Ir a **Implementar → Administrar implementaciones**.
6. Editar la implementación web actual, elegir **Nueva versión** e implementar.
7. Conservar la misma URL terminada en `/exec`.

No ejecutar nuevamente `setupD9Gestion()` y no tocar D9 Script PROD.

## 2. Actualizar el frontend

Subir todo el contenido del ZIP al alojamiento actual de D9 Gestión. La versión visible debe indicar `v0.8.2-prod`.

## 3. Configurar los perfiles

Entrar primero con Ale, que conserva el acceso administrativo existente mediante las propiedades del Script.

1. Abrir **Más → Usuarios**.
2. Editar a Ale y asignar **Admin** en D9 Gestión. Conservar su tipo actual de D9 Pedidos.
3. Editar o crear el usuario del super administrador y asignar **Super admin**. Admin y Super admin tienen las mismas funciones.
4. Editar a Mati:
   - D9 Pedidos: **Vendedor**.
   - D9 Gestión: **Vendedor**.
   - Emitir comprobantes: **Sí**.
5. Mantener como **Venta mostrador** a quienes ya tengan ese tipo en D9 Pedidos. Sólo darles acceso a Gestión si corresponde.

Al editar un usuario existente, dejar la clave vacía conserva la clave actual. Gestión nunca descarga las claves al navegador.

## 4. Pruebas mínimas antes de darlo por terminado

### Ale — Admin

- Ve todos los módulos y todos los vendedores.
- Puede abrir Usuarios y guardar una edición inocua.
- No puede desactivar su propio usuario ni quitarse el perfil administrativo.

### Super admin

- Tiene las mismas funciones que Admin.
- Puede emitir, cobrar, anular y administrar maestros.

### Mati — Vendedor con permiso

- Sólo ve sus pedidos y sus comprobantes.
- Puede crear un remito desde un pedido propio o desde cero.
- El vendedor del comprobante queda fijado a Mati y no se puede cambiar.
- No ve Usuarios, Clientes, Productos, Cuentas corrientes, Recibos, Cheques, Reportes ni Configuración.
- No puede anular comprobantes.

### Venta mostrador sin acceso a Gestión

- D9 Pedidos continúa funcionando con su rol actual.
- Gestión rechaza el ingreso mientras `rol_gestion` sea `sin_acceso` y no tenga permiso para emitir.

## Seguridad de escritura

El módulo Usuarios respeta `SOURCE_WRITES_ENABLED`. Si está en `false`, permite revisar la pantalla pero bloquea Guardar. Activarlo sólo cuando se vaya a aplicar el cambio real sobre la Sheet principal; esta propiedad ya se utiliza para los demás maestros centrales.

Cada alta o edición queda registrada en la pestaña `auditoria` de la Sheet de Gestión. Los IDs existentes no se modifican y las columnas desconocidas o con fórmulas no se reescriben.
