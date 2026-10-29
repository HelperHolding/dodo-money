import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONCEPTOS, documentosRpc, type MovimientoBanco, type Sugerencia } from "@/lib/banca/conciliacion";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import type { CuentaBanca, FiltrosBanca } from "../Banregio";
import { anularConciliacionBanca, conciliarMovimientos, confirmarExactas } from "./acciones";
import { leerConciliacion } from "./datos";
import styles from "../banca.module.css";

const NOMBRE_TIPO: Record<string, string> = {
  cobro_tarjeta: "Cobros con tarjeta (NetPay)", cobro_rappi: "Cobros de Rappi", pago_proveedor: "Pagos a proveedores", nomina: "Nómina", sin_documento: "Sin documento",
};
const nombreConcepto = (c: string) => CONCEPTOS.find((x) => x.clave === c)?.nombre ?? c;
const GRUPOS = [["operacion", "Operación"], ["inversion", "Inversión"], ["financiamiento", "Financiamiento"], ["excluido", "Fuera del flujo"]] as const;
const fecha = (f: string | undefined, def: string) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : def);

function SelectorConcepto({ valor }: { valor: string }) {
  return <label>Concepto de flujo<select name="concepto" defaultValue={valor} required>
    {GRUPOS.map(([g, n]) => <optgroup key={g} label={n}>{CONCEPTOS.filter((c) => c.grupo === g).map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}</optgroup>)}
  </select></label>;
}
const Movimientos = ({ ms }: { ms: MovimientoBanco[] }) => <ul className={styles.filaMovimiento}>
  {ms.map((m) => <li key={m.id}><span>{fechaTexto(m.fecha)} · {m.descripcion}</span><strong>{m.abono > 0 ? pesos(m.abono) : `−${pesos(m.cargo)}`}</strong></li>)}
</ul>;

export async function Conciliacion({ db, cuentas, edita, q }: { db: SupabaseClient; cuentas: CuentaBanca[]; edita: boolean; q: FiltrosBanca & { ok?: string; error?: string } }) {
  const cuenta = cuentas.find((c) => c.id === q.cuenta) ?? cuentas[0];
  const hoy = hoyCalendarioMX();
  const desde = fecha(q.desde, `${hoy.slice(0, 7)}-01`), hasta = fecha(q.hasta, hoy);
  if (!cuenta) return <section className={styles.panel}><h2>Conciliación</h2><p>Primero importa un reporte de Banregio.</p></section>;
  if (desde > hasta) return <section className={styles.panel}><p role="alert" className="aviso aviso-error">La fecha inicial debe ser anterior a la final.</p></section>;
  const d = await leerConciliacion(db, cuenta, desde, hasta);
  const enSugerencia = new Set(d.sugerencias.flatMap((s) => s.movimientos));
  const sinSugerencia = d.pendientes.filter((m) => !enSugerencia.has(m.id));
  const exactas = d.sugerencias.filter((s) => s.exacta).length;
  const ocultos = (extra: Record<string, string>) => <>
    <input type="hidden" name="cuenta" value={cuenta.id} /><input type="hidden" name="desde" value={desde} /><input type="hidden" name="hasta" value={hasta} />
    {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
  </>;
  const tarjetaSugerencia = (s: Sugerencia) => {
    const ms = s.movimientos.map(d.movimiento).filter((m): m is MovimientoBanco => Boolean(m));
    const requiereNota = s.tipo === "sin_documento" || (s.diferencia ?? 0) !== 0;
    return <article className={styles.tarjeta} key={s.movimientos.join(",")}>
      <Movimientos ms={ms} />
      {s.documentos.length > 0 && <ul>{s.documentos.map((x, i) => <li key={i}>{x.texto} · {pesos(x.monto)}</li>)}</ul>}
      {s.diferencia !== null && <p className={s.diferencia ? styles.diferencia : undefined}>Diferencia: {pesos(s.diferencia)}</p>}
      {edita && <form action={conciliarMovimientos} className={styles.formularioLinea}>
        {ocultos({ solicitud: randomUUID(), movimientos: s.movimientos.join(","), tipo: s.tipo, documentos: JSON.stringify(documentosRpc(s.documentos)) })}
        <SelectorConcepto valor={s.concepto} />
        <label>Nota<input name="nota" defaultValue={s.nota} maxLength={1000} required={requiereNota} /></label>
        <button className="boton boton-compacto">Confirmar</button>
      </form>}
    </article>;
  };

  return <section className={styles.panel}>
    <div className={styles.encabezado}><div><h2>Conciliación</h2><p>{cuenta.razon_social} · cuenta {cuenta.numero.slice(-4)} · {d.pendientes.length} por conciliar en el periodo</p></div></div>
    {q.ok && <p role="status" className="aviso">{q.ok}</p>}
    {q.error && <p role="alert" className="aviso aviso-error">{q.error}</p>}
    <form method="get" className={styles.filtros}>
      <input type="hidden" name="vista" value="conciliacion" />
      <label>Cuenta<select name="cuenta" defaultValue={cuenta.id}>{cuentas.map((c) => <option value={c.id} key={c.id}>{c.razon_social} · {c.numero.slice(-4)}</option>)}</select></label>
      <label>Desde<input type="date" name="desde" defaultValue={desde} /></label><label>Hasta<input type="date" name="hasta" defaultValue={hasta} /></label>
      <button className="boton boton-secundario">Filtrar</button>
    </form>
    <p className={styles.nota}>Conciliar es documental: no marca facturas pagadas, no crea ventas ni pagos y no cambia saldos. La app sugiere; nada queda conciliado sin confirmarlo.</p>

    <h3>Sugerencias</h3>
    {edita && exactas > 0 && <form action={confirmarExactas}>{ocultos({})}<button className="boton">Confirmar {exactas} exactas</button></form>}
    {d.sugerencias.length === 0 && <p>No hay sugerencias para el periodo.</p>}
    {Object.keys(NOMBRE_TIPO).map((t) => {
      const ss = d.sugerencias.filter((s) => s.tipo === t);
      return ss.length > 0 && <details key={t} open><summary>{NOMBRE_TIPO[t]} ({ss.length})</summary><div className={styles.tarjetas}>{ss.map(tarjetaSugerencia)}</div></details>;
    })}

    <h3>Sin sugerencia ({sinSugerencia.length})</h3>
    <div className={styles.tarjetas}>{sinSugerencia.map((m) => {
      const pagos = m.cargo > 0 ? d.pagos.filter((p) => Math.abs(p.monto - m.cargo) < 0.005) : [];
      return <article className={styles.tarjeta} key={m.id}>
        <Movimientos ms={[m]} />
        {edita && pagos.length > 0 && <form action={conciliarMovimientos} className={styles.formularioLinea}>
          {ocultos({ solicitud: randomUUID(), movimientos: m.id, tipo: "pago_proveedor" })}
          <label>Pago registrado<select name="pago" required>{pagos.map((p) => <option key={p.id} value={p.id}>{p.proveedor} · {fechaTexto(p.fecha)} · {pesos(p.monto)}</option>)}</select></label>
          <SelectorConcepto valor="proveedores" />
          <button className="boton boton-compacto">Vincular pago</button>
        </form>}
        {edita && m.cargo > 0 && <form action={conciliarMovimientos} className={styles.formularioLinea}>
          {ocultos({ solicitud: randomUUID(), movimientos: m.id, tipo: "nomina", concepto: "nomina", documentos: "[]" })}
          <label>Nota (opcional)<input name="nota" maxLength={1000} /></label>
          <button className="boton boton-secundario boton-compacto">Nómina</button>
        </form>}
        {edita && <form action={conciliarMovimientos} className={styles.formularioLinea}>
          {ocultos({ solicitud: randomUUID(), movimientos: m.id, tipo: "sin_documento", documentos: "[]" })}
          <SelectorConcepto valor="otros_operacion" />
          <label>Nota<input name="nota" maxLength={1000} required placeholder="Qué es y por qué no tiene documento" /></label>
          <button className="boton boton-secundario boton-compacto">Sin documento</button>
        </form>}
      </article>;
    })}</div>

    <details className={styles.detalle}><summary>Conciliados del periodo ({d.conciliadas.length})</summary><div className={styles.tarjetas}>{d.conciliadas.map((x) => <article className={styles.tarjeta} key={x.id}>
      <p><strong>{NOMBRE_TIPO[x.tipo] ?? x.tipo}</strong> · {nombreConcepto(x.concepto)}</p>
      <Movimientos ms={x.movimientos} />
      {x.diferencia !== null && <p className={Number(x.diferencia) ? styles.diferencia : undefined}>Documentos {pesos(Number(x.monto_documentos))} · diferencia {pesos(Number(x.diferencia))}</p>}
      {x.nota && <p><small>{x.nota}</small></p>}
      {edita && <form action={anularConciliacionBanca} className={styles.formularioLinea}>
        {ocultos({ id: x.id })}
        <label>Motivo<input name="motivo" minLength={5} maxLength={1000} required /></label>
        <button className="boton boton-secundario boton-compacto">Anular</button>
      </form>}
    </article>)}</div></details>
  </section>;
}
