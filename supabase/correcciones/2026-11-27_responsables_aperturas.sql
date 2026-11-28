-- Limpieza de responsables de aperturas (HD-27). Correr en el SQL Editor de Supabase DESPUÉS de la migración 20261127160000_aperturas_responsables.
-- Convierte el texto libre apertura_items.responsable en un responsable del catálogo (responsable_id). El trigger de sincronización
-- deja el texto igual al nombre del catálogo. Los registros sin responsable se quedan sin responsable.
-- Las equivalencias están en el values de cada bloque (mismo contenido en los dos): texto actual, responsable del catálogo,
-- nombre exacto del usuario en perfiles (null = externo, sin usuario) y nota opcional para los textos compuestos.
-- Idempotente: una segunda corrida no duplica el catálogo (los nombres ya canónicos también están en la lista).

-- ============ BLOQUE 1: REVISIÓN (solo lectura). Corre esto primero. ============
with equiv(texto, responsable, usuario, nota) as (values
 ('Julio Verdeja','Julio Verdeja','Julio Verdeja',null),
 ('Julio Veredeja','Julio Verdeja','Julio Verdeja',null),
 ('Diego Michel','Diego Michel',null,null),
 ('Ricardo Villa','Ricardo Villa','Ricardo Villa',null),
 ('José Villa','José Villa',null,null),
 ('Sebastián Cervera','Sebastián Cervera','Sebastián Cervera',null),
 ('Diego Barreto','Diego Barreto',null,null),
 ('Diego Barreto (CFE) / Julio Verdeja (UVIE)','Diego Barreto',null,'UVIE: Julio Verdeja'),
 ('César','César',null,null),
 ('César (360°)','César',null,null),
 ('Sebas (TI) / César','César',null,'TI: Sebastián'),
 ('Equipo marketing','Equipo marketing',null,null),
 ('Adrian Flores','Adrian Flores','Adrian Flores',null),
 ('Gaby Landeros','Gaby Landeros',null,null),
 ('Halim Simon','Halim Simon','Halim Simon',null),
 ('Renata','Renata Perez','Renata Perez',null),
 ('Renata Perez','Renata Perez','Renata Perez',null)
)
select btrim(i.responsable) as texto_actual, count(*) as registros,
 coalesce(e.responsable,'*** SIN EQUIVALENCIA: agrégalo al values del bloque 2 ***') as responsable_propuesto,
 case when e.texto is null then '' when e.usuario is null then 'externo' else 'usuario: '||e.usuario end as tipo, e.nota
from public.apertura_items i left join equiv e on e.texto=btrim(i.responsable)
where btrim(coalesce(i.responsable,''))<>''
group by btrim(i.responsable), e.texto, e.responsable, e.usuario, e.nota
order by registros desc;

select count(*) as registros_con_texto from public.apertura_items where btrim(coalesce(responsable,''))<>'';

-- ============ BLOQUE 2: APLICACIÓN. Pon registros_con_texto del bloque 1 en v_esperado y corre todo junto. ============
begin;
do $$
declare
 v_esperado integer := 0; -- ← pon aquí registros_con_texto del bloque 1
 v_actuales integer;
 v_filas integer;
 v_sin text;
 v_faltan integer;
 r record;
 v_perfil uuid;
 v_n integer;
begin
 if v_esperado = 0 then
  raise exception 'Falta poner registros_con_texto del bloque 1 en v_esperado. Nada se guardó.';
 end if;
 create temporary table equiv on commit drop as select * from (values
  ('Julio Verdeja','Julio Verdeja','Julio Verdeja',null),
  ('Julio Veredeja','Julio Verdeja','Julio Verdeja',null),
  ('Diego Michel','Diego Michel',null,null),
  ('Ricardo Villa','Ricardo Villa','Ricardo Villa',null),
  ('José Villa','José Villa',null,null),
  ('Sebastián Cervera','Sebastián Cervera','Sebastián Cervera',null),
  ('Diego Barreto','Diego Barreto',null,null),
  ('Diego Barreto (CFE) / Julio Verdeja (UVIE)','Diego Barreto',null,'UVIE: Julio Verdeja'),
  ('César','César',null,null),
  ('César (360°)','César',null,null),
  ('Sebas (TI) / César','César',null,'TI: Sebastián'),
  ('Equipo marketing','Equipo marketing',null,null),
  ('Adrian Flores','Adrian Flores','Adrian Flores',null),
  ('Gaby Landeros','Gaby Landeros',null,null),
  ('Halim Simon','Halim Simon','Halim Simon',null),
  ('Renata','Renata Perez','Renata Perez',null),
  ('Renata Perez','Renata Perez','Renata Perez',null)
 ) as v(texto, responsable, usuario, nota);

 select count(*) into v_actuales from public.apertura_items where btrim(coalesce(responsable,''))<>'';
 if v_actuales <> v_esperado then
  raise exception 'Hay % registros con responsable y esperabas %. Nada se guardó.', v_actuales, v_esperado;
 end if;

 select string_agg(distinct '«'||btrim(i.responsable)||'»', ', ') into v_sin
 from public.apertura_items i
 where btrim(coalesce(i.responsable,''))<>'' and not exists(select 1 from equiv e where e.texto=btrim(i.responsable));
 if v_sin is not null then
  raise exception 'Estos textos de responsable no tienen equivalencia: %. Agrégalos al values. Nada se guardó.', v_sin;
 end if;

 -- Usuarios: nombre exacto y activo, una sola coincidencia.
 for r in select distinct usuario from equiv where usuario is not null loop
  select count(*) into v_n from public.perfiles where nombre=r.usuario and activo;
  if v_n <> 1 then
   raise exception 'El usuario «%» no tiene exactamente una coincidencia activa en perfiles (hay %). Nada se guardó.', r.usuario, v_n;
  end if;
 end loop;

 -- Catálogo: crea los que faltan; si ya existe uno con ese nombre, debe ser del mismo tipo.
 for r in select distinct responsable, usuario from equiv loop
  v_perfil := null;
  if r.usuario is not null then
   select id into v_perfil from public.perfiles where nombre=r.usuario and activo;
  end if;
  if exists(select 1 from public.apertura_responsables where lower(btrim(nombre))=lower(btrim(r.responsable))) then
   if exists(select 1 from public.apertura_responsables where lower(btrim(nombre))=lower(btrim(r.responsable)) and perfil_id is distinct from v_perfil) then
    raise exception 'El responsable «%» ya existe en el catálogo con otro usuario. Revísalo. Nada se guardó.', r.responsable;
   end if;
  else
   insert into public.apertura_responsables(nombre, perfil_id, externo, activo) values(r.responsable, v_perfil, v_perfil is null, true);
  end if;
 end loop;

 -- Asigna responsable_id (el trigger copia el nombre del catálogo al texto) y agrega la nota de los compuestos una sola vez.
 update public.apertura_items i
 set responsable_id = c.id,
     notas = case when e.nota is not null and coalesce(i.notas,'') not like '%'||e.nota||'%'
                  then coalesce(nullif(i.notas,'')||E'\n','')||e.nota else i.notas end
 from equiv e join public.apertura_responsables c on lower(btrim(c.nombre))=lower(btrim(e.responsable))
 where btrim(coalesce(i.responsable,''))<>'' and e.texto=btrim(i.responsable);
 get diagnostics v_filas = row_count;
 if v_filas <> v_esperado then
  raise exception 'Se actualizaron % registros y esperabas %. Nada se guardó.', v_filas, v_esperado;
 end if;

 select count(*) into v_faltan from public.apertura_items where btrim(coalesce(responsable,''))<>'' and responsable_id is null;
 if v_faltan > 0 then
  raise exception 'Quedaron % registros con responsable sin responsable_id. Nada se guardó.', v_faltan;
 end if;
 raise notice 'Responsables asignados en % registros.', v_filas;
end
$$;
commit;
