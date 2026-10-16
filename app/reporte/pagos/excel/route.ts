import {obtenerPerfil} from '@/lib/contexto';
import {puedeVerCompras} from '@/lib/roles';
import {hoyCalendarioMX,fechaMX,hora} from '@/lib/formato';
import {cargarCorrida} from '@/app/compras/pagos/cargarCorrida';
import {libroCorrida,validarFiltroCorrida,type FiltroCorrida} from '@/lib/compras/corridaPagos';
import {escribirXlsx} from '@/lib/xlsx-escribir';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeVerCompras(perfil.rol))return new Response('Sin permiso',{status:403});
 const q=new URL(request.url).searchParams;
 const filtro:FiltroCorrida={desde:q.get('desde')??'',hasta:q.get('hasta')??'',fecha:q.get('fecha')??hoyCalendarioMX(),proveedor:q.get('proveedor')??'',sucursal:q.get('sucursal')??'',complemento:q.get('complemento')??''};
 const error=validarFiltroCorrida(filtro);if(error)return new Response(error,{status:400});
 const ahora=new Date().toISOString();
 const filas=await cargarCorrida(supabase,filtro,hoyCalendarioMX());
 const libro=libroCorrida(filas,filtro,`${fechaMX(ahora)} ${hora(ahora)} (México)`);
 const bytes=escribirXlsx(libro.hojas,{nombres:libro.nombres});
 return new Response(Buffer.from(bytes),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="Corrida_de_Pagos_${filtro.desde}_a_${filtro.hasta}.xlsx"`,'Cache-Control':'private, no-store'}});
}
