import type {SupabaseClient} from '@supabase/supabase-js';
export async function precioMenuRappi(supabase:SupabaseClient,id:number,fecha:string){
 const {data:v,error}=await supabase.from('menu_rappi_versiones').select('id,vigente_desde,archivo').lte('vigente_desde',fecha).order('vigente_desde',{ascending:false}).limit(1).maybeSingle();
 if(error){if(['42P01','PGRST205'].includes(error.code))return null;throw Error('No se pudo consultar el menú Rappi.');}if(!v)return null;
 const {data:p,error:ep}=await supabase.from('menu_rappi_productos').select('id,nombre,tamano,precio').eq('version_id',v.id).eq('dodo_id',id).maybeSingle();if(ep)throw Error('No se pudo consultar el precio Rappi.');
 return p?{...p,version:v}:null;
}
