#!/usr/bin/env python3
"""Genera supabase/01_esquema.sql a partir de supabase/esquema.json (que sale de generar_esquema.py)
y arma supabase/TODO_SUPABASE.sql (esquema + api) para pegar una sola vez en el SQL Editor de Supabase."""
import json, os
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "supabase")
d = json.load(open(os.path.join(base, "esquema.json"), encoding="utf8"))

def tipo(t):
    if t.startswith("Yes/No"): return "boolean"
    if t in ("Decimal", "Price", "Number"): return "numeric"
    return "text"

def defecto(col, t):
    k = tipo(t)
    if k == "boolean": return "true" if col in ("Activo", "Va_A_Cocina") else "false"
    if k == "numeric": return "0"
    return "''"

q = lambda s: '"' + s.replace('"', '""') + '"'
lit = lambda v: "null" if v is None else ("true" if v is True else "false" if v is False else str(v) if isinstance(v, (int, float)) else "'" + str(v).replace("'", "''") + "'")

out = ["-- GENERADO por tools/generar_supabase.py. No lo edites a mano.", "-- Esquema multi-negocio: cada tabla lleva tenant_id (el negocio dueño de la fila).", ""]
out.append("""create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists negocios (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  zona_horaria text not null default 'America/Santiago',
  plan text not null default 'PRUEBA',
  vencimiento date,
  activo boolean not null default true,
  funciones_extra text not null default '',
  max_usuarios integer,
  whatsapp text not null default '56968005177',
  creado timestamptz not null default now()
);
create table if not exists contadores (
  tenant_id uuid not null references negocios(id) on delete cascade,
  clave text not null, valor bigint not null default 0,
  primary key (tenant_id, clave)
);
create table if not exists sesiones (
  token_hash text primary key,
  tenant_id uuid not null references negocios(id) on delete cascade,
  id_usuario text not null,
  expira timestamptz not null
);
create index if not exists sesiones_expira on sesiones (expira);
create table if not exists intentos_login (
  clave text primary key, fallos integer not null default 0, hasta timestamptz
);
create table if not exists subidas (
  path text primary key,
  tenant_id uuid not null references negocios(id) on delete cascade,
  mime text not null, usado boolean not null default false,
  expira timestamptz not null
);
""")
claves = {}
for nombre, cols in d["tablas"].items():
    claves[nombre] = cols[0][0]
    lines = ["  tenant_id uuid not null references negocios(id) on delete cascade", "  _orden bigint generated always as identity"]
    for c, t in cols:
        lines.append(f"  {q(c)} {tipo(t)} not null default {defecto(c, t)}")
    lines.append(f"  primary key (tenant_id, {q(cols[0][0])})")
    out.append(f"create table if not exists {q(nombre)} (\n" + ",\n".join(lines) + "\n);")
    # Bases ya creadas: agrega las columnas nuevas (seguro de repetir)
    for c, t in cols[1:]:
        out.append(f"alter table {q(nombre)} add column if not exists {q(c)} {tipo(t)} not null default {defecto(c, t)};")
out.append("""
create unique index if not exists usuarios_email_unico on "Usuarios" (lower("Email"));
create index if not exists ventas_fecha on "Ventas" (tenant_id, "Fecha_Hora");
create index if not exists detalle_venta_venta on "Detalle_Venta" (tenant_id, "ID_Venta");
create index if not exists detalle_compra_compra on "Detalle_Compra" (tenant_id, "ID_Compra");
create index if not exists servicios_venta on "Servicios_Delivery" (tenant_id, "ID_Venta");
create index if not exists servicios_fecha on "Servicios_Delivery" (tenant_id, "Fecha");
create index if not exists ubic_delivery on "Ubicaciones_Delivery" (tenant_id, "ID_Delivery", "Fecha_Hora");
create index if not exists mov_producto on "Movimientos_Inventario" (tenant_id, "ID_Producto");
create index if not exists auditoria_fecha on "Auditoria" (tenant_id, "Fecha");
""")
# Seguridad: nadie toca las tablas directamente; todo pasa por la función api() (SECURITY DEFINER)
tablas = ["negocios", "contadores", "sesiones", "intentos_login", "subidas"] + list(d["tablas"].keys())
for t in tablas:
    out.append(f"alter table {q(t)} enable row level security;")
out.append("""
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
  end if;
end $$;
""")
# Datos base de cada negocio nuevo
out.append("create or replace function sembrar_negocio(p_tid uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $f$\nbegin")
for nombre, filas in d["semillas"].items():
    cols = [c for c, _ in d["tablas"][nombre]]
    for fila in filas:
        n = len(fila)
        cs = ", ".join(q(c) for c in cols[:n])
        vs = ", ".join(lit(v) if tipo(d["tablas"][nombre][i][1]) != "boolean" else ("true" if str(v).upper() == "TRUE" or v is True else "false") for i, v in enumerate(fila))
        out.append(f"  insert into {q(nombre)} (tenant_id, {cs}) values (p_tid, {vs}) on conflict do nothing;")
out.append("end $f$;\n")
open(os.path.join(base, "01_esquema.sql"), "w", encoding="utf8").write("\n".join(out))
print("01_esquema.sql:", len(d["tablas"]), "tablas")

api = os.path.join(base, "02_api.sql")
if os.path.exists(api):
    head = "-- ============================================================\n--  BASE DE DATOS COMPLETA (un solo archivo para pegar en Supabase > SQL Editor)\n--  Es seguro ejecutarlo de nuevo: no borra datos existentes.\n-- ============================================================\n\n"
    open(os.path.join(base, "TODO_SUPABASE.sql"), "w", encoding="utf8").write(head + "\n".join(out) + "\n\n" + open(api, encoding="utf8").read())
    print("TODO_SUPABASE.sql written")
