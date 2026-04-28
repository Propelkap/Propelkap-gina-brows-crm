-- =========================================================================
-- Bot feedback + pausa + email templates + calendar tokens
-- =========================================================================

-- 1. Pausar bot por conversación de clienta
alter table public.clientes
  add column if not exists bot_pausado boolean not null default false,
  add column if not exists bot_pausado_at timestamptz,
  add column if not exists bot_pausado_motivo text;

-- 2. Feedback al bot (thumbs up/down con corrección humana)
create table if not exists public.bot_feedback (
  id uuid primary key default gen_random_uuid(),
  comunicacion_id uuid references public.comunicaciones(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  tipo text not null check (tipo in ('up', 'down')),
  -- Solo si tipo='down': qué dijo mal y qué debió decir
  mensaje_original text,
  mensaje_corregido text,
  contexto text,
  -- Si este feedback ya fue inyectado al system prompt, marcar
  inyectado_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bot_feedback_tipo_idx on public.bot_feedback (tipo, created_at desc);
create index if not exists bot_feedback_cliente_idx on public.bot_feedback (cliente_id);

alter table public.bot_feedback enable row level security;
create policy "auth_full_access" on public.bot_feedback
  for all to authenticated using (true) with check (true);

-- 3. Templates de email (creador de templates de Gina)
do $$ begin
  create type template_tipo as enum ('email', 'whatsapp');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo template_tipo not null default 'email',
  asunto text,
  cuerpo_html text,
  cuerpo_texto text not null,
  variables_disponibles text[] default array['nombre', 'apellido', 'cumpleanos', 'ultima_cita', 'servicio_estrella', 'cupon'],
  -- Si es para una campaña pre-armada
  tipo_campania campania_tipo,
  -- Visualización
  emoji text,
  color text default 'lavanda',
  -- Auditoría
  veces_usado int not null default 0,
  ultimo_uso timestamptz,
  archivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null
);

create index if not exists templates_tipo_idx on public.email_templates (tipo, archivado);

drop trigger if exists trg_templates_updated on public.email_templates;
create trigger trg_templates_updated before update on public.email_templates
  for each row execute function public.set_updated_at();

alter table public.email_templates enable row level security;
create policy "auth_full_access" on public.email_templates
  for all to authenticated using (true) with check (true);

-- 4. Tokens OAuth para Google Calendar de Gina
create table if not exists public.calendar_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  proveedor text not null default 'google' check (proveedor in ('google', 'outlook')),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  calendar_id text,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (usuario_id, proveedor)
);

alter table public.calendar_tokens enable row level security;
create policy "owner_only" on public.calendar_tokens
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- 5. Vincular cita a evento de calendario externo
alter table public.citas
  add column if not exists google_event_id text,
  add column if not exists calendar_synced_at timestamptz;

-- 6. Seed templates iniciales con la voz de Gina
insert into public.email_templates (nombre, tipo, asunto, cuerpo_texto, tipo_campania, emoji)
values
  ('Reactivación dormidas — voz Gina', 'whatsapp', null,
   'Hello, hello {{nombre}} 🌿 Te extrañamos por aquí en Gina Brows. Quería invitarte con un detallito: tu próxima cita la pasas con diseño de ceja gratis 💜 ¿Cuándo te apartamos espacio?',
   'reactivacion_dormidas', '🌿'),
  ('Recordatorio retoque 60d', 'whatsapp', null,
   'Hello, hello {{nombre}} 🌿 Pasaron casi 60 días desde tu microblading. Es momento del retoque para que tus cejitas duren más y queden hermosas. ¿Te aparto cita esta semana?',
   'retoque_60d', '⏰'),
  ('Aviso retoque anual', 'whatsapp', null,
   'Hello, hello {{nombre}} 🌿 Ya cumplió un año tu microblading. Es momento del retoque anual para mantener tus cejitas. Si lo agendas este mes, mantienes el precio especial. ¿Te aparto?',
   'retoque_anual', '✨'),
  ('Cumpleaños con cupón', 'whatsapp', null,
   'Hello, hello {{nombre}} 🎂 ¡Feliz cumpleaños! De parte de Gina Brows te regalamos un diseño de ceja gratis para estrenar el día. Válido los próximos 30 días.',
   'cumpleanos', '🎂'),
  ('Pedido de reseña Google', 'whatsapp', null,
   'Hello, hello {{nombre}} 🌿 ¿Te gustaron tus cejitas? Si te animas a dejarme una reseña en Google, me ayudas muchísimo: {{link_resena}} 💜',
   'pedir_resena', '⭐'),
  ('Newsletter mensual ejemplo', 'email',
   'Tu mes en Gina Brows ✨',
   'Hello, hello {{nombre}} 🌿\n\nEste mes en el estudio probamos algo nuevo: el Hollywood Peeling potenciado para preparar la piel antes del verano.\n\nSi quieres ver fotos del antes/después de mis clientas y enterarte de promociones, sígueme en @ginat.brows en Instagram.\n\nUn beso,\nGina',
   'broadcast_libre', '💌')
on conflict do nothing;
