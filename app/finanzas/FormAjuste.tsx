"use client";
import { useState } from "react";
import { pesos } from "@/lib/formato";
import { guardarAjustePL } from "./ajustes/acciones";

const centavos = (n: number) => Math.round(n * 100) / 100;

/** "Ajustar" bajo un renglón de gasto: tope % de la venta neta o monto, nota obligatoria y vista previa del ajustado. */
export function FormAjuste({ sucursal, mes, renglon, real, ventaNeta, volverA }: {
  sucursal: string; mes: string; renglon: string; real: number; ventaNeta: number; volverA: string;
}) {
  const [tipo, setTipo] = useState<"tope_pct" | "monto">("tope_pct");
  const [valor, setValor] = useState("");
  const [solicitud] = useState(() => crypto.randomUUID());
  const n = Number(valor.replace(/[$\s,]/g, ""));
  const ajustado = valor.trim() === "" || !Number.isFinite(n) ? null
    : tipo === "tope_pct" ? (ventaNeta > 0 ? Math.min(real, centavos((n / 100) * ventaNeta)) : real) : centavos(real + n);
  return (
    <details className="pl-ajustar">
      <summary className="saldo-nota">Ajustar</summary>
      <form action={guardarAjustePL} className="pl-ajustar-form">
        <input type="hidden" name="solicitud" value={solicitud} />
        <input type="hidden" name="sucursal_id" value={sucursal} />
        <input type="hidden" name="mes" value={mes} />
        <input type="hidden" name="renglon" value={renglon} />
        <input type="hidden" name="volver" value={volverA} />
        <label>Tipo
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "tope_pct" | "monto")}>
            <option value="tope_pct">Tope % de la venta neta</option>
            <option value="monto">Monto en pesos (negativo limpia)</option>
          </select>
        </label>
        <label>{tipo === "tope_pct" ? "Tope (%)" : "Monto ($)"}
          <input name="valor" inputMode="decimal" required value={valor} onChange={(e) => setValor(e.target.value)} placeholder={tipo === "tope_pct" ? "5" : "-16000"} />
        </label>
        <label>Nota
          <textarea name="nota" required minLength={10} maxLength={500} rows={2} placeholder="Por qué se ajusta (se imprime en el reporte)" />
        </label>
        <p className="saldo-nota">
          {ajustado === null ? `Real ${pesos(real)}` : `Real ${pesos(real)} → ajustado ${pesos(ajustado)} (${pesos(centavos(ajustado - real))})`}
        </p>
        <button className="boton boton-compacto" type="submit">Guardar ajuste</button>
      </form>
    </details>
  );
}
