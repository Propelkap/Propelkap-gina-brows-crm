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
