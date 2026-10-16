"use client";

import {TablaFacturasPago,type FacturaTablaPago} from "./TablaFacturasPago";
import { useState } from "react";
import { fechaTexto, pesos, pesosCortos } from "@/lib/formato";
import { mesDe, moverMes, semanasDelMes } from "@/lib/ventas/calendario";

export type FacturaDelDia = FacturaTablaPago & {vencida:boolean};

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
const tituloMes = (anio: number, mes: number) => {
  const t = nombreMes.format(new Date(Date.UTC(anio, mes - 1, 1))).replace(" de ", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Cada día muestra lo que se paga ese día (programado o por vencer); en rojo si incluye vencidas. Al tocarlo, sus facturas. */
export function CalendarioPagos({ hoy, porDia, filtros={}, rangoInicial }: { hoy: string; porDia: Record<string, FacturaDelDia[]>;filtros?:{proveedor?:string;sucursal?:string;complemento?:string};rangoInicial?:{desde:string;hasta:string} }) {
  const [mes, setMes] = useState(mesDe(rangoInicial?.desde??hoy));
  const [dia, setDia] = useState<string | null>(rangoInicial?.desde===rangoInicial?.hasta?rangoInicial?.desde??null:null);
  const limites=(m:{anio:number;mes:number})=>{const primero=`${m.anio}-${String(m.mes).padStart(2,'0')}-01`;const ultimo=new Date(Date.UTC(m.anio,m.mes,0)).toISOString().slice(0,10);return {desde:primero,hasta:ultimo};};
  const [rango,setRango]=useState(()=>rangoInicial??limites(mes));
  const [fecha,setFecha]=useState(hoy);
  const [verRango,setVerRango]=useState(!!rangoInicial);
  const cambiarMes=(m:{anio:number;mes:number})=>{setMes(m);setDia(null);setVerRango(false);setRango(limites(m));};
  const seleccionarDia=(d:string)=>{setVerRango(false);if(d===dia){setDia(null);setRango(limites(mes));}else{setDia(d);setRango({desde:d,hasta:d});setFecha(d);}};
  const lista = dia ? porDia[dia] ?? [] : verRango?Object.entries(porDia).filter(([d])=>d>=rango.desde&&d<=rango.hasta).sort(([a],[b])=>a.localeCompare(b)).flatMap(([,fs])=>fs):[];
  return (
    <section className="seccion calendario" aria-label="Calendario de pagos">
      <div className="calendario-cabecera">
        <button type="button" className="calendario-flecha" aria-label="Mes anterior" onClick={() => cambiarMes(moverMes(mes, -1))}>‹</button>
        <h2>{tituloMes(mes.anio, mes.mes)}</h2>
        <button type="button" className="calendario-flecha" aria-label="Mes siguiente" onClick={() => cambiarMes(moverMes(mes, 1))}>›</button>
      </div>
      <details className="seccion" open={!!rangoInicial}><summary className="boton boton-secundario">Exportar corrida para Tesorería</summary>
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
              data-estado={d === dia ? "extremo" : verRango&&d>=rango.desde&&d<=rango.hasta?"rango":undefined} aria-pressed={d === dia}
              aria-label={`${fechaTexto(d)}: ${facturas.length ? pesos(total) : "nada por pagar"}${vencidas ? ", con vencidas" : ""}`}
              onClick={() => seleccionarDia(d)}>
              <span className="calendario-numero">{Number(d.slice(8))}{d === hoy ? " ·" : ""}</span>
              <span className="calendario-venta" style={vencidas && d !== dia ? { color: "var(--alerta-texto)" } : undefined}>{facturas.length ? pesosCortos(total) : "—"}</span>
            </button>
          );
        })}
      </div>
      <div className="calendario-pie">
        {!dia&&!verRango ? <p>Toca un día para ver sus facturas.</p> : !lista.length ? <p>{(dia?fechaTexto(dia):`${fechaTexto(rango.desde)} al ${fechaTexto(rango.hasta)}`)}: nada por pagar.</p> : (
          <TablaFacturasPago filas={lista}/>
        )}
      </div>
    </section>
  );
}
