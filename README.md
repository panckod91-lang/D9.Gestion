# D9 Gestión

Aplicación web independiente para la gestión comercial de Distribuidora D9.

Versión actual: `v0.1.3-dev`, conectada al despliegue **D9 Gestión DEV**.

## Primera base funcional

- Inicio con resumen diario.
- Lectura de pedidos, clientes, productos, listas y usuarios desde la Sheet central.
- Conversión de pedidos en remitos, proformas o notas de venta.
- Creación manual de comprobantes.
- Impresión en media hoja A4 (A5).
- Pago inicial, pago mixto o saldo en cuenta corriente.
- Recibos posteriores y aplicación a comprobantes.
- Cuentas corrientes basadas en movimientos Debe/Haber.
- Ingreso y seguimiento de cheques.
- Anulación con contramovimiento y auditoría.
- Numeración correlativa interna.
- PWA responsive, pensada principalmente para escritorio.

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
