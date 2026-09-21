# D9 Gestión v0.19.3 PROD

## A.1 · Clientes compartidos para PROPIOS

Las operaciones financieras de Mostrador reconocen la relación persistente `clientes_accesos`, manteniendo separado el acceso de uso respecto de `clientes.vendedor_id` y del permiso de edición.

La primera aplicación de una intención financiera evita relecturas redundantes; reintentos y reconciliaciones conservan el camino idempotente completo. WhatsApp continúa disponible solamente después de la confirmación financiera.

El Apps Script comienza con una identificación visible de D9 Gestión. No ejecutar `setupD9Gestion()`.

Esta versión agrega la administración del alcance de clientes por usuario y el tratamiento seguro de coincidencias al crear clientes. No incorpora ninguna función del futuro ámbito TEST.

## Usuarios

En Gestión → Usuarios aparece `Alcance de clientes`:

- `Sólo sus clientes` (`PROPIOS`).
- `Todos los clientes` (`TODOS`).

El alcance controla consulta y uso. No reasigna `vendedor_id`, no cambia comisiones y no modifica históricos.

Defaults compatibles para usuarios existentes sin valor:

- Mostrador y Cliente: `PROPIOS`.
- Vendedor y Admin: `TODOS`.

Al guardar el primer usuario, Gestión agrega de forma segura la columna `alcance_clientes` a la hoja `usuarios` si no existe y completa únicamente las celdas vacías con esos defaults. No ejecuta `setupD9Gestion()` ni recrea hojas.

## Clientes existentes

El alta desde Gestión verifica documento, teléfono, nombre y domicilio:

- Fuerte: mismo documento; nombre + teléfono; o nombre + domicilio.
- Posible: teléfono solo o nombre solo.

Una coincidencia fuerte abre/reutiliza la ficha existente. Una coincidencia posible permite confirmar expresamente que se trata de otro comercio. El nombre solo nunca fusiona ni reutiliza automáticamente.

## Instalación

1. Reemplazar el código del Apps Script de D9 Gestión por `apps-script/Code.gs`.
2. Crear una versión nueva del despliegue web conservando la misma URL, propiedades, secretos y permisos.
3. Reemplazar los archivos del frontend en el hosting.
4. Entrar en Gestión → Usuarios, revisar y guardar los alcances deseados. El primer guardado incorpora la columna y materializa los defaults.
5. En D9 Pedidos, pulsar Sync o volver a ingresar para recibir inmediatamente el alcance actualizado.

No ejecutar `setupD9Gestion()`. No hay hojas nuevas, contadores nuevos ni migraciones TEST. D9 Admin continúa sin poder escribir Usuarios. Worker y D9 Fiscal no cambian.
