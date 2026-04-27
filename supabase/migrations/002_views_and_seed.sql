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
