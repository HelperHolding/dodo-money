"use client";

import Link from "next/link";
import { useActionState } from "react";
import { subirFacturas, type ResultadoSubida } from "../acciones";

export function FormSubir() {
  const [estado, enviar, pendiente] = useActionState<ResultadoSubida | null, FormData>(subirFacturas, null);
  return (
    <form action={enviar} className="seccion formulario">
      <div className="campo">
        <label htmlFor="archivos">XML de las facturas (y su PDF, con el mismo nombre)</label>
        <input id="archivos" name="archivos" type="file" accept=".xml,.pdf" multiple required />
        <small>Puedes elegir varios a la vez. Las notas de crédito también se suben aquí.</small>
      </div>
      <label className="campo"><span><input type="checkbox" name="alta_proveedor" value="si" defaultChecked /> Dar de alta a los proveedores que no estén en la cartera</span></label>
      {estado && (
        <ul className="seccion" style={{ listStyle: "none", paddingLeft: 0, display: "grid", gap: 8 }}>
          {estado.resultados.map((r, i) => (
            <li key={i} className={r.ok ? "aviso aviso-ok texto-partible" : "aviso aviso-error texto-partible"}>
              {r.archivo && <strong>{r.archivo}: </strong>}{r.texto}{r.id && <> <Link href={`/compras/facturas/${r.id}`}>Ver</Link></>}
            </li>
          ))}
        </ul>
      )}
      <button className="boton" type="submit" disabled={pendiente}>{pendiente ? "Subiendo…" : "Subir facturas"}</button>
    </form>
  );
}
