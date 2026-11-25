-- HD-16: ficha Dodo por partida (matriz, sustituto) y fotos: la del proyecto (importada de la matriz) y la real (subida en obra).
-- Solo se escribe con las funciones (security definer); el bucket privado guarda las fotos en <apertura_id>/<uuid>.<ext>.
begin;
set local lock_timeout='5s';

create table public.apertura_item_dodo(
 item_id uuid primary key references public.apertura_items(id) on delete cascade,
 proyecto_id uuid not null references public.apertura_proyectos(id),
 codigo text check(length(codigo)<=60),
 matriz text check(matriz in ('digital','mobiliario','neutral','proceso','herramientas')),
 matriz_url text check(matriz_url ~ '^https://docs\.google\.com/' and length(matriz_url)<=500),
 sustituto text check(length(sustituto)<=2000),
 foto_proyecto text,
 foto_real text,
 foto_real_por uuid,
 foto_real_en timestamptz,
 importado_en timestamptz not null default now()
);
create index apertura_item_dodo_proyecto on public.apertura_item_dodo(proyecto_id);

alter table public.apertura_item_dodo enable row level security;
create policy ver_apertura_item_dodo on public.apertura_item_dodo for select using(public.ve_compras());
revoke all on public.apertura_item_dodo from public,anon,authenticated;
grant select on public.apertura_item_dodo to authenticated;

create function public.importar_apertura_dodo(p_proyecto uuid,p_filas jsonb)
returns table(ligadas integer,con_foto integer,fotos_anteriores text[]) language plpgsql security definer set search_path='' as $$
declare f jsonb;v_item uuid;v_foto text;v_url text;v_ant text;v_lig integer:=0;v_con integer:=0;v_antes text[]:=array[]::text[];
begin
 if not public.edita_compras() then raise exception 'Solo administración puede importar la matriz Dodo.';end if;
 if not exists(select 1 from public.apertura_proyectos where id=p_proyecto) then raise exception 'La apertura no existe.';end if;
 if p_filas is null or jsonb_typeof(p_filas)<>'array' then raise exception 'Las filas deben ser un arreglo.';end if;
 if jsonb_array_length(p_filas)>400 then raise exception 'Máximo 400 partidas por importación.';end if;
 for f in select value from jsonb_array_elements(p_filas) loop
  v_item:=(f->>'item_id')::uuid;v_foto:=nullif(f->>'foto','');v_url:=nullif(f->>'matriz_url','');
  if not exists(select 1 from public.apertura_items where id=v_item and proyecto_id=p_proyecto) then raise exception 'La partida no es de esta apertura.';end if;
  if v_url is not null and (v_url !~ '^https://docs\.google\.com/' or length(v_url)>500) then raise exception 'La liga de la matriz debe ser de docs.google.com.';end if;
  if v_foto is not null then
   if v_foto !~ ('^'||p_proyecto::text||'/[0-9a-f-]{36}\.(png|jpg|webp)$') then raise exception 'Las rutas de las fotos deben ser <apertura>/<uuid>.png, .jpg o .webp.';end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='aperturas-fotos' and o.name=v_foto) then raise exception 'La foto no se subió.';end if;
  end if;
  select d.foto_proyecto into v_ant from public.apertura_item_dodo d where d.item_id=v_item for update;
  insert into public.apertura_item_dodo(item_id,proyecto_id,codigo,matriz,matriz_url,sustituto,foto_proyecto)
   values(v_item,p_proyecto,nullif(f->>'codigo',''),nullif(f->>'matriz',''),v_url,nullif(f->>'sustituto',''),v_foto)
   on conflict(item_id) do update set codigo=excluded.codigo,matriz=excluded.matriz,matriz_url=excluded.matriz_url,sustituto=excluded.sustituto,
    foto_proyecto=coalesce(excluded.foto_proyecto,public.apertura_item_dodo.foto_proyecto),importado_en=now();
  v_lig:=v_lig+1;
  if v_foto is not null then v_con:=v_con+1;end if;
  if v_foto is not null and v_ant is not null and v_ant<>v_foto then v_antes:=v_antes||v_ant;end if;
 end loop;
 ligadas:=v_lig;con_foto:=v_con;fotos_anteriores:=v_antes;return next;
end $$;

create function public.guardar_foto_real(p_item uuid,p_ruta text)
returns text language plpgsql security definer set search_path='' as $$
declare v_proy uuid;v_ant text;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede guardar la foto real.';end if;
 select proyecto_id into v_proy from public.apertura_items where id=p_item;
 if v_proy is null then raise exception 'La partida no existe.';end if;
 if p_ruta is not null then
  if p_ruta !~ ('^'||v_proy::text||'/[0-9a-f-]{36}\.(png|jpg|webp)$') then raise exception 'La ruta de la foto debe ser <apertura>/<uuid>.png, .jpg o .webp.';end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='aperturas-fotos' and o.name=p_ruta) then raise exception 'La foto no se subió.';end if;
 end if;
 select d.foto_real into v_ant from public.apertura_item_dodo d where d.item_id=p_item for update;
 insert into public.apertura_item_dodo(item_id,proyecto_id,foto_real,foto_real_por,foto_real_en)
  values(p_item,v_proy,p_ruta,case when p_ruta is null then null else auth.uid() end,case when p_ruta is null then null else now() end)
  on conflict(item_id) do update set foto_real=excluded.foto_real,foto_real_por=excluded.foto_real_por,foto_real_en=excluded.foto_real_en;
 return v_ant;
end $$;

revoke all on function public.importar_apertura_dodo(uuid,jsonb) from public,anon;
revoke all on function public.guardar_foto_real(uuid,text) from public,anon;
grant execute on function public.importar_apertura_dodo(uuid,jsonb) to authenticated;
grant execute on function public.guardar_foto_real(uuid,text) to authenticated;

-- Bucket privado: fotos del proyecto y reales, en <apertura_id>/<uuid>.<ext>.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('aperturas-fotos','aperturas-fotos',false,5242880,array['image/png','image/jpeg','image/webp']);
create policy fotos_leer on storage.objects for select to authenticated
 using(bucket_id='aperturas-fotos' and public.ve_compras());
create policy fotos_subir on storage.objects for insert to authenticated
 with check(bucket_id='aperturas-fotos' and public.edita_compras() and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
  and exists(select 1 from public.apertura_proyectos p where p.id::text=(storage.foldername(name))[1]));
create policy fotos_borrar on storage.objects for delete to authenticated
 using(bucket_id='aperturas-fotos' and public.edita_compras() and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
  and exists(select 1 from public.apertura_proyectos p where p.id::text=(storage.foldername(name))[1]));
commit;
