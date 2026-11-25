-- HD-14: planos de apertura por hoja (E01, E02…) con partidas ubicadas como marcas (x, y en fracción 0–1).
-- Solo se escribe con las funciones (security definer); el bucket privado guarda el original y la imagen.
begin;
set local lock_timeout='5s';

create table public.apertura_planos(
 id uuid primary key default gen_random_uuid(),
 proyecto_id uuid not null references public.apertura_proyectos(id),
 hoja text not null check(hoja ~ '^[A-Za-z0-9._-]{1,20}$'),
 nombre text not null check(length(trim(nombre)) between 1 and 120),
 version_fecha date not null,
 archivo text not null check(length(archivo) between 1 and 300),
 imagen text not null check(length(imagen) between 1 and 300),
 ancho integer not null check(ancho>0),
 alto integer not null check(alto>0),
 revision integer not null default 1 check(revision>=1),
 creado_por uuid,
 creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now(),
 unique(proyecto_id,hoja)
);
create table public.apertura_plano_marcas(
 plano_id uuid not null references public.apertura_planos(id) on delete cascade,
 item_id uuid not null references public.apertura_items(id) on delete cascade,
 x numeric not null check(x>=0 and x<=1),
 y numeric not null check(y>=0 and y<=1),
 actualizado_en timestamptz not null default now(),
 primary key(plano_id,item_id)
);
create index apertura_plano_marcas_item on public.apertura_plano_marcas(item_id);

alter table public.apertura_planos enable row level security;
alter table public.apertura_plano_marcas enable row level security;
create policy ver_apertura_planos on public.apertura_planos for select using(public.ve_compras());
create policy ver_apertura_plano_marcas on public.apertura_plano_marcas for select using(public.ve_compras());
revoke all on public.apertura_planos,public.apertura_plano_marcas from public,anon,authenticated;
grant select on public.apertura_planos,public.apertura_plano_marcas to authenticated;

create function public.guardar_apertura_plano(p_proyecto uuid,p_hoja text,p_nombre text,p_version date,p_archivo text,p_imagen text,p_ancho integer,p_alto integer,p_revision integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_rev integer;v_hoja text:=trim(p_hoja);v_nombre text:=trim(p_nombre);
begin
 if not public.edita_compras() then raise exception 'Solo administración puede subir planos.';end if;
 if not exists(select 1 from public.apertura_proyectos where id=p_proyecto) then raise exception 'La apertura no existe.';end if;
 if v_hoja is null or v_hoja !~ '^[A-Za-z0-9._-]{1,20}$' then raise exception 'La hoja debe tener de 1 a 20 caracteres: letras, números, punto, guion o guion bajo.';end if;
 if v_nombre is null or length(v_nombre) not between 1 and 120 then raise exception 'El nombre debe tener de 1 a 120 caracteres.';end if;
 if p_version is null then raise exception 'Falta la fecha de versión.';end if;
 if p_ancho is null or p_alto is null or p_ancho<=0 or p_alto<=0 then raise exception 'Las medidas de la imagen no son válidas.';end if;
 if p_archivo is null or p_imagen is null or left(p_archivo,length(p_proyecto::text)+1)<>p_proyecto::text||'/' or left(p_imagen,length(p_proyecto::text)+1)<>p_proyecto::text||'/' then
  raise exception 'Las rutas de los archivos deben empezar con la carpeta de la apertura.';end if;
 select id,revision into v_id,v_rev from public.apertura_planos where proyecto_id=p_proyecto and hoja=v_hoja for update;
 if v_id is null then
  if p_revision is not null then raise exception 'La hoja ya no existe; vuelve a cargar.';end if;
  insert into public.apertura_planos(proyecto_id,hoja,nombre,version_fecha,archivo,imagen,ancho,alto,creado_por)
   values(p_proyecto,v_hoja,v_nombre,p_version,p_archivo,p_imagen,p_ancho,p_alto,auth.uid()) returning id into v_id;
  return v_id;
 end if;
 if p_revision is null or p_revision<>v_rev then raise exception 'La hoja cambió; vuelve a cargar.';end if;
 update public.apertura_planos set nombre=v_nombre,version_fecha=p_version,archivo=p_archivo,imagen=p_imagen,ancho=p_ancho,alto=p_alto,revision=revision+1,actualizado_en=now() where id=v_id;
 return v_id;
end $$;

create function public.colocar_apertura_marca(p_plano uuid,p_item uuid,p_x numeric,p_y numeric)
returns void language plpgsql security definer set search_path='' as $$
declare v_proy uuid;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede ubicar partidas.';end if;
 if p_x is null or p_y is null or p_x<0 or p_x>1 or p_y<0 or p_y>1 then raise exception 'La posición debe estar dentro del plano.';end if;
 select proyecto_id into v_proy from public.apertura_planos where id=p_plano;
 if v_proy is null then raise exception 'La hoja no existe.';end if;
 if not exists(select 1 from public.apertura_items where id=p_item and proyecto_id=v_proy) then raise exception 'La partida no es de esta apertura.';end if;
 insert into public.apertura_plano_marcas(plano_id,item_id,x,y) values(p_plano,p_item,p_x,p_y)
  on conflict(plano_id,item_id) do update set x=excluded.x,y=excluded.y,actualizado_en=now();
end $$;

create function public.quitar_apertura_marca(p_plano uuid,p_item uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.edita_compras() then raise exception 'Solo administración puede quitar marcas.';end if;
 delete from public.apertura_plano_marcas where plano_id=p_plano and item_id=p_item;
end $$;

create function public.borrar_apertura_plano(p_plano uuid)
returns table(archivo text,imagen text) language plpgsql security definer set search_path='' as $$
declare v_archivo text;v_imagen text;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede borrar planos.';end if;
 delete from public.apertura_planos p where p.id=p_plano returning p.archivo,p.imagen into v_archivo,v_imagen;
 if not found then raise exception 'La hoja no existe.';end if;
 archivo:=v_archivo;imagen:=v_imagen;return next;
end $$;

revoke all on function public.guardar_apertura_plano(uuid,text,text,date,text,text,integer,integer,integer) from public,anon;
revoke all on function public.colocar_apertura_marca(uuid,uuid,numeric,numeric) from public,anon;
revoke all on function public.quitar_apertura_marca(uuid,uuid) from public,anon;
revoke all on function public.borrar_apertura_plano(uuid) from public,anon;
grant execute on function public.guardar_apertura_plano(uuid,text,text,date,text,text,integer,integer,integer) to authenticated;
grant execute on function public.colocar_apertura_marca(uuid,uuid,numeric,numeric) to authenticated;
grant execute on function public.quitar_apertura_marca(uuid,uuid) to authenticated;
grant execute on function public.borrar_apertura_plano(uuid) to authenticated;

-- Bucket privado: original (PDF/imagen) y la imagen mostrada, en <apertura_id>/<archivo>.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('aperturas-planos','aperturas-planos',false,26214400,array['application/pdf','image/png','image/jpeg']);
create policy planos_leer on storage.objects for select to authenticated
 using(bucket_id='aperturas-planos' and public.ve_compras());
create policy planos_subir on storage.objects for insert to authenticated
 with check(bucket_id='aperturas-planos' and public.edita_compras()
  and exists(select 1 from public.apertura_proyectos p where p.id::text=(storage.foldername(name))[1]));
create policy planos_borrar on storage.objects for delete to authenticated
 using(bucket_id='aperturas-planos' and public.edita_compras());
commit;
