"use client";

import { useState } from "react";
import {AltaArticuloModal} from "./AltaArticuloModal";

/**
 * Al elegir el artículo propone el último precio de este proveedor; se puede cambiar o dejar vacío.
 * Primero van los artículos que surte este proveedor; los demás siguen disponibles abajo.
 */
export function CamposRenglon({ articulos, precios, surtidos = [], ordenId }: {
  ordenId:string;
  articulos: { id: string; nombre: string; unidad: string }[]; precios: Record<string, number>; surtidos?: string[];
}) {
  const suyos = new Set(surtidos);
  const [nuevos,setNuevos]=useState<typeof articulos>([]);
  const [seleccionado,setSeleccionado]=useState("");
  const catalogo=[...articulos,...nuevos.filter(n=>!articulos.some(a=>a.id===n.id))];
  const opcion = (a: { id: string; nombre: string; unidad: string }) => <option key={a.id} value={a.id}>{a.nombre} ({a.unidad})</option>;
  const [precio, setPrecio] = useState("");
  const [ultimo, setUltimo] = useState<number | null>(null);
  return (
    <div className="rejilla">
      <div className="campo">
        <label htmlFor="articulo_id">Artículo</label>
        <select id="articulo_id" name="articulo_id" required value={seleccionado}
          onChange={(e) => { setSeleccionado(e.target.value); const p = precios[e.target.value]; setUltimo(p ?? null); setPrecio(p ? String(p) : ""); }}>
          <option value="" disabled>Elige…</option>
          {suyos.size > 0 ? (
            <>
              <optgroup label="Los surte este proveedor">{catalogo.filter((a) => suyos.has(a.id)).map(opcion)}</optgroup>
              <optgroup label="Otros artículos">{catalogo.filter((a) => !suyos.has(a.id)).map(opcion)}</optgroup>
            </>
          ) : catalogo.map(opcion)}
        </select>
        <div className="acciones"><AltaArticuloModal ordenId={ordenId} alCrear={a=>{setNuevos(v=>[...v,a]);setSeleccionado(a.id);setPrecio("");setUltimo(null);}}/></div>
      </div>
      <div className="campo">
        <label htmlFor="cantidad">Cantidad</label>
        <input id="cantidad" name="cantidad" inputMode="decimal" required />
      </div>
      <div className="campo">
        <label htmlFor="precio">Precio unitario sin IVA</label>
        <input id="precio" name="precio" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Vacío si aún no lo sabes" />
        {ultimo !== null && <small>Última compra a este proveedor: ${ultimo.toFixed(2)}</small>}
      </div>
    </div>
  );
}
