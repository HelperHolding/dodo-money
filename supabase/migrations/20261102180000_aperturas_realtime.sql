-- El checklist de aperturas escucha cambios de apertura_items por Supabase Realtime (websocket).
-- Realtime respeta la política de lectura existente (ver_apertura_items: ve_compras()); no abre datos nuevos.
-- Repetible: no falla si la tabla ya está publicada.
do $$
begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then raise exception 'Falta la publicación supabase_realtime; córrelo en el proyecto de Supabase de producción.';end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='apertura_items') then
  alter publication supabase_realtime add table public.apertura_items;
 end if;
end $$;
