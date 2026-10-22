import type {SupabaseClient} from '@supabase/supabase-js';
import {leerTodo} from '@/lib/ventas/paginar';
import type {ReporteRappi} from '@/lib/banca/rappi';
export type FinancieroRappi={id:string;sucursal_id:string;rfc:string;desde:string;hasta:string;archivo:string;reporte:ReporteRappi;creado_en:string;motivo:string;sustituida_en:string|null};
export async function leerFinancierosRappi(db:SupabaseClient){
 return leerTodo<FinancieroRappi>((a,b)=>db.from('rappi_fin_importaciones').select('id,sucursal_id,rfc,desde,hasta,archivo,reporte,creado_en,motivo,sustituida_en').is('sustituida_en',null).order('id').range(a,b));
}
