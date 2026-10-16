begin;
set local lock_timeout='5s';
-- Sin CASCADE: una dependencia no prevista aborta toda la migración.
create temporary table precio_vista_def on commit drop as select pg_get_viewdef('public.renglones_recibido'::regclass,true) as definicion;
create temporary table precio_vista_acl on commit drop as
 select case when a.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end as destinatario,a.privilege_type,a.is_grantable
 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid='public.renglones_recibido'::regclass;
drop view public.renglones_recibido;
alter table public.orden_renglones alter column precio type numeric(14,4);
alter table public.precios_proveedor alter column precio type numeric(14,4);
alter table public.recepciones_dodo alter column precio type numeric(14,4);
do $$
declare v record;
begin
 execute 'create view public.renglones_recibido with (security_invoker=true) as '||(select definicion from precio_vista_def);
 -- Elimina permisos predeterminados de la vista nueva y restaura los anteriores.
 for v in select distinct case when a.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end as destinatario from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid='public.renglones_recibido'::regclass loop
  execute 'revoke all on public.renglones_recibido from '||v.destinatario;
 end loop;
 for v in select * from precio_vista_acl loop
  execute 'grant '||v.privilege_type||' on public.renglones_recibido to '||v.destinatario||case when v.is_grantable then ' with grant option' else '' end;
 end loop;
end $$;
commit;
