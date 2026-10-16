-- Solo consulta: no modifica facturas ni da de alta razones sociales.
select
 f.rfc_receptor,
 quote_literal(f.rfc_receptor) as rfc_tal_como_se_guardo,
 count(*) as documentos,
 count(*) filter(where f.origen='cfdi') as con_xml,
 count(*) filter(where f.origen='manual') as sin_cfdi,
 string_agg(distinct coalesce(s.nombre,'Oficina'),', ') as sucursales,
 min(f.fecha_emision) as primera_fecha,
 max(f.fecha_emision) as ultima_fecha
from public.facturas f
left join public.sucursales s on s.id=f.sucursal_id
where not exists(select 1 from public.empresa e where e.rfc=f.rfc_receptor)
 and f.rfc_receptor<>'CMS230321FI8'
group by f.rfc_receptor
order by documentos desc,f.rfc_receptor;
