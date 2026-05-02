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
