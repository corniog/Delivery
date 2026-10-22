-- ============================================================
--  API del sistema (equivale a backend/Code.gs). Todo entra por la función api().
--  Las tablas NO se pueden leer ni escribir directamente: solo a través de api().
-- ============================================================
set search_path = public, extensions;

drop type if exists ctx_t cascade;
create type ctx_t as (
  tid uuid, uid text, email text, nombre text, telefono text, rol text, deliv text,
  perms jsonb, funciones text[], maxu integer, tz text
);

-- ---------- Utilidades ----------
create or replace function fail_(msg text, code text default '', extra text default null) returns void
language plpgsql as $$ begin raise exception '%', msg using errcode = 'AP001', detail = coalesce(code, ''), hint = coalesce(extra, ''); end $$;

create or replace function nuevo_id(prefix text) returns text language sql as
$$ select prefix || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) $$;

create or replace function sig_num(p_tid uuid, p_clave text) returns bigint language plpgsql as $$
declare n bigint;
begin
  insert into contadores (tenant_id, clave, valor) values (p_tid, p_clave, 1)
  on conflict (tenant_id, clave) do update set valor = contadores.valor + 1 returning valor into n;
  return n;
end $$;

create or replace function ahora_txt(p_tz text, p_delta interval default '0') returns text language sql stable as
$$ select to_char((now() + p_delta) at time zone p_tz, 'YYYY-MM-DD"T"HH24:MI:SS') $$;
create or replace function hoy_txt(p_tz text) returns text language sql stable as
$$ select to_char(now() at time zone p_tz, 'YYYY-MM-DD') $$;

create or replace function nj(d jsonb, k text) returns numeric language plpgsql immutable as $$
declare v text := d ->> k;
begin
  if v is null or btrim(v) = '' then return 0; end if;
  begin return v::numeric; exception when others then return 0; end;
end $$;
create or replace function bj(v text) returns boolean language sql immutable as $$ select upper(coalesce(v, '')) = 'TRUE' $$;
create or replace function r2(n numeric) returns numeric language sql immutable as $$ select round(n, 2) $$;
create or replace function tj(d jsonb, k text) returns text language sql immutable as $$ select coalesce(d ->> k, '') $$;

create or replace function dias_txt() returns text[] language sql immutable as
$$ select array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'] $$;
create or replace function modulos_() returns text[] language sql immutable as
$$ select array['Inventario','Categorias','Ventas','Clientes','Proveedores','Delivery','Historial','Conocimiento','Reportes','KPI','Usuarios','Configuracion'] $$;
create or replace function acciones_() returns text[] language sql immutable as
$$ select array['Ver','Crear','Editar','Eliminar','Exportar'] $$;

-- ---------- Acceso genérico a tablas (siempre filtrado por negocio) ----------
create or replace function rows_json(p_tid uuid, p_tabla text, p_where text default 'true') returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''tenant_id'' - ''_orden'' order by x._orden), ''[]''::jsonb) from %I x where x.tenant_id = $1 and (%s)', p_tabla, p_where)
    into r using p_tid;
  return r;
end $$;

create or replace function get_row(p_tid uuid, p_tabla text, p_col text, p_val text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute format('select to_jsonb(x) - ''tenant_id'' - ''_orden'' from %I x where x.tenant_id = $1 and x.%I::text = $2 limit 1', p_tabla, p_col)
    into r using p_tid, p_val;
  return r;
end $$;

create or replace function tiene_col(p_tabla text, p_col text) returns boolean language sql stable as
$$ select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_tabla and column_name = p_col and column_name not in ('tenant_id', '_orden')) $$;

-- Deja solo columnas válidas y con el tipo correcto (vacío en número = se ignora)
create or replace function limpiar_datos(p_tabla text, p_datos jsonb) returns jsonb language plpgsql as $$
declare k text; v jsonb; t text; o jsonb := '{}'::jsonb;
begin
  for k, v in select * from jsonb_each(coalesce(p_datos, '{}'::jsonb)) loop
    select data_type into t from information_schema.columns
      where table_schema = 'public' and table_name = p_tabla and column_name = k and column_name not in ('tenant_id', '_orden');
    if t is null then continue; end if;
    if jsonb_typeof(v) = 'null' then continue; end if;
    if t = 'numeric' then
      if jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '' then continue; end if;
      begin o := o || jsonb_build_object(k, (v #>> '{}')::numeric);
      exception when others then perform fail_('Valor numérico inválido en ' || k); end;
    elsif t = 'boolean' then
      if jsonb_typeof(v) = 'boolean' then o := o || jsonb_build_object(k, v);
      elsif jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '' then continue;
      else o := o || jsonb_build_object(k, upper(v #>> '{}') = 'TRUE'); end if;
    else
      if jsonb_typeof(v) = 'array' then
        o := o || jsonb_build_object(k, (select coalesce(string_agg(e, ', '), '') from jsonb_array_elements_text(v) e));
      else o := o || jsonb_build_object(k, v #>> '{}'); end if;
    end if;
  end loop;
  return o;
end $$;

create or replace function ins_row(p_tid uuid, p_tabla text, p_datos jsonb) returns void language plpgsql as $$
declare cols text;
begin
  p_datos := limpiar_datos(p_tabla, p_datos);
  select string_agg(format('%I', k), ', ') into cols from jsonb_object_keys(p_datos) k;
  if cols is null then
    execute format('insert into %I (tenant_id) values ($1)', p_tabla) using p_tid;
  else
    execute format('insert into %I (tenant_id, %s) select $1, %s from jsonb_populate_record(null::%I, $2)', p_tabla, cols, cols, p_tabla) using p_tid, p_datos;
  end if;
end $$;

create or replace function upd_row(p_tid uuid, p_tabla text, p_col text, p_val text, p_patch jsonb) returns void language plpgsql as $$
declare sets text;
begin
  p_patch := limpiar_datos(p_tabla, p_patch);
  select string_agg(format('%I = r.%I', k, k), ', ') into sets from jsonb_object_keys(p_patch) k;
  if sets is null then return; end if;
  execute format('update %I t set %s from jsonb_populate_record(null::%I, $3) r where t.tenant_id = $1 and t.%I::text = $2', p_tabla, sets, p_tabla, p_col)
    using p_tid, p_val, p_patch;
end $$;

create or replace function del_row(p_tid uuid, p_tabla text, p_col text, p_val text) returns void language plpgsql as $$
begin
  execute format('delete from %I where tenant_id = $1 and %I::text = $2', p_tabla, p_col) using p_tid, p_val;
end $$;

create or replace function cfg_all(p_tid uuid) returns jsonb language sql stable as
$$ select coalesce(jsonb_object_agg("Clave", "Valor"), '{}'::jsonb) from "Configuracion" where tenant_id = p_tid $$;
create or replace function cfg_get(p_tid uuid, p_clave text) returns text language sql stable as
$$ select "Valor" from "Configuracion" where tenant_id = p_tid and "Clave" = p_clave $$;

create or replace function audit_(c ctx_t, p_modulo text, p_accion text, p_registro text, p_detalle text) returns void language plpgsql as $$
begin
  begin
    insert into "Auditoria" (tenant_id, "ID_Log", "Fecha", "Usuario", "Modulo", "Accion", "Registro", "Detalle")
    values (c.tid, nuevo_id('L'), ahora_txt(c.tz), coalesce(c.email, ''), p_modulo, p_accion, coalesce(p_registro, ''), coalesce(p_detalle, ''));
  exception when others then null;
  end;
end $$;

-- ---------- Permisos ----------
create or replace function perms_(p_tid uuid, p_uid text, p_rol text) returns jsonb language plpgsql as $$
declare v jsonb := '{}'::jsonb; m text; a text; master boolean := (p_rol = 'R01'); r record;
begin
  foreach m in array modulos_() loop
    v := v || jsonb_build_object(m, '{}'::jsonb);
    foreach a in array acciones_() loop
      v := jsonb_set(v, array[m, a], to_jsonb(master));
    end loop;
  end loop;
  if master then return v; end if;
  for r in select * from "Permisos" where tenant_id = p_tid and "ID_Rol" = p_rol order by _orden loop
    if v ? r."Modulo" then
      v := jsonb_set(v, array[r."Modulo", 'Ver'], to_jsonb(r."Ver")); v := jsonb_set(v, array[r."Modulo", 'Crear'], to_jsonb(r."Crear"));
      v := jsonb_set(v, array[r."Modulo", 'Editar'], to_jsonb(r."Editar")); v := jsonb_set(v, array[r."Modulo", 'Eliminar'], to_jsonb(r."Eliminar"));
      v := jsonb_set(v, array[r."Modulo", 'Exportar'], to_jsonb(r."Exportar"));
    end if;
  end loop;
  for r in select * from "Permisos_Usuario" where tenant_id = p_tid and "ID_Usuario" = p_uid order by _orden loop
    if v ? r."Modulo" then
      v := jsonb_set(v, array[r."Modulo", 'Ver'], to_jsonb(r."Ver")); v := jsonb_set(v, array[r."Modulo", 'Crear'], to_jsonb(r."Crear"));
      v := jsonb_set(v, array[r."Modulo", 'Editar'], to_jsonb(r."Editar")); v := jsonb_set(v, array[r."Modulo", 'Eliminar'], to_jsonb(r."Eliminar"));
      v := jsonb_set(v, array[r."Modulo", 'Exportar'], to_jsonb(r."Exportar"));
    end if;
  end loop;
  return v;
end $$;

create or replace function can_(c ctx_t, p_modulo text, p_accion text) returns boolean language sql immutable as
$$ select coalesce((c.perms -> p_modulo ->> p_accion)::boolean, false) $$;
create or replace function need_(c ctx_t, p_modulo text, p_accion text) returns void language plpgsql as $$
begin
  if not can_(c, p_modulo, p_accion) then
    perform fail_('No tienes permiso para ' || lower(p_accion) || ' en ' || p_modulo, 'PERM');
  end if;
end $$;
create or replace function is_master(c ctx_t) returns boolean language sql immutable as $$ select c.rol = 'R01' $$;
create or replace function is_deliv(c ctx_t) returns boolean language sql immutable as $$ select coalesce(c.deliv, '') <> '' $$;

-- ---------- Planes y licencia (cada negocio tiene su fila en "negocios") ----------
create or replace function funciones_plan(p_plan text, p_extra text) returns text[] language plpgsql immutable as $$
declare
  todas text[] := array['compras','delivery','mapa','kpi','comanda','reportes','conocimiento'];
  base text[]; n text := upper(translate(coalesce(p_plan, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')); t text; res text[] := '{}';
begin
  if n like '%ESENCIAL%' then base := array['comanda','reportes','conocimiento'];
  else base := todas; end if;
  res := base;
  foreach t in array regexp_split_to_array(lower(coalesce(p_extra, '')), '[,;\s]+') loop
    t := btrim(t);
    if t = '' then continue; end if;
    if left(t, 1) = '-' then res := array_remove(res, substr(t, 2));
    else
      t := case when left(t, 1) = '+' then substr(t, 2) else t end;
      if t = any(todas) and not (t = any(res)) then res := res || t; end if;
    end if;
  end loop;
  if not ('delivery' = any(res)) then res := array_remove(res, 'mapa'); end if;
  return array(select f from unnest(todas) f where f = any(res));
end $$;

create or replace function maxu_plan(p_plan text, p_valor integer) returns integer language plpgsql immutable as $$
declare n text := upper(translate(coalesce(p_plan, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'));
begin
  if p_valor is not null then return greatest(0, p_valor); end if;
  if n like '%ESENCIAL%' then return 3; end if;
  if n like '%PROFESIONAL%' or n like '%PRUEBA%' then return 8; end if;
  return 0;
end $$;

create or replace function lic_(p_tid uuid) returns jsonb language plpgsql stable as $$
declare n negocios%rowtype; dias integer; est text := 'activo'; blq boolean := false; msg text := ''; venc text := '';
begin
  select * into n from negocios where id = p_tid;
  if not found then return jsonb_build_object('bloqueada', true, 'estado', 'error', 'mensaje', 'Negocio no encontrado.'); end if;
  if not n.activo then
    est := 'suspendido'; blq := true; msg := 'El servicio está suspendido. Contacta a tu proveedor para reactivarlo.';
  elsif n.vencimiento is null then est := 'sin_vencimiento';
  else
    dias := n.vencimiento - (now() at time zone n.zona_horaria)::date;
    venc := to_char(n.vencimiento, 'YYYY-MM-DD');
    if dias < 0 then
      est := 'vencido'; blq := true;
      msg := 'Tu suscripción venció el ' || to_char(n.vencimiento, 'DD-MM-YYYY') || '. Contacta a tu proveedor para renovarla.';
    elsif dias <= 7 then est := 'por_vencer'; end if;
  end if;
  return jsonb_build_object('plan', n.plan, 'vencimiento', venc, 'diasRestantes', dias, 'whatsapp', n.whatsapp,
    'bloqueada', blq, 'estado', est, 'mensaje', msg,
    'funciones', to_jsonb(funciones_plan(n.plan, n.funciones_extra)), 'maxUsuarios', maxu_plan(n.plan, n.max_usuarios));
end $$;

create or replace function lic_publica(l jsonb) returns jsonb language sql immutable as $$
  select case when (l ->> 'bloqueada')::boolean
    then jsonb_build_object('bloqueada', true, 'estado', l -> 'estado', 'mensaje', l -> 'mensaje', 'plan', l -> 'plan', 'vencimiento', l -> 'vencimiento', 'whatsapp', l -> 'whatsapp')
    else jsonb_build_object('bloqueada', false) end $$;

create or replace function feat_(c ctx_t, f text) returns boolean language sql immutable as $$ select c.funciones is null or f = any(c.funciones) $$;
create or replace function needfeat_(c ctx_t, f text) returns void language plpgsql as $$
begin
  if not feat_(c, f) then perform fail_('Esta función no está incluida en tu plan. Consulta a tu proveedor para activarla.', 'PLAN'); end if;
end $$;

-- ---------- Sesiones ----------
create or replace function hash_token(p_token text) returns text language sql immutable set search_path = public, extensions, pg_temp as
$$ select encode(digest(p_token, 'sha256'), 'hex') $$;

create or replace function build_ctx(p_tid uuid, p_u jsonb) returns ctx_t language plpgsql as $$
declare c ctx_t; l jsonb; tz text;
begin
  select zona_horaria into tz from negocios where id = p_tid;
  l := lic_(p_tid);
  c.tid := p_tid; c.uid := p_u ->> 'ID_Usuario'; c.email := p_u ->> 'Email'; c.nombre := p_u ->> 'Nombre';
  c.telefono := p_u ->> 'Telefono'; c.rol := p_u ->> 'ID_Rol'; c.deliv := coalesce(p_u ->> 'ID_Delivery', '');
  c.perms := perms_(p_tid, c.uid, c.rol);
  c.funciones := case when jsonb_typeof(l -> 'funciones') = 'array' then array(select jsonb_array_elements_text(l -> 'funciones')) else null end;
  c.maxu := (l ->> 'maxUsuarios')::integer; c.tz := coalesce(tz, 'America/Santiago');
  return c;
end $$;

create or replace function autenticar_(p_token text) returns ctx_t language plpgsql as $$
declare s sesiones%rowtype; u jsonb;
begin
  if p_token is null or p_token = '' then perform fail_('Sesión no iniciada', 'AUTH'); end if;
  select * into s from sesiones where token_hash = hash_token(p_token) and expira > now();
  if not found then perform fail_('Tu sesión expiró. Vuelve a iniciar sesión.', 'AUTH'); end if;
  u := get_row(s.tenant_id, 'Usuarios', 'ID_Usuario', s.id_usuario);
  if u is null or not (u ->> 'Activo')::boolean then perform fail_('Usuario deshabilitado', 'AUTH'); end if;
  return build_ctx(s.tenant_id, u);
end $$;

create or replace function me_data(c ctx_t) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'user', jsonb_build_object('ID_Usuario', c.uid, 'Email', c.email, 'Nombre', c.nombre, 'Telefono', c.telefono, 'ID_Rol', c.rol, 'ID_Delivery', c.deliv),
    'perms', c.perms, 'config', cfg_all(c.tid),
    'funciones', case when c.funciones is null then null else to_jsonb(c.funciones) end,
    'maxUsuarios', coalesce(c.maxu, 0), 'negocio', (select codigo from negocios where id = c.tid)) $$;

create or replace function check_password(p text) returns void language plpgsql as $$
begin
  if p is null or length(p) < 8 then perform fail_('La contraseña debe tener al menos 8 caracteres'); end if;
end $$;

create or replace function crear_sesion(p_tid uuid, p_uid text) returns text language plpgsql as $$
declare tok text := encode(gen_random_bytes(32), 'hex');
begin
  delete from sesiones where expira < now();
  insert into sesiones (token_hash, tenant_id, id_usuario, expira) values (hash_token(tok), p_tid, p_uid, now() + interval '12 hours');
  return tok;
end $$;

-- ---------- Autenticación y registro ----------
create or replace function publico_(d jsonb) returns jsonb language plpgsql stable as $$
declare n negocios%rowtype; cfg jsonb; l jsonb;
begin
  if tj(d, 'negocio') <> '' then
    select * into n from negocios where codigo = lower(btrim(d ->> 'negocio'));
    if found then
      cfg := cfg_all(n.id); l := lic_(n.id);
      return jsonb_build_object('NOMBRE_NEGOCIO', coalesce(nullif(cfg ->> 'NOMBRE_NEGOCIO', ''), n.nombre), 'LOGO', coalesce(cfg ->> 'LOGO', ''), 'licencia', lic_publica(l));
    end if;
  end if;
  return jsonb_build_object('NOMBRE_NEGOCIO', 'App Negocio', 'LOGO', '', 'licencia', jsonb_build_object('bloqueada', false));
end $$;

create or replace function sesion_respuesta(p_tid uuid, p_u jsonb) returns jsonb language plpgsql as $$
declare c ctx_t; tok text;
begin
  c := build_ctx(p_tid, p_u);
  tok := crear_sesion(p_tid, c.uid);
  return jsonb_build_object('token', tok) || me_data(c);
end $$;

-- Devuelve el "sobre" completo (ok/error) para que un intento fallido quede registrado
create or replace function login_(d jsonb) returns jsonb language plpgsql as $$
declare
  em text := lower(btrim(tj(d, 'email'))); pw text := tj(d, 'password');
  ic intentos_login%rowtype; ui "Usuarios"%rowtype; l jsonb;
begin
  if em = '' or pw = '' then return jsonb_build_object('ok', false, 'error', 'Ingresa correo y contraseña', 'code', ''); end if;
  select * into ic from intentos_login where clave = em;
  if found and ic.fallos >= 5 and ic.hasta > now() then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Espera 10 minutos e inténtalo de nuevo.', 'code', '');
  end if;
  select * into ui from "Usuarios" where lower("Email") = em limit 1;
  if not found or not ui."Activo" or ui."Password_Hash" = '' or crypt(pw, ui."Password_Hash") <> ui."Password_Hash" then
    insert into intentos_login (clave, fallos, hasta) values (em, 1, now() + interval '10 minutes')
    on conflict (clave) do update set fallos = case when intentos_login.hasta > now() then intentos_login.fallos + 1 else 1 end, hasta = now() + interval '10 minutes';
    return jsonb_build_object('ok', false, 'error', 'Correo o contraseña incorrectos', 'code', '');
  end if;
  delete from intentos_login where clave = em;
  l := lic_(ui.tenant_id);
  if (l ->> 'bloqueada')::boolean then
    return jsonb_build_object('ok', false, 'error', l ->> 'mensaje', 'code', 'LICENSE', 'licencia', lic_publica(l));
  end if;
  perform upd_row(ui.tenant_id, 'Usuarios', 'ID_Usuario', ui."ID_Usuario", jsonb_build_object('Ultimo_Login', ahora_txt((select zona_horaria from negocios where id = ui.tenant_id))));
  return jsonb_build_object('ok', true, 'data', sesion_respuesta(ui.tenant_id, get_row(ui.tenant_id, 'Usuarios', 'ID_Usuario', ui."ID_Usuario")));
end $$;

-- Alta de un negocio nuevo (registro propio): 15 días de prueba con todas las funciones
create or replace function registrar_(d jsonb) returns jsonb language plpgsql as $$
declare
  em text := lower(btrim(tj(d, 'email'))); nom text := btrim(tj(d, 'negocio')); yo text := btrim(tj(d, 'nombre'));
  cod text; tid uuid; tz text := 'America/Santiago'; u jsonb; ip text;
begin
  begin ip := nullif(btrim(split_part(coalesce((current_setting('request.headers', true))::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  exception when others then ip := null; end;
  if ip is not null then   -- freno anti-abuso: máximo 5 negocios nuevos por hora desde la misma IP
    insert into intentos_login (clave, fallos, hasta) values ('reg:' || ip, 1, now() + interval '1 hour')
    on conflict (clave) do update set fallos = case when intentos_login.hasta > now() then intentos_login.fallos + 1 else 1 end,
      hasta = case when intentos_login.hasta > now() then intentos_login.hasta else now() + interval '1 hour' end;
    if (select fallos from intentos_login where clave = 'reg:' || ip) > 5 then perform fail_('Demasiados registros desde tu conexión. Intenta más tarde.'); end if;
  end if;
  if nom = '' then perform fail_('Escribe el nombre de tu negocio'); end if;
  if yo = '' then perform fail_('Escribe tu nombre'); end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then perform fail_('Correo inválido'); end if;
  perform check_password(tj(d, 'password'));
  if exists (select 1 from "Usuarios" where lower("Email") = em) then perform fail_('Ya existe una cuenta con ese correo'); end if;
  if tj(d, 'zona_horaria') <> '' and exists (select 1 from pg_timezone_names where name = d ->> 'zona_horaria') then tz := d ->> 'zona_horaria'; end if;
  cod := left(regexp_replace(lower(translate(nom, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', '', 'g'), 20);
  if cod = '' then cod := 'negocio'; end if;
  while exists (select 1 from negocios where codigo = cod) loop cod := left(cod, 15) || substr(md5(random()::text), 1, 4); end loop;
  insert into negocios (codigo, nombre, zona_horaria, plan, vencimiento)
  values (cod, nom, tz, 'PRUEBA', (now() at time zone tz)::date + 15) returning id into tid;
  perform sembrar_negocio(tid);
  update "Configuracion" set "Valor" = nom where tenant_id = tid and "Clave" = 'NOMBRE_NEGOCIO';
  insert into "Usuarios" (tenant_id, "ID_Usuario", "Email", "Nombre", "Telefono", "ID_Rol", "Activo", "Password_Hash", "Fecha_Creacion")
  values (tid, 'U0001', em, yo, tj(d, 'telefono'), 'R01', true, crypt(d ->> 'password', gen_salt('bf', 10)), ahora_txt(tz));
  u := get_row(tid, 'Usuarios', 'ID_Usuario', 'U0001');
  return sesion_respuesta(tid, u) || jsonb_build_object('codigo', cod);
end $$;

create or replace function a_cambiar_password(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare ui "Usuarios"%rowtype;
begin
  select * into ui from "Usuarios" where tenant_id = c.tid and "ID_Usuario" = c.uid;
  if crypt(tj(d, 'actual'), ui."Password_Hash") <> ui."Password_Hash" then perform fail_('La contraseña actual no es correcta'); end if;
  perform check_password(tj(d, 'nueva'));
  update "Usuarios" set "Password_Hash" = crypt(d ->> 'nueva', gen_salt('bf', 10)) where tenant_id = c.tid and "ID_Usuario" = c.uid;
  perform audit_(c, 'Usuarios', 'Editar', c.uid, 'Cambio de contraseña');
  return to_jsonb(true);
end $$;

-- ---------- CRUD genérico ----------
create or replace function cfg_tabla(p_t text) returns jsonb language sql immutable as $$
  select (jsonb_build_object(
    'Productos', jsonb_build_object('key', 'ID_Producto', 'prefix', 'P', 'module', 'Inventario'),
    'Categorias', jsonb_build_object('key', 'ID_Categoria', 'prefix', 'C', 'module', 'Categorias'),
    'Unidades', jsonb_build_object('key', 'Unidad', 'module', 'Inventario'),
    'Clientes', jsonb_build_object('key', 'ID_Cliente', 'prefix', 'CL', 'module', 'Clientes'),
    'Proveedores', jsonb_build_object('key', 'ID_Proveedor', 'prefix', 'PR', 'module', 'Proveedores'),
    'Visitas_Proveedor', jsonb_build_object('key', 'ID_Visita', 'prefix', 'VP', 'module', 'Proveedores'),
    'Deliverys', jsonb_build_object('key', 'ID_Delivery', 'prefix', 'D', 'module', 'Delivery'),
    'Categorias_Conocimiento', jsonb_build_object('key', 'ID_CatCon', 'prefix', 'CK', 'module', 'Conocimiento'),
    'Conocimiento', jsonb_build_object('key', 'ID_Conocimiento', 'prefix', 'K', 'module', 'Conocimiento'),
    'Roles', jsonb_build_object('key', 'ID_Rol', 'prefix', 'R', 'module', 'Usuarios'),
    'Permisos', jsonb_build_object('key', 'ID_Permiso', 'module', 'Usuarios'),
    'Permisos_Usuario', jsonb_build_object('key', 'ID_PermU', 'prefix', 'PU', 'module', 'Usuarios')
  )) -> p_t $$;

create or replace function modulo_solo_lectura(p_t text) returns text language sql immutable as $$
  select (jsonb_build_object('Ventas', 'Ventas', 'Detalle_Venta', 'Ventas', 'Documentos', 'Ventas', 'Compras', 'Proveedores',
    'Detalle_Compra', 'Proveedores', 'Movimientos_Inventario', 'Inventario', 'Servicios_Delivery', 'Delivery',
    'Ubicaciones_Delivery', 'Delivery', 'Auditoria', 'Configuracion')) ->> p_t $$;

create or replace function tabla_funcion(p_t text) returns text language sql immutable as $$
  select (jsonb_build_object('Proveedores', 'compras', 'Visitas_Proveedor', 'compras', 'Compras', 'compras', 'Detalle_Compra', 'compras',
    'Deliverys', 'delivery', 'Servicios_Delivery', 'delivery', 'Ubicaciones_Delivery', 'delivery',
    'Categorias_Conocimiento', 'conocimiento', 'Conocimiento', 'conocimiento')) ->> p_t $$;

create or replace function a_listar(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare t text := tj(d, 'tabla'); cfg jsonb := cfg_tabla(t); m text; r jsonb;
begin
  if cfg is not null then
    perform need_(c, cfg ->> 'module', 'Ver');
    if t = 'Deliverys' and is_deliv(c) then
      return rows_json(c.tid, t, format('"ID_Delivery" = %L', c.deliv));
    end if;
    return rows_json(c.tid, t);
  end if;
  if t = 'Usuarios' then
    perform need_(c, 'Usuarios', 'Ver');
    select coalesce(jsonb_agg(e - 'Password_Hash' - 'Salt'), '[]') into r from jsonb_array_elements(rows_json(c.tid, t)) e;
    return r;
  end if;
  if t = 'Alertas' then
    if is_master(c) then return rows_json(c.tid, t); end if;
    return rows_json(c.tid, t, format('%L = any(string_to_array("Para_Rol", '',''))', c.rol));
  end if;
  if t = 'Configuracion' then return rows_json(c.tid, t); end if;
  m := modulo_solo_lectura(t);
  if m is not null then
    perform need_(c, m, 'Ver');
    if t in ('Servicios_Delivery', 'Ubicaciones_Delivery') then perform fail_('Usa misServicios o historialDelivery'); end if;
    return rows_json(c.tid, t);
  end if;
  perform fail_('Tabla desconocida: ' || t);
  return null;
end $$;

create or replace function stock_alerta(c ctx_t, p jsonb, p_nuevo numeric) returns void language plpgsql as $$
declare mn numeric := coalesce((p ->> 'Stock_Minimo')::numeric, 0); act text := cfg_get(c.tid, 'ALERTA_STOCK_ACTIVA');
begin
  if act is not null and not bj(act) then return; end if;
  if p_nuevo > mn then return; end if;
  if exists (select 1 from "Alertas" where tenant_id = c.tid and "Tipo" = 'Stock minimo' and "Referencia" = p ->> 'ID_Producto' and not "Leida") then return; end if;
  insert into "Alertas" (tenant_id, "ID_Alerta", "Fecha", "Tipo", "Referencia", "Mensaje", "Para_Rol", "Leida")
  values (c.tid, nuevo_id('A'), ahora_txt(c.tz), 'Stock minimo', p ->> 'ID_Producto',
    (p ->> 'Nombre') || ' llegó al stock mínimo (quedan ' || trim_scale(p_nuevo)::text || ', mínimo ' || trim_scale(mn)::text || ')', 'R01,R02', false);
end $$;

create or replace function mov_stock(c ctx_t, p_prod text, p_tipo text, p_cant numeric, p_antes numeric, p_despues numeric, p_ref text, p_nota text, p_fecha text default null) returns void language sql as $$
  insert into "Movimientos_Inventario" (tenant_id, "ID_Mov", "Fecha", "ID_Producto", "Tipo", "Cantidad", "Stock_Antes", "Stock_Despues", "Referencia", "Usuario", "Nota")
  values (c.tid, nuevo_id('M'), coalesce(p_fecha, ahora_txt(c.tz)), p_prod, p_tipo, p_cant, p_antes, p_despues, coalesce(p_ref, ''), c.email, coalesce(p_nota, '')) $$;

create or replace function a_crear(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare t text := tj(d, 'tabla'); cfg jsonb := cfg_tabla(t); datos jsonb; k text; stock0 numeric := 0; ahora text := ahora_txt(c.tz); dup jsonb;
begin
  if cfg is null then perform fail_('No se puede crear en ' || t); end if;
  perform need_(c, cfg ->> 'module', 'Crear');
  if t in ('Roles', 'Permisos', 'Permisos_Usuario') and not is_master(c) then perform fail_('Solo el Master puede modificar roles y permisos', 'PERM'); end if;
  k := cfg ->> 'key';
  datos := limpiar_datos(t, coalesce(d -> 'datos', '{}'::jsonb));
  if t = 'Productos' then datos := datos - 'Stock_Actual'; end if;
  if coalesce(datos ->> k, '') = '' then
    if cfg ->> 'prefix' is null then perform fail_('Falta ' || k); end if;
    datos := datos || jsonb_build_object(k, nuevo_id(cfg ->> 'prefix'));
  end if;
  if get_row(c.tid, t, k, datos ->> k) is not null then perform fail_('Ya existe un registro con ese valor'); end if;
  if tiene_col(t, 'Fecha_Creacion') and coalesce(datos ->> 'Fecha_Creacion', '') = '' then datos := datos || jsonb_build_object('Fecha_Creacion', ahora); end if;
  if tiene_col(t, 'Fecha') and coalesce(datos ->> 'Fecha', '') = '' and t <> 'Detalle_Compra' then datos := datos || jsonb_build_object('Fecha', ahora); end if;
  if t = 'Productos' then
    stock0 := nj(d -> 'datos', 'Stock_Actual');
    if coalesce(datos ->> 'Nombre', '') = '' then perform fail_('El producto necesita un nombre'); end if;
    datos := datos || jsonb_build_object('Stock_Actual', stock0);
    if coalesce(datos ->> 'Codigo_Barras', '') <> '' then
      select to_jsonb(p) into dup from "Productos" p where tenant_id = c.tid and "Codigo_Barras" = datos ->> 'Codigo_Barras' limit 1;
      if dup is not null then perform fail_('Ya existe un producto con ese código de barras: ' || (dup ->> 'Nombre')); end if;
    end if;
  end if;
  perform ins_row(c.tid, t, datos);
  if t = 'Productos' and stock0 > 0 then
    perform mov_stock(c, datos ->> 'ID_Producto', 'Entrada compra', stock0, 0, stock0, 'Stock inicial', 'Alta del producto', ahora);
  end if;
  perform audit_(c, cfg ->> 'module', 'Crear', datos ->> k, t);
  return get_row(c.tid, t, k, datos ->> k);
end $$;

create or replace function a_actualizar(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare t text := tj(d, 'tabla'); cfg jsonb := cfg_tabla(t); k text; datos jsonb;
begin
  if cfg is null then perform fail_('No se puede editar ' || t); end if;
  perform need_(c, cfg ->> 'module', 'Editar');
  if t in ('Roles', 'Permisos', 'Permisos_Usuario') and not is_master(c) then perform fail_('Solo el Master puede modificar roles y permisos', 'PERM'); end if;
  k := cfg ->> 'key';
  if get_row(c.tid, t, k, tj(d, 'id')) is null then perform fail_('Registro no encontrado'); end if;
  datos := limpiar_datos(t, coalesce(d -> 'datos', '{}'::jsonb)) - k;
  if t = 'Productos' then datos := datos - 'Stock_Actual'; end if;
  perform upd_row(c.tid, t, k, d ->> 'id', datos);
  perform audit_(c, cfg ->> 'module', 'Editar', d ->> 'id', t);
  return to_jsonb(true);
end $$;

create or replace function a_eliminar(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare t text := tj(d, 'tabla'); cfg jsonb := cfg_tabla(t); k text;
begin
  if cfg is null then perform fail_('No se puede eliminar en ' || t); end if;
  perform need_(c, cfg ->> 'module', 'Eliminar');
  if t in ('Roles', 'Permisos', 'Permisos_Usuario') and not is_master(c) then perform fail_('Solo el Master puede modificar roles y permisos', 'PERM'); end if;
  if t = 'Roles' and tj(d, 'id') = 'R01' then perform fail_('No se puede eliminar el rol Master'); end if;
  k := cfg ->> 'key';
  if get_row(c.tid, t, k, tj(d, 'id')) is null then perform fail_('Registro no encontrado'); end if;
  perform del_row(c.tid, t, k, d ->> 'id');
  perform audit_(c, cfg ->> 'module', 'Eliminar', d ->> 'id', t);
  return to_jsonb(true);
end $$;

-- ---------- Inventario ----------
create or replace function a_ajustar_stock(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare p jsonb; antes numeric; despues numeric; tipo text := tj(d, 'tipo');
begin
  perform need_(c, 'Inventario', 'Editar');
  p := get_row(c.tid, 'Productos', 'ID_Producto', tj(d, 'ID_Producto'));
  if p is null then perform fail_('Producto no encontrado'); end if;
  antes := (p ->> 'Stock_Actual')::numeric;
  if tipo = 'Ajuste' then
    despues := nj(d, 'nuevoStock');
    if despues < 0 then perform fail_('El stock no puede ser negativo'); end if;
  elsif tipo = 'Entrada compra' then
    if not (nj(d, 'cantidad') > 0) then perform fail_('Cantidad inválida'); end if;
    despues := antes + nj(d, 'cantidad');
  elsif tipo = 'Merma' then
    if not (nj(d, 'cantidad') > 0) then perform fail_('Cantidad inválida'); end if;
    despues := antes - nj(d, 'cantidad');
    if despues < 0 then perform fail_('La merma supera el stock disponible'); end if;
  else perform fail_('Tipo de movimiento inválido'); end if;
  update "Productos" set "Stock_Actual" = despues where tenant_id = c.tid and "ID_Producto" = p ->> 'ID_Producto';
  perform mov_stock(c, p ->> 'ID_Producto', tipo, abs(despues - antes), antes, despues, tj(d, 'referencia'), tj(d, 'nota'));
  perform stock_alerta(c, p, despues);
  perform audit_(c, 'Inventario', 'Editar', p ->> 'ID_Producto', tipo || ': ' || trim_scale(antes)::text || ' → ' || trim_scale(despues)::text);
  return jsonb_build_object('ID_Producto', p ->> 'ID_Producto', 'Stock_Actual', despues);
end $$;

create or replace function a_marcar_alertas(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare ids text[] := coalesce(array(select jsonb_array_elements_text(d -> 'ids')), '{}'); todas boolean := coalesce((d ->> 'todas')::boolean, false);
begin
  update "Alertas" a set "Leida" = true
  where a.tenant_id = c.tid and not a."Leida"
    and (is_master(c) or c.rol = any(string_to_array(a."Para_Rol", ',')))
    and (todas or a."ID_Alerta" = any(ids));
  return to_jsonb(true);
end $$;

create or replace function a_guardar_config(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare k text; v text; cambios jsonb := coalesce(d -> 'valores', '{}'::jsonb); ks text[] := '{}';
begin
  perform need_(c, 'Configuracion', 'Editar');
  for k, v in select key, value #>> '{}' from jsonb_each(cambios) loop
    insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (c.tid, k, coalesce(v, ''), '')
    on conflict (tenant_id, "Clave") do update set "Valor" = excluded."Valor";
    ks := ks || k;
  end loop;
  perform audit_(c, 'Configuracion', 'Editar', '', array_to_string(ks, ', '));
  return cfg_all(c.tid);
end $$;

-- ---------- Compras a proveedores ----------
create or replace function entrada_compra(c ctx_t, p_compra jsonb, p_det jsonb, p_act_costo boolean) returns void language plpgsql as $$
declare r jsonb; p jsonb; antes numeric; despues numeric; fh text := ahora_txt(c.tz);
begin
  for r in select * from jsonb_array_elements(p_det) loop
    p := get_row(c.tid, 'Productos', 'ID_Producto', r ->> 'ID_Producto');
    if p is null then continue; end if;
    antes := (p ->> 'Stock_Actual')::numeric; despues := antes + nj(r, 'Cantidad');
    update "Productos" set "Stock_Actual" = despues,
      "Precio_Compra" = case when p_act_costo and nj(r, 'Costo_Unitario') > 0 then nj(r, 'Costo_Unitario') else "Precio_Compra" end
    where tenant_id = c.tid and "ID_Producto" = r ->> 'ID_Producto';
    perform mov_stock(c, r ->> 'ID_Producto', 'Entrada compra', nj(r, 'Cantidad'), antes, despues, p_compra ->> 'ID_Compra', '', fh);
  end loop;
end $$;

create or replace function a_crear_compra(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare
  prov jsonb; items jsonb := coalesce(d -> 'items', '[]'::jsonb); it jsonb; p jsonb; idc text := nuevo_id('CO');
  cant numeric; costo numeric; sub numeric; total numeric := 0; dets jsonb := '[]'::jsonb; det jsonb;
  recibir boolean := coalesce((d ->> 'recibir')::boolean, true); compra jsonb;
begin
  perform need_(c, 'Proveedores', 'Crear');
  prov := get_row(c.tid, 'Proveedores', 'ID_Proveedor', tj(d, 'ID_Proveedor'));
  if prov is null then perform fail_('Elige un proveedor'); end if;
  if jsonb_array_length(items) = 0 then perform fail_('Agrega al menos un producto'); end if;
  for it in select * from jsonb_array_elements(items) loop
    p := get_row(c.tid, 'Productos', 'ID_Producto', tj(it, 'ID_Producto'));
    if p is null then perform fail_('Producto no encontrado: ' || tj(it, 'ID_Producto')); end if;
    cant := nj(it, 'Cantidad'); costo := nj(it, 'Costo_Unitario');
    if not (cant > 0) then perform fail_('Cantidad inválida para ' || (p ->> 'Nombre')); end if;
    if costo < 0 then perform fail_('Costo inválido para ' || (p ->> 'Nombre')); end if;
    sub := r2(cant * costo); total := total + sub;
    dets := dets || jsonb_build_object('ID_DetCompra', nuevo_id('DC'), 'ID_Compra', idc, 'ID_Producto', p ->> 'ID_Producto', 'Cantidad', cant, 'Costo_Unitario', costo, 'Subtotal', sub);
  end loop;
  total := r2(total);
  compra := jsonb_build_object('ID_Compra', idc, 'Fecha', ahora_txt(c.tz), 'ID_Proveedor', prov ->> 'ID_Proveedor', 'Total', total,
    'Estado', case when recibir then 'Recibida' else 'Pendiente' end, 'Usuario', c.email, 'Nota', tj(d, 'nota'));
  perform ins_row(c.tid, 'Compras', compra);
  for det in select * from jsonb_array_elements(dets) loop perform ins_row(c.tid, 'Detalle_Compra', det); end loop;
  if recibir then perform entrada_compra(c, compra, dets, coalesce((d ->> 'actualizarCosto')::boolean, true)); end if;
  perform audit_(c, 'Proveedores', 'Crear', idc, 'Compra ' || (compra ->> 'Estado') || ' a ' || (prov ->> 'Nombre') || ' por ' || total::text);
  return jsonb_build_object('ID_Compra', idc, 'Total', total, 'Estado', compra ->> 'Estado');
end $$;

create or replace function a_recibir_compra(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare co jsonb; det jsonb;
begin
  perform need_(c, 'Proveedores', 'Editar');
  co := get_row(c.tid, 'Compras', 'ID_Compra', tj(d, 'ID_Compra'));
  if co is null then perform fail_('Compra no encontrada'); end if;
  if co ->> 'Estado' <> 'Pendiente' then perform fail_('Solo se pueden recibir compras pendientes'); end if;
  det := rows_json(c.tid, 'Detalle_Compra', format('"ID_Compra" = %L', co ->> 'ID_Compra'));
  perform entrada_compra(c, co, det, coalesce((d ->> 'actualizarCosto')::boolean, true));
  update "Compras" set "Estado" = 'Recibida' where tenant_id = c.tid and "ID_Compra" = co ->> 'ID_Compra';
  perform audit_(c, 'Proveedores', 'Editar', co ->> 'ID_Compra', 'Compra recibida');
  return to_jsonb(true);
end $$;

create or replace function a_anular_compra(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare co jsonb; r record; p jsonb; antes numeric; despues numeric; fh text := ahora_txt(c.tz);
begin
  perform need_(c, 'Proveedores', 'Eliminar');
  co := get_row(c.tid, 'Compras', 'ID_Compra', tj(d, 'ID_Compra'));
  if co is null then perform fail_('Compra no encontrada'); end if;
  if co ->> 'Estado' = 'Anulada' then perform fail_('La compra ya está anulada'); end if;
  if co ->> 'Estado' = 'Recibida' then
    for r in select * from "Detalle_Compra" where tenant_id = c.tid and "ID_Compra" = co ->> 'ID_Compra' order by _orden loop
      p := get_row(c.tid, 'Productos', 'ID_Producto', r."ID_Producto");
      if p is not null and (p ->> 'Stock_Actual')::numeric < r."Cantidad" then
        perform fail_('No se puede anular: ya se vendió parte de "' || (p ->> 'Nombre') || '" (stock ' || trim_scale((p ->> 'Stock_Actual')::numeric)::text || ', compra ' || trim_scale(r."Cantidad")::text || ')');
      end if;
    end loop;
    for r in select * from "Detalle_Compra" where tenant_id = c.tid and "ID_Compra" = co ->> 'ID_Compra' order by _orden loop
      p := get_row(c.tid, 'Productos', 'ID_Producto', r."ID_Producto");
      if p is null then continue; end if;
      antes := (p ->> 'Stock_Actual')::numeric; despues := antes - r."Cantidad";
      update "Productos" set "Stock_Actual" = despues where tenant_id = c.tid and "ID_Producto" = r."ID_Producto";
      perform mov_stock(c, r."ID_Producto", 'Anulacion compra', r."Cantidad", antes, despues, co ->> 'ID_Compra', tj(d, 'motivo'), fh);
      perform stock_alerta(c, p, despues);
    end loop;
  end if;
  update "Compras" set "Estado" = 'Anulada' where tenant_id = c.tid and "ID_Compra" = co ->> 'ID_Compra';
  perform audit_(c, 'Proveedores', 'Eliminar', co ->> 'ID_Compra', 'Compra anulada. ' || tj(d, 'motivo'));
  return to_jsonb(true);
end $$;

create or replace function a_listar_compras(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare desde text := coalesce(nullif(d ->> 'desde', ''), '0000-00-00'); hasta text := coalesce(nullif(d ->> 'hasta', ''), '9999-99-99'); rows jsonb; tot numeric; cant integer;
begin
  perform need_(c, 'Proveedores', 'Ver');
  select coalesce(jsonb_agg((to_jsonb(co) - 'tenant_id' - '_orden') || jsonb_build_object(
      'Proveedor', coalesce((select pr."Nombre" from "Proveedores" pr where pr.tenant_id = c.tid and pr."ID_Proveedor" = co."ID_Proveedor"), ''),
      'items', coalesce((select jsonb_agg(jsonb_build_object('ID_Producto', dc."ID_Producto",
          'Nombre', coalesce((select pd."Nombre" from "Productos" pd where pd.tenant_id = c.tid and pd."ID_Producto" = dc."ID_Producto"), dc."ID_Producto"),
          'Cantidad', dc."Cantidad", 'Costo_Unitario', dc."Costo_Unitario", 'Subtotal', dc."Subtotal") order by dc._orden)
        from "Detalle_Compra" dc where dc.tenant_id = c.tid and dc."ID_Compra" = co."ID_Compra"), '[]'::jsonb)
    ) order by co."Fecha" desc, co._orden desc), '[]'::jsonb),
    coalesce(sum(co."Total") filter (where co."Estado" <> 'Anulada'), 0), count(*) filter (where co."Estado" <> 'Anulada')
  into rows, tot, cant
  from "Compras" co
  where co.tenant_id = c.tid and left(co."Fecha", 10) between desde and hasta
    and (coalesce(d ->> 'estado', '') = '' or co."Estado" = d ->> 'estado')
    and (coalesce(d ->> 'ID_Proveedor', '') = '' or co."ID_Proveedor" = d ->> 'ID_Proveedor');
  return jsonb_build_object('rows', rows, 'total', r2(tot), 'cantidad', cant);
end $$;

-- ---------- Ventas ----------
create or replace function a_crear_venta(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare
  items jsonb := coalesce(d -> 'items', '[]'::jsonb); it jsonb; q numeric; pid text; nt text;
  ids text[] := '{}'; cant jsonb := '{}'::jsonb; notas jsonb := '{}'::jsonb;
  negativo boolean; entrega text; ahora text := ahora_txt(c.tz); fecha text := hoy_txt(c.tz); idv text;
  p jsonb; stock numeric; precio numeric; sub numeric; subtotal numeric := 0; descuento numeric; costo_del numeric := 0; total numeric;
  tipo_doc text; venta jsonb; nuevo numeric; cfg jsonb := cfg_all(c.tid); dl jsonb; cli jsonb; servicio jsonb; doc jsonb; imp numeric; neto numeric;
  dd jsonb := coalesce(d -> 'delivery', '{}'::jsonb); det jsonb := '[]'::jsonb;
begin
  perform need_(c, 'Ventas', 'Crear');
  if jsonb_array_length(items) = 0 then perform fail_('La venta no tiene productos'); end if;
  for it in select * from jsonb_array_elements(items) loop
    q := nj(it, 'Cantidad');
    if not (q > 0) then perform fail_('Cantidad inválida'); end if;
    pid := tj(it, 'ID_Producto');
    if not (pid = any(ids)) then ids := ids || pid; end if;
    cant := cant || jsonb_build_object(pid, coalesce((cant ->> pid)::numeric, 0) + q);
    nt := case when feat_(c, 'comanda') then left(btrim(tj(it, 'Nota')), 120) else '' end;
    if nt <> '' then notas := notas || jsonb_build_object(pid, case when notas ->> pid is null then nt else (notas ->> pid) || ' / ' || nt end); end if;
  end loop;
  negativo := bj(cfg ->> 'PERMITIR_STOCK_NEGATIVO');
  entrega := case when tj(d, 'tipoEntrega') in ('Delivery', 'Para servir') then d ->> 'tipoEntrega' else 'Retiro en local' end;
  if tj(d, 'ID_Cliente') <> '' and get_row(c.tid, 'Clientes', 'ID_Cliente', d ->> 'ID_Cliente') is null then perform fail_('El cliente no existe'); end if;
  if entrega = 'Delivery' then
    if tj(dd, 'ID_Delivery') = '' then perform fail_('Selecciona el delivery'); end if;
    if get_row(c.tid, 'Deliverys', 'ID_Delivery', dd ->> 'ID_Delivery') is null then perform fail_('El delivery no existe'); end if;
  end if;
  idv := 'V' || lpad(sig_num(c.tid, 'venta')::text, 6, '0');
  foreach pid in array ids loop
    p := get_row(c.tid, 'Productos', 'ID_Producto', pid);
    if p is null then perform fail_('Producto no existe: ' || pid); end if;
    if not (p ->> 'Activo')::boolean then perform fail_('El producto "' || (p ->> 'Nombre') || '" está desactivado'); end if;
    q := (cant ->> pid)::numeric; stock := (p ->> 'Stock_Actual')::numeric;
    if q > stock and not negativo then perform fail_('Stock insuficiente de "' || (p ->> 'Nombre') || '" (disponible: ' || trim_scale(stock)::text || ')'); end if;
    precio := (p ->> 'Precio_Venta')::numeric; sub := r2(q * precio); subtotal := subtotal + sub;
    det := det || jsonb_build_object('ID_Detalle', nuevo_id('DV'), 'ID_Venta', idv, 'ID_Producto', pid, 'Nombre_Producto', p ->> 'Nombre',
      'ID_Categoria', p ->> 'ID_Categoria', 'Cantidad', q, 'Precio_Unitario', precio, 'Costo_Unitario', (p ->> 'Precio_Compra')::numeric,
      'Descuento', 0, 'Subtotal', sub, 'Fecha', fecha, 'Nota', coalesce(notas ->> pid, ''), 'Va_A_Cocina', coalesce((p ->> 'Va_A_Cocina')::boolean, true));
  end loop;
  subtotal := r2(subtotal);
  descuento := r2(greatest(0, nj(d, 'descuento')));
  if descuento > subtotal then perform fail_('El descuento no puede superar el subtotal'); end if;
  if entrega = 'Delivery' then costo_del := r2(greatest(0, nj(dd, 'Monto_Delivery'))); end if;
  total := r2(subtotal - descuento + costo_del);
  tipo_doc := case when tj(d, 'tipoDocumento') in ('Ticket', 'Boleta', 'Factura') then d ->> 'tipoDocumento' else 'Ticket' end;
  venta := jsonb_build_object('ID_Venta', idv, 'Fecha_Hora', ahora, 'ID_Cliente', tj(d, 'ID_Cliente'), 'Tipo_Entrega', entrega,
    'Subtotal', subtotal, 'Descuento', descuento, 'Costo_Delivery', costo_del, 'Total', total,
    'Metodo_Pago', coalesce(nullif(d ->> 'metodoPago', ''), 'Efectivo'), 'Estado_Pago', coalesce(nullif(d ->> 'estadoPago', ''), 'Pagado'),
    'Estado', case when entrega = 'Delivery' then 'En despacho' else 'Confirmada' end, 'Tipo_Documento', tipo_doc,
    'Dia_Semana', (dias_txt())[extract(dow from (now() at time zone c.tz))::int + 1], 'Usuario', c.email,
    'Referencia', case when feat_(c, 'comanda') then left(btrim(tj(d, 'referencia')), 60) else '' end,
    'Nota_Cocina', case when feat_(c, 'comanda') then left(btrim(tj(d, 'notaCocina')), 200) else '' end);
  perform ins_row(c.tid, 'Ventas', venta);
  for it in select * from jsonb_array_elements(det) loop
    perform ins_row(c.tid, 'Detalle_Venta', it);
    pid := it ->> 'ID_Producto';
    p := get_row(c.tid, 'Productos', 'ID_Producto', pid);
    stock := (p ->> 'Stock_Actual')::numeric; nuevo := stock - (it ->> 'Cantidad')::numeric;
    update "Productos" set "Stock_Actual" = nuevo where tenant_id = c.tid and "ID_Producto" = pid;
    perform mov_stock(c, pid, 'Salida venta', (it ->> 'Cantidad')::numeric, stock, nuevo, idv, '', ahora);
    perform stock_alerta(c, p, nuevo);
  end loop;
  if entrega = 'Delivery' then
    dl := get_row(c.tid, 'Deliverys', 'ID_Delivery', dd ->> 'ID_Delivery');
    cli := case when tj(d, 'ID_Cliente') <> '' then get_row(c.tid, 'Clientes', 'ID_Cliente', d ->> 'ID_Cliente') else null end;
    servicio := jsonb_build_object('ID_Servicio', 'S' || lpad(sig_num(c.tid, 'servicio')::text, 6, '0'), 'ID_Venta', idv, 'ID_Delivery', dl ->> 'ID_Delivery',
      'Nombre_Delivery', dl ->> 'Nombre', 'Fecha_Asignacion', ahora, 'Fecha_Aceptado', '', 'Fecha_Finalizado', '', 'Fecha', fecha,
      'Direccion_Entrega', coalesce(nullif(dd ->> 'Direccion_Entrega', ''), cli ->> 'Direccion', ''),
      'Destino_LatLong', coalesce(nullif(dd ->> 'Destino_LatLong', ''), cli ->> 'Ubicacion', ''),
      'Origen_LatLong', coalesce(cfg ->> 'ORIGEN_LATLONG', ''), 'Distancia_Km', nj(dd, 'Distancia_Km'), 'Tiempo_Min', nj(dd, 'Tiempo_Min'),
      'Monto_Delivery', costo_del, 'Estado', 'Asignado', 'Notas', tj(dd, 'Notas'), 'Usuario_Asigna', c.email);
    perform ins_row(c.tid, 'Servicios_Delivery', servicio);
  end if;
  -- El documento (ticket/boleta/factura) solo se emite si la venta está pagada; si no, se emite después con pagarVenta.
  if venta ->> 'Estado_Pago' = 'Pagado' then doc := emitir_doc(c, cfg, idv, tipo_doc, total, ahora, d ->> 'formato'); end if;
  perform audit_(c, 'Ventas', 'Crear', idv, 'Total ' || trim_scale(total)::text || case when doc is null then ' (pago ' || (venta ->> 'Estado_Pago') || ')' else '' end);
  return jsonb_build_object('venta', get_row(c.tid, 'Ventas', 'ID_Venta', idv),
    'detalle', rows_json(c.tid, 'Detalle_Venta', format('"ID_Venta" = %L', idv)),
    'servicio', case when servicio is null then null else get_row(c.tid, 'Servicios_Delivery', 'ID_Servicio', servicio ->> 'ID_Servicio') end,
    'documento', case when doc is null then null else get_row(c.tid, 'Documentos', 'ID_Documento', doc ->> 'ID_Documento') end,
    'cliente', case when tj(d, 'ID_Cliente') <> '' then get_row(c.tid, 'Clientes', 'ID_Cliente', d ->> 'ID_Cliente') else null end);
end $$;

create or replace function emitir_doc(c ctx_t, cfg jsonb, idv text, tipo text, total numeric, ahora text, formato text) returns jsonb language plpgsql as $$
declare imp numeric := nj(cfg, 'IMPUESTO_PORC'); neto numeric; doc jsonb;
begin
  neto := case when imp > 0 then r2(total / (1 + imp)) else total end;
  doc := jsonb_build_object('ID_Documento', nuevo_id('DOC'), 'ID_Venta', idv, 'Tipo', tipo, 'Folio', sig_num(c.tid, 'doc_' || tipo)::text,
    'Fecha', ahora, 'Neto', neto, 'Impuesto', r2(total - neto), 'Total', total,
    'Formato', coalesce(nullif(formato, ''), nullif(cfg ->> 'FORMATO_DOC_DEFECTO', ''), 'Termica 80mm'), 'PDF_URL', '');
  perform ins_row(c.tid, 'Documentos', doc);
  return doc;
end $$;

-- Cobrar una venta pendiente: la marca pagada y emite su boleta / factura / ticket.
create or replace function a_pagar_venta(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare v jsonb; tipo text; cfg jsonb := cfg_all(c.tid); doc jsonb;
begin
  perform need_(c, 'Ventas', 'Crear');
  v := get_row(c.tid, 'Ventas', 'ID_Venta', tj(d, 'ID_Venta'));
  if v is null then perform fail_('Venta no encontrada'); end if;
  if v ->> 'Estado' = 'Anulada' then perform fail_('La venta está anulada'); end if;
  if v ->> 'Estado_Pago' = 'Pagado' then perform fail_('La venta ya está pagada'); end if;
  tipo := case when tj(d, 'tipoDocumento') in ('Ticket', 'Boleta', 'Factura') then d ->> 'tipoDocumento' else coalesce(nullif(v ->> 'Tipo_Documento', ''), 'Ticket') end;
  update "Ventas" set "Estado_Pago" = 'Pagado', "Tipo_Documento" = tipo,
    "Metodo_Pago" = coalesce(nullif(d ->> 'metodoPago', ''), "Metodo_Pago")
  where tenant_id = c.tid and "ID_Venta" = d ->> 'ID_Venta';
  doc := emitir_doc(c, cfg, d ->> 'ID_Venta', tipo, (v ->> 'Total')::numeric, ahora_txt(c.tz), d ->> 'formato');
  perform audit_(c, 'Ventas', 'Editar', d ->> 'ID_Venta', 'Pago recibido (' || coalesce(nullif(d ->> 'metodoPago', ''), v ->> 'Metodo_Pago') || '), ' || tipo || ' N° ' || (doc ->> 'Folio'));
  return a_detalle_venta(c, d);
end $$;

create or replace function a_anular_venta(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare v jsonb; r record; p jsonb; antes numeric; despues numeric; fh text := ahora_txt(c.tz);
begin
  perform need_(c, 'Ventas', 'Eliminar');
  v := get_row(c.tid, 'Ventas', 'ID_Venta', tj(d, 'ID_Venta'));
  if v is null then perform fail_('Venta no encontrada'); end if;
  if v ->> 'Estado' = 'Anulada' then perform fail_('La venta ya está anulada'); end if;
  for r in select * from "Detalle_Venta" where tenant_id = c.tid and "ID_Venta" = d ->> 'ID_Venta' order by _orden loop
    p := get_row(c.tid, 'Productos', 'ID_Producto', r."ID_Producto");
    if p is null then continue; end if;
    antes := (p ->> 'Stock_Actual')::numeric; despues := antes + r."Cantidad";
    update "Productos" set "Stock_Actual" = despues where tenant_id = c.tid and "ID_Producto" = r."ID_Producto";
    perform mov_stock(c, r."ID_Producto", 'Anulacion venta', r."Cantidad", antes, despues, d ->> 'ID_Venta', tj(d, 'motivo'), fh);
  end loop;
  update "Ventas" set "Estado" = 'Anulada' where tenant_id = c.tid and "ID_Venta" = d ->> 'ID_Venta';
  update "Servicios_Delivery" set "Estado" = 'Cancelado' where tenant_id = c.tid and "ID_Venta" = d ->> 'ID_Venta' and "Estado" <> 'Finalizado';
  perform audit_(c, 'Ventas', 'Eliminar', d ->> 'ID_Venta', 'Venta anulada. ' || tj(d, 'motivo'));
  return to_jsonb(true);
end $$;

create or replace function a_listar_ventas(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare desde text := coalesce(nullif(d ->> 'desde', ''), '0000-00-00'); hasta text := coalesce(nullif(d ->> 'hasta', ''), '9999-99-99'); rows jsonb; tot numeric; cant integer;
begin
  if is_deliv(c) or (not can_(c, 'Ventas', 'Ver') and not can_(c, 'Historial', 'Ver')) then perform fail_('No tienes permiso para ver ventas', 'PERM'); end if;
  select coalesce(jsonb_agg((to_jsonb(v) - 'tenant_id' - '_orden') || jsonb_build_object('Cliente',
      coalesce((select cl."Nombre" from "Clientes" cl where cl.tenant_id = c.tid and cl."ID_Cliente" = v."ID_Cliente"), '')) order by v."Fecha_Hora" desc, v._orden desc), '[]'::jsonb),
    coalesce(sum(v."Total") filter (where v."Estado" <> 'Anulada'), 0), count(*) filter (where v."Estado" <> 'Anulada')
  into rows, tot, cant
  from "Ventas" v
  where v.tenant_id = c.tid and left(v."Fecha_Hora", 10) between desde and hasta and (coalesce(d ->> 'estado', '') = '' or v."Estado" = d ->> 'estado');
  return jsonb_build_object('rows', rows, 'total', r2(tot), 'cantidad', cant);
end $$;

create or replace function a_detalle_venta(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  if is_deliv(c) or (not can_(c, 'Ventas', 'Ver') and not can_(c, 'Historial', 'Ver')) then perform fail_('No tienes permiso para ver ventas', 'PERM'); end if;
  v := get_row(c.tid, 'Ventas', 'ID_Venta', tj(d, 'ID_Venta'));
  if v is null then perform fail_('Venta no encontrada'); end if;
  return jsonb_build_object('venta', v,
    'detalle', rows_json(c.tid, 'Detalle_Venta', format('"ID_Venta" = %L', d ->> 'ID_Venta')),
    'documento', (rows_json(c.tid, 'Documentos', format('"ID_Venta" = %L', d ->> 'ID_Venta')) -> 0),
    'cliente', case when v ->> 'ID_Cliente' <> '' then get_row(c.tid, 'Clientes', 'ID_Cliente', v ->> 'ID_Cliente') else null end);
end $$;

-- ---------- Delivery ----------
create or replace function a_mis_servicios(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare estados text[] := case when jsonb_typeof(d -> 'estados') = 'array' then array(select jsonb_array_elements_text(d -> 'estados')) else '{}' end; r jsonb;
begin
  perform need_(c, 'Delivery', 'Ver');
  select coalesce(jsonb_agg((to_jsonb(s) - 'tenant_id' - '_orden') || jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object('Nombre', dv."Nombre_Producto", 'Cantidad', dv."Cantidad") order by dv._orden)
        from "Detalle_Venta" dv where dv.tenant_id = c.tid and dv."ID_Venta" = s."ID_Venta"), '[]'::jsonb),
      'Cliente', coalesce(cl."Nombre", ''), 'Cliente_Telefono', coalesce(cl."Telefono", ''),
      'Total_Venta', coalesce(v."Total", 0), 'Estado_Pago', coalesce(v."Estado_Pago", ''))
    order by s."Fecha_Asignacion" desc, s._orden desc), '[]'::jsonb)
  into r
  from "Servicios_Delivery" s
  left join "Ventas" v on v.tenant_id = s.tenant_id and v."ID_Venta" = s."ID_Venta"
  left join "Clientes" cl on cl.tenant_id = s.tenant_id and cl."ID_Cliente" = v."ID_Cliente"
  where s.tenant_id = c.tid
    and (not is_deliv(c) or s."ID_Delivery" = c.deliv)
    and (cardinality(estados) = 0 or s."Estado" = any(estados));
  return r;
end $$;

create or replace function a_servicio_estado(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare s jsonb; estado text := tj(d, 'estado'); patch jsonb; fh text := ahora_txt(c.tz); v jsonb;
begin
  perform need_(c, 'Delivery', 'Ver');
  s := get_row(c.tid, 'Servicios_Delivery', 'ID_Servicio', tj(d, 'ID_Servicio'));
  if s is null then perform fail_('Servicio no encontrado'); end if;
  if not (estado = any(array['Aceptado', 'En camino', 'Finalizado', 'Rechazado', 'Cancelado', 'Asignado'])) then perform fail_('Estado inválido'); end if;
  if is_deliv(c) then
    if s ->> 'ID_Delivery' <> c.deliv then perform fail_('Este servicio no es tuyo', 'PERM'); end if;
    if not (estado = any(array['Aceptado', 'En camino', 'Finalizado', 'Rechazado', 'Cancelado'])) then perform fail_('Acción no permitida', 'PERM'); end if;
  else
    perform need_(c, 'Delivery', 'Editar');
  end if;
  if s ->> 'Estado' in ('Finalizado', 'Cancelado') then perform fail_('El servicio ya está cerrado'); end if;
  patch := jsonb_build_object('Estado', estado);
  if estado = 'Aceptado' then patch := patch || jsonb_build_object('Fecha_Aceptado', fh); end if;
  if estado = 'Finalizado' then
    patch := patch || jsonb_build_object('Fecha_Finalizado', fh);
    if coalesce(d ->> 'Distancia_Km', '') <> '' then patch := patch || jsonb_build_object('Distancia_Km', nj(d, 'Distancia_Km')); end if;
    if coalesce(d ->> 'Tiempo_Min', '') <> '' then patch := patch || jsonb_build_object('Tiempo_Min', nj(d, 'Tiempo_Min')); end if;
  end if;
  perform upd_row(c.tid, 'Servicios_Delivery', 'ID_Servicio', s ->> 'ID_Servicio', patch);
  if estado in ('Finalizado', 'Rechazado') or (estado = 'Cancelado' and is_deliv(c)) then
    insert into "Alertas" (tenant_id, "ID_Alerta", "Fecha", "Tipo", "Referencia", "Mensaje", "Para_Rol", "Leida")
    values (c.tid, nuevo_id('A'), fh, case estado when 'Finalizado' then 'Delivery finalizado' when 'Rechazado' then 'Delivery rechazado' else 'Delivery cancelado' end, s ->> 'ID_Servicio',
      (s ->> 'Nombre_Delivery') || case estado when 'Finalizado' then ' finalizó' when 'Rechazado' then ' rechazó' else ' canceló' end || ' el pedido ' || (s ->> 'ID_Venta') || ' (' || (s ->> 'Direccion_Entrega') || ')', 'R01,R02', false);
  end if;
  if estado = 'Finalizado' then
    v := get_row(c.tid, 'Ventas', 'ID_Venta', s ->> 'ID_Venta');
    if v is not null and v ->> 'Estado' <> 'Anulada' then update "Ventas" set "Estado" = 'Entregada' where tenant_id = c.tid and "ID_Venta" = v ->> 'ID_Venta'; end if;
  end if;
  perform audit_(c, 'Delivery', 'Editar', s ->> 'ID_Servicio', 'Estado → ' || estado);
  return to_jsonb(true);
end $$;

create or replace function a_historial_delivery(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare desde text := coalesce(nullif(d ->> 'desde', ''), '0000-00-00'); hasta text := coalesce(nullif(d ->> 'hasta', ''), '9999-99-99');
  q text := lower(btrim(tj(d, 'nombre'))); idd text := tj(d, 'ID_Delivery'); rows jsonb; tot numeric; km numeric; n integer;
begin
  if not can_(c, 'Historial', 'Ver') and not can_(c, 'Delivery', 'Ver') then perform fail_('No tienes permiso para ver el historial', 'PERM'); end if;
  if is_deliv(c) then idd := c.deliv; end if;
  select coalesce(jsonb_agg(to_jsonb(s) - 'tenant_id' - '_orden' order by s."Fecha_Asignacion" desc, s._orden desc), '[]'::jsonb),
    coalesce(sum(s."Monto_Delivery") filter (where s."Estado" = 'Finalizado'), 0),
    coalesce(sum(s."Distancia_Km") filter (where s."Estado" = 'Finalizado'), 0), count(*) filter (where s."Estado" = 'Finalizado')
  into rows, tot, km, n
  from "Servicios_Delivery" s
  where s.tenant_id = c.tid and left(s."Fecha", 10) between desde and hasta
    and (idd = '' or s."ID_Delivery" = idd) and (q = '' or position(q in lower(s."Nombre_Delivery")) > 0);
  return jsonb_build_object('rows', rows, 'total', r2(tot), 'km', r2(km), 'servicios', n);
end $$;

-- ---------- Mapa en vivo ----------
create or replace function parse_ll(v text) returns point language plpgsql immutable as $$
declare a text[] := string_to_array(coalesce(v, ''), ',');
begin
  if cardinality(a) <> 2 then return null; end if;
  begin return point(btrim(a[1])::float8, btrim(a[2])::float8); exception when others then return null; end;
end $$;

create or replace function a_ubicacion(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare lat numeric; lng numeric; r jsonb; ll text; act jsonb; ahora text := ahora_txt(c.tz);
begin
  if not is_deliv(c) then perform fail_('Solo los repartidores comparten ubicación', 'PERM'); end if;
  begin lat := (d ->> 'lat')::numeric; lng := (d ->> 'lng')::numeric;
  exception when others then perform fail_('Ubicación inválida'); end;
  if lat is null or lng is null or abs(lat) > 90 or abs(lng) > 180 then perform fail_('Ubicación inválida'); end if;
  r := get_row(c.tid, 'Deliverys', 'ID_Delivery', c.deliv);
  if r is null then perform fail_('Repartidor no encontrado'); end if;
  ll := to_char(lat, 'FM999990.000000') || ',' || to_char(lng, 'FM9999990.000000');
  update "Deliverys" set "Ultima_Ubicacion" = ll, "Fecha_Ubicacion" = ahora where tenant_id = c.tid and "ID_Delivery" = c.deliv;
  -- Rastro: 1 punto por minuto, solo si hay un pedido en curso
  if not exists (select 1 from "Ubicaciones_Delivery" where tenant_id = c.tid and "ID_Delivery" = c.deliv and "Fecha_Hora" > ahora_txt(c.tz, interval '-60 seconds')) then
    select to_jsonb(s) into act from "Servicios_Delivery" s
      where s.tenant_id = c.tid and s."ID_Delivery" = c.deliv and s."Estado" in ('Aceptado', 'En camino') order by s._orden limit 1;
    if act is not null then
      insert into "Ubicaciones_Delivery" (tenant_id, "ID_Ubic", "ID_Servicio", "ID_Delivery", "LatLong", "Fecha_Hora")
      values (c.tid, nuevo_id('UB'), act ->> 'ID_Servicio', c.deliv, ll, ahora);
    end if;
  end if;
  return to_jsonb(true);
end $$;

create or replace function a_mapa_vivo(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare cfg jsonb := cfg_all(c.tid); hoy text := hoy_txt(c.tz); o point := parse_ll(cfg ->> 'ORIGEN_LATLONG'); reps jsonb; r record; pos point; min_ integer; ruta jsonb; srv jsonb; dest point; u record;
begin
  perform need_(c, 'Delivery', 'Ver');
  if is_deliv(c) then perform fail_('El mapa es solo para administración', 'PERM'); end if;
  reps := '[]'::jsonb;
  for r in select * from "Deliverys" where tenant_id = c.tid and "Activo" order by _orden loop
    pos := parse_ll(r."Ultima_Ubicacion"); min_ := null;
    if r."Fecha_Ubicacion" <> '' then
      begin min_ := greatest(0, round(extract(epoch from (now() - (r."Fecha_Ubicacion"::timestamp at time zone c.tz))) / 60))::int;
      exception when others then min_ := null; end;
    end if;
    ruta := '[]'::jsonb;
    for u in select "LatLong" from (select "LatLong", _orden from "Ubicaciones_Delivery" where tenant_id = c.tid and "ID_Delivery" = r."ID_Delivery" and left("Fecha_Hora", 10) = hoy order by _orden desc limit 60) x order by _orden loop
      if parse_ll(u."LatLong") is not null then ruta := ruta || jsonb_build_array(jsonb_build_array((parse_ll(u."LatLong"))[0], (parse_ll(u."LatLong"))[1])); end if;
    end loop;
    srv := '[]'::jsonb;
    for u in select s.*, coalesce(cl."Nombre", '') as cliente from "Servicios_Delivery" s
        left join "Ventas" v on v.tenant_id = s.tenant_id and v."ID_Venta" = s."ID_Venta"
        left join "Clientes" cl on cl.tenant_id = s.tenant_id and cl."ID_Cliente" = v."ID_Cliente"
        where s.tenant_id = c.tid and s."ID_Delivery" = r."ID_Delivery" and s."Estado" in ('Asignado', 'Aceptado', 'En camino') order by s._orden loop
      dest := parse_ll(u."Destino_LatLong");
      srv := srv || jsonb_build_array(jsonb_build_object('ID_Servicio', u."ID_Servicio", 'ID_Venta', u."ID_Venta", 'Estado', u."Estado", 'Direccion_Entrega', u."Direccion_Entrega",
        'dest', case when dest is null then null else jsonb_build_array(dest[0], dest[1]) end, 'Cliente', u.cliente));
    end loop;
    reps := reps || jsonb_build_array(jsonb_build_object('ID_Delivery', r."ID_Delivery", 'Nombre', r."Nombre", 'Telefono', r."Telefono", 'Vehiculo', r."Vehiculo", 'Estado', r."Estado",
      'lat', case when pos is null then null else pos[0] end, 'lng', case when pos is null then null else pos[1] end,
      'Fecha_Ubicacion', r."Fecha_Ubicacion", 'hace_min', min_, 'ruta', ruta, 'servicios', srv));
  end loop;
  return jsonb_build_object('origen', case when o is null then null else jsonb_build_array(o[0], o[1]) end, 'repartidores', reps);
end $$;

-- ---------- KPI ----------
create or replace function a_kpi(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare desde text := coalesce(nullif(d ->> 'desde', ''), '0000-00-00'); hasta text := coalesce(nullif(d ->> 'hasta', ''), '9999-99-99');
  n integer; tot numeric; margen numeric; top jsonb; pdia jsonb; phora jsonb; pcat jsonb; del jsonb; bajo jsonb;
begin
  perform need_(c, 'KPI', 'Ver');
  create temp table if not exists _kv (id text) on commit drop;
  truncate _kv;
  insert into _kv select "ID_Venta" from "Ventas" where tenant_id = c.tid and "Estado" <> 'Anulada' and left("Fecha_Hora", 10) between desde and hasta;
  select count(*), coalesce(sum("Total"), 0) into n, tot from "Ventas" where tenant_id = c.tid and "ID_Venta" in (select id from _kv);
  select coalesce(sum(dv."Subtotal" - dv."Costo_Unitario" * dv."Cantidad"), 0) into margen from "Detalle_Venta" dv where dv.tenant_id = c.tid and dv."ID_Venta" in (select id from _kv);
  select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'cantidad', r2(cant), 'monto', r2(monto)) order by cant desc), '[]'::jsonb) into top from (
    select (array_agg(dv."Nombre_Producto" order by dv._orden))[1] as nombre, sum(dv."Cantidad") as cant, sum(dv."Subtotal") as monto
    from "Detalle_Venta" dv where dv.tenant_id = c.tid and dv."ID_Venta" in (select id from _kv) group by dv."ID_Producto" order by sum(dv."Cantidad") desc limit 10) t;
  select jsonb_agg(jsonb_build_object('dia', dn, 'ventas', coalesce(x.v, 0), 'monto', r2(coalesce(x.m, 0))) order by ord) into pdia
  from unnest(array['lunes','martes','miércoles','jueves','viernes','sábado','domingo']) with ordinality as dd(dn, ord)
  left join (select coalesce(nullif(v."Dia_Semana", ''), (dias_txt())[extract(dow from v."Fecha_Hora"::timestamp)::int + 1]) as dia, count(*) as v, sum(v."Total") as m
             from "Ventas" v where v.tenant_id = c.tid and v."ID_Venta" in (select id from _kv) group by 1) x on x.dia = dd.dn;
  select coalesce(jsonb_agg(jsonb_build_object('hora', h || ':00', 'ventas', k) order by h), '[]'::jsonb) into phora
  from (select substr("Fecha_Hora", 12, 2) as h, count(*) as k from "Ventas" where tenant_id = c.tid and "ID_Venta" in (select id from _kv) group by 1) t;
  select coalesce(jsonb_agg(jsonb_build_object('categoria', coalesce(nullif(cn, ''), 'Sin categoría'), 'monto', r2(m)) order by m desc), '[]'::jsonb) into pcat from (
    select coalesce(ca."Nombre", '') as cn, sum(dv."Subtotal") as m from "Detalle_Venta" dv
    left join "Categorias" ca on ca.tenant_id = dv.tenant_id and ca."ID_Categoria" = dv."ID_Categoria"
    where dv.tenant_id = c.tid and dv."ID_Venta" in (select id from _kv) group by dv."ID_Categoria", ca."Nombre") t;
  select coalesce(jsonb_agg(jsonb_build_object('nombre', "Nombre_Delivery", 'servicios', k, 'monto', r2(m), 'km', r2(km))), '[]'::jsonb) into del from (
    select "Nombre_Delivery", count(*) k, sum("Monto_Delivery") m, sum("Distancia_Km") km from "Servicios_Delivery"
    where tenant_id = c.tid and "Estado" = 'Finalizado' and left("Fecha", 10) between desde and hasta group by "Nombre_Delivery") t;
  select coalesce(jsonb_agg(jsonb_build_object('nombre', "Nombre", 'stock', "Stock_Actual", 'minimo', "Stock_Minimo") order by _orden), '[]'::jsonb) into bajo
  from "Productos" where tenant_id = c.tid and "Activo" and "Stock_Actual" <= "Stock_Minimo";
  return jsonb_build_object('ventas', n, 'total', r2(tot), 'ticketPromedio', case when n > 0 then r2(tot / n) else 0 end, 'margen', r2(margen),
    'topProductos', top, 'porDia', pdia, 'porHora', phora, 'porCategoria', pcat, 'delivery', del, 'bajoStock', bajo);
end $$;

-- ---------- Usuarios y permisos ----------
create or replace function usuarios_activos(p_tid uuid) returns integer language sql stable as
$$ select count(*)::int from "Usuarios" where tenant_id = p_tid and "Activo" $$;

create or replace function a_usuarios_crear(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare em text := lower(btrim(tj(d, 'Email'))); id text := nuevo_id('U');
begin
  perform need_(c, 'Usuarios', 'Crear');
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then perform fail_('Correo inválido'); end if;
  if tj(d, 'Nombre') = '' then perform fail_('Falta el nombre'); end if;
  perform check_password(d ->> 'password');
  if get_row(c.tid, 'Roles', 'ID_Rol', tj(d, 'ID_Rol')) is null then perform fail_('Rol inválido'); end if;
  if d ->> 'ID_Rol' = 'R01' and not is_master(c) then perform fail_('Solo un Master puede crear otro Master', 'PERM'); end if;
  if exists (select 1 from "Usuarios" where lower("Email") = em) then perform fail_('Ya existe un usuario con ese correo'); end if;
  if coalesce(c.maxu, 0) > 0 and usuarios_activos(c.tid) >= c.maxu then
    perform fail_('Tu plan permite hasta ' || c.maxu || ' usuarios activos. Consulta a tu proveedor para ampliarlo.', 'PLAN');
  end if;
  insert into "Usuarios" (tenant_id, "ID_Usuario", "Email", "Nombre", "Telefono", "ID_Rol", "ID_Delivery", "Activo", "Password_Hash", "Fecha_Creacion")
  values (c.tid, id, em, d ->> 'Nombre', tj(d, 'Telefono'), d ->> 'ID_Rol', tj(d, 'ID_Delivery'), true, crypt(d ->> 'password', gen_salt('bf', 10)), ahora_txt(c.tz));
  perform audit_(c, 'Usuarios', 'Crear', id, em);
  return jsonb_build_object('ID_Usuario', id);
end $$;

create or replace function a_usuarios_actualizar(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare u jsonb; patch jsonb := '{}'::jsonb; k text;
begin
  perform need_(c, 'Usuarios', 'Editar');
  u := get_row(c.tid, 'Usuarios', 'ID_Usuario', tj(d, 'ID_Usuario'));
  if u is null then perform fail_('Usuario no encontrado'); end if;
  foreach k in array array['Nombre', 'Telefono', 'ID_Delivery'] loop
    if d ? k then patch := patch || jsonb_build_object(k, d -> k); end if;
  end loop;
  if d ? 'ID_Rol' then
    if get_row(c.tid, 'Roles', 'ID_Rol', tj(d, 'ID_Rol')) is null then perform fail_('Rol inválido'); end if;
    if (d ->> 'ID_Rol' = 'R01' or u ->> 'ID_Rol' = 'R01') and not is_master(c) then perform fail_('Solo un Master puede cambiar este rol', 'PERM'); end if;
    patch := patch || jsonb_build_object('ID_Rol', d ->> 'ID_Rol');
  end if;
  if d ? 'Activo' then
    if u ->> 'ID_Usuario' = c.uid and not (d ->> 'Activo')::boolean then perform fail_('No puedes deshabilitarte a ti mismo'); end if;
    if (d ->> 'Activo')::boolean and not (u ->> 'Activo')::boolean and coalesce(c.maxu, 0) > 0 and usuarios_activos(c.tid) >= c.maxu then
      perform fail_('Tu plan permite hasta ' || c.maxu || ' usuarios activos. Consulta a tu proveedor para ampliarlo.', 'PLAN');
    end if;
    patch := patch || jsonb_build_object('Activo', (d ->> 'Activo')::boolean);
  end if;
  perform upd_row(c.tid, 'Usuarios', 'ID_Usuario', u ->> 'ID_Usuario', patch);
  if (patch ? 'Activo') and not (patch ->> 'Activo')::boolean then delete from sesiones where tenant_id = c.tid and id_usuario = u ->> 'ID_Usuario'; end if;
  perform audit_(c, 'Usuarios', 'Editar', u ->> 'ID_Usuario', (select jsonb_agg(kk) from jsonb_object_keys(patch) kk)::text);
  return to_jsonb(true);
end $$;

create or replace function a_usuarios_password(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare u jsonb;
begin
  perform need_(c, 'Usuarios', 'Editar');
  u := get_row(c.tid, 'Usuarios', 'ID_Usuario', tj(d, 'ID_Usuario'));
  if u is null then perform fail_('Usuario no encontrado'); end if;
  if u ->> 'ID_Rol' = 'R01' and not is_master(c) then perform fail_('Solo un Master puede cambiar esta contraseña', 'PERM'); end if;
  perform check_password(d ->> 'password');
  update "Usuarios" set "Password_Hash" = crypt(d ->> 'password', gen_salt('bf', 10)) where tenant_id = c.tid and "ID_Usuario" = u ->> 'ID_Usuario';
  delete from sesiones where tenant_id = c.tid and id_usuario = u ->> 'ID_Usuario';
  perform audit_(c, 'Usuarios', 'Editar', u ->> 'ID_Usuario', 'Contraseña restablecida');
  return to_jsonb(true);
end $$;

create or replace function a_permisos_guardar(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare por_usuario boolean := tj(d, 'ID_Usuario') <> ''; m jsonb; a text; vals jsonb; tabla text;
begin
  if not is_master(c) then perform fail_('Solo el Master puede modificar permisos', 'PERM'); end if;
  tabla := case when por_usuario then 'Permisos_Usuario' else 'Permisos' end;
  if not por_usuario and d ->> 'ID_Rol' = 'R01' then perform fail_('El rol Master siempre tiene todos los permisos'); end if;
  if not por_usuario and get_row(c.tid, 'Roles', 'ID_Rol', tj(d, 'ID_Rol')) is null then perform fail_('Rol inválido'); end if;
  for m in select * from jsonb_array_elements(coalesce(d -> 'matriz', '[]'::jsonb)) loop
    if not (tj(m, 'Modulo') = any(modulos_())) then continue; end if;
    vals := '{}'::jsonb;
    foreach a in array acciones_() loop vals := vals || jsonb_build_object(a, coalesce((m ->> a)::boolean, false)); end loop;
    if por_usuario then
      if exists (select 1 from "Permisos_Usuario" where tenant_id = c.tid and "ID_Usuario" = d ->> 'ID_Usuario' and "Modulo" = m ->> 'Modulo') then
        update "Permisos_Usuario" set "Ver" = (vals ->> 'Ver')::boolean, "Crear" = (vals ->> 'Crear')::boolean, "Editar" = (vals ->> 'Editar')::boolean,
          "Eliminar" = (vals ->> 'Eliminar')::boolean, "Exportar" = (vals ->> 'Exportar')::boolean
        where tenant_id = c.tid and "ID_Usuario" = d ->> 'ID_Usuario' and "Modulo" = m ->> 'Modulo';
      else
        perform ins_row(c.tid, 'Permisos_Usuario', vals || jsonb_build_object('ID_PermU', nuevo_id('PU'), 'ID_Usuario', d ->> 'ID_Usuario', 'Modulo', m ->> 'Modulo'));
      end if;
    else
      if exists (select 1 from "Permisos" where tenant_id = c.tid and "ID_Rol" = d ->> 'ID_Rol' and "Modulo" = m ->> 'Modulo') then
        update "Permisos" set "Ver" = (vals ->> 'Ver')::boolean, "Crear" = (vals ->> 'Crear')::boolean, "Editar" = (vals ->> 'Editar')::boolean,
          "Eliminar" = (vals ->> 'Eliminar')::boolean, "Exportar" = (vals ->> 'Exportar')::boolean
        where tenant_id = c.tid and "ID_Rol" = d ->> 'ID_Rol' and "Modulo" = m ->> 'Modulo';
      else
        perform ins_row(c.tid, 'Permisos', vals || jsonb_build_object('ID_Permiso', (d ->> 'ID_Rol') || '-' || (m ->> 'Modulo'), 'ID_Rol', d ->> 'ID_Rol', 'Modulo', m ->> 'Modulo'));
      end if;
    end if;
  end loop;
  perform audit_(c, 'Usuarios', 'Editar', coalesce(nullif(d ->> 'ID_Usuario', ''), d ->> 'ID_Rol'), 'Permisos actualizados');
  return to_jsonb(true);
end $$;

-- ---------- Reportes, archivos y suscripción ----------
create or replace function a_exportar(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare permitidas jsonb := jsonb_build_object('Productos', 'Inventario', 'Categorias', 'Categorias', 'Clientes', 'Clientes', 'Proveedores', 'Proveedores',
    'Ventas', 'Ventas', 'Detalle_Venta', 'Ventas', 'Servicios_Delivery', 'Delivery', 'Movimientos_Inventario', 'Inventario', 'Deliverys', 'Delivery', 'Compras', 'Proveedores');
  h text; o jsonb := '{}'::jsonb; ks text[] := '{}';
begin
  perform need_(c, 'Reportes', 'Exportar');
  for h in select jsonb_array_elements_text(coalesce(d -> 'hojas', '[]'::jsonb)) loop
    if permitidas ->> h is null then continue; end if;
    if not can_(c, permitidas ->> h, 'Ver') then continue; end if;
    o := o || jsonb_build_object(h, rows_json(c.tid, h)); ks := ks || h;
  end loop;
  perform audit_(c, 'Reportes', 'Exportar', '', array_to_string(ks, ', '));
  return o;
end $$;

-- Reserva un lugar para subir un archivo (imagen/PDF) al almacenamiento; la app lo sube y usa la URL pública
create or replace function a_subir_archivo(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare modulo text := coalesce(nullif(d ->> 'modulo', ''), 'Inventario'); mime text := tj(d, 'mime'); ext text; ruta text; tam numeric := nj(d, 'tamano');
begin
  if not (modulo = any(modulos_())) then perform fail_('Módulo inválido'); end if;
  if not can_(c, modulo, 'Crear') and not can_(c, modulo, 'Editar') then perform fail_('No tienes permiso para subir archivos en ' || modulo, 'PERM'); end if;
  ext := case mime when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' when 'image/gif' then 'gif' when 'application/pdf' then 'pdf' else null end;
  if ext is null then perform fail_('Tipo de archivo no permitido'); end if;
  if tam <= 0 or tam > 6 * 1024 * 1024 then perform fail_('Archivo vacío o demasiado grande (máx. ~6 MB)'); end if;
  ruta := c.tid::text || '/' || gen_random_uuid()::text || '.' || ext;
  insert into subidas (path, tenant_id, mime, expira) values (ruta, c.tid, mime, now() + interval '10 minutes');
  perform audit_(c, modulo, 'Crear', ruta, 'Archivo ' || left(tj(d, 'nombre'), 80));
  return jsonb_build_object('id', ruta, 'path', ruta, 'bucket', 'archivos', 'url', '/storage/v1/object/public/archivos/' || ruta);
end $$;

create or replace function a_suscripcion(c ctx_t, d jsonb) returns jsonb language plpgsql as $$
declare l jsonb;
begin
  if not is_master(c) then perform fail_('Solo el Master puede ver la suscripción', 'PERM'); end if;
  l := lic_(c.tid);
  return jsonb_build_object('funciones', l -> 'funciones', 'maxUsuarios', l -> 'maxUsuarios', 'plan', l -> 'plan', 'whatsapp', l -> 'whatsapp',
    'vencimiento', l -> 'vencimiento', 'diasRestantes', l -> 'diasRestantes', 'estado', l -> 'estado');
end $$;

-- ---------- Control de funciones por plan ----------
create or replace function accion_funcion(a text) returns text language sql immutable as $$
  select (jsonb_build_object('crearCompra', 'compras', 'recibirCompra', 'compras', 'anularCompra', 'compras', 'listarCompras', 'compras',
    'ubicacion', 'mapa', 'mapaVivo', 'mapa', 'misServicios', 'delivery', 'servicioEstado', 'delivery', 'historialDelivery', 'delivery',
    'kpi', 'kpi', 'exportar', 'reportes')) ->> a $$;

-- ---------- Punto de entrada único ----------
create or replace function api(accion text, datos jsonb default '{}'::jsonb, token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare c ctx_t; l jsonb; d jsonb := coalesce(datos, '{}'::jsonb); f text; r jsonb; msg text; det text; hint text;
begin
  if accion = 'publico' then return jsonb_build_object('ok', true, 'data', publico_(d)); end if;
  if accion = 'login' then return login_(d); end if;
  if accion = 'registrar' then return jsonb_build_object('ok', true, 'data', registrar_(d)); end if;
  c := autenticar_(token);
  if accion = 'logout' then
    delete from sesiones where token_hash = hash_token(token);
    return jsonb_build_object('ok', true, 'data', true);
  end if;
  if not (accion = any(array['me','cambiarPassword','listar','crear','actualizar','eliminar','ajustarStock','crearVenta','anularVenta','pagarVenta','listarVentas','detalleVenta','misServicios','servicioEstado','historialDelivery','marcarAlertas','kpi','subirArchivo','guardarConfig','usuariosCrear','usuariosActualizar','usuariosPassword','permisosGuardar','exportar','crearCompra','recibirCompra','anularCompra','listarCompras','ubicacion','mapaVivo','suscripcion'])) then
    perform fail_('Acción desconocida: ' || accion);
  end if;
  -- Un repartidor SOLO puede operar sus propios pedidos: nada de crear/editar/borrar otras cosas, aunque tenga permisos marcados
  if is_deliv(c) and not (accion = any(array['me','cambiarPassword','misServicios','servicioEstado','historialDelivery','marcarAlertas','ubicacion'])) then
    perform fail_('No tienes permiso: un repartidor solo gestiona sus propios pedidos', 'PERM');
  end if;
  l := lic_(c.tid);
  if (l ->> 'bloqueada')::boolean then perform fail_(l ->> 'mensaje', 'LICENSE', lic_publica(l)::text); end if;
  f := accion_funcion(accion);
  if f is not null then perform needfeat_(c, f); end if;
  if accion in ('listar', 'crear', 'actualizar', 'eliminar') and tabla_funcion(tj(d, 'tabla')) is not null then perform needfeat_(c, tabla_funcion(d ->> 'tabla')); end if;
  if accion = 'crearVenta' and tj(d, 'tipoEntrega') = 'Delivery' then perform needfeat_(c, 'delivery'); end if;
  if accion in ('crear', 'actualizar', 'eliminar', 'ajustarStock', 'crearVenta', 'anularVenta', 'pagarVenta', 'servicioEstado', 'crearCompra', 'recibirCompra', 'anularCompra',
                'guardarConfig', 'usuariosCrear', 'usuariosActualizar', 'usuariosPassword', 'permisosGuardar', 'marcarAlertas') then
    perform pg_advisory_xact_lock(hashtextextended(c.tid::text, 0));
  end if;
  r := case accion
    when 'me' then me_data(c)
    when 'cambiarPassword' then a_cambiar_password(c, d)
    when 'listar' then a_listar(c, d)
    when 'crear' then a_crear(c, d)
    when 'actualizar' then a_actualizar(c, d)
    when 'eliminar' then a_eliminar(c, d)
    when 'ajustarStock' then a_ajustar_stock(c, d)
    when 'crearVenta' then a_crear_venta(c, d)
    when 'anularVenta' then a_anular_venta(c, d)
    when 'pagarVenta' then a_pagar_venta(c, d)
    when 'listarVentas' then a_listar_ventas(c, d)
    when 'detalleVenta' then a_detalle_venta(c, d)
    when 'misServicios' then a_mis_servicios(c, d)
    when 'servicioEstado' then a_servicio_estado(c, d)
    when 'historialDelivery' then a_historial_delivery(c, d)
    when 'marcarAlertas' then a_marcar_alertas(c, d)
    when 'kpi' then a_kpi(c, d)
    when 'subirArchivo' then a_subir_archivo(c, d)
    when 'guardarConfig' then a_guardar_config(c, d)
    when 'usuariosCrear' then a_usuarios_crear(c, d)
    when 'usuariosActualizar' then a_usuarios_actualizar(c, d)
    when 'usuariosPassword' then a_usuarios_password(c, d)
    when 'permisosGuardar' then a_permisos_guardar(c, d)
    when 'exportar' then a_exportar(c, d)
    when 'crearCompra' then a_crear_compra(c, d)
    when 'recibirCompra' then a_recibir_compra(c, d)
    when 'anularCompra' then a_anular_compra(c, d)
    when 'listarCompras' then a_listar_compras(c, d)
    when 'ubicacion' then a_ubicacion(c, d)
    when 'mapaVivo' then a_mapa_vivo(c, d)
    when 'suscripcion' then a_suscripcion(c, d)
    else null end;
  return jsonb_build_object('ok', true, 'data', r);
exception
  when sqlstate 'AP001' then
    get stacked diagnostics msg = message_text, det = pg_exception_detail, hint = pg_exception_hint;
    return jsonb_build_object('ok', false, 'error', msg, 'code', coalesce(det, ''), 'licencia', case when det = 'LICENSE' then hint::jsonb else null end);
  when others then
    raise warning 'api(%) fallo: % %', accion, sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error', case when current_setting('app.debug', true) = 'on' then 'INTERNO: ' || sqlerrm else 'Error interno del servidor. Intenta de nuevo.' end, 'code', '');
end $$;

-- ---------- Permisos de ejecución: desde internet solo se puede llamar a api() ----------
revoke execute on all functions in schema public from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on all functions in schema public from anon;
    grant execute on function api(text, jsonb, text) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on all functions in schema public from authenticated;
    grant execute on function api(text, jsonb, text) to authenticated;
  end if;
end $$;

-- ---------- Almacenamiento de imágenes/PDF (solo en Supabase) ----------
create or replace function puede_subir(p_name text) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare ok boolean;
begin
  update subidas set usado = true where path = p_name and not usado and expira > now() returning true into ok;
  return coalesce(ok, false);
end $$;
revoke execute on function puede_subir(text) from public;

do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('archivos', 'archivos', true, 6291456, array['image/png','image/jpeg','image/webp','image/gif','application/pdf'])
    on conflict (id) do nothing;
    execute 'grant execute on function public.puede_subir(text) to anon, authenticated';
    execute 'drop policy if exists "subir_con_permiso" on storage.objects';
    execute 'create policy "subir_con_permiso" on storage.objects for insert to anon, authenticated with check (bucket_id = ''archivos'' and public.puede_subir(name))';
  end if;
end $$;
