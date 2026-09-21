# `send-intake-email`: endurecimiento de seguridad

## Vulnerabilidad encontrada (antes de este cambio)

La Edge Function `send-intake-email` se desplegaba con `verify_jwt` activado, pero **la clave anon
pública del frontend es un JWT válido** para el gateway y el código no validaba ninguna sesión. El
payload `{ to, link, empresa }` se aceptaba tal cual:

- **Relé abierto de correo**: cualquiera con la clave anon (visible en el bundle de feblio.com) podía
  hacer que Feblio enviase correos, con remitente `notificaciones@feblio.com`, a **cualquier
  destinatario** con **cualquier enlace** y **cualquier nombre de empresa** (phishing con marca Feblio,
  daño a la reputación del dominio en Resend).
- **Acceso cruzado entre empresas**: el idioma y el nombre se resolvían a partir del token presente en
  `link`; un usuario de la empresa A podía hacer enviar (a quien quisiera) el enlace real de un
  formulario de la empresa B si conocía su token.
- El mensaje de error devolvía el texto de la excepción (`String(e)`).

## Controles añadidos

| Control | Implementación |
|---|---|
| JWT obligatorio + sesión validada en servidor | `verify_jwt` sigue activado y, además, `auth.getUser(jwt)` con service role; sin usuario → `401 unauthorized`. |
| Empresa del remitente desde datos protegidos | `profiles.empresa_id` / `profiles.role` del usuario autenticado (service role). Cuentas `cliente` o sin empresa → `403 forbidden`. |
| Pertenencia del recurso | El payload solo identifica el formulario (`{ intake_id }`; por compatibilidad `{ token }` o `{ link }`, del que solo se extrae el token). La fila `client_intake` debe existir **y** tener `empresa_id` igual a la del usuario; inexistente y de otra empresa responden igual (`404 not_found`). |
| Datos autoritativos de la base de datos | Destinatario = `client_intake.client_email` (validado); nombre = `empresas.trade_name`/`name`; idioma = `empresas.language`; enlace = origen permitido + `/form/<token de la fila>`. Los campos `to`, `empresa`, `language` o URL del payload se ignoran. |
| Estado del formulario | `status = 'completado'` o `expires_at` pasado → `409 form_closed`; sin correo válido → `400 no_recipient`. |
| Validación estricta del payload | JSON ≤ 4 KB, UUID canónico, nada más; `400 invalid_payload`. |
| Respuestas neutras | Solo `{ ok, code }` (+ `locale`, `link`, `to`, `id` en éxito). Fallo del proveedor → `502 send_failed` sin detalle; excepción inesperada → `500 error` sin texto. Se registra en logs solo el id del formulario y el nombre del error. |
| CORS y métodos | `Access-Control-Allow-Origin` solo para `https://feblio.com`, `https://www.feblio.com`, el origen de `APP_URL` y localhost (desarrollo); métodos `POST, OPTIONS`; otros → `405` con `Allow`. `Cache-Control: no-store`. |
| Secretos | `RESEND_API_KEY`, `INTAKE_FROM_EMAIL` y `APP_URL` solo en `Deno.env` del servidor; nunca en respuestas ni logs. |

## Pruebas

`supabase/functions/_shared/intake/sendIntake.test.ts` (Deno, en el job `edge-security` de CI; proveedor y
base de datos simulados, **sin envíos reales**): sin JWT; JWT inválido; usuario válido con recurso propio
(destinatario/enlace/empresa del servidor, payload hostil ignorado); usuario válido con recurso de otra
empresa (por id, token y enlace) → 404 neutro y aislamiento simétrico; recurso inexistente; payload
manipulado (vacío, no UUID, inyección, ruta `../`, tipos incorrectos, no JSON, > 4 KB), cuenta de cliente,
método GET; idioma es/en/no válido según `empresas.language`; error de Resend simulado y clave ausente;
formulario completado/caducado/sin destinatario; CORS y construcción del enlace.

## Riesgos que permanecen

- No hay límite de frecuencia por usuario/formulario: un usuario legítimo de empresa puede reenviar el
  mismo formulario a su cliente muchas veces (solo a la dirección guardada en su propio formulario).
- `APP_URL` en producción apunta al dominio de Railway; el enlace del correo usa el origen de la petición
  (feblio.com) cuando está en la lista blanca, y `APP_URL` solo como respaldo. Conviene actualizar el
  secreto a `https://feblio.com` (cambio de secreto: fuera de este alcance).
- La ruta de compatibilidad `{ link }` sigue aceptándose para clientes con el bundle anterior; se puede
  retirar cuando el frontend con `{ intake_id }` esté desplegado en Railway.
