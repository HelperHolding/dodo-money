"use client";

import { useActionState } from "react";
import { importarRecepciones, type ResultadoImportacion } from "./acciones";

export function FormImportarRecepciones() {
  const [resultado, enviar, pendiente] = useActionState<ResultadoImportacion | null, FormData>(importarRecepciones, null);
  return (
    <form action={enviar} className="seccion formulario">
      <div className="campo">
        <label htmlFor="archivo-recepciones">Incoming supplies de Dodo IS</label>
        <input id="archivo-recepciones" name="archivo" type="file" accept=".xlsx" required />
        <small>Dodo IS → Informes → Incoming supplies, del periodo que quieras. Los días que ya estaban se reemplazan (y se pierden sus ligas manuales).</small>
      </div>
      {resultado?.errores && (
        <div className="aviso aviso-error" role="alert"><p>No se guardó nada:</p><ul>{resultado.errores.map((e) => <li key={e}>{e}</li>)}</ul></div>
      )}
      {resultado?.ok && <p className="aviso aviso-ok" role="status">{resultado.ok}</p>}
      <button className="boton" type="submit" disabled={pendiente}>{pendiente ? "Importando…" : "Importar recepciones"}</button>
    </form>
  );
}
