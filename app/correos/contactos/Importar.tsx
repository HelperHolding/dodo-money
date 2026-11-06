"use client";
import { useEffect, useState } from "react";
import styles from "../correos.module.css";
import { decodificarCsv } from "@/lib/correos/decodificar";
import { importarCsv } from "./acciones";

/** Sube el CSV, muestra la previa del servidor y confirma con el mismo contenido. */
export function Importar({ previa, huella, origen, etiquetaExtra }: { previa: string | null; huella: string; origen: string; etiquetaExtra: string }) {
  const [contenido, setContenido] = useState("");
  const [nombre, setNombre] = useState(origen);
  const [aviso, setAviso] = useState("");
  const [archivoNuevo, setArchivoNuevo] = useState(false);
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
      <input type="file" accept=".csv,text/csv" onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        setArchivoNuevo(true); setAviso("");
        if (f.size > 4_500_000) { setContenido(""); setAviso("El archivo pesa más de 4.5 MB; divídelo en partes."); return; }
        const t = decodificarCsv(await f.arrayBuffer()); setContenido(t); setNombre(f.name);
        try { sessionStorage.setItem("correos-csv", t); } catch { setAviso("No se pudo guardar el archivo en el navegador; si no deja confirmar, vuelve a elegirlo."); }
      }} />
      {aviso && <p><small>{aviso}</small></p>}
      <textarea name="contenido" value={contenido} readOnly hidden /><input type="hidden" name="origen" value={nombre} />
      <label>Agregar esta etiqueta a todos (opcional)<input name="etiquetaExtra" defaultValue={etiquetaExtra} /></label>
      <input type="hidden" name="confirmar" value="0" />
      <button className="boton" type="submit" disabled={!contenido}>Revisar</button>
    </form>
    {previa && !archivoNuevo && <form action={importarCsv} className={styles.fila}>
      <p>{previa}</p>
      <textarea name="contenido" value={contenido} readOnly hidden /><input type="hidden" name="origen" value={nombre} />
      <input type="hidden" name="etiquetaExtra" value={etiquetaExtra} /><input type="hidden" name="confirmar" value="1" /><input type="hidden" name="huella" value={huella} />
      <button className="boton" type="submit" disabled={!contenido}>Confirmar importación</button>
    </form>}
  </section>;
}
