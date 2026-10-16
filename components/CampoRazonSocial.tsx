import type {RazonSocial} from '@/lib/compras/razonesSociales';
export function CampoRazonSocial({razones,sucursal}:{razones:RazonSocial[];sucursal?:string}){
 const disponibles=razones.filter(e=>e.activa&&(!sucursal||e.principal||e.razon_social_sucursales.some(s=>s.sucursal_id===sucursal)));
 return <label className="campo">Razón social receptora<select name="rfc_receptor" required defaultValue={disponibles.find(e=>e.principal)?.rfc??""} key={sucursal??"todas"}>
 <option value="" disabled>Elige la empresa de este documento…</option>
 {disponibles.map(e=><option key={e.rfc} value={e.rfc}>{e.razon_social} · {e.rfc}{e.principal?'':` · ${e.razon_social_sucursales.map(s=>s.sucursales?.nombre??'Sucursal').join(', ')}`}</option>)}
 </select><small>La empresa del documento debe coincidir con el RFC receptor de su CFDI.</small></label>;
}
