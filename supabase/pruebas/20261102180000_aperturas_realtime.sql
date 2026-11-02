-- Después de 20261102180000_aperturas_realtime.sql. PRUEBAS OK confirma; no cambia nada.
do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='apertura_items') then raise exception 'FALLÓ: apertura_items no está en Realtime';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='apertura_items' and policyname='ver_apertura_items' and cmd='SELECT') then raise exception 'FALLÓ: falta la política de lectura que filtra Realtime';end if;
 if has_table_privilege('anon','public.apertura_items','SELECT') then raise exception 'FALLÓ: anon puede leer aperturas';end if;
 raise exception 'PRUEBAS OK — apertura_items en Realtime · lectura limitada por ver_apertura_items · anon sin acceso';
end $$;
