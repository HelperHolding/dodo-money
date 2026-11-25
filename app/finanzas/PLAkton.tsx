import type { ReactNode } from "react";
import { pesos, porcentaje } from "@/lib/formato";
import { esDetalleNomina, type EntradaPL, type FilaPL } from "@/lib/finanzas/pl";
import type { AjustePL } from "@/lib/finanzas/ajustes";
import { PRIME_COST_MERCADO, indicadoresAkton, lecturaEbitda, notasPorRenglon, renglonesAkton, type RenglonAkton } from "@/lib/finanzas/akton";
import { referenciaHelper } from "@/lib/finanzas/catalogoHelper";
import { Importe } from "./Importe";
import { desplegable, type Detalle } from "./TablaPL";

/*
 * P&L contra meta en el estilo Akton. Guía: docs/diseno/estilo-akton.md.
 * Indicadores → lectura numerada → tabla con variación coloreada, notas al margen y notas al pie.
 */

const pts = (real: number | null, meta: number | null) => (real === null || meta === null ? null : (real - meta) * 100);
const textoPts = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)} pts`;
const entero = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

function Kpi({ etiqueta, valor, pie, tono }: { etiqueta: string; valor: ReactNode; pie: ReactNode; tono?: "destacado" | "si" | "no" }) {
  return (
    <div className="akton-kpi" data-tono={tono}>
      <span className="akton-kpi-etiqueta">{etiqueta}</span>
      <strong className="akton-kpi-valor">{valor}</strong>
      <span className="akton-kpi-pie">{pie}</span>
    </div>
  );
}

export function IndicadoresAkton({ entrada, filas, dias }: { entrada: EntradaPL; filas: readonly FilaPL[]; dias: number }) {
  const k = indicadoresAkton(entrada, filas, dias);
  const am = pts(k.alimentoMermaPct, k.alimentoMermaMetaPct);
  const prime = k.primeCostPct;
  const enRango = prime === null ? undefined : prime >= PRIME_COST_MERCADO.min && prime <= PRIME_COST_MERCADO.max ? "si" : prime > PRIME_COST_MERCADO.max ? "no" : undefined;
  return (
    <section className="akton-kpis" aria-label="Indicadores del periodo">
      <Kpi etiqueta="Venta neta sin IVA" valor={pesos(k.ventaNeta)}
        pie={k.ventaBruta === null ? "Bruta sin dato completo" : <>Bruta {pesos(k.ventaBruta)} · {porcentaje(k.descuentoPct)} de descuento</>} />
      <Kpi etiqueta="Pedidos" valor={k.pedidos === null ? "Sin dato" : entero.format(k.pedidos)}
        pie={k.pedidosDia === null ? "—" : <>{decimal.format(k.pedidosDia)} al día en promedio</>} />
      <Kpi etiqueta="Ticket neto" valor={k.ticket === null ? "Sin dato" : pesos(k.ticket)}
        pie={<>POS {k.ticketPos === null ? "—" : pesos(k.ticketPos)} | Rappi {k.ticketRappi === null ? "—" : pesos(k.ticketRappi)}</>} />
      <Kpi etiqueta="Alimento y merma" valor={porcentaje(k.alimentoMermaPct)} tono={am === null || am === 0 ? undefined : am < 0 ? "si" : "no"}
        pie={k.alimentoMermaMetaPct === null ? "Sin meta" : <>Meta {porcentaje(k.alimentoMermaMetaPct)}{am !== null && <> · {textoPts(am)}</>}</>} />
      <Kpi etiqueta="Prime cost" valor={porcentaje(prime)} tono={enRango}
        pie={<>Alimento + merma + nómina · mercado {Math.round(PRIME_COST_MERCADO.min * 100)}–{Math.round(PRIME_COST_MERCADO.max * 100)} %</>} />
      <Kpi etiqueta="EBITDA de tienda" tono="destacado" valor={k.ebitdaTienda === null ? "Sin dato" : pesos(k.ebitdaTienda)}
        pie={<>{porcentaje(k.ebitdaTiendaPct)} de la venta{k.ebitdaTiendaMeta !== null && <> · meta {pesos(k.ebitdaTiendaMeta)}</>}</>} />
    </section>
  );
}

export function LecturaAkton({ filas }: { filas: readonly FilaPL[] }) {
  const l = lecturaEbitda(filas);
  if (l.ebitda === null) return null;
  const falta = l.diferencia !== null && l.diferencia < 0;
  return (
    <section className="akton-lectura" aria-labelledby="akton-lectura-1">
      <span className="akton-lectura-numero" aria-hidden="true">1</span>
      <div>
        <h2 id="akton-lectura-1">EBITDA de tienda: {pesos(l.ebitda)}{l.meta !== null && <> contra {pesos(l.meta)} de meta</>}</h2>
        {l.diferencia === null ? <p>Sin meta para este periodo.</p> : (
          <p>
            {falta ? <>Faltan <strong className="akton-no">{pesos(-l.diferencia)}</strong> para la meta.</> : <>Supera la meta por <strong className="akton-si">{pesos(l.diferencia)}</strong>.</>}
            {l.causas.length > 0 && <> {falta ? "Lo explican sobre todo" : "Aun así, se pasan de su meta"}: {l.causas.map((c, i) => (
              <span key={c.clave}>{i > 0 && (i === l.causas.length - 1 ? " y " : ", ")}{c.nombre} (<span className="akton-no">+{pesos(c.exceso)}</span>)</span>
            ))}.</>}
          </p>
        )}
      </div>
    </section>
  );
}

/** Notas al pie fijas (metodología): el ⓘ del renglón enlaza a ellas. */
const PIE: { clave: string; texto: string }[] = [
  { clave: "venta_neta", texto: "Venta neta sin IVA, después de descuentos; criterio devengado. Los % de la tabla son sobre la venta neta." },
  { clave: "alimento", texto: "Alimento y empaque: costo teórico de receta + periférico de lo vendido; no son compras." },
  { clave: "merma", texto: "Merma: productos terminados e insumos adicionales al BOM, sin IVA. Los costos desconocidos quedan pendientes." },
  { clave: "rappi_neto", texto: "Rappi: con reporte financiero, la comisión se toma neta del reporte; retenciones e IVA de comisiones no son gasto." },
  { clave: "oficina", texto: "Oficina central: gasto corporativo prorrateado a la sucursal; en el consolidado va completo." },
];

export function TablaAkton({ r, ajustado, ajustes, avisos, conSucursal = false, captura }: {
  r: {
    filas: FilaPL[]; detalleDe: (renglon: string) => Detalle;
  };
  ajustado: readonly FilaPL[] | null;
  ajustes: readonly AjustePL[];
  /** Avisos del P&L: los que tienen renglón van al margen; el resto se devuelve con `generales`. */
  avisos: { porRenglon: ReadonlyMap<string, string[]> };
  /** Consolidado: cada nota de ajuste dice de qué sucursal es. */
  conSucursal?: boolean;
  captura?: (f: FilaPL) => ReactNode;
}) {
  const aj = ajustado ? new Map(ajustado.map((f) => [f.clave, f])) : null;
  const renglones = renglonesAkton(r.filas, (f) => esDetalleNomina(f.clave) && !f.monto && !aj?.get(f.clave)?.monto);
  const pie = new Map(PIE.map((p, i) => [p.clave, i + 1]));
  const notasDe = (clave: string) => [
    ...(clave === "alimento" ? ["Costo teórico de receta, no compras."] : []),
    ...(avisos.porRenglon.get(clave) ?? []),
    ...ajustes.filter((a) => a.renglon === clave).map((a) => `Ajuste${conSucursal ? ` ${a.sucursal}` : ""}: ${a.sinEfecto ? "sin efecto" : pesos(a.ajuste)} · ${a.nota}`),
  ];
  // Las comparaciones contra el periodo anterior viven en la vista Comparativo; aquí solo real contra meta.
  const columnasTotal = 7 + (aj ? 1 : 0);

  const fila = (x: RenglonAkton) => {
    if (x.nivel === "seccion") return (
      <tr key={x.clave} className="akton-seccion"><th colSpan={columnasTotal} scope="rowgroup">{x.nombre}</th></tr>
    );
    const f = x.fila;
    const n = pie.get(x.clave);
    const notas = notasDe(x.clave);
    const a = f && aj?.get(f.clave);
    const ajuste = a && a.monto !== null && f.monto !== null ? Math.round((a.monto - f.monto) * 100) / 100 : 0;
    return (
      <tr key={x.clave} className={`akton-${x.nivel}`} data-notas={notas.length ? "si" : undefined}>
        <td data-label="Renglón">
          <span className="celda-pila">
            <span className="akton-nombre">
              {x.nivel === "fila" || x.nivel === "sub" ? x.nombre : <strong>{x.nombre}</strong>}
              {x.ingreso && <span className="akton-chip">ingreso</span>}
              {n && <a className="akton-info" href={`#akton-pie-${n}`} aria-label={`Nota ${n}`}>ⓘ<sup>{n}</sup></a>}
            </span>
            {f && x.nivel !== "sub" && referenciaHelper(f.clave) && <small>Referencia contable: {referenciaHelper(f.clave)}</small>}
            {f && desplegable(r.detalleDe(f.clave), "De dónde sale")}
            {f && captura?.(f)}
          </span>
        </td>
        <td data-label="Real" className="monto"><Importe n={x.monto} /></td>
        <td data-label="% venta" className="monto akton-pct">{porcentaje(x.pct)}</td>
        {aj && <>
          <td data-label="Ajustado" className="monto">{ajuste ? <Importe n={a!.monto} /> : "—"}</td>
        </>}
        <td data-label="Meta" className="monto">{x.meta === null ? "—" : <Importe n={x.meta} />}</td>
        <td data-label="% meta" className="monto akton-pct">{porcentaje(x.metaPct)}</td>
        <td data-label="Var. vs meta" className="monto akton-var" data-favorable={x.favorable === null ? undefined : x.favorable ? "si" : "no"}>
          {f?.sinCapturar ? "Sin capturar" : x.diferencia === null ? "—" : <Importe n={x.diferencia} />}
        </td>
        <td data-label="Notas" className="akton-nota-celda">
          {notas.length > 0 && <div className="akton-nota">{notas.map((t, i) => <p key={i}>{t}</p>)}</div>}
        </td>
      </tr>
    );
  };

  return (
    <section className="akton-tabla-marco" aria-labelledby="akton-tabla-titulo">
      <h2 id="akton-tabla-titulo" className="akton-titulo">Estado de resultados contra meta</h2>
      <p className="akton-subtitulo">Toca «De dónde sale» bajo un renglón para ver su detalle.</p>
      <div className="tabla-contenedor">
        <table className={`tabla tabla-tarjetas akton-tabla${aj ? " akton-tabla-ajustada" : ""}`}>
          <thead>
            <tr>
              <th>Renglón</th><th className="monto">Real</th><th className="monto">% venta</th>
              {aj && <th className="monto" title="Solo en los renglones con ajuste; el monto y la nota van en Notas">Ajustado</th>}
              <th className="monto">Meta</th><th className="monto">% meta</th><th className="monto">Var. vs meta</th>
              <th className="akton-nota-celda">Notas</th>
            </tr>
          </thead>
          <tbody>{renglones.map(fila)}</tbody>
        </table>
      </div>
      <footer className="akton-pie">
        <ol>{PIE.map((p, i) => <li key={p.clave} id={`akton-pie-${i + 1}`}>{p.texto}</li>)}</ol>
        <p>Meta: PL Base del modelo de Dodo (los % sobre la venta neta real; renta, servicios y plantilla de nómina en pesos). Var. vs meta = real − meta: verde a favor, rojo en contra.
          Fuentes: Dodo IS (ventas, pedidos, mermas), reporte financiero de Rappi, facturas y caja chica, nómina capturada y Banca.</p>
      </footer>
    </section>
  );
}

/** Reparte los avisos: los de un renglón van a la tabla y los demás quedan para «Observaciones del reporte». */
export const repartirAvisos = (avisos: readonly string[]) => notasPorRenglon(avisos);
