"use client";
import { useState } from "react";
import type { Campana } from "@/lib/correos/tipos";
import { TODOS, opcionesEtiqueta } from "@/lib/correos/etiqueta";
import styles from "./correos.module.css";
import { cambiarEstado, guardarCampana, mandarPrueba } from "./acciones";

export function FormCampana({ campana, etiquetas, conteos }: { campana: Campana | null; etiquetas: string[]; conteos: Record<string, number> }) {
  const [html, setHtml] = useState(campana?.html ?? "");
  const [etiqueta, setEtiqueta] = useState(campana?.etiqueta ?? TODOS);
  const [cuando, setCuando] = useState("ahora");
  return <div className={styles.columnas}>
    <form action={guardarCampana} className={`seccion ${styles.panel}`}>
      <h2>Contenido</h2>
      {campana && <input type="hidden" name="id" value={campana.id} />}
      <label>Nombre interno<input name="nombre" required maxLength={120} defaultValue={campana?.nombre} /></label>
      <label>Asunto<input name="asunto" required maxLength={150} defaultValue={campana?.asunto} /></label>
      <label>Archivo HTML de Canva<input type="file" accept=".html,text/html" onChange={async (e) => { const el = e.target, f = el.files?.[0]; if (f) { setHtml(await f.text()); el.value = ""; } }} /></label>
      <label>O pega el HTML<textarea name="html" rows={8} value={html} onChange={(e) => setHtml(e.target.value)} /></label>
      <label>A quién va<select name="etiqueta" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}>
        <option value={TODOS}>Toda la base ({conteos[""] ?? 0})</option>
        {opcionesEtiqueta(etiquetas, campana?.etiqueta ?? null).map((t) => <option key={t} value={t}>{t} ({conteos[t] ?? 0})</option>)}
      </select></label>
      <button type="submit" className="boton">Guardar</button>
    </form>
    <div className={`seccion ${styles.panel}`}>
      <h2>Vista previa</h2>
      <iframe title="Vista previa del correo" sandbox="" srcDoc={html} className={styles.previa} />
      {campana && <>
        <form action={mandarPrueba} className={styles.fila}>
          <input type="hidden" name="id" value={campana.id} />
          <label>Mandar prueba a (hasta 5, separados por coma)<input name="correos" required placeholder="tu@dodopizza.mx" /></label>
          <button type="submit" className="boton">Mandar prueba</button>
        </form>
        {campana.estado === "borrador" && <form action={cambiarEstado} className={styles.fila}>
          <input type="hidden" name="id" value={campana.id} /><input type="hidden" name="accion" value="programar" />
          <input type="hidden" name="volver_a" value={`/correos/${campana.id}/editar`} />
          <fieldset><legend>Cuándo</legend>
            <label><input type="radio" name="cuando" value="ahora" checked={cuando === "ahora"} onChange={() => setCuando("ahora")} /> Enviar ahora</label>
            <label><input type="radio" name="cuando" value="fecha" checked={cuando === "fecha"} onChange={() => setCuando("fecha")} /> Fecha y hora (México)</label>
            {cuando === "fecha" && <input type="datetime-local" name="fecha" required />}
          </fieldset>
          <button type="submit" className="boton">Programar envío</button>
        </form>}
      </>}
    </div>
  </div>;
}
