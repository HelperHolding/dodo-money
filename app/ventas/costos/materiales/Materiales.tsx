import { pesos } from "@/lib/formato";
import type { Material,Insumo } from "@/lib/costeo/bom";
import Link from "next/link";
import {insumoDeMaterial} from "@/lib/costeo/trazabilidad";
import {fichaInsumo} from "@/lib/costeo/enlaces";
const cantidad = (n:number|null) => n === null ? "Pendiente" : n.toLocaleString("es-MX",{maximumFractionDigits:4});
export function Materiales({items,insumos=[],version}:{items:readonly Material[];insumos?:readonly Insumo[];version?:string}) {
  return <div className="tabla-contenedor"><table className="tabla tabla-tarjetas">
    <thead><tr><th>Material</th><th className="monto">Cantidad</th><th className="monto">Precio unitario</th><th className="monto">Costo</th></tr></thead>
    <tbody>{items.map((m,n)=><tr key={n}>
      <td data-label="Material"><span className="celda-pila"><strong>{version&&insumoDeMaterial(m,insumos)?<Link href={fichaInsumo(version,insumoDeMaterial(m,insumos)!.referencia)}>{m.nombre.replace(/🚨/g,"")}</Link>:m.nombre.replace(/🚨/g,"")}</strong><small className="pl-pct">{m.porciones !== null ? `${cantidad(m.porciones)} × ` : ""}{m.medida} · {m.referencia}</small></span></td>
      <td data-label="Cantidad" className="monto">{cantidad(m.cantidad)} {m.unidad ?? ""}</td>
      <td data-label="Precio unitario" className="monto">{m.precio===null ? "Pendiente" : pesos(m.precio)} / {m.unidad === "g" ? "kg" : m.unidad ?? "?"}</td>
      <td data-label="Costo" className="monto">{m.importe===null ? "Pendiente" : pesos(m.importe)}</td>
    </tr>)}</tbody>
  </table></div>;
}
