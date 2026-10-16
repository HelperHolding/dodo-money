import type {SupabaseClient} from '@supabase/supabase-js';
export type RazonSocial={rfc:string;razon_social:string;principal:boolean;activa:boolean;razon_social_sucursales:{sucursal_id:string;sucursales:{nombre:string}|null}[]};
export async function leerRazonesSociales(db:SupabaseClient){
 const {data,error}=await db.from('razones_sociales').select('rfc,razon_social,principal,activa,razon_social_sucursales(sucursal_id,sucursales(nombre))').order('principal',{ascending:false}).order('razon_social').returns<RazonSocial[]>();
 if(error)throw Error('No se pudieron consultar las razones sociales. Revisa la migración 0068.');
 return data??[];
}
