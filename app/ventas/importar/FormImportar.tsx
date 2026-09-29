"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { fechaTexto, pesos } from "@/lib/formato";
import { guardarImportacion, revisarImportacion, type ResultadoImportacion } from "./acciones";
import type { Revision } from "./preparar";

/**
 * Un archivo de Datos brutos → Revisar (lee sin guardar) → vista previa por sucursal y día → Guardar o Reimportar.
 * El envío es manual (no <form action>) para que React no vacíe el campo de archivo entre Revisar y Guardar.
 */
export function FormImportar() {
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [pendiente, iniciar] = useTransition();
  const revision = resultado?.tipo === "revision" || resultado?.tipo === "error" ? resultado.revision : undefined;

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const guardar = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "guardar";
    const datos = new FormData(form);
    iniciar(async () => {
      const r = await (guardar ? guardarImportacion(datos) : revisarImportacion(datos));
      setResultado(r);
      if (r.tipo === "guardado") form.reset();
    });
  }

  return (
    <form className="seccion formulario" onSubmit={enviar}>
      <div className="campo">
        <label htmlFor="archivo">Datos brutos de Dodo IS</label>
        <input id="archivo" name="archivo" type="file" accept=".xlsx" required onChange={() => setResultado(null)} />
        <small>Dodo IS → Informes → Datos brutos, del periodo que quieras (hasta 92 días), de una o varias sucursales.</small>
      </div>

      {resultado?.tipo === "error" && <p className="aviso aviso-error" role="alert">{resultado.mensaje}</p>}
      {resultado?.tipo === "guardado" && (
        <p className="aviso aviso-ok" role="status">{resultado.mensaje} <Link href="/ventas">Ver reportes</Link></p>
      )}
      {revision && <VistaPrevia r={revision} />}

      <div className="acciones">
        <button className="boton boton-secundario" type="submit" value="revisar" disabled={pendiente}>
          {pendiente ? "Leyendo…" : "Revisar"}
        </button>
        {revision && (
          <button className="boton" type="submit" value="guardar" disabled={pendiente}>
            {revision.diasYaImportados ? "Reimportar" : "Guardar"}
          </button>
        )}
      </div>
    </form>
  );
}

function VistaPrevia({ r }: { r: Revision }) {
  const periodo = r.periodo.desde === r.periodo.hasta ? fechaTexto(r.periodo.desde) : `${fechaTexto(r.periodo.desde)} al ${fechaTexto(r.periodo.hasta)}`;
  const faltan = r.nuevos.length + r.sinCategoria.length + r.sinCosto.length > 0;
  return (
    <div className="vista-previa" aria-live="polite">
      <h2>{periodo}</h2>
      <p>
        {r.dias.length} {r.dias.length === 1 ? "día" : "días"} · {r.totales.pedidos} pedidos · {pesos(r.totales.total)} ·
        {" "}{r.totales.personal} comidas del personal · {r.totales.cancelados} cancelados
      </p>
      <ul className="dias-importar">
        {r.dias.map((d) => (
          <li key={`${d.sucursal.id}|${d.fecha}`} data-repetido={d.yaImportado ? "si" : undefined}>
            <span className="dias-importar-fecha">{fechaTexto(d.fecha)}{new Set(r.dias.map((x) => x.sucursal.id)).size > 1 ? ` · ${d.sucursal.nombre}` : ""}</span>
            <span>{d.resumen.pedidos} ped. · <strong>{pesos(d.resumen.total)}</strong></span>
            <span className="saldo-nota">
              Ticket {d.ticket === null ? "—" : pesos(d.ticket)} · personal {d.personal.pedidos} · cancelados {d.cancelados.pedidos}
              {d.yaImportado ? ` · ya importado (${pesos(d.yaImportado.total)})` : ""}
            </span>
          </li>
        ))}
      </ul>
      {r.diasYaImportados > 0 && (
        <>
          <p className="aviso aviso-info">
            {r.diasYaImportados} {r.diasYaImportados === 1 ? "día ya estaba importado" : "días ya estaban importados"}. Reimportar
            los reemplaza completos con lo que trae este archivo.
          </p>
          <label className="casilla">
            <input type="checkbox" name="confirmar" value="si" />
            Sí, reemplazar los días ya importados
          </label>
        </>
      )}
      {faltan && (
        <div className="aviso aviso-info">
          {r.nuevos.length > 0 && <p>Productos nuevos (entran sin categoría ni costo): {r.nuevos.join(", ")}.</p>}
          {r.sinCategoria.length > 0 && <p>Sin categoría: {r.sinCategoria.join(", ")}.</p>}
          {r.sinCosto.length > 0 && <p>Sin costo: {r.sinCosto.join(", ")}.</p>}
          <p>Después de guardar, asígnalos en <Link href="/ventas/costos">Costos</Link>.</p>
        </div>
      )}
    </div>
  );
}
