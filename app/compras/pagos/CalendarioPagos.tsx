"use client";

import { Icono } from "@/components/Icono";
import Link from "next/link";
import { useState } from "react";
import { fechaTexto, pesos, pesosCortos } from "@/lib/formato";
import { mesDe, moverMes, semanasDelMes } from "@/lib/ventas/calendario";

export type FacturaDelDia = { id: string; nombre: string; proveedor: string; saldo: number; vencida: boolean; formaPrevista?:string };

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
const tituloMes = (anio: number, mes: number) => {
  const t = nombreMes.format(new Date(Date.UTC(anio, mes - 1, 1))).replace(" de ", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Cada día muestra lo que se paga ese día (programado o por vencer); en rojo si incluye vencidas. Al tocarlo, sus facturas. */
export function CalendarioPagos({ hoy, porDia, filtros={} }: { hoy: string; porDia: Record<string, FacturaDelDia[]>;filtros?:{proveedor?:string;sucursal?:string;complemento?:string} }) {
  const [mes, setMes] = useState(mesDe(hoy));
  const [dia, setDia] = useState<string | null>(null);
  const limites=(m:{anio:number;mes:number})=>{const primero=`${m.anio}-${String(m.mes).padStart(2,'0')}-01`;const ultimo=new Date(Date.UTC(m.anio,m.mes,0)).toISOString().slice(0,10);return {desde:primero,hasta:ultimo};};
  const [rango,setRango]=useState(()=>limites(mes));
  const [fecha,setFecha]=useState(hoy);
  const cambiarMes=(m:{anio:number;mes:number})=>{setMes(m);setDia(null);setRango(limites(m));};
  const seleccionarDia=(d:string)=>{if(d===dia){setDia(null);setRango(limites(mes));}else{setDia(d);setRango({desde:d,hasta:d});setFecha(d);}};
  const lista = dia ? porDia[dia] ?? [] : [];
  return (
    <section className="seccion calendario" aria-label="Calendario de pagos">
      <div className="calendario-cabecera">
        <button type="button" className="boton-icono calendario-flecha" aria-label="Mes anterior" onClick={() => cambiarMes(moverMes(mes, -1))}><Icono nombre="izquierda" tamano={22} /></button>
        <h2>{tituloMes(mes.anio, mes.mes)}</h2>
        <button type="button" className="boton-icono calendario-flecha" aria-label="Mes siguiente" onClick={() => cambiarMes(moverMes(mes, 1))}><Icono nombre="derecha" tamano={22} /></button>
      </div>
      <details className="seccion"><summary className="boton boton-secundario">Exportar corrida para Tesorería</summary>
       <form action="/reporte/pagos/excel" method="get" className="formulario" style={{marginTop:16}}>
        {Object.entries(filtros).map(([k,v])=>v?<input type="hidden" key={k} name={k} value={v}/>:null)}
        <div className="rejilla"><label className="campo">Fecha de pago desde<input type="date" name="desde" required value={rango.desde} onChange={e=>setRango(r=>({...r,desde:e.target.value}))}/></label><label className="campo">Hasta<input type="date" name="hasta" min={rango.desde} required value={rango.hasta} onChange={e=>setRango(r=>({...r,hasta:e.target.value}))}/></label><label className="campo">Fecha de corrida<input type="date" name="fecha" required value={fecha} onChange={e=>setFecha(e.target.value)}/></label></div>
        <p className="saldo-nota">Resumen y una hoja por sucursal, con saldos pendientes actuales. Incluye las fechas programadas o sugeridas del rango y respeta los filtros de arriba. Las observaciones van en Pendientes de revisión. Exportar no registra pagos.</p>
        <button type="submit" className="boton">Descargar Excel de Tesorería</button>
       </form>
      </details>
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
              onClick={() => seleccionarDia(d)}>
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
                <Link href={`/compras/facturas/${f.id}`}>{f.nombre}</Link> · {f.proveedor} · {pesos(f.saldo)}{f.formaPrevista?` · ${f.formaPrevista}`:""}{f.vencida ? " · vencida" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
