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
