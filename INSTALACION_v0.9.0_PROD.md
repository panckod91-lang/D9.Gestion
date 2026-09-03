# Actualización segura de D9 Gestión v0.9.0-prod

Esta entrega incorpora la configuración inicial de comisiones dentro del módulo Usuarios. Cada vendedor puede tener su porcentaje general, administrado por Ale o por un Super admin.

## Alcance

- Se actualizan únicamente el frontend y el Apps Script propio de D9 Gestión.
- No se modifica D9 Pedidos, D9 Admin, D9 Script PROD, Worker ni la Sheet principal.
- Los usuarios continúan viviendo exclusivamente en la hoja central `usuarios`.
- Las comisiones se guardan en `comisiones_reglas`, dentro de la Sheet de Gestión, vinculadas por `vendedor_id`.
- Esta versión no calcula liquidaciones todavía; sólo deja configuradas y auditadas las reglas.

## 1. Actualizar el Apps Script de Gestión

1. Abrir la Sheet **D9 Gestión**.
2. Ir a **Extensiones → Apps Script**.
3. Reemplazar el contenido por `apps-script/Code.gs` de esta entrega.
4. Guardar.
5. Ir a **Implementar → Administrar implementaciones**.
6. Editar la implementación actual, elegir **Nueva versión** e implementar.
7. Conservar la misma URL `/exec`.

No ejecutar nuevamente `setupD9Gestion()`. La hoja `comisiones_reglas` se crea automáticamente cuando se guarda la primera comisión.

## 2. Actualizar el frontend

Subir todo el contenido del ZIP al alojamiento actual de D9 Gestión. La versión visible debe indicar `v0.9.0-prod`.

## 3. Cargar los porcentajes

1. Entrar como Ale o Super admin.
2. Abrir **Más → Usuarios**.
3. En cada ficha cuyo tipo central sea **Vendedor**, pulsar **Comisión**.
4. Ingresar el porcentaje general y la fecha desde la que rige.
5. Guardar.

Si todos cobran lo mismo, se ingresa el mismo porcentaje en cada vendedor. No se inventa ni se precarga ningún valor hasta que Ale confirme el porcentaje real.

## 4. Prueba recomendada

1. Guardar una comisión de prueba para un vendedor.
2. Confirmar que su ficha muestre `Comisión X%`.
3. Recargar Gestión y verificar que el porcentaje siga visible.
4. En la Sheet de Gestión, comprobar la nueva hoja `comisiones_reglas` con una fila `GENERAL` y el ID correcto del vendedor.
5. Verificar en `auditoria` la acción `CREAR` o `ACTUALIZAR` sobre `COMISION_REGLA`.
6. Editar el porcentaje, guardar y comprobar que se actualice la misma regla.

Guardar una comisión no escribe en la Sheet principal y no necesita activar `SOURCE_WRITES_ENABLED`.

## Preparación para la etapa siguiente

La tabla ya incluye `marca`, `vigente_desde`, `vigente_hasta` y `activo`. La interfaz de esta versión fija `marca = GENERAL`; más adelante se podrán añadir excepciones por marca y el cálculo sobre remitos menos notas de crédito, conservando la fotografía histórica aplicada a cada comprobante.
