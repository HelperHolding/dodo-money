import {crearClienteServidor} from '@/lib/supabase/server';
import {pesos,fechaMX,fechaTexto} from '@/lib/formato';
type Conversion={original:{folio:string};cfdi:{uuid:string;conceptos:{descripcion:string;cantidad:number;unidad:string;importe:number}[]};motivo:string;confirmado_en:string};
export async function OrigenPrefactura({id}:{id:string}) {
 const supabase=await crearClienteServidor();
 const {data}=await supabase.from('prefactura_conversiones').select('original,cfdi,motivo,confirmado_en').eq('factura_id',id).not('confirmado_en','is',null).maybeSingle<Conversion>();
 if(!data)return null;
 return <section className="seccion"><h2>CFDI asociado a la prefactura</h2><p>Referencia original: {data.original.folio} · convertido {fechaTexto(fechaMX(data.confirmado_en))}</p><p>{data.motivo}</p><h3>Conceptos fiscales del XML</h3><p className="saldo-nota">Referencia fiscal. No suma otra compra ni reemplaza los renglones operativos recibidos.</p><div className="tabla-scroll"><table className="tabla"><thead><tr><th>Concepto</th><th>Cantidad</th><th>Unidad</th><th>Importe</th></tr></thead><tbody>{data.cfdi.conceptos.map((c,i)=><tr key={i}><td>{c.descripcion}</td><td>{c.cantidad}</td><td>{c.unidad}</td><td>{pesos(c.importe)}</td></tr>)}</tbody></table></div></section>;
}
