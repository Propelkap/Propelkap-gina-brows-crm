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
create index citas_fecha_idx on public.citas (date(inicio));

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
