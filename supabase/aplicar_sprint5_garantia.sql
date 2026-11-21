-- Sprint 5 (ajuste): pega TODO este archivo en Supabase > Editor SQL > nueva consulta > Correr (una sola vez).

-- Sprint 5 · ajuste: texto de garantía detallado (cobertura y casos no cubiertos) para la imagen.
-- Una línea por renglón; una línea que termina en «:» se muestra como subtítulo.
-- La copia congelada (business_snapshot) lo incluye sola, porque issue_quotation copia la fila completa.
alter table public.business_settings
  add column if not exists warranty_details_text text
    check (warranty_details_text is null or length(warranty_details_text) <= 3000);
