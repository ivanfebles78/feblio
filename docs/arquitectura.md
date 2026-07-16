# Arquitectura de Feblio

## Visión

SaaS multi-tenant para gestión de proyectos. Tres niveles de acceso:

```
admin (plataforma Feblio)
  └── empresa (tenant de pago)
        ├── clientes (finales)
        ├── proyectos
        ├── documentos
        └── plantillas
```

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS 3
- **Auth / DB / Storage:** Supabase (Postgres 17 + GoTrue + RLS)
- **Deploy previsto:** Railway (frontend) · GitHub (repo)

## Modelo de datos

| Tabla | Descripción |
|-------|-------------|
| `empresas` | Tenants (empresas de pago) |
| `profiles` | 1:1 con `auth.users`; guarda `role`, `empresa_id`, `cliente_id` |
| `clientes` | Clientes finales de una empresa |
| `projects` | Proyectos de una empresa (presupuesto, facturado, provisión, progreso) |
| `documents` | Documentos por proyecto (presupuesto/provisión/factura/contrato) |
| `document_templates` | Plantillas reutilizables por empresa |

## Seguridad (RLS)

Cada tabla tiene Row Level Security. Las políticas usan funciones
`SECURITY DEFINER` (`current_role_name()`, `current_empresa_id()`,
`current_cliente_id()`, `is_admin()`) para evitar recursión al leer `profiles`.

- **admin:** acceso total (via `is_admin()`).
- **empresa:** solo filas con `empresa_id = current_empresa_id()`.
- **cliente:** solo lectura de sus proyectos/documentos (`cliente_id = current_cliente_id()`).

Al registrarse un usuario, el trigger `handle_new_user` crea su `profile`
tomando `full_name` y `role` de los metadatos del signup.

## Flujo de auth

1. `signInWithPassword` (Supabase) → sesión JWT.
2. `AuthContext` carga el `profile` (rol + tenant).
3. `ProtectedRoute` redirige a `/admin`, `/empresa` o `/cliente` según el rol.

## Notas de despliegue (Railway)

El frontend es una SPA Vite. Para Railway:

1. Servicio con root `frontend/`.
2. Build: `npm install && npm run build` → genera `dist/`.
3. Start: servir `dist/` con un static server (p. ej. `npx serve -s dist -l $PORT`)
   o usar el preset estático de Railway/Nixpacks.
4. Variables de entorno en Railway: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   (se inyectan en build time).

> Nota: la clave publishable de Supabase es pública por diseño; la seguridad
> real la impone RLS en la base de datos.
