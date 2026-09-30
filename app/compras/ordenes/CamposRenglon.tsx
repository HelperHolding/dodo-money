"use client";

import { useState } from "react";

/** Al elegir el artículo propone el último precio de este proveedor; se puede cambiar o dejar vacío. */
export function CamposRenglon({ articulos, precios }: {
  articulos: { id: string; nombre: string; unidad: string }[]; precios: Record<string, number>;
}) {
  const [precio, setPrecio] = useState("");
  const [ultimo, setUltimo] = useState<number | null>(null);
  return (
    <div className="rejilla">
      <div className="campo">
        <label htmlFor="articulo_id">Artículo</label>
        <select id="articulo_id" name="articulo_id" required defaultValue=""
          onChange={(e) => { const p = precios[e.target.value]; setUltimo(p ?? null); setPrecio(p ? String(p) : ""); }}>
          <option value="" disabled>Elige…</option>
          {articulos.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({a.unidad})</option>)}
        </select>
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
