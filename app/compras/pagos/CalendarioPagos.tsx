"use client";

import Link from "next/link";
import { useState } from "react";
import { fechaTexto, pesos, pesosCortos } from "@/lib/formato";
import { mesDe, moverMes, semanasDelMes } from "@/lib/ventas/calendario";

export type FacturaDelDia = { id: string; nombre: string; proveedor: string; saldo: number; vencida: boolean };

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
const tituloMes = (anio: number, mes: number) => {
  const t = nombreMes.format(new Date(Date.UTC(anio, mes - 1, 1))).replace(" de ", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Cada día muestra lo que se paga ese día (programado o por vencer); en rojo si incluye vencidas. Al tocarlo, sus facturas. */
export function CalendarioPagos({ hoy, porDia }: { hoy: string; porDia: Record<string, FacturaDelDia[]> }) {
  const [mes, setMes] = useState(mesDe(hoy));
  const [dia, setDia] = useState<string | null>(null);
  const lista = dia ? porDia[dia] ?? [] : [];
  return (
    <section className="seccion calendario" aria-label="Calendario de pagos">
      <div className="calendario-cabecera">
        <button type="button" className="calendario-flecha" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}>‹</button>
        <h2>{tituloMes(mes.anio, mes.mes)}</h2>
        <button type="button" className="calendario-flecha" aria-label="Mes siguiente" onClick={() => setMes(moverMes(mes, 1))}>›</button>
      </div>
      <div className="calendario-rejilla" role="grid">
        {DIAS.map((d) => <span key={d} className="calendario-dia-semana" role="columnheader">{d}</span>)}
        {semanasDelMes(mes.anio, mes.mes).flat().map((d, i) => {
          if (!d) return <span key={`h${i}`} aria-hidden="true" />;
          const facturas = porDia[d] ?? [];
          const total = facturas.reduce((s, f) => s + f.saldo, 0);
          const vencidas = facturas.some((f) => f.vencida);
          return (
            <button key={d} type="button" className="calendario-dia" data-vacio={facturas.length ? undefined : "si"}
              data-estado={d === dia ? "extremo" : undefined} aria-pressed={d === dia}
              aria-label={`${fechaTexto(d)}: ${facturas.length ? pesos(total) : "nada por pagar"}${vencidas ? ", con vencidas" : ""}`}
              onClick={() => setDia(d === dia ? null : d)}>
              <span className="calendario-numero">{Number(d.slice(8))}{d === hoy ? " ·" : ""}</span>
              <span className="calendario-venta" style={vencidas && d !== dia ? { color: "var(--alerta-texto)" } : undefined}>{facturas.length ? pesosCortos(total) : "—"}</span>
            </button>
          );
        })}
      </div>
      <div className="calendario-pie">
        {!dia ? <p>Toca un día para ver sus facturas.</p> : !lista.length ? <p>{fechaTexto(dia)}: nada por pagar.</p> : (
          <ul style={{ listStyle: "none", paddingLeft: 0, display: "grid", gap: 6 }}>
            {lista.map((f) => (
              <li key={f.id} style={{ overflowWrap: "anywhere" }}>
                <Link href={`/compras/facturas/${f.id}`}>{f.nombre}</Link> · {f.proveedor} · {pesos(f.saldo)}{f.vencida ? " · vencida" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
