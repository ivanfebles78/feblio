# Feblio

Gestiona tus proyectos de principio a fin. SaaS multiempresa para gestión de
proyectos, presupuestos, provisiones de fondos, facturas, clientes, documentos y
canales de comunicación con clientes.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS
- **Backend / DB / Auth:** Supabase (Postgres + Auth + RLS + Storage + Edge Functions)
- **Deploy:** Railway (frontend) · Supabase (backend gestionado)
- **Tests:** Vitest + Testing Library (frontend) · script SQL de aislamiento RLS (base de datos)

## Roles

| Rol | Qué es | Qué ve / hace |
|-----|--------|---------------|
| `admin` | Dueño de la plataforma Feblio | Todas las empresas, usuarios y métricas globales |
| `empresa` | Cliente de pago (tenant) | Sus proyectos, clientes, plantillas, formularios, canales e integraciones |
| `cliente` | Cliente final de una empresa | Portal de solo lectura: estado del proyecto, documentos y facturas |

## Flujo de una empresa nueva

```
Registro (persona + empresa por separado, términos obligatorios, marketing opcional)
  → Verificación de email (código de Feblio; una sola vez)
  → Wizard de configuración inicial (10 pasos, autoguardado, reanudable)
  → Prueba guiada (datos sandbox) → Activar Feblio → Dashboard
  → Configuración (datos, canales e integraciones, facturación, automatizaciones, formularios)
```

Detalles en [docs/onboarding.md](docs/onboarding.md) e [docs/integraciones.md](docs/integraciones.md).

## Estructura

```
feblio/
├── frontend/                 # App Vite + React + Tailwind
│   └── src/
│       ├── components/       # UI compartida (auth, forms, onboarding, gate, diálogos)
│       ├── context/          # AuthContext
│       ├── lib/              # validación, routing, onboarding (tipos, api, contexto), integraciones (adaptadores)
│       ├── pages/            # Landing, dashboards, onboarding (10 pasos), legal, OAuth callback
│       └── sections/         # Secciones del dashboard (home, plantillas, configuración)
├── database/
│   ├── migrations/           # 0001 … 0013 (esquema, RLS, RPCs, sincronización de email, endurecimiento, registro v2)
│   ├── seed/                 # Datos de desarrollo (sin credenciales)
│   └── tests/                # 0009_rls_isolation · 0009_backfill · 0010_sync_profile_email · 0011_security_audit · 0011_signup_roles
├── supabase/functions/       # send-otp, send-intake-email, integrations (privada), integrations-oauth-callback (pública), _shared
└── docs/                     # arquitectura, onboarding, integraciones
```

## Arranque rápido

```bash
cd frontend
cp .env.example .env.local   # rellena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm install
npm run dev                  # http://localhost:5173
```

Scripts: `npm run typecheck` · `npm run lint` · `npm test` · `npm run build`.

## Variables de entorno (frontend)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `VITE_SUPABASE_URL` | Sí | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Sí | Clave publishable/anon (pública por diseño; la seguridad la impone RLS) |
| `VITE_APP_URL` | Recomendada | URL pública de la app (enlaces y vuelta de OAuth) |
| `VITE_DEMO_MODE` | No | `true` muestra los accesos de demostración. **Oculto por defecto** |
| `VITE_DEMO_ACCOUNTS` | No | `Etiqueta:email,Etiqueta:email` (solo emails; nunca contraseñas) |

Las variables del backend (Edge Functions) se documentan en [docs/integraciones.md](docs/integraciones.md).
Ninguna `VITE_*` debe contener secretos.

## Cuentas de prueba y modo demo

Cuentas de prueba del seed (`database/seed/0002_seed_users.sql`):

| Rol | Email | Vinculación |
|---|---|---|
| admin | ivan.febles@gmail.com | `profiles.role = admin` |
| empresa (RALM) | ivan.feblestrujillo@gmail.com | `profiles.empresa_id` → empresa RALM |
| cliente final | ivanfebles@devcon8.com | `profiles.cliente_id` → cliente «Casa Chona» de RALM |

- **No hay contraseñas en el repositorio.** El seed exige `select set_config('app.seed_password', '…', false);` en la
  sesión SQL antes de ejecutarse. La cuenta admin solo puede crearse desde una sesión administrativa con la fila temporal
  `platform_settings.allow_admin_signup` (el propio seed la crea y la borra); el signup público nunca crea admins.
- Cambiar los archivos SQL **no modifica usuarios que ya existen en Supabase**: para actualizar los emails de cuentas
  existentes sigue [DEPLOY.md §5.1](DEPLOY.md#51-cambiar-el-email-de-una-cuenta-existente-y-mantener-profilesemail-sincronizado).
- **Modo demo:** los accesos rápidos solo aparecen con `VITE_DEMO_MODE=true` (nunca en producción). Muestran únicamente
  las etiquetas **Admin / Empresa / Cliente** tomadas de `VITE_DEMO_ACCOUNTS` (variable de entorno, no código); el email no se
  imprime en la landing y la contraseña se escribe manualmente. No existe login automático.
- Las credenciales demo publicadas en versiones anteriores del repositorio deben **rotarse** en Supabase → Authentication → Users.

## Base de datos

Aplica en orden en el SQL Editor de Supabase (todas idempotentes):
`0001_init_schema.sql` → `0002_seed_users.sql` (seed; requiere `set_config('app.seed_password', …)`) →
`0003_harden_functions.sql` → `0004` → `0005` → `0006` → `0007` → `0008` → **`0009_onboarding_wizard.sql`** →
**`0010_sync_profile_email.sql`** → **`0011_security_hardening.sql`** (bucket `intake-files` privado, revocaciones, signup sin auto-admin) → **`0012_e2e_fixes.sql`** (auditoría idempotente de la verificación nativa) → **`0013_registration_v2.sql`** (bienvenida de primera entrada `onboarding_welcome_seen_at` + RPC `mark_onboarding_welcome_seen`, y corrección de 0011: `feblio_trusted()` ejecutable por `authenticated`, sin lo cual las empresas no podían actualizar su propia fila).
Después, ejecuta en una rama los tests `database/tests/0009_rls_isolation.sql`, `0009_backfill.sql`, `0010_sync_profile_email.sql`, `0011_security_audit.sql` y `0011_signup_roles.sql`.

## Documentación

- [DEPLOY.md](DEPLOY.md): despliegue en Railway, configuración manual de Supabase, dominio feblio.com.
- [docs/arquitectura.md](docs/arquitectura.md): modelo de datos, RLS, flujo de auth.
- [docs/onboarding.md](docs/onboarding.md): registro, verificación, wizard, estados, pruebas.
- [docs/integraciones.md](docs/integraciones.md): adaptadores, OAuth, webhooks, secrets.
