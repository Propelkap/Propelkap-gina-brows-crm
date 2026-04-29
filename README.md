# Gina Brows — CRM

CRM operativo del estudio de cejas **Gina Brows** (microblading, micropigmentación, remoción láser).
Manejado por PropelKap como caso real desplegado.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Supabase SSR · Twilio · Resend · Stripe · Lucide.

- **Live:** https://gina-brows-crm.vercel.app
- **Vercel project:** `gina-brows-crm` (team `team_6Hh9hj1Rx5ykjvksUYzlGcvL`)
- **Proyectos hermanos del cliente:**
  - Intake form: `~/gina-brows-intake/` → https://gina-brows.vercel.app
  - Propuesta: `~/gina-brows-propuesta/` → https://gina-brows-propuesta.vercel.app

---

## 🧬 Setup local

```bash
git clone git@github.com:Propelkap/gina-brows-crm.git ~/gina-brows-crm
cd ~/gina-brows-crm
npm install
cp .env.example .env.local      # luego pegar credenciales reales (ver _secretos-env.md en bóveda PropelKap OS)
npm run dev
```

Migrations Supabase: correr en orden `supabase/migrations/*.sql` desde el SQL Editor.

---

## 📐 Estructura

```
app/
├── (app)/                  # rutas autenticadas (CRM)
├── api/                    # endpoints (campañas, webhooks, etc.)
├── login/                  # auth Supabase
└── layout.tsx

lib/
├── supabase/               # clientes SSR + server-side
└── ...

scripts/                    # utilities (importar AgendaPro, seeds, etc.)
docs/                       # guías operativas (export AgendaPro, etc.)
supabase/migrations/        # schema (clientes, citas, paquetes, consentimientos, campañas, bot_feedback)
```

---

## 🧪 Features incluidas (obligatorias CRM PropelKap)

- ✅ Thumbs up/down al bot con doble cuadro de feedback (`que_fallo` + `como_debio_responder`).
- ✅ Sección Contactos para carga manual de leads orgánicos.
- ✅ Tracking de sesiones X/N en paquetes (Day 13: 2x remoción láser).
- ✅ Editar cita en drawer.
- ✅ Base de consentimientos (microblading + remoción láser, basado en PDFs oficiales de Gina Brows).

---

## 🚀 Deploy

```bash
vercel --prod
```

Auto-deploy GitHub → Vercel pendiente de configurar (cuando se conecte este repo al proyecto Vercel).

---

## 📚 Convenciones PropelKap

- Idioma UI: español mexicano.
- Secretos en `_secretos-env.md` por proyecto en la bóveda Obsidian (`~/Desktop/PropelKap OS/02-Proyectos/Gina-Brows-CRM/`).
- Patrón de implementación replicable: el repo del CRM de Pensiones (Haydée) → `Propelkap/propelkap-crm-pensiones-template`.

---

Owner: Jorge Pérez Briones · `jpbriones@propelkap.com`
