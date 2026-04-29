-- =========================================================================
-- Seed de templates de consentimiento — Microblading + Remoción Láser
-- Basado en los PDFs oficiales de Gina Brows
-- =========================================================================

-- Permitir consentimientos pendientes (sin firma aún)
alter table public.consentimientos
  alter column firmado_at drop not null,
  alter column contenido_html drop not null;

-- Template MICROBLADING
insert into public.consentimiento_templates (tipo, nombre, version, estructura)
values (
  'microblading_v1',
  'Consentimiento Microblading',
  1,
  jsonb_build_object(
    'titulo', 'FORMULARIO DE CONSENTIMIENTO PARA TRATAMIENTO DE MICROBLADING',
    'datos_personales', jsonb_build_array(
      jsonb_build_object('id', 'nombre', 'label', 'Nombre completo', 'tipo', 'text', 'requerido', true),
      jsonb_build_object('id', 'fecha_nacimiento', 'label', 'Fecha de nacimiento', 'tipo', 'date', 'requerido', true),
      jsonb_build_object('id', 'direccion', 'label', 'Dirección', 'tipo', 'text', 'requerido', false),
      jsonb_build_object('id', 'ciudad', 'label', 'Ciudad', 'tipo', 'text', 'requerido', false),
      jsonb_build_object('id', 'estado', 'label', 'Estado', 'tipo', 'text', 'requerido', false),
      jsonb_build_object('id', 'codigo_postal', 'label', 'Código postal', 'tipo', 'text', 'requerido', false),
      jsonb_build_object('id', 'telefono', 'label', 'Teléfono', 'tipo', 'tel', 'requerido', true),
      jsonb_build_object('id', 'email', 'label', 'Correo electrónico', 'tipo', 'email', 'requerido', true)
    ),
    'declaraciones', jsonb_build_array(
      'Certifico que tengo más de 18 años, no estoy bajo la influencia de drogas o alcohol, no estoy embarazada y estoy de acuerdo en recibir el procedimiento de microblading. Se me ha explicado la naturaleza general del tratamiento de microblading a realizar.',
      'Entiendo que una cierta cantidad de malestar está asociada con este procedimiento y que puede ocurrir hinchazón, enrojecimiento y moretones.',
      'Entiendo que Retin A, Renova, Ácidos Alpha Hydroxidos y Ácidos Glicolicos y cremas antiedad no deben usarse en las áreas tratadas. Alterarán el color. Aún ya cicatrizado el tratamiento.',
      'Entiendo que el sol, las camas de bronceado, las piscinas, algunos productos para el cuidado de la piel y los medicamentos pueden afectar el resultado final de mi microblading.',
      'Entiendo que si tengo un trabajo de maquillaje permanente anterior el color puede cambiar, no fijarse o tener un resultado pobre y la persona que realiza el tratamiento no tiene control para predecirlo o evitarlo.',
      'Entiendo que el color del pigmento implantado puede cambiar o desvanecerse ligeramente con el tiempo debido a circunstancias fuera de su control y tendré que mantener el color en futuras aplicaciones y una sesión de perfeccionamiento dentro de las 6 a 8 semanas del procedimiento inicial.',
      'Entiendo que la variación de color, la fijación del mismo no solo dependen de la experiencia del artista si no de mi tipo de piel y cuidados posteriores.',
      'Entiendo que una vez pasados 6 meses, el costo del tratamiento varía y al pasar un año no es un retoque si no un trabajo nuevo.',
      'Se me han explicado las instrucciones de postratamiento al pie de la letra.',
      'No habrá reembolso para este procedimiento electivo.'
    ),
    'salud', jsonb_build_array(
      jsonb_build_object('id', 'hemofilia', 'pregunta', 'Hemofilia'),
      jsonb_build_object('id', 'diabetes', 'pregunta', 'Diabetes mellitus'),
      jsonb_build_object('id', 'hepatitis', 'pregunta', 'Hepatitis A, B, C, D, E, F'),
      jsonb_build_object('id', 'hiv', 'pregunta', 'HIV +'),
      jsonb_build_object('id', 'piel', 'pregunta', 'Enfermedades de la piel'),
      jsonb_build_object('id', 'maquillaje_anterior', 'pregunta', 'Maquillaje permanente anterior en el área a tratar'),
      jsonb_build_object('id', 'alergias', 'pregunta', 'Alergias'),
      jsonb_build_object('id', 'autoinmunes', 'pregunta', 'Enfermedades autoinmunes'),
      jsonb_build_object('id', 'herpes', 'pregunta', '¿Eres propenso al herpes?'),
      jsonb_build_object('id', 'infecciosas', 'pregunta', 'Enfermedades infecciosas / alta temperatura'),
      jsonb_build_object('id', 'epilepsia', 'pregunta', 'Epilepsia'),
      jsonb_build_object('id', 'cardiovasculares', 'pregunta', 'Problemas cardiovasculares'),
      jsonb_build_object('id', 'anticoagulantes', 'pregunta', '¿Toma anticoagulantes?'),
      jsonb_build_object('id', 'embarazada', 'pregunta', '¿Estás embarazada?'),
      jsonb_build_object('id', 'medicamentos', 'pregunta', '¿Toma algún medicamento a diario? (Anticonceptivos, suplementos, vitaminas, pastillas para adelgazar, productos preworkout)'),
      jsonb_build_object('id', 'marcapasos', 'pregunta', '¿Tienes marcapasos cardiovascular?'),
      jsonb_build_object('id', 'curacion_heridas', 'pregunta', '¿Tienes problemas con la curación de heridas?'),
      jsonb_build_object('id', 'narcoticos_24h', 'pregunta', '¿Ha consumido narcóticos o alcohol en las últimas 24 horas?'),
      jsonb_build_object('id', 'cirugia_14d', 'pregunta', '¿Ha tenido cirugía, terapia con láser u otra intervención médica en los últimos 14 días? ¿Está tomando antibióticos?'),
      jsonb_build_object('id', 'ejercicio', 'pregunta', '¿Hace ejercicio regularmente?')
    ),
    'autoriza_fotos', jsonb_build_object(
      'pregunta', 'Doy mi consentimiento para que se realicen fotografías, filmaciones, grabaciones y/o imágenes digitales del tratamiento que se va a realizar y el uso de las fotos con fines publicitarios (solo salen los ojos)',
      'requerido', true
    ),
    'enlace', jsonb_build_array(
      'Confirmo que he leído y entiendo la información antes mencionada.',
      'Obtuve una respuesta clara y comprensible a todas las preguntas que hice.',
      'El procedimiento de tratamiento y la atención posterior al tratamiento me han sido explicados detalladamente y estoy de acuerdo con eso.'
    ),
    'cuidados_posteriores', 'Día 1: limpiar con Aftercare Wipe cada 2 horas, aplicar Aftercare Gel. Días 2-3: limpiar e hidratar 5 veces al día. Días 4-7: solo Angel Care Gel 5 veces al día. PRIMEROS 7 DÍAS: NO maquillarse la ceja, NO sauna ni vapor, NO ejercicio, NO anticoagulantes, NO alcohol o tabaco. SIGUIENTES 30 DÍAS: NO botox, NO asolearse. DURANTE LA VIDA DEL TRATAMIENTO: NO peeling, NO láser en la zona tratada.',
    'autorizacion_artista', 'Autorizo a Gina Torres como mi artista de Microblading de cejas para realizar en mi cuerpo el procedimiento de Microblading de cejas que se desea hoy.'
  )
)
on conflict (tipo) do update set
  estructura = excluded.estructura,
  version = excluded.version,
  updated_at = now();


-- Template REMOCIÓN LÁSER
insert into public.consentimiento_templates (tipo, nombre, version, estructura)
values (
  'remocion_laser_v1',
  'Consentimiento Remoción con Láser',
  1,
  jsonb_build_object(
    'titulo', 'FORMULARIO DE CONSENTIMIENTO PARA TRATAMIENTO DE REMOCIÓN CON LÁSER',
    'datos_personales', jsonb_build_array(
      jsonb_build_object('id', 'nombre', 'label', 'Nombre completo', 'tipo', 'text', 'requerido', true),
      jsonb_build_object('id', 'fecha_nacimiento', 'label', 'Fecha de nacimiento', 'tipo', 'date', 'requerido', true),
      jsonb_build_object('id', 'telefono', 'label', 'Teléfono', 'tipo', 'tel', 'requerido', true),
      jsonb_build_object('id', 'email', 'label', 'Correo electrónico', 'tipo', 'email', 'requerido', true)
    ),
    'declaraciones', jsonb_build_array(
      'Certifico que tengo más de 18 años, no estoy bajo la influencia de drogas o alcohol, no estoy embarazada y estoy de acuerdo en recibir el procedimiento de láser. Se me ha explicado la naturaleza general del tratamiento de Láser a realizar.',
      'Entiendo que una cierta cantidad de malestar está asociada con este procedimiento y que puede ocurrir hinchazón, enrojecimiento y moretones.',
      'Entiendo que Retin A, Renova, Ácidos Alpha Hydroxidos y Ácidos Glicolicos y cremas antiedad no deben usarse en las áreas tratadas. Aún ya cicatrizado el tratamiento.',
      'Entiendo que el sol, las camas de bronceado, las piscinas, algunos productos para el cuidado de la piel y los medicamentos pueden afectar el resultado final de mi remoción.',
      'Entiendo que mi pelo real en ceja puede bajar su tono recién hecho el procedimiento (efecto frozen), sin embargo dicho efecto desaparecerá en los próximos días.',
      'Entiendo que no debo aplicar ningún producto sobre mis cejas en las próximas 24 hrs post tratamiento.',
      'Entiendo que el número de sesiones láser depende de la profundidad y calidad del maquillaje permanente anterior.',
      'Se me han explicado las instrucciones de postratamiento al pie de la letra.',
      'No habrá reembolso para este procedimiento electivo.'
    ),
    'salud', jsonb_build_array(
      jsonb_build_object('id', 'hemofilia', 'pregunta', 'Hemofilia'),
      jsonb_build_object('id', 'diabetes', 'pregunta', 'Diabetes mellitus'),
      jsonb_build_object('id', 'hepatitis', 'pregunta', 'Hepatitis A, B, C, D, E, F'),
      jsonb_build_object('id', 'hiv', 'pregunta', 'HIV +'),
      jsonb_build_object('id', 'piel', 'pregunta', 'Enfermedades de la piel'),
      jsonb_build_object('id', 'ejercicio', 'pregunta', '¿Hace ejercicio regularmente?'),
      jsonb_build_object('id', 'alergias', 'pregunta', 'Alergias'),
      jsonb_build_object('id', 'autoinmunes', 'pregunta', 'Enfermedades autoinmunes'),
      jsonb_build_object('id', 'herpes', 'pregunta', '¿Eres propenso al herpes?'),
      jsonb_build_object('id', 'infecciosas', 'pregunta', 'Enfermedades infecciosas / alta temperatura'),
      jsonb_build_object('id', 'epilepsia', 'pregunta', 'Epilepsia'),
      jsonb_build_object('id', 'cardiovasculares', 'pregunta', 'Problemas cardiovasculares'),
      jsonb_build_object('id', 'anticoagulantes', 'pregunta', '¿Toma anticoagulantes?'),
      jsonb_build_object('id', 'embarazada', 'pregunta', '¿Estás embarazada?'),
      jsonb_build_object('id', 'medicamentos', 'pregunta', '¿Toma algún medicamento a diario? (Anticonceptivos, suplementos, vitaminas, pastillas para adelgazar, productos preworkout)'),
      jsonb_build_object('id', 'marcapasos', 'pregunta', '¿Tienes marcapasos cardiovascular?'),
      jsonb_build_object('id', 'curacion_heridas', 'pregunta', '¿Tienes problemas con la curación de heridas?'),
      jsonb_build_object('id', 'narcoticos_24h', 'pregunta', '¿Ha consumido narcóticos o alcohol en las últimas 24 horas?'),
      jsonb_build_object('id', 'cirugia_14d', 'pregunta', '¿Ha tenido cirugía, terapia con láser u otra intervención médica en los últimos 14 días? ¿Está tomando antibióticos?')
    ),
    'autoriza_fotos', jsonb_build_object(
      'pregunta', 'Doy mi consentimiento para que se realicen fotografías, filmaciones, grabaciones y/o imágenes digitales del tratamiento que se va a realizar y el uso de las fotos con fines publicitarios (solo salen los ojos)',
      'requerido', true
    ),
    'enlace', jsonb_build_array(
      'Confirmo que he leído y entiendo la información antes mencionada.',
      'Obtuve una respuesta clara y comprensible a todas las preguntas que hice.',
      'El procedimiento de tratamiento y la atención posterior al tratamiento me han sido explicados detalladamente y estoy de acuerdo con eso.'
    ),
    'cuidados_posteriores', 'PRÓXIMOS 30 DÍAS: Evitar exponerse al sol por períodos prolongados. No aplicar cremas antiedad, maquillaje, serum. NO maquillarse la ceja por 24 hrs. Evitar saunas y vapor. Evitar sudor en exceso. No anticoagulantes. Evitar exceso de alcohol y tabaco. SIGUIENTES 30 DÍAS: No botox, no asolearse. DURANTE LA VIDA DEL TRATAMIENTO: no peeling.',
    'autorizacion_artista', 'Autorizo a Gina Brows para realizar en mi cuerpo el procedimiento de remoción con láser que se desea hoy.'
  )
)
on conflict (tipo) do update set
  estructura = excluded.estructura,
  version = excluded.version,
  updated_at = now();


-- Vincular templates a los servicios correspondientes
update public.consentimiento_templates
set servicios_aplica = (
  select array_agg(id) from public.servicios
  where nombre in ('Microblading', 'Retoque mensual', 'Retoque anual', 'Paquete Mantenimiento de Microblading')
)
where tipo = 'microblading_v1';

update public.consentimiento_templates
set servicios_aplica = (
  select array_agg(id) from public.servicios
  where nombre in ('Remoción de ceja (1 sesión)', 'Remoción de ceja (2 sesiones)', 'Remoción de ceja (3 sesiones)', 'Láser express')
)
where tipo = 'remocion_laser_v1';

-- Bucket para PDFs de consentimientos firmados
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consentimientos-firmados', 'consentimientos-firmados', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Authenticated read consentimientos firmados" on storage.objects;
create policy "Authenticated read consentimientos firmados"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'consentimientos-firmados');

drop policy if exists "Service role write consentimientos firmados" on storage.objects;
create policy "Service role write consentimientos firmados"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'consentimientos-firmados');
