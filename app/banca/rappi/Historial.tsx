import type {SupabaseClient} from '@supabase/supabase-js';
export async function HistorialFinRappi({db}:{db:SupabaseClient}){
 const {data,error}=await db.from('rappi_fin_importaciones').select('id,archivo,rfc,desde,hasta,motivo,sustituida_en,creado_en').order('creado_en',{ascending:false}).limit(20);
 if(error)throw Error('No se pudo consultar el historial financiero Rappi.');
 return <details className="seccion"><summary>Historial de reportes financieros · últimas 20 versiones</summary><ul>{data?.map(f=><li key={f.id}><a href={`/banca/rappi/${f.id}/archivo`}>{f.archivo}</a> · {f.rfc} · {f.desde} al {f.hasta} · {f.sustituida_en?'Sustituida, conservada como respaldo':'Activa'} · {f.motivo}</li>)}</ul></details>;
}
