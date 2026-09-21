# Plantillas bilingües de Supabase Auth (es / en)

Plantillas de correo de **autenticación** y de **notificaciones de seguridad** de Supabase Auth para
Feblio, versionadas aquí y listas para aplicar en el panel de Supabase (*Authentication → Email Templates*)
o mediante la Management API (`PATCH /v1/projects/{ref}/config/auth`).

## Cómo se decide el idioma

Cada plantilla (asunto y cuerpo) contiene las dos versiones dentro de una condicional de Go Templates
sobre `auth.users.user_metadata.language`, que Feblio guarda al registrarse (`buildSignUpMetadata`) y
sincroniza cuando el usuario autenticado pulsa el selector ES/EN (`syncUserLanguageMetadata`):

```
{{ if eq .Data.language "en" }}…inglés…{{ else }}…español…{{ end }}
```

- `language = "en"` → inglés.
- `language = "es"`, ausente, vacío o cualquier otro valor → **español** (rama `else`).
- Nunca se usa el idioma del navegador ni el de la empresa (`empresas.language`): es una comunicación
  de autenticación, personal del usuario.

## Archivos

| Archivo | Plantilla en Supabase | Clave Management API (asunto / cuerpo) | Variables oficiales usadas |
| --- | --- | --- | --- |
| `confirm-signup.html` | Confirm sign up | `mailer_subjects_confirmation` / `mailer_templates_confirmation_content` | `{{ .ConfirmationURL }}` |
| `reset-password.html` | Reset password | `mailer_subjects_recovery` / `mailer_templates_recovery_content` | `{{ .ConfirmationURL }}` |
| `invite-user.html` | Invite user | `mailer_subjects_invite` / `mailer_templates_invite_content` | `{{ .ConfirmationURL }}` |
| `magic-link.html` | Magic link | `mailer_subjects_magic_link` / `mailer_templates_magic_link_content` | `{{ .ConfirmationURL }}` |
| `change-email.html` | Change email address | `mailer_subjects_email_change` / `mailer_templates_email_change_content` | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| `reauthentication.html` | Reauthentication | `mailer_subjects_reauthentication` / `mailer_templates_reauthentication_content` | `{{ .Token }}` |
| `security/password-changed.html` | Password changed | `mailer_subjects_password_changed_notification` / `…_content` | — |
| `security/email-changed.html` | Email address changed | `mailer_subjects_email_changed_notification` / `…_content` | `{{ .OldEmail }}`, `{{ .Email }}` |
| `security/phone-changed.html` | Phone number changed | `mailer_subjects_phone_changed_notification` / `…_content` | `{{ .OldPhone }}`, `{{ .Phone }}` |
| `security/identity-linked.html` | Sign-in method linked | `mailer_subjects_identity_linked_notification` / `…_content` | `{{ .Provider }}`, `{{ .Email }}` |
| `security/identity-unlinked.html` | Sign-in method removed | `mailer_subjects_identity_unlinked_notification` / `…_content` | `{{ .Provider }}`, `{{ .Email }}` |
| `security/mfa-factor-enrolled.html` | Verification method added | `mailer_subjects_mfa_factor_enrolled_notification` / `…_content` | `{{ .FactorType }}` |
| `security/mfa-factor-unenrolled.html` | Verification method removed | `mailer_subjects_mfa_factor_unenrolled_notification` / `…_content` | `{{ .FactorType }}` |

`templates.json` es el manifiesto: para cada plantilla, el archivo, el **asunto bilingüe** (con la misma
condicional), los asuntos por idioma y las claves de la Management API.

Los asuntos:

| Plantilla | Español | Inglés |
| --- | --- | --- |
| Confirm sign up | Confirma tu correo electrónico · Feblio | Confirm your email address · Feblio |
| Reset password | Restablece tu contraseña · Feblio | Reset your password · Feblio |
| Invite user | Te han invitado a Feblio | You've been invited to Feblio |
| Magic link | Tu enlace de acceso · Feblio | Your sign-in link · Feblio |
| Change email | Confirma tu nueva dirección de correo · Feblio | Confirm your new email address · Feblio |
| Reauthentication | `{{ .Token }}` es tu código de verificación · Feblio | `{{ .Token }}` is your verification code · Feblio |

## Diseño

- Maquetación por tablas con CSS en línea (Gmail, Outlook, Apple Mail), ancho máximo 560 px, responsive.
- Logo `https://feblio.com/feblio-email-logo.png` (HTTPS, 180 px, `alt="Feblio"`); sin imágenes Base64.
- Botón grande de acción, enlace alternativo en texto para copiar, aviso «si no lo has solicitado, ignora
  este correo», pie de Feblio. Contraste AA (texto `#0f172a`/`#334155` sobre blanco; botón blanco sobre
  `#2563eb`). Sin JavaScript ni manejadores de eventos.
- Los `href` de los botones son **exactamente** la variable oficial (`{{ .ConfirmationURL }}`); no se
  construyen enlaces propios ni se alteran las URL de autenticación.

## Pruebas automáticas

`frontend/src/lib/authEmailTemplates.test.ts` (parte de `npm test`) comprueba en cada archivo: ramas es/en y
resolución a español sin idioma; que ninguna condicional queda literal al renderizar; variables oficiales
exactas por plantilla y ninguna inventada; ausencia de `<script>`, manejadores `on*=`, `javascript:` y
Base64; logo por HTTPS con texto alternativo; y ausencia de claves técnicas visibles.

## Cómo aplicarlas (manual, panel de Supabase)

1. **Antes de tocar nada**, guarda una copia exacta del asunto y del HTML actuales de cada plantilla (copia
   el contenido del editor del panel a un archivo fuera del repositorio, p. ej.
   `C:\Users\<usuario>\FeblioBackups\auth-templates-<ref>-<fecha>\`). No la subas al repositorio si
   contiene textos que no quieras versionar.
2. En el panel del proyecto (**primero staging `tbobbbgjfqrifwrmbtpd`, después producción
   `sykyofrzbzosbtdcsrxa`**): *Authentication → Email Templates* → pestaña de cada plantilla.
3. Pega en **Subject** el valor `subject` de `templates.json` y en **Message body** el contenido íntegro
   del archivo `.html`. Guarda.
4. Pulsa **Preview** y comprueba que se ve el español, que no aparece ningún `{{ if` / `{{ else }}` /
   `{{ end }}` literal y que el botón apunta a la URL de confirmación.
5. Repite en la pestaña *Security* para las 7 notificaciones (solo se envían si están activadas a nivel de
   proyecto; activar o desactivar notificaciones **no** forma parte de este cambio).

Alternativa con la Management API (token personal, nunca en el repositorio ni en el chat):

```bash
# Copia de seguridad de asuntos y cuerpos actuales
curl -s "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | jq 'to_entries | map(select(.key | startswith("mailer_subjects") or startswith("mailer_templates"))) | from_entries' > backup.json
# Aplicar (un PATCH con las claves de templates.json; el valor de *_content es el HTML del archivo)
curl -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" -d @payload.json
```

## Limitaciones conocidas

- **Asunto con condicional**: la documentación oficial muestra que los asuntos son plantillas de Go
  (`"mailer_subjects_reauthentication": "{{ .Token }} is your verification code"`), por lo que la misma
  condicional es válida. Si en el Preview de algún proyecto el asunto apareciera con la condicional
  literal, usa el asunto breve bilingüe de respaldo, p. ej. `Restablece tu contraseña · Reset your password · Feblio`.
- `{{ .Data.language }}` solo existe para usuarios registrados desde Feblio (o que hayan pulsado el
  selector con sesión). Usuarios anteriores sin el campo reciben español.
