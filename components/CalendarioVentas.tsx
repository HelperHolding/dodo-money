"use client";

import { Icono } from "@/components/Icono";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fechaTexto, pesos, pesosCortos } from "@/lib/formato";
import {
  diasEntreFechas, elegirDia, mesDe, moverMes, rangoElegido, semanasDelMes, ventaDelRango, type Rango, type Seleccion,
} from "@/lib/ventas/calendario";

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
const tituloMes = (anio: number, mes: number) => {
  const t = nombreMes.format(new Date(Date.UTC(anio, mes - 1, 1))).replace(" de ", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Calendario del periodo de Ventas: cada día muestra su venta; primer toque inicio, segundo fin.
 * "Ver este periodo" recarga el tablero con el rango (y la sucursal elegida).
 */
export function CalendarioVentas({ venta, periodo, hoy, maxDias, sucursal, sucursales }: {
  venta: Record<string, number>;
  periodo: Rango;
  hoy: string;
  maxDias: number;
  sucursal: string | null;
  /** null = el usuario no elige sucursal (gerente). */
  sucursales: { id: string; nombre: string }[] | null;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mes, setMes] = useState(mesDe(periodo.hasta));
  const [sel, setSel] = useState<Seleccion>({ inicio: periodo.desde, fin: periodo.hasta });
  const rango = rangoElegido(sel);
  const dias = rango ? diasEntreFechas(rango) : 0;
  const excede = dias > maxDias;
  const resumen = rango ? ventaDelRango(venta, rango) : null;
  const esteMes = mesDe(hoy);
  const puedeAvanzar = mes.anio * 12 + mes.mes < esteMes.anio * 12 + esteMes.mes;

  const ir = (r: Rango, suc: string | null) => {
    const q = new URLSearchParams({ desde: r.desde, hasta: r.hasta });
    if (suc) q.set("sucursal", suc);
    iniciar(() => router.push(`/ventas?${q}`));
  };

  return (
    <section className="seccion calendario" aria-label="Periodo">
      {sucursales && (
        <div className="acciones">
          <label htmlFor="sucursal" className="etiqueta">Sucursal</label>
          <select id="sucursal" value={sucursal ?? ""} disabled={pendiente} onChange={(e) => ir(periodo, e.target.value || null)}>
            <option value="">Todas</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      )}

      <div className="calendario-cabecera">
        <button type="button" className="boton-icono calendario-flecha" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}><Icono nombre="izquierda" tamano={22} /></button>
        <h2>{tituloMes(mes.anio, mes.mes)}</h2>
        <button type="button" className="boton-icono calendario-flecha" aria-label="Mes siguiente" disabled={!puedeAvanzar} onClick={() => setMes(moverMes(mes, 1))}><Icono nombre="derecha" tamano={22} /></button>
      </div>

      <div className="calendario-rejilla" role="grid">
        {DIAS.map((d) => <span key={d} className="calendario-dia-semana" role="columnheader">{d}</span>)}
        {semanasDelMes(mes.anio, mes.mes).flat().map((dia, i) => {
          if (!dia) return <span key={`h${i}`} aria-hidden="true" />;
          const monto = venta[dia];
          const extremo = rango && (dia === rango.desde || dia === rango.hasta);
          const dentro = rango && dia > rango.desde && dia < rango.hasta;
          return (
            <button key={dia} type="button" className="calendario-dia" disabled={dia > hoy}
              data-estado={extremo ? "extremo" : dentro ? "dentro" : undefined} data-vacio={monto === undefined ? "si" : undefined}
              aria-pressed={Boolean(extremo || dentro)}
              aria-label={`${fechaTexto(dia)}: ${monto === undefined ? "sin ventas importadas" : pesos(monto)}`}
              onClick={() => setSel(elegirDia(sel, dia))}>
              <span className="calendario-numero">{Number(dia.slice(8))}</span>
              <span className="calendario-venta">{monto === undefined ? "—" : pesosCortos(monto)}</span>
            </button>
          );
        })}
      </div>

      <div className="calendario-pie">
        <p aria-live="polite">
          {rango && resumen ? (
            <>
              <strong>{rango.desde === rango.hasta ? fechaTexto(rango.desde) : `${fechaTexto(rango.desde)} al ${fechaTexto(rango.hasta)}`}</strong>
              {` · ${dias} ${dias === 1 ? "día" : "días"} · ${pesos(resumen.total)}`}
              {!sel.fin && <span className="saldo-nota"> · toca el último día</span>}
            </>
          ) : "Toca el primer día del periodo."}
        </p>
        {excede && <p className="alerta-texto">El periodo puede ser de hasta {maxDias} días.</p>}
        <button type="button" className="boton" disabled={!rango || excede || pendiente} onClick={() => rango && ir(rango, sucursal)}>
          {pendiente ? "Cargando…" : "Ver este periodo"}
        </button>
      </div>
    </section>
  );
}
