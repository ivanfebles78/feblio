-- Feblio · Pruebas de 0017 (límite de frecuencia de send-intake-email). ROLLBACK final. Sin envíos.
--   R1 permisos: service_role puede ejecutar; anon, authenticated y public no
--   R2 usuario+formulario: 5 permitidos, 6.º bloqueado (429) con retry_after en 1..3600; el rechazo no consume cuota
--   R3 independencia: otro usuario / otro formulario / otra empresa mantienen cuotas propias
--   R4 expiración de la ventana → vuelve a permitir y reinicia el contador
--   R5 límite de empresa (30): bloquea, no incrementa el contador usuario+formulario del intento rechazado
--   R6 entradas nulas → bloqueado; solo se almacenan UUID y contadores; limpieza únicamente de claves 'ie:%'
begin;
create temp table _t (name text, ok boolean) on commit drop;
grant insert on table pg_temp._t to authenticated, anon, service_role;

do $$
declare
  fn constant text := 'public.intake_email_rate_check(uuid, uuid, uuid)';
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ea uuid := gen_random_uuid(); eb uuid := gen_random_uuid();
  ia uuid := gen_random_uuid(); ib uuid := gen_random_uuid();
  r jsonb; i int; n int; h int; ok boolean; has_public boolean;
begin
  -- R1 permisos --------------------------------------------------------------------------------
  insert into pg_temp._t values ('R1a service_role tiene EXECUTE', has_function_privilege('service_role', fn, 'execute'));
  insert into pg_temp._t values ('R1b anon NO tiene EXECUTE', not has_function_privilege('anon', fn, 'execute'));
  insert into pg_temp._t values ('R1c authenticated NO tiene EXECUTE', not has_function_privilege('authenticated', fn, 'execute'));
  select exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                 where p.oid = 'public.intake_email_rate_check(uuid, uuid, uuid)'::regprocedure and a.grantee = 0) into has_public;
  insert into pg_temp._t values ('R1d public NO tiene EXECUTE (sin entrada ACL para grantee 0)', not has_public);
  -- ejecución real como cada rol (set local role dentro de un bloque anidado)
  begin
    execute 'set local role service_role';
    r := public.intake_email_rate_check(gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
    execute 'reset role';
    insert into pg_temp._t values ('R1e service_role ejecuta la función', (r->>'allowed')::boolean);
  exception when others then
    execute 'reset role';
    insert into pg_temp._t values ('R1e service_role ejecuta la función', false);
  end;
  begin
    execute 'set local role anon';
    r := public.intake_email_rate_check(ua, ea, ia);
    execute 'reset role';
    insert into pg_temp._t values ('R1f anon rechazado al ejecutar', false);
  exception when insufficient_privilege then
    execute 'reset role';
    insert into pg_temp._t values ('R1f anon rechazado al ejecutar', true);
  end;
  begin
    execute 'set local role authenticated';
    r := public.intake_email_rate_check(ua, ea, ia);
    execute 'reset role';
    insert into pg_temp._t values ('R1g authenticated rechazado al ejecutar', false);
  exception when insufficient_privilege then
    execute 'reset role';
    insert into pg_temp._t values ('R1g authenticated rechazado al ejecutar', true);
  end;

  -- R2 usuario+formulario ----------------------------------------------------------------------
  ok := true;
  for i in 1..5 loop
    r := public.intake_email_rate_check(ua, ea, ia);
    ok := ok and (r->>'allowed')::boolean and (r ? 'retry_after') = false;
  end loop;
  insert into pg_temp._t values ('R2a los 5 primeros intentos se permiten', ok);
  select hits into h from public.rate_limits where key = 'ie:u:' || ua || ':i:' || ia;
  insert into pg_temp._t values ('R2b contador usuario+formulario = 5', h = 5);
  select hits into h from public.rate_limits where key = 'ie:e:' || ea;
  insert into pg_temp._t values ('R2c contador empresa = 5 (ambos +1 por intento permitido)', h = 5);
  r := public.intake_email_rate_check(ua, ea, ia);
  insert into pg_temp._t values ('R2d 6.º intento bloqueado', not (r->>'allowed')::boolean);
  insert into pg_temp._t values ('R2e retry_after entre 1 y 3600', (r->>'retry_after')::int between 1 and 3600);
  r := public.intake_email_rate_check(ua, ea, ia);
  select hits into h from public.rate_limits where key = 'ie:u:' || ua || ':i:' || ia;
  select hits into n from public.rate_limits where key = 'ie:e:' || ea;
  insert into pg_temp._t values ('R2f los intentos rechazados no consumen cuota (usuario 5, empresa 5)', h = 5 and n = 5);

  -- R3 independencia --------------------------------------------------------------------------
  r := public.intake_email_rate_check(ub, ea, ia);
  insert into pg_temp._t values ('R3a otro usuario, mismo formulario → permitido', (r->>'allowed')::boolean);
  r := public.intake_email_rate_check(ua, ea, ib);
  insert into pg_temp._t values ('R3b mismo usuario, otro formulario → permitido', (r->>'allowed')::boolean);
  select hits into n from public.rate_limits where key = 'ie:e:' || ea;
  insert into pg_temp._t values ('R3c contador de empresa A = 7 tras esos dos permitidos', n = 7);
  -- Un usuario y un formulario pertenecen a una sola empresa: la empresa B tiene sus propios usuarios/formularios
  ok := true;
  for i in 1..5 loop
    r := public.intake_email_rate_check(ub, eb, ib);
    ok := ok and (r->>'allowed')::boolean;
  end loop;
  select hits into n from public.rate_limits where key = 'ie:e:' || eb;
  insert into pg_temp._t values ('R3d otra empresa: cuota propia (5 permitidos; contador de B = 5)', ok and n = 5);
  select hits into n from public.rate_limits where key = 'ie:e:' || ea;
  insert into pg_temp._t values ('R3e la empresa A no se ve afectada por la empresa B', n = 7);

  -- R4 expiración -----------------------------------------------------------------------------
  update public.rate_limits set window_start = now() - interval '61 minutes' where key = 'ie:u:' || ua || ':i:' || ia;
  r := public.intake_email_rate_check(ua, ea, ia);
  select hits into h from public.rate_limits where key = 'ie:u:' || ua || ':i:' || ia;
  insert into pg_temp._t values ('R4a ventana vencida → permitido y contador reiniciado a 1', (r->>'allowed')::boolean and h = 1);
  select (window_start > now() - interval '1 minute') into ok from public.rate_limits where key = 'ie:u:' || ua || ':i:' || ia;
  insert into pg_temp._t values ('R4b la ventana nueva empieza ahora', ok);

  -- R5 límite de empresa ----------------------------------------------------------------------
  update public.rate_limits set hits = 30, window_start = now() where key = 'ie:e:' || ea;
  ib := gen_random_uuid();                             -- clave usuario+formulario nueva
  r := public.intake_email_rate_check(ub, ea, ib);
  insert into pg_temp._t values ('R5a empresa en el límite (30) → bloqueado', not (r->>'allowed')::boolean);
  insert into pg_temp._t values ('R5b retry_after entre 1 y 3600', (r->>'retry_after')::int between 1 and 3600);
  select hits into h from public.rate_limits where key = 'ie:u:' || ub || ':i:' || ib;
  select hits into n from public.rate_limits where key = 'ie:e:' || ea;
  insert into pg_temp._t values ('R5c el rechazo por empresa no incrementa ni usuario+formulario (0) ni empresa (30)', h = 0 and n = 30);
  update public.rate_limits set window_start = now() - interval '61 minutes' where key = 'ie:e:' || ea;
  r := public.intake_email_rate_check(ub, ea, ib);
  select hits into n from public.rate_limits where key = 'ie:e:' || ea;
  insert into pg_temp._t values ('R5d ventana de empresa vencida → permitido y contador 1', (r->>'allowed')::boolean and n = 1);

  -- R6 nulos, contenido almacenado y limpieza -------------------------------------------------
  r := public.intake_email_rate_check(null, ea, ia);
  insert into pg_temp._t values ('R6a usuario nulo → bloqueado', not (r->>'allowed')::boolean and (r->>'retry_after')::int between 1 and 3600);
  select count(*) into n from public.rate_limits where key like 'ie:%'
    and key !~ '^ie:(u:[0-9a-f-]{36}:i:[0-9a-f-]{36}|e:[0-9a-f-]{36})$';
  insert into pg_temp._t values ('R6b las claves ie:* solo contienen UUID (sin correos, enlaces ni tokens)', n = 0);
  insert into public.rate_limits (key, window_start, hits) values ('ie:e:' || gen_random_uuid(), now() - interval '2 days', 3);
  insert into public.rate_limits (key, window_start, hits) values ('dl:ip:test-0017', now() - interval '2 days', 3);
  perform public.intake_email_rate_check(ua, ea, gen_random_uuid());
  select count(*) into n from public.rate_limits where key like 'ie:%' and window_start < now() - interval '1 day';
  select count(*) into h from public.rate_limits where key = 'dl:ip:test-0017';
  insert into pg_temp._t values ('R6c limpieza: borra claves ie:* vencidas hace >1 día y no toca otras (dl:*)', n = 0 and h = 1);
end $$;

reset role;
select name, case when ok then 'OK' else 'FALLO' end as resultado from pg_temp._t order by name;
do $$
declare failed int;
begin
  select count(*) into failed from pg_temp._t where not ok;
  if failed > 0 then raise exception 'Han fallado % comprobaciones de 0017', failed; end if;
  raise notice 'Rate limit 0017: todas las comprobaciones han pasado';
end $$;
rollback;
