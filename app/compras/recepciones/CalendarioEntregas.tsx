"use client";

import { Icono } from "@/components/Icono";
import Link from "next/link";
import { useState } from "react";
import { fechaTexto } from "@/lib/formato";
import { mesDe, moverMes, semanasDelMes } from "@/lib/ventas/calendario";

export type OrdenEsperada = { id: string; folio: string; proveedor: string; destino: string; avance: string; atrasada: boolean;href?:string };

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
const tituloMes = (anio: number, mes: number) => {
  const t = nombreMes.format(new Date(Date.UTC(anio, mes - 1, 1))).replace(" de ", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Cada día muestra cuántas órdenes se esperan; en rojo si alguna ya pasó su fecha sin recibirse completa. Al tocarlo, sus órdenes. */
export function CalendarioEntregas({ hoy, porDia,realizadas={} }: { hoy: string; porDia: Record<string, OrdenEsperada[]>;realizadas?:Record<string,OrdenEsperada[]> }) {
  const [mes, setMes] = useState(mesDe(hoy));
  const [dia, setDia] = useState<string | null>(null);
  const recibidas=dia?realizadas[dia]??[]:[];
  const lista = dia ? porDia[dia] ?? [] : [];
  return (
    <section className="seccion calendario" aria-label="Calendario de recepciones programadas y realizadas">
      <div className="calendario-cabecera">
        <button type="button" className="boton-icono calendario-flecha" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}><Icono nombre="izquierda" tamano={22} /></button>
        <h2>{tituloMes(mes.anio, mes.mes)}</h2>
        <button type="button" className="boton-icono calendario-flecha" aria-label="Mes siguiente" onClick={() => setMes(moverMes(mes, 1))}><Icono nombre="derecha" tamano={22} /></button>
      </div>
      <p className="saldo-nota">Programadas · <span className="recepcion-hecha">Recibidas en verde (fecha real)</span></p>
      <div className="calendario-rejilla" role="grid">
        {DIAS.map((d) => <span key={d} className="calendario-dia-semana" role="columnheader">{d}</span>)}
        {semanasDelMes(mes.anio, mes.mes).flat().map((d, i) => {
          if (!d) return <span key={`h${i}`} aria-hidden="true" />;
          const ordenes = porDia[d] ?? [];
          const hechas=realizadas[d]??[];
          const atrasadas = ordenes.some((o) => o.atrasada);
          return (
            <button key={d} type="button" className="calendario-dia" data-vacio={ordenes.length||hechas.length ? undefined : "si"}
              data-estado={d === dia ? "extremo" : undefined} aria-pressed={d === dia}
              aria-label={`${fechaTexto(d)}: ${ordenes.length ? `${ordenes.length} ${ordenes.length === 1 ? "orden" : "órdenes"}` : "nada esperado"}${atrasadas ? ", con atrasadas" : ""}, ${hechas.length} documentos con recepción registrada`}
              onClick={() => setDia(d === dia ? null : d)}>
              <span className="calendario-numero">{Number(d.slice(8))}{d === hoy ? " ·" : ""}</span>
              <span className="calendario-venta" style={atrasadas && d !== dia ? { color: "var(--alerta-texto)" } : undefined}>
                {ordenes.length ? `${ordenes.length} ${ordenes.length === 1 ? "OC" : "OCs"}` : "—"}
              </span>
              {hechas.length>0&&<span className="recepcion-hecha">✓ {hechas.length} recibidas</span>}
            </button>
          );
        })}
      </div>
      <div className="calendario-pie">
        {!dia ? <p>Toca un día para ver las órdenes programadas y las recepciones realizadas.</p> : !lista.length&&!recibidas.length ? <p>{fechaTexto(dia)}: sin entregas programadas ni recibidas.</p> : (
          <ul style={{ listStyle: "none", paddingLeft: 0, display: "grid", gap: 6 }}>
            {lista.length>0&&<li><strong>Programadas</strong></li>}
            {lista.map((o) => (
              <li key={o.id} className="texto-partible">
                <Link href={o.href??`/compras/ordenes/${o.id}`}>{o.folio}</Link> · {o.proveedor} · {o.destino} · {o.avance}{o.atrasada ? " · atrasada" : ""}
              </li>
            ))}
            {recibidas.length>0&&<li><strong className="recepcion-hecha">Recepciones realizadas · {fechaTexto(dia!)}</strong></li>}
            {recibidas.map(o=><li key={`recibida-${o.id}`}><Link href={o.href??`/compras/ordenes/${o.id}`}>{o.folio}</Link> · {o.proveedor} · {o.destino} · <span className="recepcion-hecha">{o.avance==="recibida completa"?"Ya recibido":"Recepción registrada"}</span></li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
