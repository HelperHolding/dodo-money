-- Alta de dodo-2 para asignar compras y obra antes de la apertura.
-- Ejecutar en Supabase SQL Editor como postgres. Requiere migraciones hasta 0036.
-- Repetible: no cambia fondos, saldos, usuarios ni cajas que ya existan.
begin;
do $$
declare s uuid;
begin
 perform pg_advisory_xact_lock(hashtext('alta-sucursal:dodo-2'));
 if (select count(*) from public.sucursales where lower(trim(nombre))='dodo-2')>1 then
   raise exception 'Hay más de una sucursal equivalente a dodo-2. Revisa antes de continuar.';
 end if;
 select id into s from public.sucursales where lower(trim(nombre))='dodo-2';
 if s is null then
   insert into public.sucursales(nombre) values('dodo-2') returning id into s;
 end if;
 insert into public.cajas(sucursal_id,tipo,nombre,saldo_inicial)
 select s,c.tipo::public.tipo_caja,c.nombre,0 from (values
   ('venta','Caja de venta'),('cambios','Fondo de cambios'),('boveda','Bóveda'),
   ('caja_chica','Caja chica'),('corporativo','Corporativo')
 ) c(tipo,nombre)
 on conflict(sucursal_id,tipo) do nothing;
 if (select count(*) from public.cajas where sucursal_id=s)<>5 then
   raise exception 'El alta requiere las cinco cajas de la sucursal.';
 end if;
end $$;
commit;

select 'ALTA OK' as resultado,s.id,s.nombre,s.fondo_caja_venta,s.fondo_cambios,
 s.fondo_caja_chica,s.limite_retiro,count(c.id) as cajas
from public.sucursales s join public.cajas c on c.sucursal_id=s.id
where lower(trim(s.nombre))='dodo-2'
group by s.id;
