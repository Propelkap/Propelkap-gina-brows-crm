-- =========================================================================
-- 013 · Fix anticipo de valoración: $300 (no null)
-- =========================================================================
-- Migration 012 puso valoración en NULL asumiendo "no requiere anticipo",
-- pero JP aclaró 2026-05-02: la valoración SÍ se aparta, solo que con
-- $300 fijo (no $500 como otros servicios).
--
-- Caso de uso: clientas nuevas con trabajo previo (microblading antiguo,
-- tatuaje en cejas, etc.) Gina siempre ofrece VALORACIÓN primero antes
-- de agendar microblading o remoción. Esa valoración cuesta $300 y se
-- aparta con el mismo monto.
-- =========================================================================

update public.servicios
set anticipo_fijo_mxn = 300
where lower(nombre) ilike '%valoracion%' or lower(nombre) ilike '%valoración%';

-- Verificar que la valoración existe en el catálogo. Si no, crearla.
insert into public.servicios (nombre, descripcion, precio_mxn, duracion_min, anticipo_fijo_mxn, categoria, visible, orden)
select
  'Valoración',
  'Sesión de evaluación para clientas con trabajo previo. Definimos juntas el mejor procedimiento.',
  300,
  30,
  300,
  'evaluacion',
  true,
  0
where not exists (
  select 1 from public.servicios
  where lower(nombre) ilike '%valoracion%' or lower(nombre) ilike '%valoración%'
);
