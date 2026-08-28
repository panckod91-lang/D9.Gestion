# D9 Gestión

Aplicación web independiente para la gestión comercial de Distribuidora D9.

Versión actual: `v0.1.12-dev`, conectada al despliegue **D9 Gestión DEV**.

## Primera base funcional

- Inicio con resumen diario.
- Lectura de pedidos, clientes, productos, listas y usuarios desde la Sheet central.
- Conversión de pedidos en remitos, proformas o notas de venta.
- Creación manual de comprobantes.
- Carga rápida de productos por código o descripción, con cantidad opcional (`3*F037`, `3xqueso`, `0,5*jamón`) y cantidad 1 por defecto.
- Suma automática de cantidades cuando se vuelve a cargar un producto ya agregado.
- Búsqueda de clientes por código o cualquier parte del nombre, sin desplegar listados interminables.
- Cliente ocasional con nombre propio y un identificador interno independiente.
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

## Arquitectura

```text
D9 Gestión (Cloudflare Pages)
        ↓
D9 Gestión Script (Apps Script separado)
        ├── lee → Sheet central D9
        └── escribe → Sheet D9 Gestión
```

No usa Firebase y no modifica `D9 Script PROD` ni el Worker de pedidos.

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
- Incorporar edición controlada de clientes, productos y parámetros de D9 Admin.
- Agregar exportación y respaldo.
- Hacer pruebas de concurrencia y recuperación ante una escritura incompleta.
