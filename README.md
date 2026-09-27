# D9 Gestión v0.19.6 — Bloque 3, Pedido origen

Versión completa de D9 Gestión para reemplazar v0.19.5. D9 Pedidos permanece en v1.5.43.

## Cambio

Al crear un comprobante desde Pedido, el Apps Script de Gestión consulta la hoja vigente de Pedidos por `pedido_id`. Rechaza un Pedido inexistente, anulado o asociado a otro cliente. Vuelve a consultarlo inmediatamente antes de escribir el contador y el comprobante. Ante un rechazo por anulación o desaparición, la interfaz cierra la carga desactualizada y vuelve a cargar Pedidos.

No cambia la creación desde Venta, la creación manual ni el alcance REAL/TEST. La revisión automática de Pedidos conserva el criterio anterior de última fila; una anulación de fila histórica puede no refrescarse automáticamente hasta una recarga de Pedidos, pero el backend impide convertir el Pedido anulado.

## Archivos y despliegue

- Frontend: reemplazar el paquete completo en el alojamiento actual de D9 Gestión.
- Apps Script: reemplazar el código del proyecto **D9 Gestión** con `apps-script/Code.gs.txt` (es copia idéntica de `apps-script/Code.gs`). Guardar, crear nueva versión y actualizar el despliegue web existente para que apunte a ella. Conservar URL, Script Properties, permisos y datos.
- Orden recomendado: actualizar primero Apps Script y luego frontend. El frontend v0.19.5 con backend v0.19.6 obtiene el rechazo seguro, pero no refresca automáticamente el listado tras el error. El frontend v0.19.6 con backend v0.19.5 no garantiza el bloqueo y no debe utilizarse como estado transitorio.
- No ejecutar `setupD9Gestion()`. No crear hojas ni migrar datos.

El código fuente completo del Apps Script está incluido dentro del ZIP en texto plano por la convención permanente de respaldos D9.
