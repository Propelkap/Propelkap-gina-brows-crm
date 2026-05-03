-- =========================================================================
-- MIGRACIÓN COMPLETA v2 (idempotente): aplica las 13 migrations a ffibztcfr
-- =========================================================================
-- v2 corrige errores "relation already exists" agregando IF NOT EXISTS a
-- CREATE TABLE/INDEX y wrappeando CREATE TYPE en DO blocks defensivos.
-- =========================================================================

-- Limpiar tablas existentes (vacías). Si tu ffibztcfr ya tenía algo aplicado
-- de otro CRM, este DROP CASCADE lo elimina. Comentar si NO quieres.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(t) || ' CASCADE';
  END LOOP;
END $$;

-- Drop types (necesario antes de re-crear con CREATE TYPE)
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT typname FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typtype = 'e'
  LOOP
    EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(t) || ' CASCADE';
  END LOOP;
END $$;

-- ========================== supabase/migrations/001_initial_schema.sql ==========================
-- =========================================================================
-- Gina Brows CRM · Schema inicial
-- Generado 2026-04-27 por PropelKap
-- =========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- =========================================================================
-- ENUMS
-- =========================================================================

create type cita_estado as enum (
  'tentativa',
  'confirmada',
  'completada',
  'no_show',
  'cancelada',
  'reagendada'
);

create type pago_estado as enum (
  'pendiente',
  'autorizado',
  'pagado',
  'reembolsado',
  'fallido'
);

create type pago_metodo as enum (
  'efectivo',
  'transferencia',
  'terminal',
  'stripe',
  'otro'
);

create type comunicacion_canal as enum (
  'whatsapp',
  'sms',
  'email',
  'llamada',
  'instagram',
  'manual'
);

create type comunicacion_direccion as enum ('entrante', 'saliente');

create type campania_tipo as enum (
  'reactivacion_dormidas',
  'cumpleanos',
  'retoque_60d',
  'retoque_anual',
  'pedir_resena',
  'cross_sell',
  'broadcast_libre'
);

create type campania_estado as enum (
  'borrador',
  'programada',
  'enviando',
  'completada',
  'pausada',
  'cancelada'
);

create type origen_lead as enum (
  'instagram',
  'tiktok',
  'facebook',
  'google',
  'walk_in',
  'referida',
  'whatsapp_directo',
  'meta_ads',
  'google_ads',
  'otro'
);

-- =========================================================================
-- USUARIOS DEL SISTEMA (Gina + futuras técnicas/recepción)
-- Se vincula a auth.users de Supabase
-- =========================================================================

create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  nombre text not null,
  rol text not null default 'admin' check (rol in ('admin', 'tecnica', 'recepcion')),
  whatsapp text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- CATÁLOGO DE SERVICIOS (con reglas de retoque incorporadas)
-- =========================================================================

create table public.servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  precio_mxn numeric(10,2) not null,
  duracion_min int not null default 60,
  -- Reglas de retoque por servicio
  retoque_dias_obligatorio int,             -- ej. 60 días para microblading
  retoque_precio_mxn numeric(10,2),         -- ej. $1,500
  retoque_anual_dias int,                   -- ej. 365
  retoque_anual_precio_mxn numeric(10,2),   -- ej. $2,200
  -- Cross-sell sugerido (id de otro servicio que se ofrece después)
  cross_sell_servicio_id uuid references public.servicios(id) on delete set null,
  cross_sell_dias_despues int,              -- ej. 90 días después ofrecer peeling
  -- Visibilidad y orden en UI
  visible boolean not null default true,
  orden int not null default 0,
  categoria text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================================
-- CLIENTES (lo más importante — corazón del CRM)
-- =========================================================================

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  -- Datos básicos
  nombre text not null,
  apellido text,
  email text,
  whatsapp text,                    -- E.164 ej. +528130791032
  whatsapp_normalizado text generated always as (regexp_replace(whatsapp, '[^0-9+]', '', 'g')) stored,
  telefono_alterno text,
  fecha_nacimiento date,            -- para automatización de cumpleaños
  -- Comerciales
  origen_lead origen_lead default 'otro',
  origen_detalle text,              -- ej. "campaña Instagram febrero"
  referida_por_cliente_id uuid references public.clientes(id) on delete set null,
  -- Médicos / técnicos
  tipo_piel text,
  alergias text,
  contraindicaciones jsonb default '{}'::jsonb,  -- estructura de las 13 contraindicaciones
  notas_tecnicas text,
  -- Notas libres / personales
  notas text,
  -- Tags flexibles
  tags text[] default '{}',
  -- Cálculos rápidos cacheados (se actualizan vía trigger)
  total_citas int not null default 0,
  total_gastado_mxn numeric(12,2) not null default 0,
  ultima_cita_fecha date,
  proxima_cita_fecha date,
  primera_cita_fecha date,
  -- Estado del cliente en el funnel
  estado text not null default 'activa' check (estado in ('lead', 'activa', 'dormida', 'perdida', 'vip')),
  -- Auditoría
  archivada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null,
  -- Migración
  agendapro_id text unique,         -- id original en AgendaPro para rastreo
  migrado_desde_agendapro_at timestamptz
);

create index clientes_whatsapp_idx on public.clientes (whatsapp_normalizado);
create index clientes_email_idx on public.clientes (email);
create index clientes_estado_idx on public.clientes (estado) where archivada = false;
create index clientes_ultima_cita_idx on public.clientes (ultima_cita_fecha desc);
create index clientes_proxima_cita_idx on public.clientes (proxima_cita_fecha) where archivada = false;
create index clientes_fecha_nac_idx on public.clientes (fecha_nacimiento);

-- =========================================================================
-- CITAS (agenda + estado)
-- =========================================================================

create table public.citas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  -- Tiempo
  inicio timestamptz not null,
  fin timestamptz not null,
  -- Estado
  estado cita_estado not null default 'tentativa',
  estado_motivo text,               -- motivo de cancelación o no-show
  -- Económico
  precio_mxn numeric(10,2) not null,
  anticipo_mxn numeric(10,2) default 0,
  descuento_mxn numeric(10,2) default 0,
  -- Tracking de retoque (si esta cita ES un retoque, apunta a la cita original)
  cita_origen_id uuid references public.citas(id) on delete set null,
  es_retoque_60d boolean default false,
  es_retoque_anual boolean default false,
  -- Confirmación / recordatorios
  recordatorio_24h_enviado_at timestamptz,
  recordatorio_2h_enviado_at timestamptz,
  confirmacion_solicitada_at timestamptz,
  confirmada_por_cliente_at timestamptz,
  -- Pre-form contraindicaciones
  pre_form_enviado_at timestamptz,
  pre_form_completado_at timestamptz,
  pre_form_alertas jsonb,           -- contraindicaciones marcadas
  -- Asignación
  tecnica_id uuid references public.usuarios(id) on delete set null,
  -- Notas
  notas_internas text,
  -- Auditoría
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null,
  agendapro_id text unique
);

create index citas_inicio_idx on public.citas (inicio);
create index citas_cliente_idx on public.citas (cliente_id);
create index citas_estado_idx on public.citas (estado);
create index citas_fecha_idx on public.citas (((inicio at time zone 'America/Monterrey')::date));

-- =========================================================================
-- PROCEDIMIENTOS (lo que SE HIZO en una cita completada)
-- Una cita puede tener N procedimientos (microblading + peeling el mismo día)
-- =========================================================================

create table public.procedimientos (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid not null references public.citas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  fecha_realizacion date not null,
  -- Datos técnicos del procedimiento
  pigmento_usado text,
  tecnica_aplicada text,
  notas_tecnicas text,
  -- Próximas fechas calculadas (CLAVE para automatizaciones)
  proxima_revision_fecha date,
  proximo_retoque_60d_fecha date,
  proximo_retoque_anual_fecha date,
  -- Cross-sell sugerido auto
  proxima_oferta_fecha date,
  proxima_oferta_servicio_id uuid references public.servicios(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null
);

create index procedimientos_cliente_idx on public.procedimientos (cliente_id);
create index procedimientos_proxima_oferta_idx on public.procedimientos (proxima_oferta_fecha) where proxima_oferta_fecha is not null;
create index procedimientos_retoque_60d_idx on public.procedimientos (proximo_retoque_60d_fecha) where proximo_retoque_60d_fecha is not null;
create index procedimientos_retoque_anual_idx on public.procedimientos (proximo_retoque_anual_fecha) where proximo_retoque_anual_fecha is not null;

-- =========================================================================
-- FOTOS (antes / durante / después por procedimiento)
-- =========================================================================

create table public.fotos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  procedimiento_id uuid references public.procedimientos(id) on delete cascade,
  cita_id uuid references public.citas(id) on delete set null,
  storage_path text not null,       -- bucket: clientes-fotos
  tipo text not null check (tipo in ('antes', 'durante', 'despues', 'cicatrizacion', 'general')),
  descripcion text,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null
);

create index fotos_cliente_idx on public.fotos (cliente_id);

-- =========================================================================
-- CONSENTIMIENTOS (firmados digitalmente)
-- =========================================================================

create table public.consentimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  cita_id uuid references public.citas(id) on delete set null,
  tipo text not null,               -- ej. "microblading_2026"
  contenido_html text not null,     -- texto completo firmado
  firma_imagen_path text,           -- bucket: consentimientos
  firma_ip text,
  firma_user_agent text,
  firmado_at timestamptz not null,
  pdf_path text,                    -- PDF generado y archivado
  created_at timestamptz not null default now()
);

create index consentimientos_cliente_idx on public.consentimientos (cliente_id);

-- =========================================================================
-- PAGOS (anticipos + saldos)
-- =========================================================================

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  cita_id uuid references public.citas(id) on delete set null,
  monto_mxn numeric(10,2) not null,
  metodo pago_metodo not null,
  estado pago_estado not null default 'pendiente',
  -- Stripe
  stripe_payment_link_url text,
  stripe_payment_intent_id text unique,
  stripe_session_id text,
  stripe_metadata jsonb,
  -- Auditoría
  pagado_at timestamptz,
  reembolsado_at timestamptz,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null
);

create index pagos_cliente_idx on public.pagos (cliente_id);
create index pagos_cita_idx on public.pagos (cita_id);
create index pagos_estado_idx on public.pagos (estado);

-- =========================================================================
-- COMUNICACIONES (cada mensaje WA/email/etc, entrante o saliente)
-- =========================================================================

create table public.comunicaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  canal comunicacion_canal not null,
  direccion comunicacion_direccion not null,
  -- Contenido
  asunto text,                      -- para emails
  cuerpo text not null,
  template_usado text,              -- nombre del template Meta si aplica
  variables jsonb,                  -- vars sustituidas en el template
  -- Tracking del proveedor
  twilio_sid text,
  resend_id text,
  estado_entrega text,              -- delivered, read, failed, bounced, etc.
  -- Vínculos
  cita_id uuid references public.citas(id) on delete set null,
  campania_id uuid,                 -- ref más abajo
  -- Auditoría
  enviado_at timestamptz not null default now(),
  leido_at timestamptz,
  respondido_at timestamptz
);

create index comunicaciones_cliente_idx on public.comunicaciones (cliente_id, enviado_at desc);
create index comunicaciones_canal_idx on public.comunicaciones (canal, enviado_at desc);
create index comunicaciones_campania_idx on public.comunicaciones (campania_id);

-- =========================================================================
-- CAMPAÑAS (broadcast + automáticas)
-- =========================================================================

create table public.campanias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo campania_tipo not null,
  estado campania_estado not null default 'borrador',
  -- Plantilla / contenido
  template_meta text,               -- nombre del template aprobado
  contenido text,                   -- copy con variables {{nombre}}, {{servicio}}, etc.
  -- Targeting (se evalúa al lanzar)
  segmento_filtros jsonb default '{}'::jsonb,
  -- Tracking
  total_destinatarios int default 0,
  total_enviados int default 0,
  total_entregados int default 0,
  total_leidos int default 0,
  total_respondidos int default 0,
  total_conversiones int default 0,  -- agendaron tras la campaña
  -- Programación
  programada_para timestamptz,
  iniciada_at timestamptz,
  completada_at timestamptz,
  -- Auditoría
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null
);

alter table public.comunicaciones add constraint comunicaciones_campania_fk
  foreign key (campania_id) references public.campanias(id) on delete set null;

create index campanias_estado_idx on public.campanias (estado, programada_para);

-- =========================================================================
-- REFERIDOS (1 Hollywood peeling por cada 3 referidas — su programa actual)
-- =========================================================================

create table public.referidos (
  id uuid primary key default gen_random_uuid(),
  cliente_referente_id uuid not null references public.clientes(id) on delete cascade,
  cliente_referido_id uuid not null references public.clientes(id) on delete cascade,
  primera_cita_referido_id uuid references public.citas(id) on delete set null,
  recompensa_otorgada boolean default false,
  recompensa_otorgada_at timestamptz,
  recompensa_descripcion text,
  created_at timestamptz not null default now(),
  unique (cliente_referente_id, cliente_referido_id)
);

-- =========================================================================
-- RESEÑAS GOOGLE (tracking del flujo de pedido + obtenidas)
-- =========================================================================

create table public.resenas_solicitudes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  cita_id uuid not null references public.citas(id) on delete cascade,
  link_enviado_at timestamptz,
  resena_obtenida boolean default false,
  resena_obtenida_at timestamptz,
  estrellas int check (estrellas between 1 and 5),
  comentario text,
  created_at timestamptz not null default now(),
  unique (cita_id)
);

-- =========================================================================
-- CONFIGURACIÓN DEL ESTUDIO (1 sola fila)
-- =========================================================================

create table public.configuracion (
  id int primary key default 1 check (id = 1),
  nombre_estudio text not null default 'Gina Brows Microblading Artist',
  whatsapp_estudio text,
  email_estudio text,
  direccion text,
  ciudad text default 'Monterrey, Nuevo León',
  google_business_place_id text,
  google_review_link text,
  -- Horarios
  horarios jsonb default '{
    "lunes": {"abre": "11:00", "cierra": "19:00"},
    "martes": {"abre": "11:00", "cierra": "19:00"},
    "miercoles": {"abre": "11:00", "cierra": "19:00"},
    "jueves": {"abre": "11:00", "cierra": "19:00"},
    "viernes": {"abre": "11:00", "cierra": "19:00"},
    "sabado": {"abre": "11:00", "cierra": "15:00"},
    "domingo": null
  }'::jsonb,
  -- Defaults
  anticipo_porcentaje_default int default 50,
  dias_dormida int default 180,
  dias_pre_aviso_retoque int default 7,
  -- Voz de marca para el bot IA
  voz_bot_system_prompt text,
  frases_si text[] default '{}',
  frases_no text[] default '{}',
  updated_at timestamptz not null default now()
);

insert into public.configuracion (id) values (1) on conflict do nothing;

-- =========================================================================
-- TRIGGERS de updated_at
-- =========================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_clientes_updated before update on public.clientes
  for each row execute function public.set_updated_at();

create trigger trg_citas_updated before update on public.citas
  for each row execute function public.set_updated_at();

create trigger trg_servicios_updated before update on public.servicios
  for each row execute function public.set_updated_at();

create trigger trg_configuracion_updated before update on public.configuracion
  for each row execute function public.set_updated_at();

-- =========================================================================
-- TRIGGER: cuando se completa una cita → crear procedimiento + actualizar cliente
-- =========================================================================

create or replace function public.cita_completada_trigger()
returns trigger language plpgsql as $$
declare
  v_servicio public.servicios;
  v_proc_id uuid;
begin
  if new.estado = 'completada' and (old.estado is null or old.estado != 'completada') then
    select * into v_servicio from public.servicios where id = new.servicio_id;

    -- Crear procedimiento con fechas calculadas
    insert into public.procedimientos (
      cita_id, cliente_id, servicio_id, fecha_realizacion,
      proximo_retoque_60d_fecha,
      proximo_retoque_anual_fecha,
      proxima_oferta_fecha,
      proxima_oferta_servicio_id
    )
    values (
      new.id, new.cliente_id, new.servicio_id, date(new.inicio),
      case when v_servicio.retoque_dias_obligatorio is not null
        then date(new.inicio) + (v_servicio.retoque_dias_obligatorio || ' days')::interval
        else null
      end,
      case when v_servicio.retoque_anual_dias is not null
        then date(new.inicio) + (v_servicio.retoque_anual_dias || ' days')::interval
        else null
      end,
      case when v_servicio.cross_sell_dias_despues is not null
        then date(new.inicio) + (v_servicio.cross_sell_dias_despues || ' days')::interval
        else null
      end,
      v_servicio.cross_sell_servicio_id
    )
    returning id into v_proc_id;

    -- Actualizar agregados del cliente
    update public.clientes c set
      total_citas = total_citas + 1,
      total_gastado_mxn = total_gastado_mxn + new.precio_mxn,
      ultima_cita_fecha = greatest(c.ultima_cita_fecha, date(new.inicio)),
      primera_cita_fecha = coalesce(c.primera_cita_fecha, date(new.inicio)),
      estado = case when c.estado in ('lead', 'dormida') then 'activa' else c.estado end
    where id = new.cliente_id;
  end if;
  return new;
end $$;

create trigger trg_cita_completada
  after update of estado on public.citas
  for each row execute function public.cita_completada_trigger();

-- =========================================================================
-- TRIGGER: actualizar proxima_cita_fecha del cliente
-- =========================================================================

create or replace function public.actualizar_proxima_cita_cliente()
returns trigger language plpgsql as $$
begin
  update public.clientes set proxima_cita_fecha = (
    select min(date(inicio))
    from public.citas
    where cliente_id = coalesce(new.cliente_id, old.cliente_id)
      and estado in ('tentativa', 'confirmada')
      and inicio > now()
  )
  where id = coalesce(new.cliente_id, old.cliente_id);
  return coalesce(new, old);
end $$;

create trigger trg_cita_proxima
  after insert or update or delete on public.citas
  for each row execute function public.actualizar_proxima_cita_cliente();

-- =========================================================================
-- TRIGGER: marcar cliente como 'dormida' si pasa el umbral
-- (se ejecuta vía cron, no aquí — pero la función se define ahora)
-- =========================================================================

create or replace function public.marcar_dormidas()
returns int language plpgsql as $$
declare
  v_dias int;
  v_count int;
begin
  select dias_dormida into v_dias from public.configuracion where id = 1;

  with actualizadas as (
    update public.clientes set estado = 'dormida'
    where estado = 'activa'
      and archivada = false
      and ultima_cita_fecha is not null
      and ultima_cita_fecha < current_date - (v_dias || ' days')::interval
      and not exists (
        select 1 from public.citas
        where cliente_id = clientes.id
          and estado in ('tentativa', 'confirmada')
          and inicio > now()
      )
    returning 1
  )
  select count(*) into v_count from actualizadas;
  return v_count;
end $$;

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

alter table public.usuarios enable row level security;
alter table public.servicios enable row level security;
alter table public.clientes enable row level security;
alter table public.citas enable row level security;
alter table public.procedimientos enable row level security;
alter table public.fotos enable row level security;
alter table public.consentimientos enable row level security;
alter table public.pagos enable row level security;
alter table public.comunicaciones enable row level security;
alter table public.campanias enable row level security;
alter table public.referidos enable row level security;
alter table public.resenas_solicitudes enable row level security;
alter table public.configuracion enable row level security;

-- Por ahora: cualquier usuario autenticado activo puede leer/escribir todo.
-- Cuando entren técnicas, agregamos políticas por rol.

create policy "auth_full_access" on public.usuarios
  for all to authenticated using (true) with check (true);
create policy "auth_full_access" on public.servicios
  for all to authenticated using (true) with check (true);
create policy "auth_full_access" on public.clientes
  for all to authenticated using (true) with check (true);
create policy "auth_full_access" on public.citas
  for all to authenticated using (true) with check (true);
create policy "auth_full_access" on public.procedimientos
  for all to authenticated using (true) with check (true);
create policy "auth_full_access" on public.fotos
  for all to authenticated using (true) with check (true);
create policy "auth_full_access" on public.consentimientos
  for all to authenticated using (true) with check (true);
create policy "auth_full_access" on public.pagos
  for all to authenticated using (true) with check (true);
create policy "auth_full_access" on public.comunicaciones
  for all to authenticated using (true) with check (true);
create policy "auth_full_access" on public.campanias
  for all to authenticated using (true) with check (true);
create policy "auth_full_access" on public.referidos
  for all to authenticated using (true) with check (true);
create policy "auth_full_access" on public.resenas_solicitudes
  for all to authenticated using (true) with check (true);
create policy "auth_full_access" on public.configuracion
  for all to authenticated using (true) with check (true);

-- ========================== supabase/migrations/002_views_and_seed.sql ==========================
-- =========================================================================
-- Vistas para el dashboard + seed del catálogo de servicios de Gina
-- =========================================================================

-- =========================================================================
-- VISTAS — listas para el dashboard sin necesidad de query complejo
-- =========================================================================

-- Citas de hoy
create or replace view public.v_citas_hoy as
select
  c.*,
  cl.nombre as cliente_nombre,
  cl.apellido as cliente_apellido,
  cl.whatsapp as cliente_whatsapp,
  s.nombre as servicio_nombre,
  s.precio_mxn as servicio_precio
from public.citas c
join public.clientes cl on cl.id = c.cliente_id
join public.servicios s on s.id = c.servicio_id
where ((c.inicio at time zone 'America/Monterrey')::date) = current_date
  and c.estado not in ('cancelada')
order by c.inicio;

-- Citas pendientes de confirmar (24h o menos)
create or replace view public.v_citas_pendientes_confirmar as
select c.*, cl.nombre as cliente_nombre, cl.whatsapp as cliente_whatsapp
from public.citas c
join public.clientes cl on cl.id = c.cliente_id
where c.estado = 'tentativa'
  and c.inicio between now() and now() + interval '36 hours'
order by c.inicio;

-- Clientas dormidas (>180 días sin cita, sin cita futura)
create or replace view public.v_clientas_dormidas as
select c.*,
  current_date - c.ultima_cita_fecha as dias_dormida,
  (select count(*) from public.procedimientos p where p.cliente_id = c.id) as total_procedimientos
from public.clientes c
where c.archivada = false
  and c.estado in ('dormida', 'activa')
  and c.ultima_cita_fecha is not null
  and c.ultima_cita_fecha < current_date - interval '180 days'
  and not exists (
    select 1 from public.citas ci
    where ci.cliente_id = c.id
      and ci.estado in ('tentativa', 'confirmada')
      and ci.inicio > now()
  )
order by c.total_gastado_mxn desc nulls last;

-- Retoques 60d pendientes (próximos 14 días + ya vencidos hasta 30 días atrás)
create or replace view public.v_retoques_60d_pendientes as
select
  p.id as procedimiento_id,
  p.cliente_id,
  cl.nombre as cliente_nombre,
  cl.whatsapp as cliente_whatsapp,
  s.nombre as servicio_original,
  p.fecha_realizacion,
  p.proximo_retoque_60d_fecha,
  p.proximo_retoque_60d_fecha - current_date as dias_restantes,
  case
    when p.proximo_retoque_60d_fecha < current_date then 'vencido'
    when p.proximo_retoque_60d_fecha <= current_date + interval '7 days' then 'urgente'
    else 'proximo'
  end as urgencia
from public.procedimientos p
join public.clientes cl on cl.id = p.cliente_id
join public.servicios s on s.id = p.servicio_id
where p.proximo_retoque_60d_fecha is not null
  and p.proximo_retoque_60d_fecha between current_date - interval '30 days' and current_date + interval '14 days'
  -- No tiene aún el retoque hecho
  and not exists (
    select 1 from public.citas c
    where c.cita_origen_id = p.cita_id
      and c.es_retoque_60d = true
      and c.estado in ('completada', 'tentativa', 'confirmada')
  )
order by p.proximo_retoque_60d_fecha;

-- Retoques anuales pendientes (próximos 30 días + vencidos hasta 60 días atrás)
create or replace view public.v_retoques_anuales_pendientes as
select
  p.id as procedimiento_id,
  p.cliente_id,
  cl.nombre as cliente_nombre,
  cl.whatsapp as cliente_whatsapp,
  s.nombre as servicio_original,
  p.fecha_realizacion,
  p.proximo_retoque_anual_fecha,
  p.proximo_retoque_anual_fecha - current_date as dias_restantes,
  case
    when p.proximo_retoque_anual_fecha < current_date then 'vencido'
    when p.proximo_retoque_anual_fecha <= current_date + interval '14 days' then 'urgente'
    else 'proximo'
  end as urgencia
from public.procedimientos p
join public.clientes cl on cl.id = p.cliente_id
join public.servicios s on s.id = p.servicio_id
where p.proximo_retoque_anual_fecha is not null
  and p.proximo_retoque_anual_fecha between current_date - interval '60 days' and current_date + interval '30 days'
  and not exists (
    select 1 from public.citas c
    where c.cita_origen_id = p.cita_id
      and c.es_retoque_anual = true
      and c.estado in ('completada', 'tentativa', 'confirmada')
  )
order by p.proximo_retoque_anual_fecha;

-- Cumpleaños del próximo mes
create or replace view public.v_cumpleanos_proximos as
select
  c.*,
  to_char(c.fecha_nacimiento, 'DD') as dia,
  to_char(c.fecha_nacimiento, 'MM') as mes,
  case
    when extract(month from c.fecha_nacimiento) = extract(month from current_date)
      and extract(day from c.fecha_nacimiento) >= extract(day from current_date)
    then make_date(
      extract(year from current_date)::int,
      extract(month from c.fecha_nacimiento)::int,
      extract(day from c.fecha_nacimiento)::int
    )
    when extract(month from c.fecha_nacimiento) = extract(month from current_date) + 1
      or (extract(month from current_date) = 12 and extract(month from c.fecha_nacimiento) = 1)
    then make_date(
      case when extract(month from current_date) = 12 then extract(year from current_date)::int + 1 else extract(year from current_date)::int end,
      extract(month from c.fecha_nacimiento)::int,
      extract(day from c.fecha_nacimiento)::int
    )
  end as proximo_cumple
from public.clientes c
where c.fecha_nacimiento is not null
  and c.archivada = false
  and (
    extract(month from c.fecha_nacimiento) = extract(month from current_date)
    or extract(month from c.fecha_nacimiento) = extract(month from current_date) + 1
    or (extract(month from current_date) = 12 and extract(month from c.fecha_nacimiento) = 1)
  )
order by proximo_cumple;

-- Cross-sell sugerido (procedimientos cuya proxima_oferta_fecha está en ventana)
create or replace view public.v_cross_sell_sugerido as
select
  p.id as procedimiento_id,
  p.cliente_id,
  cl.nombre as cliente_nombre,
  cl.whatsapp as cliente_whatsapp,
  s_original.nombre as compro_servicio,
  s_oferta.nombre as ofrecer_servicio,
  s_oferta.precio_mxn as ofrecer_precio,
  p.proxima_oferta_fecha
from public.procedimientos p
join public.clientes cl on cl.id = p.cliente_id
join public.servicios s_original on s_original.id = p.servicio_id
join public.servicios s_oferta on s_oferta.id = p.proxima_oferta_servicio_id
where p.proxima_oferta_fecha between current_date - interval '7 days' and current_date + interval '14 days'
  -- No le hemos ofrecido aún
  and not exists (
    select 1 from public.comunicaciones cm
    where cm.cliente_id = p.cliente_id
      and cm.template_usado = 'cross_sell'
      and cm.enviado_at > p.fecha_realizacion
  )
  and cl.archivada = false
order by p.proxima_oferta_fecha;

-- KPIs del dashboard (1 sola fila, todo agregado)
create or replace view public.v_dashboard_kpis as
select
  (select count(*) from public.v_citas_hoy where estado != 'completada') as citas_hoy_pendientes,
  (select count(*) from public.v_citas_pendientes_confirmar) as confirmar_24h,
  (select count(*) from public.v_clientas_dormidas) as clientas_dormidas,
  (select count(*) from public.v_retoques_60d_pendientes where urgencia in ('vencido', 'urgente')) as retoques_60d_urgentes,
  (select count(*) from public.v_retoques_anuales_pendientes where urgencia in ('vencido', 'urgente')) as retoques_anuales_urgentes,
  (select count(*) from public.v_cumpleanos_proximos where proximo_cumple between current_date and current_date + interval '7 days') as cumples_7d,
  (select count(*) from public.v_cross_sell_sugerido) as cross_sell_sugeridos,
  (select coalesce(sum(precio_mxn), 0) from public.citas where ((inicio at time zone 'America/Monterrey')::date) = current_date and estado in ('confirmada', 'completada')) as ingreso_proyectado_hoy,
  (select coalesce(sum(precio_mxn), 0) from public.citas where ((inicio at time zone 'America/Monterrey')::date) >= date_trunc('month', current_date) and estado = 'completada') as ingreso_mes,
  (select count(*) from public.citas where ((inicio at time zone 'America/Monterrey')::date) >= date_trunc('month', current_date) and estado = 'completada') as citas_completadas_mes;

-- =========================================================================
-- SEED — catálogo de servicios de Gina (lo que ella declaró en el intake)
-- Cross-sell rules: microblading → Hollywood peeling 90d después
-- =========================================================================

do $$
declare
  v_microblading uuid := gen_random_uuid();
  v_retoque_mensual uuid := gen_random_uuid();
  v_retoque_anual uuid := gen_random_uuid();
  v_valoracion uuid := gen_random_uuid();
  v_diseno uuid := gen_random_uuid();
  v_remocion_1 uuid := gen_random_uuid();
  v_remocion_3 uuid := gen_random_uuid();
  v_peeling_1 uuid := gen_random_uuid();
  v_peeling_3 uuid := gen_random_uuid();
  v_melasma uuid := gen_random_uuid();
  v_laser uuid := gen_random_uuid();
begin
  insert into public.servicios (id, nombre, precio_mxn, duracion_min, retoque_dias_obligatorio, retoque_precio_mxn, retoque_anual_dias, retoque_anual_precio_mxn, cross_sell_dias_despues, categoria, orden) values
    (v_microblading, 'Microblading', 3000, 120, 60, 1500, 365, 2200, 90, 'cejas', 1),
    (v_retoque_mensual, 'Retoque mensual', 1500, 60, null, null, null, null, null, 'cejas', 2),
    (v_retoque_anual, 'Retoque anual', 2200, 90, null, null, null, null, null, 'cejas', 3),
    (v_valoracion, 'Valoración', 300, 30, null, null, null, null, null, 'consulta', 10),
    (v_diseno, 'Diseño de ceja', 400, 30, null, null, null, null, null, 'cejas', 4),
    (v_remocion_1, 'Remoción de ceja (1 sesión)', 1500, 90, null, null, null, null, null, 'remocion', 5),
    (v_remocion_3, 'Remoción de ceja (3 sesiones)', 3500, 90, null, null, null, null, null, 'remocion', 6),
    (v_peeling_1, 'Hollywood peeling (1 sesión)', 1100, 60, null, null, null, null, null, 'piel', 7),
    (v_peeling_3, 'Hollywood peeling (3 sesiones)', 2700, 60, null, null, null, null, null, 'piel', 8),
    (v_melasma, 'Melasma', 2000, 90, null, null, null, null, null, 'piel', 9),
    (v_laser, 'Láser express', 500, 30, null, null, null, null, null, 'piel', 11);

  -- Cross-sell: microblading → Hollywood peeling 90d
  update public.servicios set cross_sell_servicio_id = v_peeling_1 where id = v_microblading;
end $$;

-- Configuración inicial con frases de Gina del intake
update public.configuracion set
  frases_si = array['Hello, hello', 'Procuro destacar la naturalidad de las cejitas', 'Las cejas son hermanas, no gemelas', 'Lo natural nunca va a pasar de moda'],
  frases_no = array['Referirme con groserías', 'Utilizar malas palabras con las clientas', 'Están horribles tus cejas', 'Estás fea'],
  voz_bot_system_prompt = 'Eres Gina Torres, dueña de Gina Brows Microblading Artist en Monterrey. Tu tono es servicial, profesional, empático, detallista, natural y humano. Empiezas siempre con "Hello, hello". Hablas de cejitas (en diminutivo cariñoso). Frases que usas: "Las cejas son hermanas, no gemelas", "Lo natural nunca va a pasar de moda", "Procuro destacar la naturalidad de las cejitas". NUNCA dices groserías, malas palabras, ni nada despectivo sobre las cejas o el aspecto de la clienta. Eres genuina, cálida, y haces sentir a la clienta especial.'
where id = 1;

-- ========================== supabase/migrations/003_storage_buckets.sql ==========================
-- =========================================================================
-- Storage buckets privados con RLS
-- =========================================================================
-- 3 buckets:
--   1. clientes-fotos       → fotos antes/después/cicatrización por procedimiento
--   2. consentimientos      → PDFs firmados digitalmente
--   3. agendapro-exports    → backup en frío de los exports CSV/JSON antes de migrar
-- =========================================================================

-- Crear buckets (idempotente)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'clientes-fotos',
    'clientes-fotos',
    false,
    10485760, -- 10 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  )
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'consentimientos',
    'consentimientos',
    false,
    5242880, -- 5 MB
    array['application/pdf', 'image/png', 'image/jpeg']
  )
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'agendapro-exports',
    'agendapro-exports',
    false,
    104857600, -- 100 MB (un export grande)
    array['text/csv', 'application/json', 'application/zip', 'application/x-zip-compressed']
  )
on conflict (id) do nothing;

-- =========================================================================
-- RLS POLICIES — solo authenticated users pueden leer/escribir.
-- Por ahora cualquier admin/técnica/recepción ve todo. Cuando entren más
-- técnicas refinamos a "técnica solo ve fotos de SUS procedimientos".
-- =========================================================================

-- Limpiar policies existentes si ya estaban (idempotente)
drop policy if exists "Authenticated read clientes-fotos" on storage.objects;
drop policy if exists "Authenticated write clientes-fotos" on storage.objects;
drop policy if exists "Authenticated update clientes-fotos" on storage.objects;
drop policy if exists "Authenticated delete clientes-fotos" on storage.objects;

drop policy if exists "Authenticated read consentimientos" on storage.objects;
drop policy if exists "Authenticated write consentimientos" on storage.objects;

drop policy if exists "Authenticated read agendapro-exports" on storage.objects;
drop policy if exists "Service role write agendapro-exports" on storage.objects;

-- clientes-fotos
create policy "Authenticated read clientes-fotos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'clientes-fotos');

create policy "Authenticated write clientes-fotos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'clientes-fotos');

create policy "Authenticated update clientes-fotos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'clientes-fotos');

create policy "Authenticated delete clientes-fotos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'clientes-fotos');

-- consentimientos (read-only para authenticated, write solo via service-role desde edge function)
create policy "Authenticated read consentimientos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'consentimientos');

create policy "Authenticated write consentimientos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'consentimientos');

-- agendapro-exports (solo admins ven el backup en frío)
create policy "Authenticated read agendapro-exports"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'agendapro-exports'
    and exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.rol = 'admin' and u.activo = true
    )
  );

create policy "Authenticated write agendapro-exports"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'agendapro-exports'
    and exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.rol = 'admin' and u.activo = true
    )
  );

-- ========================== supabase/migrations/004_bot_marketing_calendar.sql ==========================
-- =========================================================================
-- Bot feedback + pausa + email templates + calendar tokens
-- =========================================================================

-- 1. Pausar bot por conversación de clienta
alter table public.clientes
  add column if not exists bot_pausado boolean not null default false,
  add column if not exists bot_pausado_at timestamptz,
  add column if not exists bot_pausado_motivo text;

-- 2. Feedback al bot (thumbs up/down con corrección humana)
create table if not exists public.bot_feedback (
  id uuid primary key default gen_random_uuid(),
  comunicacion_id uuid references public.comunicaciones(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  tipo text not null check (tipo in ('up', 'down')),
  -- Solo si tipo='down': qué dijo mal y qué debió decir
  mensaje_original text,
  mensaje_corregido text,
  contexto text,
  -- Si este feedback ya fue inyectado al system prompt, marcar
  inyectado_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bot_feedback_tipo_idx on public.bot_feedback (tipo, created_at desc);
create index if not exists bot_feedback_cliente_idx on public.bot_feedback (cliente_id);

alter table public.bot_feedback enable row level security;
create policy "auth_full_access" on public.bot_feedback
  for all to authenticated using (true) with check (true);

-- 3. Templates de email (creador de templates de Gina)
do $$ begin
  create type template_tipo as enum ('email', 'whatsapp');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo template_tipo not null default 'email',
  asunto text,
  cuerpo_html text,
  cuerpo_texto text not null,
  variables_disponibles text[] default array['nombre', 'apellido', 'cumpleanos', 'ultima_cita', 'servicio_estrella', 'cupon'],
  -- Si es para una campaña pre-armada
  tipo_campania campania_tipo,
  -- Visualización
  emoji text,
  color text default 'lavanda',
  -- Auditoría
  veces_usado int not null default 0,
  ultimo_uso timestamptz,
  archivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null
);

create index if not exists templates_tipo_idx on public.email_templates (tipo, archivado);

drop trigger if exists trg_templates_updated on public.email_templates;
create trigger trg_templates_updated before update on public.email_templates
  for each row execute function public.set_updated_at();

alter table public.email_templates enable row level security;
create policy "auth_full_access" on public.email_templates
  for all to authenticated using (true) with check (true);

-- 4. Tokens OAuth para Google Calendar de Gina
create table if not exists public.calendar_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  proveedor text not null default 'google' check (proveedor in ('google', 'outlook')),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  calendar_id text,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (usuario_id, proveedor)
);

alter table public.calendar_tokens enable row level security;
create policy "owner_only" on public.calendar_tokens
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- 5. Vincular cita a evento de calendario externo
alter table public.citas
  add column if not exists google_event_id text,
  add column if not exists calendar_synced_at timestamptz;

-- 6. Seed templates iniciales con la voz de Gina
insert into public.email_templates (nombre, tipo, asunto, cuerpo_texto, tipo_campania, emoji)
values
  ('Reactivación dormidas — voz Gina', 'whatsapp', null,
   'Hello, hello {{nombre}} 🌿 Te extrañamos por aquí en Gina Brows. Quería invitarte con un detallito: tu próxima cita la pasas con diseño de ceja gratis 💜 ¿Cuándo te apartamos espacio?',
   'reactivacion_dormidas', '🌿'),
  ('Recordatorio retoque 60d', 'whatsapp', null,
   'Hello, hello {{nombre}} 🌿 Pasaron casi 60 días desde tu microblading. Es momento del retoque para que tus cejitas duren más y queden hermosas. ¿Te aparto cita esta semana?',
   'retoque_60d', '⏰'),
  ('Aviso retoque anual', 'whatsapp', null,
   'Hello, hello {{nombre}} 🌿 Ya cumplió un año tu microblading. Es momento del retoque anual para mantener tus cejitas. Si lo agendas este mes, mantienes el precio especial. ¿Te aparto?',
   'retoque_anual', '✨'),
  ('Cumpleaños con cupón', 'whatsapp', null,
   'Hello, hello {{nombre}} 🎂 ¡Feliz cumpleaños! De parte de Gina Brows te regalamos un diseño de ceja gratis para estrenar el día. Válido los próximos 30 días.',
   'cumpleanos', '🎂'),
  ('Pedido de reseña Google', 'whatsapp', null,
   'Hello, hello {{nombre}} 🌿 ¿Te gustaron tus cejitas? Si te animas a dejarme una reseña en Google, me ayudas muchísimo: {{link_resena}} 💜',
   'pedir_resena', '⭐'),
  ('Newsletter mensual ejemplo', 'email',
   'Tu mes en Gina Brows ✨',
   'Hello, hello {{nombre}} 🌿\n\nEste mes en el estudio probamos algo nuevo: el Hollywood Peeling potenciado para preparar la piel antes del verano.\n\nSi quieres ver fotos del antes/después de mis clientas y enterarte de promociones, sígueme en @ginat.brows en Instagram.\n\nUn beso,\nGina',
   'broadcast_libre', '💌')
on conflict do nothing;

-- ========================== supabase/migrations/005_paquetes_y_consentimientos.sql ==========================
-- =========================================================================
-- Paquetes con tracking de sesión (1/3, 2/3, 3/3) + base de consentimientos digitales
-- =========================================================================

-- 1. Agregar campos en servicios para definir paquetes
alter table public.servicios
  add column if not exists sesiones_paquete int not null default 1;

comment on column public.servicios.sesiones_paquete is
  'Si > 1, este servicio es un paquete. La 1ra cita cobra precio total, las siguientes precio 0.';

-- 2. Agregar tracking de paquete + sesión en citas
alter table public.citas
  add column if not exists paquete_grupo_id uuid,
  add column if not exists sesion_numero int,
  add column if not exists sesiones_totales int;

comment on column public.citas.paquete_grupo_id is
  'UUID que agrupa las N sesiones del mismo paquete (mismo cliente + mismo servicio).';

create index if not exists citas_paquete_grupo_idx on public.citas (paquete_grupo_id);

-- 3. Actualizar servicios existentes con sus sesiones_paquete reales
update public.servicios set sesiones_paquete = 3 where nombre = 'Remoción de ceja (3 sesiones)';
update public.servicios set sesiones_paquete = 3 where nombre = 'Hollywood peeling (3 sesiones)';

-- 4. Agregar el nuevo paquete que pidió Gina: Remoción 2 sesiones
insert into public.servicios (nombre, precio_mxn, duracion_min, categoria, orden, sesiones_paquete)
values ('Remoción de ceja (2 sesiones)', 2000, 90, 'remocion', 5, 2)
on conflict do nothing;

-- 5. RPC helper: dado cliente + servicio, calcula la siguiente sesión y precio correcto
create or replace function public.calcular_proxima_sesion_paquete(
  p_cliente_id uuid,
  p_servicio_id uuid
)
returns table(
  paquete_grupo_id uuid,
  sesion_numero int,
  sesiones_totales int,
  precio_mxn numeric,
  es_paquete boolean
) language plpgsql as $$
declare
  v_servicio public.servicios;
  v_grupo_existente uuid;
  v_sesiones_hechas int;
begin
  select * into v_servicio from public.servicios where id = p_servicio_id;

  -- Si no es paquete (sesiones_paquete = 1), siempre precio normal
  if v_servicio.sesiones_paquete <= 1 then
    return query select
      gen_random_uuid() as paquete_grupo_id,
      1::int as sesion_numero,
      1::int as sesiones_totales,
      v_servicio.precio_mxn,
      false as es_paquete;
    return;
  end if;

  -- Buscar paquete abierto del cliente para este servicio (con menos de N sesiones)
  select c.paquete_grupo_id
    into v_grupo_existente
  from public.citas c
  where c.cliente_id = p_cliente_id
    and c.servicio_id = p_servicio_id
    and c.paquete_grupo_id is not null
    and c.estado != 'cancelada'
  group by c.paquete_grupo_id
  having count(*) < v_servicio.sesiones_paquete
  limit 1;

  if v_grupo_existente is not null then
    -- Continuar paquete existente: sesión++, precio 0
    select count(*) into v_sesiones_hechas
    from public.citas
    where paquete_grupo_id = v_grupo_existente
      and estado != 'cancelada';
    return query select
      v_grupo_existente,
      (v_sesiones_hechas + 1)::int,
      v_servicio.sesiones_paquete,
      0::numeric,
      true as es_paquete;
  else
    -- Empezar paquete nuevo: sesión 1, precio total
    return query select
      gen_random_uuid() as paquete_grupo_id,
      1::int as sesion_numero,
      v_servicio.sesiones_paquete,
      v_servicio.precio_mxn,
      true as es_paquete;
  end if;
end $$;

-- =========================================================================
-- Base para consentimientos digitales (atacar en detalle mañana)
-- =========================================================================

-- Templates de consentimiento (HTML/JSON con preguntas estructuradas)
create table if not exists public.consentimiento_templates (
  id uuid primary key default gen_random_uuid(),
  tipo text not null unique,                  -- 'microblading_v1', 'remocion_laser_v1', etc.
  nombre text not null,                       -- "Consentimiento Microblading"
  servicios_aplica uuid[] default '{}',       -- IDs de servicios que disparan este consentimiento
  estructura jsonb not null,                  -- {"declaraciones": [...], "salud": [...], "datos_personales": [...], etc.}
  version int not null default 1,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Extender tabla `consentimientos` existente con campos para firma digital y respuestas estructuradas
alter table public.consentimientos
  add column if not exists template_id uuid references public.consentimiento_templates(id) on delete restrict,
  add column if not exists respuestas jsonb,            -- {"hemofilia": "no", "diabetes": "si", "explicacion": "...", "iniciales_decl1": "JT", ...}
  add column if not exists token text unique,           -- token único para abrir el form en iPad sin auth
  add column if not exists token_expira_at timestamptz,
  add column if not exists ip_firma text;

create index if not exists consentimientos_token_idx on public.consentimientos (token) where token is not null;

alter table public.consentimiento_templates enable row level security;
drop policy if exists "auth_full_access" on public.consentimiento_templates;
create policy "auth_full_access" on public.consentimiento_templates
  for all to authenticated using (true) with check (true);

-- Allow public read of templates by token (for iPad form, no auth needed)
drop policy if exists "public_read_by_token" on public.consentimientos;
create policy "public_read_by_token" on public.consentimientos
  for select using (token is not null and token_expira_at > now());

-- ========================== supabase/migrations/006_seed_consentimientos.sql ==========================
-- =========================================================================
-- Seed de templates de consentimiento — Microblading + Remoción Láser
-- Basado en los PDFs oficiales de Gina Brows
-- =========================================================================

-- Permitir consentimientos pendientes (sin firma aún)
alter table public.consentimientos
  alter column firmado_at drop not null,
  alter column contenido_html drop not null;

-- Template MICROBLADING
insert into public.consentimiento_templates (tipo, nombre, version, estructura)
values (
  'microblading_v1',
  'Consentimiento Microblading',
  1,
  jsonb_build_object(
    'titulo', 'FORMULARIO DE CONSENTIMIENTO PARA TRATAMIENTO DE MICROBLADING',
    'datos_personales', jsonb_build_array(
      jsonb_build_object('id', 'nombre', 'label', 'Nombre completo', 'tipo', 'text', 'requerido', true),
      jsonb_build_object('id', 'fecha_nacimiento', 'label', 'Fecha de nacimiento', 'tipo', 'date', 'requerido', true),
      jsonb_build_object('id', 'direccion', 'label', 'Dirección', 'tipo', 'text', 'requerido', false),
      jsonb_build_object('id', 'ciudad', 'label', 'Ciudad', 'tipo', 'text', 'requerido', false),
      jsonb_build_object('id', 'estado', 'label', 'Estado', 'tipo', 'text', 'requerido', false),
      jsonb_build_object('id', 'codigo_postal', 'label', 'Código postal', 'tipo', 'text', 'requerido', false),
      jsonb_build_object('id', 'telefono', 'label', 'Teléfono', 'tipo', 'tel', 'requerido', true),
      jsonb_build_object('id', 'email', 'label', 'Correo electrónico', 'tipo', 'email', 'requerido', true)
    ),
    'declaraciones', jsonb_build_array(
      'Certifico que tengo más de 18 años, no estoy bajo la influencia de drogas o alcohol, no estoy embarazada y estoy de acuerdo en recibir el procedimiento de microblading. Se me ha explicado la naturaleza general del tratamiento de microblading a realizar.',
      'Entiendo que una cierta cantidad de malestar está asociada con este procedimiento y que puede ocurrir hinchazón, enrojecimiento y moretones.',
      'Entiendo que Retin A, Renova, Ácidos Alpha Hydroxidos y Ácidos Glicolicos y cremas antiedad no deben usarse en las áreas tratadas. Alterarán el color. Aún ya cicatrizado el tratamiento.',
      'Entiendo que el sol, las camas de bronceado, las piscinas, algunos productos para el cuidado de la piel y los medicamentos pueden afectar el resultado final de mi microblading.',
      'Entiendo que si tengo un trabajo de maquillaje permanente anterior el color puede cambiar, no fijarse o tener un resultado pobre y la persona que realiza el tratamiento no tiene control para predecirlo o evitarlo.',
      'Entiendo que el color del pigmento implantado puede cambiar o desvanecerse ligeramente con el tiempo debido a circunstancias fuera de su control y tendré que mantener el color en futuras aplicaciones y una sesión de perfeccionamiento dentro de las 6 a 8 semanas del procedimiento inicial.',
      'Entiendo que la variación de color, la fijación del mismo no solo dependen de la experiencia del artista si no de mi tipo de piel y cuidados posteriores.',
      'Entiendo que una vez pasados 6 meses, el costo del tratamiento varía y al pasar un año no es un retoque si no un trabajo nuevo.',
      'Se me han explicado las instrucciones de postratamiento al pie de la letra.',
      'No habrá reembolso para este procedimiento electivo.'
    ),
    'salud', jsonb_build_array(
      jsonb_build_object('id', 'hemofilia', 'pregunta', 'Hemofilia'),
      jsonb_build_object('id', 'diabetes', 'pregunta', 'Diabetes mellitus'),
      jsonb_build_object('id', 'hepatitis', 'pregunta', 'Hepatitis A, B, C, D, E, F'),
      jsonb_build_object('id', 'hiv', 'pregunta', 'HIV +'),
      jsonb_build_object('id', 'piel', 'pregunta', 'Enfermedades de la piel'),
      jsonb_build_object('id', 'maquillaje_anterior', 'pregunta', 'Maquillaje permanente anterior en el área a tratar'),
      jsonb_build_object('id', 'alergias', 'pregunta', 'Alergias'),
      jsonb_build_object('id', 'autoinmunes', 'pregunta', 'Enfermedades autoinmunes'),
      jsonb_build_object('id', 'herpes', 'pregunta', '¿Eres propenso al herpes?'),
      jsonb_build_object('id', 'infecciosas', 'pregunta', 'Enfermedades infecciosas / alta temperatura'),
      jsonb_build_object('id', 'epilepsia', 'pregunta', 'Epilepsia'),
      jsonb_build_object('id', 'cardiovasculares', 'pregunta', 'Problemas cardiovasculares'),
      jsonb_build_object('id', 'anticoagulantes', 'pregunta', '¿Toma anticoagulantes?'),
      jsonb_build_object('id', 'embarazada', 'pregunta', '¿Estás embarazada?'),
      jsonb_build_object('id', 'medicamentos', 'pregunta', '¿Toma algún medicamento a diario? (Anticonceptivos, suplementos, vitaminas, pastillas para adelgazar, productos preworkout)'),
      jsonb_build_object('id', 'marcapasos', 'pregunta', '¿Tienes marcapasos cardiovascular?'),
      jsonb_build_object('id', 'curacion_heridas', 'pregunta', '¿Tienes problemas con la curación de heridas?'),
      jsonb_build_object('id', 'narcoticos_24h', 'pregunta', '¿Ha consumido narcóticos o alcohol en las últimas 24 horas?'),
      jsonb_build_object('id', 'cirugia_14d', 'pregunta', '¿Ha tenido cirugía, terapia con láser u otra intervención médica en los últimos 14 días? ¿Está tomando antibióticos?'),
      jsonb_build_object('id', 'ejercicio', 'pregunta', '¿Hace ejercicio regularmente?')
    ),
    'autoriza_fotos', jsonb_build_object(
      'pregunta', 'Doy mi consentimiento para que se realicen fotografías, filmaciones, grabaciones y/o imágenes digitales del tratamiento que se va a realizar y el uso de las fotos con fines publicitarios (solo salen los ojos)',
      'requerido', true
    ),
    'enlace', jsonb_build_array(
      'Confirmo que he leído y entiendo la información antes mencionada.',
      'Obtuve una respuesta clara y comprensible a todas las preguntas que hice.',
      'El procedimiento de tratamiento y la atención posterior al tratamiento me han sido explicados detalladamente y estoy de acuerdo con eso.'
    ),
    'cuidados_posteriores', 'Día 1: limpiar con Aftercare Wipe cada 2 horas, aplicar Aftercare Gel. Días 2-3: limpiar e hidratar 5 veces al día. Días 4-7: solo Angel Care Gel 5 veces al día. PRIMEROS 7 DÍAS: NO maquillarse la ceja, NO sauna ni vapor, NO ejercicio, NO anticoagulantes, NO alcohol o tabaco. SIGUIENTES 30 DÍAS: NO botox, NO asolearse. DURANTE LA VIDA DEL TRATAMIENTO: NO peeling, NO láser en la zona tratada.',
    'autorizacion_artista', 'Autorizo a Gina Torres como mi artista de Microblading de cejas para realizar en mi cuerpo el procedimiento de Microblading de cejas que se desea hoy.'
  )
)
on conflict (tipo) do update set
  estructura = excluded.estructura,
  version = excluded.version,
  updated_at = now();


-- Template REMOCIÓN LÁSER
insert into public.consentimiento_templates (tipo, nombre, version, estructura)
values (
  'remocion_laser_v1',
  'Consentimiento Remoción con Láser',
  1,
  jsonb_build_object(
    'titulo', 'FORMULARIO DE CONSENTIMIENTO PARA TRATAMIENTO DE REMOCIÓN CON LÁSER',
    'datos_personales', jsonb_build_array(
      jsonb_build_object('id', 'nombre', 'label', 'Nombre completo', 'tipo', 'text', 'requerido', true),
      jsonb_build_object('id', 'fecha_nacimiento', 'label', 'Fecha de nacimiento', 'tipo', 'date', 'requerido', true),
      jsonb_build_object('id', 'telefono', 'label', 'Teléfono', 'tipo', 'tel', 'requerido', true),
      jsonb_build_object('id', 'email', 'label', 'Correo electrónico', 'tipo', 'email', 'requerido', true)
    ),
    'declaraciones', jsonb_build_array(
      'Certifico que tengo más de 18 años, no estoy bajo la influencia de drogas o alcohol, no estoy embarazada y estoy de acuerdo en recibir el procedimiento de láser. Se me ha explicado la naturaleza general del tratamiento de Láser a realizar.',
      'Entiendo que una cierta cantidad de malestar está asociada con este procedimiento y que puede ocurrir hinchazón, enrojecimiento y moretones.',
      'Entiendo que Retin A, Renova, Ácidos Alpha Hydroxidos y Ácidos Glicolicos y cremas antiedad no deben usarse en las áreas tratadas. Aún ya cicatrizado el tratamiento.',
      'Entiendo que el sol, las camas de bronceado, las piscinas, algunos productos para el cuidado de la piel y los medicamentos pueden afectar el resultado final de mi remoción.',
      'Entiendo que mi pelo real en ceja puede bajar su tono recién hecho el procedimiento (efecto frozen), sin embargo dicho efecto desaparecerá en los próximos días.',
      'Entiendo que no debo aplicar ningún producto sobre mis cejas en las próximas 24 hrs post tratamiento.',
      'Entiendo que el número de sesiones láser depende de la profundidad y calidad del maquillaje permanente anterior.',
      'Se me han explicado las instrucciones de postratamiento al pie de la letra.',
      'No habrá reembolso para este procedimiento electivo.'
    ),
    'salud', jsonb_build_array(
      jsonb_build_object('id', 'hemofilia', 'pregunta', 'Hemofilia'),
      jsonb_build_object('id', 'diabetes', 'pregunta', 'Diabetes mellitus'),
      jsonb_build_object('id', 'hepatitis', 'pregunta', 'Hepatitis A, B, C, D, E, F'),
      jsonb_build_object('id', 'hiv', 'pregunta', 'HIV +'),
      jsonb_build_object('id', 'piel', 'pregunta', 'Enfermedades de la piel'),
      jsonb_build_object('id', 'ejercicio', 'pregunta', '¿Hace ejercicio regularmente?'),
      jsonb_build_object('id', 'alergias', 'pregunta', 'Alergias'),
      jsonb_build_object('id', 'autoinmunes', 'pregunta', 'Enfermedades autoinmunes'),
      jsonb_build_object('id', 'herpes', 'pregunta', '¿Eres propenso al herpes?'),
      jsonb_build_object('id', 'infecciosas', 'pregunta', 'Enfermedades infecciosas / alta temperatura'),
      jsonb_build_object('id', 'epilepsia', 'pregunta', 'Epilepsia'),
      jsonb_build_object('id', 'cardiovasculares', 'pregunta', 'Problemas cardiovasculares'),
      jsonb_build_object('id', 'anticoagulantes', 'pregunta', '¿Toma anticoagulantes?'),
      jsonb_build_object('id', 'embarazada', 'pregunta', '¿Estás embarazada?'),
      jsonb_build_object('id', 'medicamentos', 'pregunta', '¿Toma algún medicamento a diario? (Anticonceptivos, suplementos, vitaminas, pastillas para adelgazar, productos preworkout)'),
      jsonb_build_object('id', 'marcapasos', 'pregunta', '¿Tienes marcapasos cardiovascular?'),
      jsonb_build_object('id', 'curacion_heridas', 'pregunta', '¿Tienes problemas con la curación de heridas?'),
      jsonb_build_object('id', 'narcoticos_24h', 'pregunta', '¿Ha consumido narcóticos o alcohol en las últimas 24 horas?'),
      jsonb_build_object('id', 'cirugia_14d', 'pregunta', '¿Ha tenido cirugía, terapia con láser u otra intervención médica en los últimos 14 días? ¿Está tomando antibióticos?')
    ),
    'autoriza_fotos', jsonb_build_object(
      'pregunta', 'Doy mi consentimiento para que se realicen fotografías, filmaciones, grabaciones y/o imágenes digitales del tratamiento que se va a realizar y el uso de las fotos con fines publicitarios (solo salen los ojos)',
      'requerido', true
    ),
    'enlace', jsonb_build_array(
      'Confirmo que he leído y entiendo la información antes mencionada.',
      'Obtuve una respuesta clara y comprensible a todas las preguntas que hice.',
      'El procedimiento de tratamiento y la atención posterior al tratamiento me han sido explicados detalladamente y estoy de acuerdo con eso.'
    ),
    'cuidados_posteriores', 'PRÓXIMOS 30 DÍAS: Evitar exponerse al sol por períodos prolongados. No aplicar cremas antiedad, maquillaje, serum. NO maquillarse la ceja por 24 hrs. Evitar saunas y vapor. Evitar sudor en exceso. No anticoagulantes. Evitar exceso de alcohol y tabaco. SIGUIENTES 30 DÍAS: No botox, no asolearse. DURANTE LA VIDA DEL TRATAMIENTO: no peeling.',
    'autorizacion_artista', 'Autorizo a Gina Brows para realizar en mi cuerpo el procedimiento de remoción con láser que se desea hoy.'
  )
)
on conflict (tipo) do update set
  estructura = excluded.estructura,
  version = excluded.version,
  updated_at = now();


-- Vincular templates a los servicios correspondientes
update public.consentimiento_templates
set servicios_aplica = (
  select array_agg(id) from public.servicios
  where nombre in ('Microblading', 'Retoque mensual', 'Retoque anual', 'Paquete Mantenimiento de Microblading')
)
where tipo = 'microblading_v1';

update public.consentimiento_templates
set servicios_aplica = (
  select array_agg(id) from public.servicios
  where nombre in ('Remoción de ceja (1 sesión)', 'Remoción de ceja (2 sesiones)', 'Remoción de ceja (3 sesiones)', 'Láser express')
)
where tipo = 'remocion_laser_v1';

-- Bucket para PDFs de consentimientos firmados
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consentimientos-firmados', 'consentimientos-firmados', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Authenticated read consentimientos firmados" on storage.objects;
create policy "Authenticated read consentimientos firmados"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'consentimientos-firmados');

drop policy if exists "Service role write consentimientos firmados" on storage.objects;
create policy "Service role write consentimientos firmados"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'consentimientos-firmados');

-- ========================== supabase/migrations/007_cita_items_checkout.sql ==========================
-- =========================================================================
-- Check-out de cita: items / productos extras consumidos durante la cita
-- =========================================================================
-- Permite agregar a una cita servicios/productos adicionales que el cliente
-- compró en el momento (ej: vino por microblading, también le vendieron
-- sombreado + jabón Tocobo). Cada item tiene precio propio y todos suman al total.

create table if not exists public.cita_items (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid not null references public.citas(id) on delete cascade,
  -- Si es servicio del catálogo, vincular. Si es producto custom, dejar null y usar descripcion_libre
  servicio_id uuid references public.servicios(id) on delete set null,
  descripcion_libre text,
  cantidad numeric(10,2) not null default 1 check (cantidad > 0),
  precio_unitario_mxn numeric(10,2) not null,
  precio_total_mxn numeric(10,2) generated always as (cantidad * precio_unitario_mxn) stored,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null,
  -- Constraint: debe tener servicio_id O descripcion_libre, no ambos vacíos
  constraint cita_items_referencia_chk check (servicio_id is not null or (descripcion_libre is not null and length(descripcion_libre) > 0))
);

create index if not exists cita_items_cita_idx on public.cita_items (cita_id);
create index if not exists cita_items_servicio_idx on public.cita_items (servicio_id);

alter table public.cita_items enable row level security;
drop policy if exists "auth_full_access" on public.cita_items;
create policy "auth_full_access" on public.cita_items
  for all to authenticated using (true) with check (true);

-- =========================================================================
-- Vista: total final de la cita (precio_mxn del servicio principal + items extras)
-- =========================================================================
create or replace view public.v_citas_totales as
select
  c.id as cita_id,
  c.cliente_id,
  c.servicio_id,
  c.estado,
  c.precio_mxn as precio_servicio_principal,
  coalesce((
    select sum(precio_total_mxn)
    from public.cita_items
    where cita_id = c.id
  ), 0) as total_items_extras,
  c.precio_mxn + coalesce((
    select sum(precio_total_mxn)
    from public.cita_items
    where cita_id = c.id
  ), 0) as total_final_mxn,
  c.anticipo_mxn,
  (c.precio_mxn + coalesce((select sum(precio_total_mxn) from public.cita_items where cita_id = c.id), 0)) - coalesce(c.anticipo_mxn, 0) as saldo_pendiente
from public.citas c;

-- ========================== supabase/migrations/008_pagos_y_saldo.sql ==========================
-- =========================================================================
-- 008 · Pagos por cita: amplia metodos, agrega referencia y vista de saldo
-- =========================================================================
-- Replica el flujo de checkout estilo AgendaPro:
--   - Multiples pagos por cita (abonos parciales)
--   - Metodos: efectivo, terminal, tarjeta credito/debito, transferencia,
--     giftcard, link de pago (Stripe), otro
--   - Saldo calculado en vivo: precio_servicio + items + - anticipo - pagos
-- =========================================================================

-- 1. Ampliar enum pago_metodo (idempotente)
do $$
begin
  if not exists (select 1 from pg_enum where enumtypid = 'pago_metodo'::regtype and enumlabel = 'tarjeta_credito') then
    alter type pago_metodo add value 'tarjeta_credito';
  end if;
  if not exists (select 1 from pg_enum where enumtypid = 'pago_metodo'::regtype and enumlabel = 'tarjeta_debito') then
    alter type pago_metodo add value 'tarjeta_debito';
  end if;
  if not exists (select 1 from pg_enum where enumtypid = 'pago_metodo'::regtype and enumlabel = 'giftcard') then
    alter type pago_metodo add value 'giftcard';
  end if;
  if not exists (select 1 from pg_enum where enumtypid = 'pago_metodo'::regtype and enumlabel = 'link_pago') then
    alter type pago_metodo add value 'link_pago';
  end if;
end$$;

-- 2. Columna referencia (libre: ult 4 digitos tarjeta, # transferencia, etc.)
alter table public.pagos
  add column if not exists referencia text;

-- 3. Vista v_citas_saldo: total bruto, anticipo, pagado, saldo
create or replace view public.v_citas_saldo as
select
  c.id as cita_id,
  c.cliente_id,
  c.precio_mxn as precio_servicio_mxn,
  c.anticipo_mxn,
  coalesce(items.total_items_mxn, 0)::numeric(10,2) as total_items_mxn,
  (c.precio_mxn + coalesce(items.total_items_mxn, 0))::numeric(10,2) as total_mxn,
  coalesce(p.total_pagado_mxn, 0)::numeric(10,2) as total_pagado_mxn,
  coalesce(p.num_pagos, 0)::int as num_pagos,
  greatest(
    (c.precio_mxn + coalesce(items.total_items_mxn, 0)) - c.anticipo_mxn - coalesce(p.total_pagado_mxn, 0),
    0
  )::numeric(10,2) as saldo_mxn,
  case
    when (c.precio_mxn + coalesce(items.total_items_mxn, 0)) - c.anticipo_mxn - coalesce(p.total_pagado_mxn, 0) <= 0
      then 'pagado'
    when c.anticipo_mxn > 0 or coalesce(p.total_pagado_mxn, 0) > 0
      then 'parcial'
    else 'pendiente'
  end as estado_pago
from public.citas c
left join lateral (
  select sum(precio_total_mxn)::numeric(10,2) as total_items_mxn
  from public.cita_items
  where cita_id = c.id
) items on true
left join lateral (
  select sum(monto_mxn)::numeric(10,2) as total_pagado_mxn,
         count(*)::int as num_pagos
  from public.pagos
  where cita_id = c.id and estado = 'pagado'
) p on true;

comment on view public.v_citas_saldo is
  'Saldo en vivo por cita: total = servicio + items; pagado = anticipo_mxn + sum(pagos pagados); saldo = total - pagado.';

-- 4. RLS: pagos ya tiene policies; nada que tocar.

-- ========================== supabase/migrations/009_status_callbacks.sql ==========================
-- =========================================================================
-- 009 · Status callbacks de Twilio: trackeo detallado de errores de entrega
-- =========================================================================
-- Cada mensaje WhatsApp saliente recibe webhooks de Twilio en
-- /api/webhooks/twilio-status. Cuando el mensaje falla, queremos guardar
-- el codigo y mensaje de error para diagnosticar (numero invalido, fuera
-- de la ventana de 24h, template no aprobada, etc.).
-- =========================================================================

alter table public.comunicaciones
  add column if not exists error_codigo text,
  add column if not exists error_mensaje text;

-- Index para que las queries de "mensajes fallidos" sean rapidas.
create index if not exists comunicaciones_estado_entrega_idx
  on public.comunicaciones (estado_entrega)
  where estado_entrega in ('failed', 'undelivered');

comment on column public.comunicaciones.error_codigo is
  'Twilio ErrorCode del status callback (ej. 63016 para template no aprobada).';
comment on column public.comunicaciones.error_mensaje is
  'Twilio ErrorMessage explicando el fallo de entrega.';

-- ========================== supabase/migrations/010_push_subscriptions.sql ==========================
-- =========================================================================
-- 010 · Web Push subscriptions
-- =========================================================================
-- Cada navegador/dispositivo donde Gina (o JP) acepta notificaciones
-- registra su PushSubscription en esta tabla. Cuando hay un evento
-- (intake completado, etc.), el server itera todos los rows y manda
-- push a cada endpoint via web-push protocol con VAPID keys.
-- =========================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios(id) on delete cascade,
  endpoint text not null unique,
  -- Keys del PushSubscription (p256dh + auth) en JSONB para mantener flexibilidad.
  keys jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  failed_count int not null default 0
);

create index if not exists push_subscriptions_usuario_idx
  on public.push_subscriptions (usuario_id);

comment on table public.push_subscriptions is
  'Web Push subscriptions activas por dispositivo. Si una entrega falla con 410 (Gone), el row se elimina.';

-- ========================== supabase/migrations/011_cartera_segmentos.sql ==========================
-- =========================================================================
-- 011 · Segmentos de cartera + opt-out de marketing
-- =========================================================================
-- Vista que clasifica cada clienta en uno de 5 segmentos para targeting de
-- campañas masivas:
--   - caliente:        cita en ultimos 30 dias
--   - tibia_60_180:    ultima cita 60-180 dias atras (NICE candidate
--                      para retoque o reactivacion suave)
--   - fria_180_365:    180-365 dias sin venir (reactivacion fuerte)
--   - dormida_365_plus: 365+ dias o nunca tuvo cita (reactivacion ultima)
--   - reciente_30_60:  cita 30-60 dias atras (transicion, no campaña aún)
--
-- Ademas: columna clientes.no_marketing para opt-out.
-- =========================================================================

-- 1. Opt-out de marketing (STOP / BAJA respondidos por WhatsApp)
alter table public.clientes
  add column if not exists no_marketing boolean not null default false,
  add column if not exists no_marketing_at timestamptz,
  add column if not exists no_marketing_motivo text;

create index if not exists clientes_no_marketing_idx
  on public.clientes (no_marketing) where no_marketing = true;

comment on column public.clientes.no_marketing is
  'Si true, NO se le envian campañas masivas. Se setea cuando responde STOP, BAJA, NO ESCRIBAN, etc.';

-- 2. Vista de segmentos basada en ultima_cita_fecha (ya existe en clientes
--    como columna mantenida por trigger). Si es null = nunca tuvo cita
--    completada → trata como dormida.
create or replace view public.v_cartera_segmentos as
select
  c.id,
  c.nombre,
  c.apellido,
  c.whatsapp,
  c.email,
  c.estado,
  c.tags,
  c.no_marketing,
  c.ultima_cita_fecha,
  c.proxima_cita_fecha,
  c.total_citas,
  c.total_gastado_mxn,
  c.fecha_nacimiento,
  case
    when c.archivada then 'archivada'
    when c.proxima_cita_fecha is not null then 'caliente'
    when c.ultima_cita_fecha is null then 'dormida_365_plus'
    when c.ultima_cita_fecha >= (current_date - interval '30 days') then 'caliente'
    when c.ultima_cita_fecha >= (current_date - interval '60 days') then 'reciente_30_60'
    when c.ultima_cita_fecha >= (current_date - interval '180 days') then 'tibia_60_180'
    when c.ultima_cita_fecha >= (current_date - interval '365 days') then 'fria_180_365'
    else 'dormida_365_plus'
  end as segmento,
  case
    when c.ultima_cita_fecha is null then null
    else (current_date - c.ultima_cita_fecha)::int
  end as dias_sin_venir
from public.clientes c
where c.archivada = false;

comment on view public.v_cartera_segmentos is
  'Clasifica clientas no archivadas en 5 segmentos por dias sin venir. '
  'Usar para targeting de campañas masivas tibia/fria/dormida.';

-- 3. Vista resumida de conteos por segmento (para el dashboard)
create or replace view public.v_cartera_segmentos_resumen as
select
  segmento,
  count(*) as total,
  count(*) filter (where no_marketing = false) as elegibles,
  count(*) filter (where whatsapp is not null and no_marketing = false) as elegibles_con_wa,
  avg(dias_sin_venir)::int as dias_promedio
from public.v_cartera_segmentos
group by segmento
order by case segmento
  when 'caliente' then 1
  when 'reciente_30_60' then 2
  when 'tibia_60_180' then 3
  when 'fria_180_365' then 4
  when 'dormida_365_plus' then 5
  else 6
end;

comment on view public.v_cartera_segmentos_resumen is
  'Conteos por segmento + cuántas son elegibles (no opt-out, con WA) para campaña.';

-- ========================== supabase/migrations/012_anticipo_fijo_servicios.sql ==========================
-- =========================================================================
-- 012 · Anticipo fijo por servicio
-- =========================================================================
-- Regla de negocio Gina: TODAS las citas se apartan con $500 fijo,
-- EXCEPTO valoración que no requiere anticipo.
--
-- Antes el copy de la template confirmacion_cita_link_pago decía
-- "del 50%", lo cual no aplicaba (un servicio de $1500 no apartaba con
-- $750, sino con $500 fijo). Template re-aprobada 2026-05-02 con copy
-- genérico "anticipo de ${{4}} MXN".
--
-- Esta migration agrega la columna que se consulta cuando se construye
-- el mensaje de link de pago.
-- =========================================================================

alter table public.servicios
  add column if not exists anticipo_fijo_mxn numeric(10,2) default 500;

-- Valoración no requiere anticipo: poner null (o 0) para que el sistema
-- skipee el envío del template confirmacion_cita_link_pago.
update public.servicios
set anticipo_fijo_mxn = null
where lower(nombre) ilike '%valoracion%' or lower(nombre) ilike '%valoración%';

comment on column public.servicios.anticipo_fijo_mxn is
  'Monto fijo del anticipo en MXN. NULL = no requiere anticipo (ej. valoración). Default $500.';

-- ========================== supabase/migrations/013_fix_anticipo_valoracion.sql ==========================
-- =========================================================================
-- 013 · Fix anticipo de valoración: $300 (no null)
-- =========================================================================
-- Migration 012 puso valoración en NULL asumiendo "no requiere anticipo",
-- pero JP aclaró 2026-05-02: la valoración SÍ se aparta, solo que con
-- $300 fijo (no $500 como otros servicios).
--
-- Caso de uso: clientas nuevas con trabajo previo (microblading antiguo,
-- tatuaje en cejas, etc.) Gina siempre ofrece VALORACIÓN primero antes
-- de agendar microblading o remoción. Esa valoración cuesta $300 y se
-- aparta con el mismo monto.
-- =========================================================================

update public.servicios
set anticipo_fijo_mxn = 300
where lower(nombre) ilike '%valoracion%' or lower(nombre) ilike '%valoración%';

-- Verificar que la valoración existe en el catálogo. Si no, crearla.
insert into public.servicios (nombre, descripcion, precio_mxn, duracion_min, anticipo_fijo_mxn, categoria, visible, orden)
select
  'Valoración',
  'Sesión de evaluación para clientas con trabajo previo. Definimos juntas el mejor procedimiento.',
  300,
  30,
  300,
  'evaluacion',
  true,
  0
where not exists (
  select 1 from public.servicios
  where lower(nombre) ilike '%valoracion%' or lower(nombre) ilike '%valoración%'
);

