-- GENERADO por tools/generar_supabase.py. No lo edites a mano.
-- Esquema multi-negocio: cada tabla lleva tenant_id (el negocio dueño de la fila).

create schema if not exists extensions;
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

create table if not exists "Usuarios" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Usuario" text not null default '',
  "Email" text not null default '',
  "Nombre" text not null default '',
  "Telefono" text not null default '',
  "ID_Rol" text not null default '',
  "ID_Delivery" text not null default '',
  "Activo" boolean not null default true,
  "Password_Hash" text not null default '',
  "Salt" text not null default '',
  "Ultimo_Login" text not null default '',
  "Fecha_Creacion" text not null default '',
  primary key (tenant_id, "ID_Usuario")
);
create table if not exists "Roles" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Rol" text not null default '',
  "Nombre_Rol" text not null default '',
  "Descripcion" text not null default '',
  primary key (tenant_id, "ID_Rol")
);
create table if not exists "Permisos" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Permiso" text not null default '',
  "ID_Rol" text not null default '',
  "Modulo" text not null default '',
  "Ver" boolean not null default false,
  "Crear" boolean not null default false,
  "Editar" boolean not null default false,
  "Eliminar" boolean not null default false,
  "Exportar" boolean not null default false,
  primary key (tenant_id, "ID_Permiso")
);
create table if not exists "Permisos_Usuario" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_PermU" text not null default '',
  "ID_Usuario" text not null default '',
  "Modulo" text not null default '',
  "Ver" boolean not null default false,
  "Crear" boolean not null default false,
  "Editar" boolean not null default false,
  "Eliminar" boolean not null default false,
  "Exportar" boolean not null default false,
  primary key (tenant_id, "ID_PermU")
);
create table if not exists "Configuracion" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "Clave" text not null default '',
  "Valor" text not null default '',
  "Descripcion" text not null default '',
  primary key (tenant_id, "Clave")
);
create table if not exists "Categorias" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Categoria" text not null default '',
  "Nombre" text not null default '',
  "Imagen" text not null default '',
  "Orden" numeric not null default 0,
  "Activo" boolean not null default true,
  primary key (tenant_id, "ID_Categoria")
);
create table if not exists "Unidades" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "Unidad" text not null default '',
  "Abreviatura" text not null default '',
  primary key (tenant_id, "Unidad")
);
create table if not exists "Productos" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Producto" text not null default '',
  "Codigo_Barras" text not null default '',
  "SKU" text not null default '',
  "Nombre" text not null default '',
  "ID_Categoria" text not null default '',
  "Imagen" text not null default '',
  "Unidad_Medida" text not null default '',
  "Precio_Compra" numeric not null default 0,
  "Precio_Venta" numeric not null default 0,
  "Stock_Actual" numeric not null default 0,
  "Stock_Minimo" numeric not null default 0,
  "ID_Proveedor" text not null default '',
  "Activo" boolean not null default true,
  "Fecha_Creacion" text not null default '',
  "Va_A_Cocina" boolean not null default true,
  primary key (tenant_id, "ID_Producto")
);
create table if not exists "Movimientos_Inventario" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Mov" text not null default '',
  "Fecha" text not null default '',
  "ID_Producto" text not null default '',
  "Tipo" text not null default '',
  "Cantidad" numeric not null default 0,
  "Stock_Antes" numeric not null default 0,
  "Stock_Despues" numeric not null default 0,
  "Referencia" text not null default '',
  "Usuario" text not null default '',
  "Nota" text not null default '',
  primary key (tenant_id, "ID_Mov")
);
create table if not exists "Clientes" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Cliente" text not null default '',
  "Nombre" text not null default '',
  "Documento" text not null default '',
  "Telefono" text not null default '',
  "Email" text not null default '',
  "Direccion" text not null default '',
  "Ubicacion" text not null default '',
  "Notas" text not null default '',
  "Fecha_Creacion" text not null default '',
  primary key (tenant_id, "ID_Cliente")
);
create table if not exists "Proveedores" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Proveedor" text not null default '',
  "Nombre" text not null default '',
  "Documento" text not null default '',
  "Contacto" text not null default '',
  "Telefono" text not null default '',
  "Email" text not null default '',
  "Direccion" text not null default '',
  "Dias_Visita" text not null default '',
  "Ultima_Visita" text not null default '',
  "Proxima_Visita" text not null default '',
  "Notas" text not null default '',
  primary key (tenant_id, "ID_Proveedor")
);
create table if not exists "Visitas_Proveedor" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Visita" text not null default '',
  "ID_Proveedor" text not null default '',
  "Fecha" text not null default '',
  "Tipo" text not null default '',
  "Notas" text not null default '',
  "Usuario" text not null default '',
  primary key (tenant_id, "ID_Visita")
);
create table if not exists "Compras" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Compra" text not null default '',
  "Fecha" text not null default '',
  "ID_Proveedor" text not null default '',
  "Total" numeric not null default 0,
  "Estado" text not null default '',
  "Usuario" text not null default '',
  "Nota" text not null default '',
  primary key (tenant_id, "ID_Compra")
);
create table if not exists "Detalle_Compra" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_DetCompra" text not null default '',
  "ID_Compra" text not null default '',
  "ID_Producto" text not null default '',
  "Cantidad" numeric not null default 0,
  "Costo_Unitario" numeric not null default 0,
  "Subtotal" numeric not null default 0,
  primary key (tenant_id, "ID_DetCompra")
);
create table if not exists "Deliverys" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Delivery" text not null default '',
  "Nombre" text not null default '',
  "Telefono" text not null default '',
  "Email" text not null default '',
  "Vehiculo" text not null default '',
  "Patente" text not null default '',
  "Estado" text not null default '',
  "Tarifa_Base" numeric not null default 0,
  "Tarifa_Km" numeric not null default 0,
  "Activo" boolean not null default true,
  "Ultima_Ubicacion" text not null default '',
  "Fecha_Ubicacion" text not null default '',
  primary key (tenant_id, "ID_Delivery")
);
create table if not exists "Ventas" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Venta" text not null default '',
  "Fecha_Hora" text not null default '',
  "ID_Cliente" text not null default '',
  "Tipo_Entrega" text not null default '',
  "Subtotal" numeric not null default 0,
  "Descuento" numeric not null default 0,
  "Costo_Delivery" numeric not null default 0,
  "Total" numeric not null default 0,
  "Metodo_Pago" text not null default '',
  "Estado_Pago" text not null default '',
  "Estado" text not null default '',
  "Tipo_Documento" text not null default '',
  "Dia_Semana" text not null default '',
  "Usuario" text not null default '',
  "Referencia" text not null default '',
  "Nota_Cocina" text not null default '',
  primary key (tenant_id, "ID_Venta")
);
create table if not exists "Detalle_Venta" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Detalle" text not null default '',
  "ID_Venta" text not null default '',
  "ID_Producto" text not null default '',
  "Nombre_Producto" text not null default '',
  "ID_Categoria" text not null default '',
  "Cantidad" numeric not null default 0,
  "Precio_Unitario" numeric not null default 0,
  "Costo_Unitario" numeric not null default 0,
  "Descuento" numeric not null default 0,
  "Subtotal" numeric not null default 0,
  "Fecha" text not null default '',
  "Nota" text not null default '',
  "Va_A_Cocina" boolean not null default true,
  primary key (tenant_id, "ID_Detalle")
);
create table if not exists "Servicios_Delivery" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Servicio" text not null default '',
  "ID_Venta" text not null default '',
  "ID_Delivery" text not null default '',
  "Nombre_Delivery" text not null default '',
  "Fecha_Asignacion" text not null default '',
  "Fecha_Aceptado" text not null default '',
  "Fecha_Finalizado" text not null default '',
  "Fecha" text not null default '',
  "Direccion_Entrega" text not null default '',
  "Destino_LatLong" text not null default '',
  "Origen_LatLong" text not null default '',
  "Distancia_Km" numeric not null default 0,
  "Tiempo_Min" numeric not null default 0,
  "Monto_Delivery" numeric not null default 0,
  "Estado" text not null default '',
  "Notas" text not null default '',
  "Usuario_Asigna" text not null default '',
  primary key (tenant_id, "ID_Servicio")
);
create table if not exists "Ubicaciones_Delivery" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Ubic" text not null default '',
  "ID_Servicio" text not null default '',
  "ID_Delivery" text not null default '',
  "LatLong" text not null default '',
  "Fecha_Hora" text not null default '',
  primary key (tenant_id, "ID_Ubic")
);
create table if not exists "Documentos" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Documento" text not null default '',
  "ID_Venta" text not null default '',
  "Tipo" text not null default '',
  "Folio" text not null default '',
  "Fecha" text not null default '',
  "Neto" numeric not null default 0,
  "Impuesto" numeric not null default 0,
  "Total" numeric not null default 0,
  "Formato" text not null default '',
  "PDF_URL" text not null default '',
  primary key (tenant_id, "ID_Documento")
);
create table if not exists "Categorias_Conocimiento" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_CatCon" text not null default '',
  "Nombre" text not null default '',
  "Imagen" text not null default '',
  primary key (tenant_id, "ID_CatCon")
);
create table if not exists "Conocimiento" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Conocimiento" text not null default '',
  "Titulo" text not null default '',
  "ID_CatCon" text not null default '',
  "Archivo_PDF" text not null default '',
  "Descripcion" text not null default '',
  "Etiquetas" text not null default '',
  "Fecha" text not null default '',
  "Usuario" text not null default '',
  primary key (tenant_id, "ID_Conocimiento")
);
create table if not exists "Alertas" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Alerta" text not null default '',
  "Fecha" text not null default '',
  "Tipo" text not null default '',
  "Referencia" text not null default '',
  "Mensaje" text not null default '',
  "Para_Rol" text not null default '',
  "Leida" boolean not null default false,
  primary key (tenant_id, "ID_Alerta")
);
create table if not exists "Auditoria" (
  tenant_id uuid not null references negocios(id) on delete cascade,
  _orden bigint generated always as identity,
  "ID_Log" text not null default '',
  "Fecha" text not null default '',
  "Usuario" text not null default '',
  "Modulo" text not null default '',
  "Accion" text not null default '',
  "Registro" text not null default '',
  "Detalle" text not null default '',
  primary key (tenant_id, "ID_Log")
);

create unique index if not exists usuarios_email_unico on "Usuarios" (lower("Email"));
create index if not exists ventas_fecha on "Ventas" (tenant_id, "Fecha_Hora");
create index if not exists detalle_venta_venta on "Detalle_Venta" (tenant_id, "ID_Venta");
create index if not exists detalle_compra_compra on "Detalle_Compra" (tenant_id, "ID_Compra");
create index if not exists servicios_venta on "Servicios_Delivery" (tenant_id, "ID_Venta");
create index if not exists servicios_fecha on "Servicios_Delivery" (tenant_id, "Fecha");
create index if not exists ubic_delivery on "Ubicaciones_Delivery" (tenant_id, "ID_Delivery", "Fecha_Hora");
create index if not exists mov_producto on "Movimientos_Inventario" (tenant_id, "ID_Producto");
create index if not exists auditoria_fecha on "Auditoria" (tenant_id, "Fecha");

alter table "negocios" enable row level security;
alter table "contadores" enable row level security;
alter table "sesiones" enable row level security;
alter table "intentos_login" enable row level security;
alter table "subidas" enable row level security;
alter table "Usuarios" enable row level security;
alter table "Roles" enable row level security;
alter table "Permisos" enable row level security;
alter table "Permisos_Usuario" enable row level security;
alter table "Configuracion" enable row level security;
alter table "Categorias" enable row level security;
alter table "Unidades" enable row level security;
alter table "Productos" enable row level security;
alter table "Movimientos_Inventario" enable row level security;
alter table "Clientes" enable row level security;
alter table "Proveedores" enable row level security;
alter table "Visitas_Proveedor" enable row level security;
alter table "Compras" enable row level security;
alter table "Detalle_Compra" enable row level security;
alter table "Deliverys" enable row level security;
alter table "Ventas" enable row level security;
alter table "Detalle_Venta" enable row level security;
alter table "Servicios_Delivery" enable row level security;
alter table "Ubicaciones_Delivery" enable row level security;
alter table "Documentos" enable row level security;
alter table "Categorias_Conocimiento" enable row level security;
alter table "Conocimiento" enable row level security;
alter table "Alertas" enable row level security;
alter table "Auditoria" enable row level security;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
  end if;
end $$;

create or replace function sembrar_negocio(p_tid uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  insert into "Roles" (tenant_id, "ID_Rol", "Nombre_Rol", "Descripcion") values (p_tid, 'R01', 'Master', 'Acceso total') on conflict do nothing;
  insert into "Roles" (tenant_id, "ID_Rol", "Nombre_Rol", "Descripcion") values (p_tid, 'R02', 'Ventas', 'Vende, consulta inventario, asigna delivery') on conflict do nothing;
  insert into "Roles" (tenant_id, "ID_Rol", "Nombre_Rol", "Descripcion") values (p_tid, 'R03', 'Delivery', 'Solo ve y gestiona sus servicios') on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R01-Inventario', 'R01', 'Inventario', true, true, true, true, true) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R01-Categorias', 'R01', 'Categorias', true, true, true, true, true) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R01-Ventas', 'R01', 'Ventas', true, true, true, true, true) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R01-Clientes', 'R01', 'Clientes', true, true, true, true, true) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R01-Proveedores', 'R01', 'Proveedores', true, true, true, true, true) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R01-Delivery', 'R01', 'Delivery', true, true, true, true, true) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R01-Historial', 'R01', 'Historial', true, true, true, true, true) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R01-Conocimiento', 'R01', 'Conocimiento', true, true, true, true, true) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R01-Reportes', 'R01', 'Reportes', true, true, true, true, true) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R01-KPI', 'R01', 'KPI', true, true, true, true, true) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R01-Usuarios', 'R01', 'Usuarios', true, true, true, true, true) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R01-Configuracion', 'R01', 'Configuracion', true, true, true, true, true) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R02-Inventario', 'R02', 'Inventario', true, true, true, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R02-Categorias', 'R02', 'Categorias', true, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R02-Ventas', 'R02', 'Ventas', true, true, true, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R02-Clientes', 'R02', 'Clientes', true, true, true, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R02-Proveedores', 'R02', 'Proveedores', true, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R02-Delivery', 'R02', 'Delivery', true, true, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R02-Historial', 'R02', 'Historial', true, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R02-Conocimiento', 'R02', 'Conocimiento', true, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R02-Reportes', 'R02', 'Reportes', false, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R02-KPI', 'R02', 'KPI', false, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R02-Usuarios', 'R02', 'Usuarios', false, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R02-Configuracion', 'R02', 'Configuracion', false, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R03-Inventario', 'R03', 'Inventario', false, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R03-Categorias', 'R03', 'Categorias', false, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R03-Ventas', 'R03', 'Ventas', false, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R03-Clientes', 'R03', 'Clientes', false, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R03-Proveedores', 'R03', 'Proveedores', false, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R03-Delivery', 'R03', 'Delivery', true, false, true, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R03-Historial', 'R03', 'Historial', true, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R03-Conocimiento', 'R03', 'Conocimiento', true, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R03-Reportes', 'R03', 'Reportes', false, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R03-KPI', 'R03', 'KPI', false, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R03-Usuarios', 'R03', 'Usuarios', false, false, false, false, false) on conflict do nothing;
  insert into "Permisos" (tenant_id, "ID_Permiso", "ID_Rol", "Modulo", "Ver", "Crear", "Editar", "Eliminar", "Exportar") values (p_tid, 'R03-Configuracion', 'R03', 'Configuracion', false, false, false, false, false) on conflict do nothing;
  insert into "Unidades" (tenant_id, "Unidad", "Abreviatura") values (p_tid, 'Unidad', 'un') on conflict do nothing;
  insert into "Unidades" (tenant_id, "Unidad", "Abreviatura") values (p_tid, 'Kilogramo', 'kg') on conflict do nothing;
  insert into "Unidades" (tenant_id, "Unidad", "Abreviatura") values (p_tid, 'Gramo', 'g') on conflict do nothing;
  insert into "Unidades" (tenant_id, "Unidad", "Abreviatura") values (p_tid, 'Litro', 'lt') on conflict do nothing;
  insert into "Unidades" (tenant_id, "Unidad", "Abreviatura") values (p_tid, 'Mililitro', 'ml') on conflict do nothing;
  insert into "Unidades" (tenant_id, "Unidad", "Abreviatura") values (p_tid, 'Caja', 'caja') on conflict do nothing;
  insert into "Unidades" (tenant_id, "Unidad", "Abreviatura") values (p_tid, 'Paquete', 'paq') on conflict do nothing;
  insert into "Unidades" (tenant_id, "Unidad", "Abreviatura") values (p_tid, 'Docena', 'doc') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'NOMBRE_NEGOCIO', 'Mi Negocio', 'Nombre que sale en documentos') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'DOCUMENTO_NEGOCIO', '76.000.000-0', 'RUT / ID fiscal del negocio') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'DIRECCION_NEGOCIO', 'Calle Ejemplo 100', 'Dirección del local') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'MONEDA', 'CLP', 'Moneda') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'IMPUESTO_PORC', '0.19', 'Porcentaje de impuesto (0.19 = 19%)') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'TARIFA_BASE_DELIVERY', '1000', 'Tarifa base por defecto') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'TARIFA_KM_DELIVERY', '300', 'Tarifa por km por defecto') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'FORMATO_DOC_DEFECTO', 'Termica 80mm', 'Termica 58mm | Termica 80mm | A4 Carta') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'FORMATO_COMANDA', 'Termica 80mm', 'Formato del ticket de cocina') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'COMANDA_AUTO', 'FALSE', 'TRUE = al vender se abre sola la impresión de la comanda') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'ORIGEN_LATLONG', '-33.4372,-70.6506', 'Coordenadas del local') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'ALERTA_STOCK_ACTIVA', 'TRUE', 'Activa las alertas de stock mínimo') on conflict do nothing;
  insert into "Configuracion" (tenant_id, "Clave", "Valor", "Descripcion") values (p_tid, 'LOGO', '', 'URL del logo (se sube desde Configuración)') on conflict do nothing;
end $f$;
