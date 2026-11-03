-- Ernesto Marín (Cacho) acepta en corporativo sin ser corporativo. Correr después de 20261103120000_acepta_como_corporativo.sql y su prueba.
-- Solo cambia la bandera si hay exactamente un admin activo con ese nombre; si no, se detiene sin tocar nada.
do $$
declare n int; e uuid;
begin
 select count(*),min(id::text)::uuid into n,e from public.perfiles where nombre ilike '%ernesto%' and nombre ilike '%mar_n%' and activo and rol::text='admin';
 if n<>1 then raise exception 'Se encontraron % admins activos llamados Ernesto Marín; se esperaba 1. No se cambió nada.',n;end if;
 update public.perfiles set acepta_como_corporativo=true where id=e;
end $$;
select nombre,rol,activo,acepta_como_corporativo from public.perfiles where acepta_como_corporativo;
