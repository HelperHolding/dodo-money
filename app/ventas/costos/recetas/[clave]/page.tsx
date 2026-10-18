import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import Link from "next/link";
import {notFound} from "next/navigation";
import {catalogoCosteo} from "../../catalogo";
import {FichaReceta} from "../../FichaReceta";
import {buscarPorRuta} from "@/lib/costeo/rutas";
export default async function Receta({params,searchParams}:{params:Promise<{clave:string}>;searchParams:Promise<{version?:string}>}){
 const [p,q]=await Promise.all([params,searchParams]);const {v,recetas}=await catalogoCosteo(q.version);
 const r=buscarPorRuta(recetas,p.clave,r=>r.clave);if(!v||!r)notFound();
 return <><EncabezadoPagina titulo={<>{r.nombre}</>} descripcion="Receta y costeo por versión." />{r.dodo_id!==null?<Link href={`/ventas/costos/productos/${r.dodo_id}?version=${v.id}`}>Ver ficha del producto de venta</Link>:<p className="aviso">Esta receta todavía no está vinculada a un producto de venta.</p>}<FichaReceta v={v} r={r}/></>;
}
