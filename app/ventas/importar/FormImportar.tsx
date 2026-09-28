"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { fechaTexto, pesos } from "@/lib/formato";
import { NOMBRE_TIPO } from "@/lib/ventas/calculos";
import { necesitaConfirmacion } from "@/lib/ventas/extraer";
import { guardarImportacion, revisarImportacion, type ResultadoImportacion } from "./acciones";
import type { Revision } from "./preparar";

/**
 * Dos archivos → Revisar (lee sin guardar) → vista previa → Guardar o Reimportar.
 * El envío es manual (no <form action>) para que React no vacíe los campos de archivo entre Revisar y Guardar.
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
        <label htmlFor="ventas">Reporte de Ventas</label>
        <input id="ventas" name="ventas" type="file" accept=".xlsx" required onChange={() => setResultado(null)} />
        <small>Dodo IS → Informes → Ventas, de un solo día.</small>
      </div>
      <div className="campo">
        <label htmlFor="productos">Reporte de Productos</label>
        <input id="productos" name="productos" type="file" accept=".xlsx" required onChange={() => setResultado(null)} />
        <small>ProductsSales del mismo día, con método de cálculo &quot;Con descuentos&quot;.</small>
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
            {revision.yaImportado ? "Reimportar" : "Guardar"}
          </button>
        )}
      </div>
    </form>
  );
}

function VistaPrevia({ r }: { r: Revision }) {
  const piezas = r.productos.reduce((s, p) => s + p.cantidad, 0);
  const tipos = r.desglose.filter((d) => d.total || d.pedidos);
  const faltan = r.nuevos.length + r.sinCategoria.length + r.sinCosto.length > 0;
  return (
    <div className="vista-previa" aria-live="polite">
      <h2>{r.sucursal.nombre} · {fechaTexto(r.fecha)}</h2>
      <dl className="tarjeta-datos">
        <dt>Venta</dt>
        <dd>
          <span>Total {pesos(r.resumen.total)}</span>
          <span>Neta {pesos(r.resumen.total - r.resumen.iva)}</span>
          <span>IVA {pesos(r.resumen.iva)}</span>
        </dd>
        <dt>Pedidos</dt>
        <dd>
          <span>{r.resumen.pedidos}</span>
          <span>Ticket promedio {r.ticket === null ? "—" : pesos(r.ticket)}</span>
        </dd>
        <dt>Pago</dt>
        <dd>
          <span>Efectivo {pesos(r.resumen.efectivo)}</span>
          <span>Tarjeta {pesos(r.resumen.tarjeta)}</span>
          <span>En línea {pesos(r.resumen.en_linea)}</span>
        </dd>
        {tipos.length > 0 && (
          <>
            <dt>Tipo</dt>
            <dd>{tipos.map((d) => <span key={d.tipo}>{NOMBRE_TIPO[d.tipo]} {pesos(d.total)} · {d.pedidos}</span>)}</dd>
          </>
        )}
        <dt>Productos</dt>
        <dd><span>{r.productos.length} productos · {piezas} piezas</span></dd>
      </dl>

      {r.cuadra
        ? <p className="aviso aviso-ok">✅ Cuadra: Ventas {pesos(r.resumen.total)} y Productos {pesos(r.sumaProductos)}.</p>
        : <p className="aviso aviso-error">⚠ Los archivos no cuadran por {pesos(Math.abs(r.diferencia))}: Ventas {pesos(r.resumen.total)}, Productos {pesos(r.sumaProductos)}.</p>}
      {r.yaImportado && (
        <p className="aviso aviso-info">Ese día ya se importó con un total de {pesos(r.yaImportado.total)}. Reimportar lo reemplaza.</p>
      )}
      {faltan && (
        <div className="aviso aviso-info">
          {r.nuevos.length > 0 && <p>Productos nuevos (entran sin categoría ni costo): {r.nuevos.join(", ")}.</p>}
          {r.sinCategoria.length > 0 && <p>Sin categoría: {r.sinCategoria.join(", ")}.</p>}
          {r.sinCosto.length > 0 && <p>Sin costo: {r.sinCosto.join(", ")}.</p>}
          <p>Después de guardar, asígnalos en <Link href="/ventas/costos">Costos</Link>.</p>
        </div>
      )}
      {necesitaConfirmacion({ cuadra: r.cuadra, yaImportado: r.yaImportado !== null }) && (
        <label className="casilla">
          <input type="checkbox" name="confirmar" value="si" />
          {r.yaImportado ? "Sí, reemplazar el día ya importado" : "Sí, guardar aunque no cuadren"}
        </label>
      )}
    </div>
  );
}
