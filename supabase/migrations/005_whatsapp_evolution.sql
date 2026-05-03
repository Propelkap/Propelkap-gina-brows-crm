-- ====================================================================
-- Sandbox: schema mínimo para WhatsApp via Evolution API
-- Solo lo necesario para Fase 3: estado de conexión + mensajes entrantes
-- ====================================================================

-- 1) Estado de conexión por instancia
create table if not exists public.whatsapp_connections (
  instance_name text primary key,
  state text not null default 'close',          -- 'open' | 'close' | 'connecting'
  phone text,
  profile_name text,
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists wa_conn_state_idx on public.whatsapp_connections (state);

-- 2) Mensajes (incoming + outgoing)
create table if not exists public.whatsapp_messages (
  id bigserial primary key,
  instance_name text not null,
  message_id text,                              -- id que da Evolution
  from_jid text,
  to_jid text,
  direction text not null,                      -- 'in' | 'out'
  content text,
  message_type text,                            -- 'text' | 'image' | etc.
  raw jsonb,                                    -- payload completo del webhook por si hace falta debug
  ts timestamptz not null default now()
);

create index if not exists wa_msg_instance_ts_idx on public.whatsapp_messages (instance_name, ts desc);
create index if not exists wa_msg_from_jid_idx on public.whatsapp_messages (from_jid);
alter table public.whatsapp_messages drop constraint if exists wa_msg_unique;
alter table public.whatsapp_messages add constraint wa_msg_unique unique (instance_name, message_id);

-- RLS off por ahora (sandbox single-tenant). Cuando portemos al template
-- agregamos policies por user_id y prendemos RLS.
