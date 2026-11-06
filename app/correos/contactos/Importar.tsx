"use client";
import { useEffect, useState } from "react";
import styles from "../correos.module.css";
import { importarCsv } from "./acciones";

/** Sube el CSV, muestra la previa del servidor y confirma con el mismo contenido. */
export function Importar({ previa, origen, etiquetaExtra }: { previa: string | null; origen: string; etiquetaExtra: string }) {
  const [contenido, setContenido] = useState("");
  const [nombre, setNombre] = useState(origen);
  // Con previa se recupera el archivo guardado; sin ella (carga nueva o importación terminada) se descarta.
  useEffect(() => {
    try {
      if (previa) setContenido(sessionStorage.getItem("correos-csv") ?? "");
      else sessionStorage.removeItem("correos-csv");
    } catch {}
  }, [previa]);
  return <section className={styles.fila}>
    <h2>Importar CSV</h2>
    <p><small>Columnas: correo (obligatoria), nombre, etiquetas. Los dados de baja no se reactivan. Máximo 20 000 contactos y 5 MB.</small></p>
    <form action={importarCsv} className={styles.fila}>
      <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const t = await f.text(); setContenido(t); setNombre(f.name); try { sessionStorage.setItem("correos-csv", t); } catch {} }} />
      <textarea name="contenido" value={contenido} readOnly hidden /><input type="hidden" name="origen" value={nombre} />
      <label>Agregar esta etiqueta a todos (opcional)<input name="etiquetaExtra" defaultValue={etiquetaExtra} /></label>
      <input type="hidden" name="confirmar" value="0" />
      <button className="boton" type="submit" disabled={!contenido}>Revisar</button>
    </form>
    {previa && <form action={importarCsv} className={styles.fila}>
      <p>{previa}</p>
      <textarea name="contenido" value={contenido} readOnly hidden /><input type="hidden" name="origen" value={nombre} />
      <input type="hidden" name="etiquetaExtra" value={etiquetaExtra} /><input type="hidden" name="confirmar" value="1" />
      <button className="boton" type="submit" disabled={!contenido}>Confirmar importación</button>
    </form>}
  </section>;
}
