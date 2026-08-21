# D9 Gestión Script

Este backend es independiente de `D9 Script PROD`. Lee maestros y pedidos desde la Sheet central de D9, pero escribe únicamente en una nueva Sheet de Gestión.

## Instalación

1. Crear una Google Sheet nueva llamada **D9 Gestión** en la cuenta `pancko.d9@gmail.com`.
2. Abrir **Extensiones → Apps Script**.
3. Reemplazar el contenido por `Code.gs`.
4. Ejecutar manualmente `setupD9Gestion()` y aceptar los permisos.
5. En **Configuración del proyecto → Propiedades del script**, revisar:
   - `SOURCE_SHEET_ID`: Sheet central de D9.
   - `GESTION_SHEET_ID`: se completa automáticamente.
   - `ALLOWED_USER_IDS`: comienza con `1` (Ale). Para habilitar más usuarios, separar IDs con coma.
   - `TOKEN_SECRET`: se genera automáticamente. No copiarlo al frontend.
6. Implementar como **Aplicación web**:
   - Ejecutar como: propietario.
   - Acceso: cualquier persona (el propio Script exige usuario, clave y autorización).
7. Copiar la URL `/exec` en `config.js` del frontend.

## Seguridad

- El endpoint nuevo nunca devuelve la columna `clave`.
- Las credenciales se verifican únicamente dentro de Apps Script.
- El navegador recibe una sesión firmada con vencimiento de 12 horas.
- Las acciones económicas requieren sesión y se serializan con `ScriptLock`.
- No agregar `TOKEN_SECRET` ni claves al repositorio.

## Pestañas creadas

- `config`
- `contadores`
- `operaciones`
- `operacion_items`
- `recibos`
- `pagos`
- `cheques`
- `movimientos`
- `auditoria`

El saldo de una cuenta no se escribe manualmente: se calcula como **Debe − Haber** a partir de `movimientos`.
