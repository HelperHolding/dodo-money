import Link from "next/link";
import {catalogoCosteo} from "../catalogo";
import {CalculadoraPromociones} from "../CalculadoraPromociones";
import {leerTodo} from "@/lib/ventas/paginar";
import {costoVigente} from "@/lib/ventas/calculos";
export default async function Calculadora({searchParams}:{searchParams:Promise<{producto?:string}>}){
 const q=await searchParams,{supabase,hoy,recetas}=await catalogoCosteo();
 const [productos,costos]=await Promise.all([
  leerTodo<{dodo_id:number;nombre:string}>((a,b)=>supabase.from("productos_venta").select("dodo_id,nombre").order("nombre").order("dodo_id").range(a,b)),
  leerTodo<{dodo_id:number;costo:number;vigente_desde:string;fuente:string|null}>((a,b)=>supabase.from("costos_producto").select("dodo_id,costo,vigente_desde,fuente").order("dodo_id").order("vigente_desde",{ascending:false}).range(a,b)),
 ]);
 const porProducto=new Map<number,typeof costos>();for(const c of costos)porProducto.set(c.dodo_id,[...(porProducto.get(c.dodo_id)??[]),c]);
 const id=q.producto&&/^\d+$/.test(q.producto)?Number(q.producto):undefined;
 const referencia=recetas.find(r=>r.dodo_id===id);
 return <><div className="encabezado ficha-encabezado"><h1>Calculadora de promociones</h1><p>Precio, descuento y contribución por promoción.</p></div><div className="acciones"><Link className="boton boton-secundario" href="/ventas/costos">Volver a costeo</Link></div><CalculadoraPromociones inicial={id} precioInicial={referencia?.receta.precioVenta??null} productos={productos.map(p=>{const c=costoVigente(porProducto.get(p.dodo_id)??[],hoy);return {id:p.dodo_id,nombre:p.nombre,costo:c?Number(c.costo):null,desde:c?.vigente_desde??null,fuente:c?.fuente??null};})}/>{referencia&&<p className="saldo-nota">Precio inicial: referencia POS del BOM vigente. Confirma el precio del canal que vas a simular.</p>}</>;
}
