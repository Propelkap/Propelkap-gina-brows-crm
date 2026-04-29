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
