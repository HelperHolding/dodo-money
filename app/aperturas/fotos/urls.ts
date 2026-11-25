import {crearClienteServidor} from '@/lib/supabase/server';

/** URLs firmadas de 1 h para las fotos del bucket privado, en una sola llamada. Si falla, {} y las fotos no se muestran. */
export async function urlsFotos(rutas:string[]):Promise<Record<string,string>> {
 const unicas=[...new Set(rutas.filter(Boolean))];
 if(!unicas.length)return {};
 try{
  const supabase=await crearClienteServidor();
  const {data,error}=await supabase.storage.from('aperturas-fotos').createSignedUrls(unicas,3600);
  if(error||!data)return {};
  const salida:Record<string,string>={};
  for(const d of data)if(d.path&&d.signedUrl&&!d.error)salida[d.path]=d.signedUrl;
  return salida;
 }catch{return {};}
}
