import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeVerCompras} from '@/lib/roles';
import {pesos} from '@/lib/formato';
import {nombreFactura} from '@/lib/compras/facturas';
import {NOMBRE_FORMA_PAGO,type FormaPago} from '@/lib/compras/proveedores';
import {leerTodo} from '@/lib/ventas/paginar';
export const dynamic='force-dynamic';
export const runtime='nodejs';
type Factura={id:string;uuid:string|null;uuid_manual:string|null;origen:'cfdi'|'manual';serie:string|null;folio:string|null;rfc_receptor:string;rfc_emisor:string;nombre_emisor:string;fecha_emision:string;vence_el:string;subtotal:number;descuento:number;iva:number;retenciones:number;total:number;saldo:number;pagado:number;pago_programado_forma:FormaPago|null;estado:string;proveedores:{razon_social:string;nombre_comercial:string|null}|null;sucursales:{nombre:string}|null};
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {supabase,perfil}=await obtenerPerfil();if(!puedeVerCompras(perfil.rol))return new Response('Sin acceso',{status:403});
 const {id}=await params;
 const {data:f,error}=await supabase.from('facturas_saldo').select('id,uuid,uuid_manual,origen,serie,folio,rfc_receptor,rfc_emisor,nombre_emisor,fecha_emision,vence_el,subtotal,descuento,iva,retenciones,total,saldo,pagado,pago_programado_forma,estado,proveedores(razon_social,nombre_comercial),sucursales(nombre)').eq('id',id).maybeSingle<Factura>();
 if(error)return new Response('No se pudo consultar la factura',{status:500});if(!f)return new Response('Factura no encontrada',{status:404});
 const conceptos=await leerTodo<{descripcion:string;cantidad:number;unidad:string;valor_unitario:number;importe:number}>((d,h)=>supabase.from('factura_conceptos').select('descripcion,cantidad,unidad,valor_unitario,importe').eq('factura_id',id).order('id').range(d,h));
 const {data:empresa}=await supabase.from('razones_sociales').select('razon_social').eq('rfc',f.rfc_receptor).maybeSingle<{razon_social:string}>();
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 let page=pdf.addPage([595,842]),y=796;
 const limpiar=(s:string)=>s.replace(/[^\x20-\x7E\xA0-\xFF\n]/g,'-');
 const texto=(s:string,fuerte=false,size=10)=>{
  const fuente=fuerte?bold:font;const palabras=limpiar(s).replace(/\n/g,' ').split(/\s+/);let linea='';
  const dibujar=()=>{if(y<50){page=pdf.addPage([595,842]);y=796;}page.drawText(linea,{x:40,y,size,font:fuente,color:rgb(.08,.08,.08)});y-=size+6;};
  for(const palabra of palabras){
   // Divide también identificadores o descripciones sin espacios que exceden la página.
   for(let i=0;i<palabra.length;i+=65){const parte=palabra.slice(i,i+65);if(linea&&fuente.widthOfTextAtSize(linea+' '+parte,size)>510){dibujar();linea='';}linea+=(linea?' ':'')+parte;}
  }if(linea)dibujar();
 };
 texto('DODO MX',true,20);texto('Reporte interno de factura / prefactura',true,14);
 texto('Generado desde Dodo MX. No sustituye al CFDI ni al PDF del proveedor.');y-=8;
 texto(`Documento: ${nombreFactura(f)} | Estado: ${f.estado}`,true);
 texto(`Proveedor: ${f.proveedores?.razon_social??f.nombre_emisor} | RFC: ${f.rfc_emisor}`);
 texto(`Empresa: ${empresa?.razon_social??f.rfc_receptor} | RFC receptor: ${f.rfc_receptor}`);
 texto(`Destino de la factura: ${f.sucursales?.nombre??'Oficina'}`);
 texto(`Emisión: ${f.fecha_emision} | Vencimiento: ${f.vence_el}`);
 texto(`UUID: ${f.uuid??f.uuid_manual??'Sin UUID'}${!f.uuid&&f.uuid_manual?' (manual; XML pendiente)':''}`);
 texto(`Tipo de pago previsto: ${f.pago_programado_forma?NOMBRE_FORMA_PAGO[f.pago_programado_forma]:'Por definir'}`);y-=10;
 texto('CONCEPTOS REGISTRADOS',true);
 for(const c of conceptos){texto(c.descripcion,true);texto(`${c.cantidad} ${c.unidad??''} | Precio unitario: ${pesos(c.valor_unitario)} | Importe: ${pesos(c.importe)}`);y-=4;}
 y-=8;texto(`Subtotal: ${pesos(f.subtotal)} | Descuento: ${pesos(f.descuento)}`);texto(`IVA: ${pesos(f.iva)} | Retenciones: ${pesos(f.retenciones)}`);
 texto(`Total del documento: ${pesos(f.total)}`,true,12);texto(`Pagado: ${pesos(f.pagado)} | Saldo pendiente: ${pesos(f.saldo)}`,true,12);
 texto(`Consulta: https://dodo-money-j31t.vercel.app/compras/facturas/${f.id}`);
 const paginas=pdf.getPages();paginas.forEach((p,i)=>p.drawText(`Dodo MX | Reporte interno | ${i+1} / ${paginas.length}`,{x:40,y:25,size:8,font,color:rgb(.4,.4,.4)}));
 return new Response(Buffer.from(await pdf.save()),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="Dodo_MX_factura_${f.id}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
