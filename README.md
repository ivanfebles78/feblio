# Feblio

Gestiona tus proyectos de principio a fin. SaaS multi-rol para gestión de
proyectos, presupuestos, provisiones de fondos, facturas, clientes y documentos.

## Stack (propuesto)

- **Frontend:** Vite + React + TypeScript + Tailwind CSS
- **Backend / DB / Auth:** Supabase (Postgres + Auth + RLS + Storage)
- **Deploy:** Railway (frontend) · Supabase (backend gestionado)
- **Repo:** GitHub

## Roles (propuesta a confirmar)

| Rol         | Usuario prueba | Qué es                              | Qué ve / hace |
|-------------|----------------|-------------------------------------|---------------|
| `admin`     | Ivan           | Dueño de la plataforma Feblio       | Todo: todas las empresas, usuarios, métricas globales |
| `empresa`   | Ralm           | Cliente de pago (tenant)            | Sus proyectos, sus clientes, plantillas (presupuestos/provisiones/facturas), documentos |
| `cliente`   | Casa_chona     | Cliente final de una empresa        | Portal de solo-lectura: estado del proyecto, sus documentos y facturas |

## Estructura

```
feblio/
├── frontend/          # App Vite + React + Tailwind
├── database/
│   ├── migrations/    # SQL de esquema (tablas, RLS, políticas)
│   └── seed/          # Usuarios y datos de prueba
├── docs/              # PRD, arquitectura, decisiones
└── README.md
```

## Estado

- [x] Esqueleto de carpetas
- [x] Arquitectura y modelo de roles confirmados (3 niveles multi-tenant · solo Supabase)
- [x] Proyecto Supabase `feblio` + esquema + RLS + seed
- [x] Frontend (auth + 3 dashboards por rol) **verificado end-to-end**
- [ ] Deploy a GitHub + Railway

## Arranque rápido

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Las variables ya están en `frontend/.env.local` (proyecto Supabase `feblio`).

## Usuarios de prueba

| Rol | Email | Contraseña |
|-----|-------|-----------|
| admin | ivan@feblio.app | Feblio2026! |
| empresa | ralm@feblio.app | Feblio2026! |
| cliente | casachona@feblio.app | Feblio2026! |

En la landing hay botones de **acceso rápido** para entrar con un clic.

## Supabase

- Proyecto: `feblio` (ref `zpwwquujvqhlhjbvhqvd`, región eu-west-3)
- URL: https://zpwwquujvqhlhjbvhqvd.supabase.co
- Esquema y seed en `database/`. Aplica en orden: `0001_init_schema.sql`,
  `0002_seed_users.sql`, `0003_harden_functions.sql`.
