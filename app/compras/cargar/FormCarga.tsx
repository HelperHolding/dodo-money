"use client";

import Link from "next/link";
import { useActionState } from "react";
import { cargarProveedores, type ResultadoCarga } from "./acciones";

export function FormCarga() {
  const [resultado, enviar, pendiente] = useActionState<ResultadoCarga | null, FormData>(cargarProveedores, null);
  return (
    <form action={enviar} className="seccion formulario">
      <div className="campo">
        <label htmlFor="archivo">Excel de proveedores</label>
        <input id="archivo" name="archivo" type="file" accept=".xlsx" required />
      </div>
      {resultado?.errores && (
        <div className="aviso aviso-error" role="alert">
          <p>No se guardó ningún proveedor. Corrige esto y vuelve a subir el archivo:</p>
          <ul>{resultado.errores.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>
          {resultado.errores.length > 20 && <p>…y {resultado.errores.length - 20} más.</p>}
        </div>
      )}
      {resultado?.ok && <p className="aviso aviso-ok" role="status">{resultado.ok} <Link href="/compras">Ver proveedores</Link></p>}
      <button className="boton" type="submit" disabled={pendiente}>{pendiente ? "Cargando…" : "Cargar proveedores"}</button>
    </form>
  );
}
