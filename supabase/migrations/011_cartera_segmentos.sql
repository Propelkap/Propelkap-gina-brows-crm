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
