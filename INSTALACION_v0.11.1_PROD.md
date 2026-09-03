# Actualización segura de D9 Gestión v0.11.1-prod

Esta entrega modifica únicamente **D9 Gestión** y su Apps Script propio. No reemplaza ni requiere cambios en D9 Pedidos, D9 Admin, D9 Script PROD, Worker o la Sheet principal.

## Orden de actualización

1. Abrir el proyecto existente **D9 Gestión Script**.
2. Reemplazar su contenido por `apps-script/Code.gs` o por la copia idéntica `apps-script/Code.txt` de este paquete.
3. Ir a **Implementar → Administrar implementaciones**, editar la aplicación web y crear una **Nueva versión**.
4. Conservar la misma URL `/exec`. No ejecutar `setupD9Gestion()` y no crear otra Sheet.
5. Reemplazar los archivos del frontend por los de este paquete.
6. Abrir Gestión, actualizar y confirmar que en **Más** figure `v0.11.1-prod`. Si el celular conserva la versión anterior, cerrar completamente la PWA y abrirla otra vez.

Al primer uso, el Script agrega al final de la hoja `operaciones`, si faltan, estas columnas: `credito_tipo`, `credito_concepto`, `comision_estado` y `comision_motivo`. No reordena ni borra columnas existentes.

## Prueba breve recomendada

1. Entrar como Ale y abrir **Reportes**. Comprobar que primero aparezcan las tarjetas de reportes y que Ventas/Comisiones pidan filtros antes de mostrar resultados.
2. Crear un remito pequeño con un vendedor y comprobar que aparezca en su comisión.
3. Crear otro remito eligiendo **Venta directa de Ale · sin comisión** y comprobar que figure con comisión `$ 0`, sin quedar pendiente.
4. Sobre un remito de prueba, usar **Bonificar**, indicar importe y motivo, y comprobar que baje la cuenta corriente y la comisión proporcionalmente.
5. Desde **Nuevo comprobante**, elegir **NC / ajuste de crédito**, seleccionar cliente e ingresar importe y motivo. Comprobar que reduzca la cuenta corriente y no afecte comisiones.
6. Si existe un remito histórico sin vendedor, usar **Definir comisión** y probar asignarlo o marcarlo como venta directa. No cerrar todavía un período real hasta revisar el reporte completo.

## Resultado esperado

- Remito con vendedor: suma comisión según su regla vigente.
- Devolución o bonificación vinculada: resta la comisión de la venta original.
- Crédito general: ajusta cuenta corriente y no participa del reporte de comisiones.
- Venta directa sin vendedor: queda explícitamente como `NO_APLICA`, con comisión cero.
- Remito histórico ambiguo: queda `PENDIENTE` y bloquea el cierre hasta que administración lo resuelva.
