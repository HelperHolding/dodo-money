import Link from "next/link";
import {catalogoCosteo} from "../catalogo";
import {CalculadoraPromociones} from "../CalculadoraPromociones";
import {CalculadoraMargen} from "../CalculadoraMargen";
import {CalculadoraCombo} from "../CalculadoraCombo";
import {ultimosPreciosCosteo,preciosPOSDodo} from "../precios";
import {comisionRappiVigente,comisionPOSVigente} from "../comision";
import {FichaPestanas} from "@/components/FichaPestanas";
import {leerTodo} from "@/lib/ventas/paginar";
import {costoVigente} from "@/lib/ventas/calculos";
import {fechaTexto} from "@/lib/formato";
export default async function Calculadoras({searchParams}:{searchParams:Promise<{producto?:string;calculadora?:string}>}){
 const q=await searchParams,{supabase,hoy,recetas}=await catalogoCosteo();
 const [productos,costos,preciosRappi,comision,terminal,preciosPOS]=await Promise.all([
  leerTodo<{dodo_id:number;nombre:string}>((a,b)=>supabase.from("productos_venta").select("dodo_id,nombre").order("nombre").order("dodo_id").range(a,b)),
  leerTodo<{dodo_id:number;costo:number;vigente_desde:string;fuente:string|null}>((a,b)=>supabase.from("costos_producto").select("dodo_id,costo,vigente_desde,fuente").order("dodo_id").order("vigente_desde",{ascending:false}).range(a,b)),
  ultimosPreciosCosteo(supabase,hoy),
  comisionRappiVigente(supabase,hoy),
  comisionPOSVigente(supabase,hoy),
  preciosPOSDodo(supabase,hoy),
 ]);
 const porProducto=new Map<number,typeof costos>();for(const c of costos)porProducto.set(c.dodo_id,[...(porProducto.get(c.dodo_id)??[]),c]);
 const id=q.producto&&/^\d+$/.test(q.producto)?Number(q.producto):undefined;
 const referencia=recetas.find(r=>r.dodo_id===id);
 const lista=productos.map(p=>{const c=costoVigente(porProducto.get(p.dodo_id)??[],hoy);return {id:p.dodo_id,nombre:p.nombre,costo:c?Number(c.costo):null,desde:c?.vigente_desde??null,fuente:c?.fuente??null,pos:preciosPOS.get(p.dodo_id)?.precio??recetas.find(r=>r.dodo_id===p.dodo_id)?.receta.precioVenta??null,rappi:preciosRappi.get(p.dodo_id)?.precio??null};});
 const comisionRappi=comision?.pct??null,comisionPOS=terminal?.pct??null;
 return <><div className="encabezado ficha-encabezado"><h1>Calculadoras</h1><p>Juega con el precio de un producto, una promoción o un combo y ve su margen al instante. Nada de lo que captures aquí cambia los precios ni los costos registrados.</p></div>
 <div className="acciones"><Link className="boton boton-secundario" href="/ventas/costos">Volver a costeo</Link></div>
 <p className="saldo-nota">Comisión Rappi vigente: {comision?`${comision.pct.toLocaleString("es-MX",{maximumFractionDigits:2})} % sobre el precio con IVA, desde ${fechaTexto(comision.desde)} (Finanzas → Parámetros)`:"sin parámetro vigente; captura una comisión para simular Rappi"}. Comisión POS: {terminal?`terminal ${terminal.tasaPct.toLocaleString("es-MX",{maximumFractionDigits:2})} % sobre el ${terminal.tarjetaPct.toLocaleString("es-MX",{maximumFractionDigits:1})} % de la venta cobrado con tarjeta en los últimos 30 días = ${terminal.pct.toLocaleString("es-MX",{maximumFractionDigits:2})} % del precio con IVA`:"sin ventas recientes para estimarla"}. POS: último precio de lista cobrado en tienda según Dodo IS (60 días); sin ventas en ese periodo, el del Excel del BOM. Rappi: lista oficial vigente o, sin ella, último precio observado.</p>
 <FichaPestanas key={q.calculadora??"margen"} etiqueta="Calculadoras" inicial={q.calculadora} pestanas={[
  {id:"margen",titulo:"Margen por precio",contenido:<CalculadoraMargen productos={lista} inicial={id} comisionRappi={comisionRappi} comisionPOS={comisionPOS}/>},
  {id:"promocion",titulo:"Promoción",contenido:<><CalculadoraPromociones inicial={id} precioInicial={lista.find(p=>p.id===id)?.pos??null} comisionRappi={comisionRappi} comisionPOS={comisionPOS} productos={lista}/>{referencia&&<p className="saldo-nota">Precio inicial: precio POS de Dodo IS o, sin ventas recientes, del Excel del BOM. Confirma el precio del canal que vas a simular.</p>}</>},
  {id:"combo",titulo:"Combo",contenido:<CalculadoraCombo productos={lista} comisionRappi={comisionRappi} comisionPOS={comisionPOS}/>},
 ]}/></>;
}
