"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { RANGOS_AMASADO, motivoAmasado } from "@/lib/amasado";
import { decimal } from "@/lib/formato";
import { TEMPS_AREA } from "@/lib/masa";
import { registrarLote } from "./actions";

const TEMPS = [
  { k: "temp_sala", clave: "sala", texto: "Temperatura de la pizzería" },
  { k: "temp_harina", clave: "harina", texto: "Temperatura de la harina" },
  { k: "temp_agua", clave: "agua", texto: "Temperatura del agua" },
  { k: "temp_masa", clave: "masa", texto: "Temperatura de la masa" },
] as const;
const GRAMOS = [
  { k: "g_agua", texto: "Agua" }, { k: "g_sal", texto: "Sal" }, { k: "g_azucar", texto: "Azúcar" },
  { k: "g_aceite", texto: "Aceite" }, { k: "g_harina", texto: "Harina" }, { k: "g_levadura", texto: "Levadura" },
] as const;

export function FormAmasado() {
  const [temps, setTemps] = useState<Record<string, string>>({});
  const numeros = { sala: decimal(temps.temp_sala ?? ""), harina: decimal(temps.temp_harina ?? ""), agua: decimal(temps.temp_agua ?? ""), masa: decimal(temps.temp_masa ?? "") };
  const completas = Object.values(numeros).every(Number.isFinite);
  const motivo = completas ? motivoAmasado(numeros) : null;
  const fuera = (clave: keyof typeof RANGOS_AMASADO) =>
    Number.isFinite(numeros[clave]) && (numeros[clave] < RANGOS_AMASADO[clave][0] || numeros[clave] > RANGOS_AMASADO[clave][1]);

  return (
    <form action={registrarLote} className="formulario">
      <div className="rejilla">
        <div className="campo"><label htmlFor="inicio">Inicio del amasado</label><input id="inicio" name="inicio" type="time" required /></div>
        <div className="campo"><label htmlFor="fin">Fin del amasado</label><input id="fin" name="fin" type="time" required /></div>
        <div className="campo"><label htmlFor="minutos_amasado">Minutos de amasado</label>
          <input id="minutos_amasado" name="minutos_amasado" inputMode="decimal" required autoComplete="off" />
          <small>Lento 3 min · rápido 5 min</small></div>
        <div className="campo"><label htmlFor="plan_bolas">Bolas planeadas</label><input id="plan_bolas" name="plan_bolas" type="number" min="0" step="1" required /></div>
        <div className="campo"><label htmlFor="bolas_resultado">Bolas que salieron</label><input id="bolas_resultado" name="bolas_resultado" type="number" min="0" step="1" required /></div>
      </div>
      <fieldset className="campo">
        <legend className="etiqueta">Temperatura del área (norma de bolas)</legend>
        <div className="si-no">
          {TEMPS_AREA.map((t) => <label key={t}><input type="radio" name="temp_area" value={t} required /><span>{t} °C</span></label>)}
        </div>
      </fieldset>
      <div className="rejilla">
        {TEMPS.map((t) => (
          <div key={t.k} className="campo">
            <label htmlFor={t.k}>{t.texto} (°C)</label>
            <input id={t.k} name={t.k} inputMode="decimal" required autoComplete="off"
              aria-invalid={fuera(t.clave) || undefined} className={fuera(t.clave) ? "fuera-rango" : undefined}
              value={temps[t.k] ?? ""} onChange={(e) => setTemps({ ...temps, [t.k]: e.target.value })} />
            <small>Norma: {RANGOS_AMASADO[t.clave][0]} a {RANGOS_AMASADO[t.clave][1]} °C</small>
          </div>
        ))}
      </div>
      <div className="rejilla">
        {GRAMOS.map((g) => (
          <div key={g.k} className="campo">
            <label htmlFor={g.k}>{g.texto} (g)</label>
            <input id={g.k} name={g.k} inputMode="decimal" required autoComplete="off" />
          </div>
        ))}
      </div>
      <div className="campo"><label htmlFor="empleado">¿Quién amasó?</label><input id="empleado" name="empleado" required autoComplete="off" placeholder="Nombre y apellido" /></div>
      <div className="campo">
        <label htmlFor="comentario">Comentario{motivo ? " (obligatorio)" : ""}</label>
        <textarea id="comentario" name="comentario" rows={2} required={!!motivo} />
        {motivo && <small role="status">Escribe qué pasó: {motivo}.</small>}
      </div>
      <p className="saldo-nota">Después del amasado, la masa reposa 60 minutos en cruces.</p>
      <div className="acciones"><BotonEnviar>Registrar lote</BotonEnviar></div>
    </form>
  );
}
