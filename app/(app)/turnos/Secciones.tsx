import { Fragment } from "react";
import { hora, pesos } from "@/lib/formato";
import { NOMBRE_ORIGEN, ORIGENES, sumaPorOrigen } from "@/lib/gastos";
import { CLASE_ESTADO_SALIDA, estadoSalida, NOMBRE_ESTADO_SALIDA } from "@/lib/salidas";
import { NOMBRE_MOMENTO, NOMBRE_MOVIMIENTO, type TipoMovimiento } from "@/lib/tipos";
import type { ArqueoDia, DetalleTurno, GastoDia, MovimientoDia } from "./datos";

/** Las mismas tablas sirven en pantalla (se vuelven tarjetas en celular) y en los reportes para imprimir. */

type Nombres = Map<string, string>;

const COMPROBANTE: Record<string, string> = { cfdi: "Factura", nota: "Nota", sin_comprobante: "Sin comprobante" };
const conDiferencia = (n: number) => Math.round(Number(n) * 100) !== 0;

export function TablaArqueos({ arqueos, persona }: { arqueos: ArqueoDia[]; persona: Nombres }) {
  if (!arqueos.length) return <p className="vacio">Sin arqueos.</p>;
  return (
    <div className="tabla-contenedor">
      <table className="tabla tabla-tarjetas">
        <thead><tr><th>Hora</th><th>Momento</th><th>Entregó → recibió</th><th>Contado</th><th>Esperado</th><th>Diferencia</th></tr></thead>
        <tbody>
          {arqueos.map((a) => (
            <tr key={a.id} className={a.anulado_en ? "fila-anulada" : undefined}>
              <td data-label="Hora">{hora(a.creado_en)}</td>
              <td data-label="Momento">
                <span className="celda-pila">
                  {NOMBRE_MOMENTO[a.momento]}
                  {a.anulado_en ? <small className="nota-estado">Anulado: {a.motivo_anulacion}</small> : null}
                  {a.explicacion ? <small className="nota-estado">{a.explicacion}</small> : null}
                </span>
              </td>
              <td data-label="Entregó → recibió">{persona.get(a.entrega_id) ?? "—"} → {a.recibe_id ? persona.get(a.recibe_id) ?? "—" : "sin recibir"}</td>
              <td data-label="Contado" className="monto">{pesos(a.total_contado)}</td>
              <td data-label="Esperado" className="monto">{pesos(a.esperado)}</td>
              <td data-label="Diferencia" className={`monto${!a.anulado_en && conDiferencia(a.diferencia) ? " celda-alerta" : ""}`}>{pesos(a.diferencia)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TablaMovimientos({ movimientos, persona, caja }: { movimientos: MovimientoDia[]; persona: Nombres; caja: Nombres }) {
  if (!movimientos.length) return <p className="vacio">Sin movimientos.</p>;
  return (
    <div className="tabla-contenedor">
      <table className="tabla tabla-tarjetas">
        <thead><tr><th>Hora</th><th>Movimiento</th><th>De → a</th><th>Folio</th><th>Registró</th><th>Confirmó</th><th>Estado</th><th>Monto</th></tr></thead>
        <tbody>
          {movimientos.map((m) => {
            const salida = m.tipo === "salida_corporativo" ? estadoSalida(m) : null;
            return (
              <tr key={m.id}>
                <td data-label="Hora">{hora(m.creado_en)}</td>
                <td data-label="Movimiento">{NOMBRE_MOVIMIENTO[m.tipo]}</td>
                <td data-label="De → a">{caja.get(m.caja_origen_id) ?? "—"} → {caja.get(m.caja_destino_id) ?? "—"}</td>
                <td data-label="Folio">{m.folio ?? ""}</td>
                <td data-label="Registró">{persona.get(m.registrado_por) ?? "—"}</td>
                <td data-label="Confirmó">{m.confirmado_por ? persona.get(m.confirmado_por) ?? "—" : ""}</td>
                <td data-label="Estado"><span className="celda-pila">
                  {salida
                    ? <span className={`estado estado-${CLASE_ESTADO_SALIDA[salida]}`}>{NOMBRE_ESTADO_SALIDA[salida]}</span>
                    : <span className={`estado estado-${m.estado}`}>{m.estado}</span>}
                  {salida === "no_cuadro" && m.nota_recepcion ? <small className="nota-estado">{m.nota_recepcion}</small> : null}
                </span></td>
                <td data-label="Monto" className="monto">{pesos(m.monto)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TablaGastos({ gastos, persona }: { gastos: GastoDia[]; persona: Nombres }) {
  if (!gastos.length) return <p className="vacio">Sin gastos.</p>;
  return (
    <div className="tabla-contenedor">
      <table className="tabla tabla-tarjetas">
        <thead><tr><th>Hora</th><th>Concepto</th><th>Salió de</th><th>Comprobante</th><th>Monto</th></tr></thead>
        <tbody>
          {gastos.map((g) => (
            <tr key={g.id}>
              <td data-label="Hora">{hora(g.creado_en)}</td>
              <td data-label="Concepto">{g.concepto}{g.proveedor ? ` · ${g.proveedor}` : ""}</td>
              <td data-label="Salió de">
                {g.origen === "empleado"
                  ? `${persona.get(g.pagado_por ?? "") ?? "Empleado"}${g.repuesto_en ? " (repuesto)" : " (por reponer)"}`
                  : NOMBRE_ORIGEN[g.origen]}
              </td>
              <td data-label="Comprobante">{COMPROBANTE[g.comprobante] ?? g.comprobante}</td>
              <td data-label="Monto" className="monto">{pesos(g.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Matutino · abrió Ana 08:02 · cerró 16:05" */
export function lineaTurno(t: { tipo: string; abierto_en: string; cerrado_en: string | null; encargado_id: string }, persona: Nombres) {
  const tipo = t.tipo === "matutino" ? "Matutino" : "Vespertino";
  return `${tipo} · abrió ${persona.get(t.encargado_id) ?? "—"} a las ${hora(t.abierto_en)} · ${t.cerrado_en ? `cerró a las ${hora(t.cerrado_en)}` : "sigue abierto"}`;
}

/** Diferencia al cierre, movimientos confirmados por tipo, pendientes y gastos por origen. */
export function ResumenTurnoDatos({ t }: { t: DetalleTurno }) {
  const gastos = sumaPorOrigen(t.gastos);
  return (
    <dl className="tarjeta-datos">
      <dt>Diferencia al cierre</dt>
      <dd className={t.resumen.descuadrados ? "celda-alerta" : undefined}>
        {t.resumen.diferenciaCierre === null ? "Sin arqueo de cierre" : pesos(t.resumen.diferenciaCierre)}
      </dd>
      {(Object.entries(t.resumen.confirmadoPorTipo) as [TipoMovimiento, number][]).map(([tipo, monto]) => (
        <Fragment key={tipo}><dt>{NOMBRE_MOVIMIENTO[tipo]}</dt><dd>{pesos(monto)}</dd></Fragment>
      ))}
      {t.resumen.sinConfirmar > 0 && <><dt>Sin confirmar</dt><dd className="celda-alerta">{t.resumen.sinConfirmar} movimientos</dd></>}
      {ORIGENES.filter((o) => gastos[o] > 0).map((o) => (
        <Fragment key={o}><dt>Gastos · {NOMBRE_ORIGEN[o]}</dt><dd>{pesos(gastos[o])}</dd></Fragment>
      ))}
    </dl>
  );
}
