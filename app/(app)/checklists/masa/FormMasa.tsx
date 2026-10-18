"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { etiquetaHora, type Franja } from "@/lib/franjas";
import { decimal } from "@/lib/formato";
import { TEMPS_AREA, bolasNorma, motivoComentario } from "@/lib/masa";
import type { NormaMasa, TempArea } from "@/lib/tipos";
import { registrarLectura } from "./actions";

const clave = (f: Franja) => `${f.fecha}|${f.hora}`;

export function FormMasa({ franjas, normas }: { franjas: Franja[]; normas: NormaMasa[] }) {
  const [franja, setFranja] = useState(clave(franjas[0]));
  const [tempArea, setTempArea] = useState<TempArea | null>(null);
  const [bolas, setBolas] = useState("");
  const [temperatura, setTemperatura] = useState("");

  const horaElegida = Number(franja.split("|")[1]);
  const norma = normas.find((n) => n.hora === horaElegida);
  const tempNum = decimal(temperatura);
  const motivo = norma && tempArea && bolas !== "" && Number.isFinite(tempNum)
    ? motivoComentario(norma, tempArea, Number(bolas), tempNum)
    : null;

  const completo = !!norma && !!tempArea && bolas !== "" && Number.isFinite(tempNum) && temperatura !== "";

  return (
    <form action={registrarLectura} className="formulario">
      <div className="campo">
        <label htmlFor="franja">Hora</label>
        <select id="franja" name="franja" value={franja} onChange={(e) => setFranja(e.target.value)}>
          {franjas.map((f) => (
            <option key={clave(f)} value={clave(f)}>{etiquetaHora(f.hora)} – {etiquetaHora((f.hora + 1) % 24)}</option>
          ))}
        </select>
        {norma && <small>Norma: {norma.bolas_25} bolas a 25 °C · {norma.bolas_30} a 30 °C · {norma.bolas_35} a 35 °C</small>}
      </div>

      <fieldset className="campo">
        <legend className="etiqueta">Temperatura del área</legend>
        <div className="si-no si-no-grande">
          {TEMPS_AREA.map((t) => (
            <label key={t}>
              <input type="radio" name="temp_area" value={t} required checked={tempArea === t} onChange={() => setTempArea(t)} />
              <span>{t} °C</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rejilla rejilla-corta">
        <div className="campo">
          <label htmlFor="bolas">Bolas sacadas</label>
          <input
            id="bolas" name="bolas" type="number" inputMode="numeric" min="0" step="1" required
            value={bolas} onChange={(e) => setBolas(e.target.value)}
          />
          {norma && tempArea && <small>La norma a {tempArea} °C es {bolasNorma(norma, tempArea)}.</small>}
        </div>
        <div className="campo">
          <label htmlFor="temperatura">Temperatura de la masa (°C)</label>
          <input
            id="temperatura" name="temperatura" inputMode="decimal" required autoComplete="off" placeholder="Ej. 18"
            value={temperatura} onChange={(e) => setTemperatura(e.target.value)}
          />
        </div>
      </div>

      {completo && (
        <p className="veredicto-masa" data-estado={motivo ? "revisar" : "norma"} role="status">
          {motivo ? <>Fuera de norma: {motivo}.</> : <>En norma</>}
        </p>
      )}

      <div className="campo">
        <label htmlFor="comentario">Comentario{motivo ? " (obligatorio)" : ""}</label>
        <textarea
          id="comentario" name="comentario" rows={2} required={!!motivo}
          placeholder="Si sacaste más o menos bolas, o hay problemas con la masa"
        />
        {motivo && <small role="status">Escribe qué pasó: {motivo}.</small>}
      </div>

      <div className="acciones registro-enviar"><BotonEnviar>Registrar temperatura</BotonEnviar></div>
    </form>
  );
}