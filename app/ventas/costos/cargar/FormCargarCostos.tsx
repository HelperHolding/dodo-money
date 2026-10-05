"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { fechaTexto, pesos } from "@/lib/formato";
import { guardarCargaCostos, revisarCargaCostos, type ResultadoCargaCostos, type RevisionCostos } from "./acciones";

const ORIGEN = { nombre: "", equivalencia: "elegido antes", thin: "Thin = su tamaño", mitad: "promedio de sabores" } as const;

/**
 * Excel del menú → Revisar (lee y empareja sin guardar) → elegir a mano lo que no se emparejó → Guardar.
 * El envío es manual (no <form action>) para que React no vacíe el campo de archivo entre Revisar y Guardar.
 */
export function FormCargarCostos({ fechaPorDefecto }: { fechaPorDefecto: string }) {
  const [resultado, setResultado] = useState<ResultadoCargaCostos | null>(null);
  const [pendiente, iniciar] = useTransition();
  const revision = resultado?.tipo === "revision" ? resultado.revision : null;

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const guardar = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "guardar";
    const datos = new FormData(form);
    iniciar(async () => {
      const r = await (guardar ? guardarCargaCostos(datos) : revisarCargaCostos(datos));
      setResultado(r);
    });
  }

  return (
    <form className="seccion formulario" onSubmit={enviar}>
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="archivo">Excel del menú</label>
          <input id="archivo" name="archivo" type="file" accept=".xlsx" required onChange={() => setResultado(null)} />
          <small>Se lee la pestaña “Costo”: costo de receta + periférico (1 % del precio).</small>
        </div>
        <div className="campo">
          <label htmlFor="fecha">Valen desde</label>
          <input id="fecha" name="fecha" type="date" defaultValue={fechaPorDefecto} required onChange={() => setResultado(null)} />
          <small>Las ventas antes de esta fecha se siguen costeando con los costos anteriores.</small>
        </div>
      </div>

      {resultado?.tipo === "error" && <p className="aviso aviso-error" role="alert">{resultado.mensaje}</p>}
      {resultado?.tipo === "guardado" && <p className="aviso aviso-ok" role="status">{resultado.mensaje} <Link href="/ventas">Ver ventas</Link></p>}
      {revision && <VistaPrevia r={revision} />}

      <div className="acciones">
        <button className="boton boton-secundario" type="submit" value="revisar" disabled={pendiente}>
          {pendiente ? "Leyendo…" : revision ? "Revisar de nuevo" : "Revisar"}
        </button>
        {revision && (
          <button className="boton" type="submit" value="guardar" disabled={pendiente}>
            Guardar {revision.asignaciones.length} costos
          </button>
        )}
      </div>
    </form>
  );
}

function VistaPrevia({ r }: { r: RevisionCostos }) {
  const cambian = r.asignaciones.filter((a) => a.costoActual === null || a.costoActual !== a.costo);
  return (
    <>
      <p className="aviso aviso-info">
        {r.asignaciones.length} productos con costo desde el {fechaTexto(r.fecha)} · {cambian.length} cambian o son nuevos
        {r.combos ? ` · ${r.combos} combos ignorados (Dodo IS los vende por piezas)` : ""}. Nada se guarda hasta que presiones Guardar.
      </p>

      {r.sinProducto.length > 0 && (
        <section aria-labelledby="t-sin-producto">
          <h3 id="t-sin-producto">Del Excel sin producto en Dodo IS ({r.sinProducto.length})</h3>
          <p className="saldo-nota">Elige a qué producto corresponde y presiona “Revisar de nuevo”. La próxima carga lo empareja solo.</p>
          <ul className="lista-filas" style={{ "--columnas": 1 } as React.CSSProperties}>
            {r.sinProducto.map((f) => (
              <li key={`${f.clave}|${f.tam}`} className="fila">
                <div className="fila-nombre"><strong>{f.nombre} · {f.tam}</strong><small>{pesos(f.costo)}</small></div>
                <div className="fila-datos">
                  <span>
                    <label className="solo-lector" htmlFor={`m-${f.clave}-${f.tam}`}>Producto para {f.nombre} {f.tam}</label>
                    <select id={`m-${f.clave}-${f.tam}`} name={`manual|${f.clave}|${f.tam}`} defaultValue="">
                      <option value="">No cargar</option>
                      {r.sinCosto.map((p) => <option key={p.dodo_id} value={p.dodo_id}>{p.nombre}</option>)}
                    </select>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="t-asignados">
        <h3 id="t-asignados">Costos que se cargan ({r.asignaciones.length})</h3>
        <ul className="lista-filas" style={{ "--columnas": 3 } as React.CSSProperties}>
          <li className="fila fila-encabezado" aria-hidden="true"><span>Producto de Dodo IS</span><span>Del Excel</span><span>Actual</span><span>Nuevo</span></li>
          {r.asignaciones.map((a) => {
            const delta = a.costoActual === null ? null : Math.round((a.costo - a.costoActual) * 100) / 100;
            return (
              <li key={a.dodo_id} className="fila" data-alerta={delta !== null && a.costoActual! > 0 && Math.abs(delta) / a.costoActual! > 0.3 ? "si" : undefined}>
                <div className="fila-nombre"><strong>{a.producto}</strong>{ORIGEN[a.origen] && <small>{ORIGEN[a.origen]}</small>}</div>
                <div className="fila-datos">
                  <span>{a.excel} · {a.tam}</span>
                  <span>{a.costoActual === null ? "Sin costo" : pesos(a.costoActual)}</span>
                  <span><strong>{pesos(a.costo)}</strong>{delta ? ` (${delta > 0 ? "+" : ""}${pesos(delta)})` : ""}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {r.sinCosto.length > 0 && (
        <details>
          <summary>Productos de Dodo IS que no reciben costo nuevo ({r.sinCosto.length})</summary>
          <p className="saldo-nota">Conservan su costo anterior, si tenían. Si alguno debía venir en el Excel, empárejalo arriba.</p>
          <ul className="lista-simple">{r.sinCosto.map((p) => <li key={p.dodo_id}>{p.nombre}</li>)}</ul>
        </details>
      )}
    </>
  );
}
