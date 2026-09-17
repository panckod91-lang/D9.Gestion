# D9 Gestión v0.18.0-prod

## Qué incorpora

- Lee las ventas reales de la hoja `ventas` de D9 Pedidos.
- Muestra `Ventas recientes` en el Inicio, con actualización automática cada 15 segundos mediante la misma revisión liviana usada para Pedidos.
- Permite imprimir una venta desde sus datos históricos guardados.
- Permite preparar un comprobante desde una venta sin emitirlo automáticamente.
- Conserva la trazabilidad con `origen_tipo = VENTA` y `origen_venta_id = venta_id`.
- Advierte cuando una venta ya fue convertida y exige `Generar igualmente` para reutilizarla.
- Mantiene Pedidos recientes, Cobranzas pendientes y Ventas recientes con scroll independiente en escritorio y apilado natural en móvil.

## Estado financiero actual

La hoja `ventas` no guarda condición `Cobrado / Cuenta corriente`, medio de pago, importe cobrado ni saldo. Por eso esta versión no muestra un estado financiero inventado y no genera movimientos, deuda ni recibos al detectar una venta. El impacto financiero ocurre únicamente al guardar un comprobante en Gestión mediante el circuito normal.

## Instalación

1. Actualizar primero `apps-script/Code.gs` o `Code.txt` en D9 Gestión Script.
2. Crear una nueva versión de la implementación conservando la URL `/exec`.
3. Reemplazar después el frontend completo de D9 Gestión.
4. No ejecutar nuevamente `setupD9Gestion()`.

No modifica D9 Script PROD, Worker, D9 Admin ni D9 Fiscal.
