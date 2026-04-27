# Guía rápida — Export de AgendaPro para Gina

Esto es lo que necesitamos de AgendaPro para migrar TODA tu data al CRM nuevo.
Toma entre 10 y 15 minutos. Si algo no aparece como aquí dice, mándame screenshot.

---

## Lo que vas a exportar

Necesitamos **2 archivos CSV** en total:

1. **Clientes** — la base completa de tus clientas con sus datos
2. **Citas histórico** — todas las citas que has tenido (pasadas y futuras)

Los descargas a tu computadora y nos los pasas (por WhatsApp o email).

---

## Paso a paso en AgendaPro

### Archivo 1 — CLIENTES

1. Entra a tu cuenta de AgendaPro en computadora (no celular, es más fácil)
2. Menú izquierdo → **Clientes** (o **Pacientes** según versión)
3. Arriba a la derecha busca el botón **"Exportar"** (a veces es un ícono ⬇️)
4. Selecciona **CSV** o **Excel** como formato
5. **Marca todos los campos posibles**: nombre, email, teléfono, fecha de nacimiento, notas, ID, etc.
6. Da click en **Descargar / Exportar**
7. El archivo se baja a tu carpeta `Descargas` con nombre tipo `clientes_2026-04-27.csv`

### Archivo 2 — CITAS HISTÓRICO

1. Mismo menú lateral → **Citas** o **Agenda histórica**
2. Cambia el filtro de fecha a **TODO el rango disponible** (desde el primer día que abriste hasta hoy)
3. Botón **"Exportar"** → CSV
4. Marca todos los campos: cliente, servicio, fecha, hora, estado, precio, notas
5. Descargar

---

## Cómo nos los pasas

**Opción A — La más fácil:** mándalos por WhatsApp a JP. Ambos archivos como adjunto.

**Opción B:** correo a `jpbriones@propelkap.com` con los 2 CSV adjuntos.

---

## ¿Y si AgendaPro no me deja exportar?

A veces el plan de AgendaPro tiene esta función bloqueada o requiere ser admin. Si no aparece el botón:

1. Pregunta al soporte de AgendaPro: "¿Cómo exporto mis clientes y citas a CSV/Excel?"
2. Si te dicen que no se puede, avísame y agendamos una **screen-share de 30 min** donde lo hacemos juntos copiando manualmente o usando otra técnica.

---

## ⚠️ Antes de mandármelos

**NO los abras en Excel** y guardes — Excel a veces cambia los acentos, los teléfonos los convierte en notación científica, y nos rompe los datos. Mándamelos **tal como te los descarga AgendaPro**.

Si ya los abriste, descarga otra vez una copia limpia.

---

## Lo que pasa después de que yo reciba los archivos

1. Subo backup en frío al storage seguro (cumplimos la promesa "backup completo antes de tocar")
2. Corro el script de migración (~5 minutos)
3. Te paso URL de staging para que valides 5-10 fichas que conoces de memoria
4. Si validas OK, queda en producción

Dudas → WhatsApp.
