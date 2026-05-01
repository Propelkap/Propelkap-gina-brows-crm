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
