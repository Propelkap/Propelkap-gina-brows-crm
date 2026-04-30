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
