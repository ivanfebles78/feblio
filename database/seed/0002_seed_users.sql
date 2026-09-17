-- Feblio · Seed de usuarios de prueba y datos demo
-- Contraseña de prueba: NO está en el repositorio. Antes de ejecutar este seed
-- define la variable de sesión (solo en tu sesión SQL, nunca en git):
--   select set_config('app.seed_password', 'una-contraseña-segura', false);
--   select set_config('feblio.allow_admin_signup', 'on', false);  -- necesario (0011) para crear la cuenta admin
-- Si no está definida, el seed aborta. Rota estas cuentas tras cualquier exposición.
--   admin    -> ivan.febles@gmail.com
--   empresa  -> ivan.feblestrujillo@gmail.com
--   cliente  -> ivanfebles@devcon8.com

do $$
declare
  v_ivan    uuid := gen_random_uuid();
  v_ralm    uuid := gen_random_uuid();
  v_casa    uuid := gen_random_uuid();
  v_empresa uuid := gen_random_uuid();
  v_cliente uuid := gen_random_uuid();
  v_proj1   uuid := gen_random_uuid();
  v_proj2   uuid := gen_random_uuid();
  v_password text := nullif(current_setting('app.seed_password', true), '');
begin
  if v_password is null or length(v_password) < 8 then
    raise exception 'Define app.seed_password (>= 8 caracteres) con set_config antes de ejecutar el seed';
  end if;
  -- Autoriza la creación de la cuenta admin en esta sesión (ver 0011 · handle_new_user)
  perform set_config('feblio.allow_admin_signup', 'on', true);

  -- Empresa (tenant)
  insert into public.empresas(id, name, cif) values (v_empresa, 'Ralm', 'B00000000');

  -- Usuarios de Auth
  -- IMPORTANTE: las columnas de token deben ir a '' (no NULL) o GoTrue falla
  -- al hacer login con "Database error querying schema".
  insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at,
     raw_app_meta_data, raw_user_meta_data,
     confirmation_token, recovery_token, email_change_token_new, email_change,
     email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values
    ('00000000-0000-0000-0000-000000000000', v_ivan, 'authenticated', 'authenticated',
     'ivan.febles@gmail.com', crypt(v_password, gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('full_name','Ivan','role','admin'),
     '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_ralm, 'authenticated', 'authenticated',
     'ivan.feblestrujillo@gmail.com', crypt(v_password, gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('full_name','Ralm','role','empresa'),
     '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_casa, 'authenticated', 'authenticated',
     'ivanfebles@devcon8.com', crypt(v_password, gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('full_name','Casa Chona','role','cliente'),
     '', '', '', '', '', '', '', '');

  -- Identities (necesario para login por email/password)
  insert into auth.identities
    (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), v_ivan, v_ivan::text,
     jsonb_build_object('sub', v_ivan::text, 'email','ivan.febles@gmail.com'), 'email', now(), now(), now()),
    (gen_random_uuid(), v_ralm, v_ralm::text,
     jsonb_build_object('sub', v_ralm::text, 'email','ivan.feblestrujillo@gmail.com'), 'email', now(), now(), now()),
    (gen_random_uuid(), v_casa, v_casa::text,
     jsonb_build_object('sub', v_casa::text, 'email','ivanfebles@devcon8.com'), 'email', now(), now(), now());

  -- Cliente final (pertenece a la empresa Ralm)
  insert into public.clientes(id, empresa_id, name, email, linked_profile_id)
  values (v_cliente, v_empresa, 'Casa Chona', 'ivanfebles@devcon8.com', v_casa);

  -- Vincular perfiles (creados por el trigger handle_new_user)
  update public.profiles set empresa_id = v_empresa                       where id = v_ralm;
  update public.profiles set empresa_id = v_empresa, cliente_id = v_cliente where id = v_casa;

  -- Proyectos demo
  insert into public.projects(id, empresa_id, cliente_id, name, status, budget_total, invoiced, provision_funds, pending_payments, progress)
  values
    (v_proj1, v_empresa, v_cliente, 'Reforma Integral Edificio Central', 'en_progreso', 120000, 75250, 15000, 29750, 65),
    (v_proj2, v_empresa, null,      'Rehabilitación Fachada Norte',       'borrador',    45000,     0,  5000,     0, 10);

  -- Documentos demo
  insert into public.documents(empresa_id, project_id, type, name, amount, status)
  values
    (v_empresa, v_proj1, 'presupuesto', 'Presupuesto.pdf',          120000, 'aprobado'),
    (v_empresa, v_proj1, 'contrato',    'Contrato.pdf',                  0, 'firmado'),
    (v_empresa, v_proj1, 'factura',     'Factura_F-2024-015.pdf',    12500, 'enviada'),
    (v_empresa, v_proj1, 'otro',        'Certificado_Obra.pdf',          0, 'archivado');

  -- Plantillas demo
  insert into public.document_templates(empresa_id, type, name, content)
  values
    (v_empresa, 'presupuesto', 'Plantilla presupuesto estándar', '{"iva":21,"moneda":"EUR"}'::jsonb),
    (v_empresa, 'provision',   'Plantilla provisión de fondos',  '{"moneda":"EUR"}'::jsonb),
    (v_empresa, 'factura',     'Plantilla factura estándar',     '{"iva":21,"moneda":"EUR"}'::jsonb);
end $$;
