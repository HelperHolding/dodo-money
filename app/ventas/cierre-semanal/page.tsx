import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { ConInfo } from "@/components/ConInfo";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaConAnio, fechaMX, fechaTexto, hora, hoyCalendarioMX, pesos } from "@/lib/formato";
import { puedeEditarFinanzas, puedeVerFinanzas } from "@/lib/roles";
import { diasDeSemana, semanaDe, type CierreSemanal } from "@/lib/ventas/cierreSemanal";
import { aprobarSemana } from "./acciones";
import { cargarCierreSemanal } from "./datos";
import { Imprimir } from "./Imprimir";

export const dynamic = "force-dynamic";

type Filtros = { sucursal?: string; semana?: string; ok?: string; error?: string };
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const MES = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
const firmado = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${pesos(Math.abs(n))}`;

/** Diferencia en tono suave bajo la cifra; solo si pasa de $1. */
function Dif({ valor, contra }: { valor: number | null; contra: string }) {
  if (valor === null || Math.abs(valor) <= 1) return null;
  return <small className="cierre-dif" data-signo={valor < 0 ? "menos" : "mas"}>{firmado(valor)} vs {contra}</small>;
}

function Tabla({ c }: { c: CierreSemanal }) {
  const conHuecosEf = c.dias.some((d) => d.difEfectivo === null);
  const conHuecosRa = c.dias.some((d) => d.difRappi === null);
  return (
    <div className="tabla-contenedor">
      <table className="akton-tabla tabla-tarjetas cierre-tabla">
        <thead>
          <tr><th scope="col">Día</th><th scope="col">Efectivo</th><th scope="col">Tarjeta</th><th scope="col">Rappi</th><th scope="col">Rappi Turbo</th><th scope="col">Total</th></tr>
        </thead>
        <tbody>
          {c.dias.map((d) => (
            <tr key={d.fecha} className="akton-fila">
              <td data-label="Día"><strong>{fechaTexto(d.fecha)}</strong></td>
              <td data-label="Efectivo" className="monto">
                <span className="celda-pila">{d.sinArqueos ? <span className="cierre-aviso">Sin arqueos</span> : pesos(d.efectivo)}<Dif valor={d.difEfectivo} contra="Dodo IS" /></span>
              </td>
              <td data-label="Tarjeta" className="monto">{d.sinArqueos ? <span className="cierre-aviso">Sin arqueos</span> : pesos(d.tarjeta)}</td>
              <td data-label="Rappi" className="monto">
                <span className="celda-pila">{d.sinPortal ? <span className="cierre-aviso">Sin datos del portal</span> : pesos(d.rappi)}<Dif valor={d.difRappi} contra="arqueo (con Turbo)" /></span>
              </td>
              <td data-label="Rappi Turbo" className="monto">{d.sinPortal ? "—" : pesos(d.turbo)}</td>
              <td data-label="Total" className="monto"><strong>{pesos(d.total)}</strong></td>
            </tr>
          ))}
          <tr className="akton-destacado">
            <td data-label=""><strong>Total de la semana</strong></td>
            <td data-label="Efectivo" className="monto">
              <span className="celda-pila">{pesos(c.semana.efectivo)}{!conHuecosEf && <Dif valor={c.semana.difEfectivo} contra="Dodo IS" />}</span>
            </td>
            <td data-label="Tarjeta" className="monto">{pesos(c.semana.tarjeta)}</td>
            <td data-label="Rappi" className="monto">
              <span className="celda-pila">{pesos(c.semana.rappi)}{!conHuecosRa && <Dif valor={c.semana.difRappi} contra="arqueo (con Turbo)" />}</span>
            </td>
            <td data-label="Rappi Turbo" className="monto">{pesos(c.semana.turbo)}</td>
            <td data-label="Total" className="monto">{pesos(c.semana.total)}</td>
          </tr>
        </tbody>
      </table>
      {(conHuecosEf || conHuecosRa) && (
        <p className="saldo-nota">La diferencia semanal {conHuecosEf && conHuecosRa ? "de efectivo y de Rappi" : conHuecosEf ? "de efectivo" : "de Rappi"} no se
          muestra porque hay días sin arqueo{conHuecosEf ? " o sin venta de Dodo IS" : ""}: revisa la diferencia de cada día.</p>
      )}
    </div>
  );
}

function NetPay({ c, sinAsignar, cuentas }: { c: CierreSemanal; sinAsignar: number; cuentas: number }) {
  const n = c.netpay;
  const faltan = c.dias.filter((d) => d.sinArqueos).length;
  return (
    <section className="seccion cierre-netpay" aria-labelledby="cierre-netpay">
      <h2 id="cierre-netpay">NetPay de la semana</h2>
      <dl className="transito-totales">
        <div><dt>Tarjeta en arqueos</dt><dd>{pesos(n.tarjeta)}</dd></div>
        <div><dt>Depositado por NetPay</dt><dd>{pesos(n.depositado)}</dd></div>
        <div><dt>Comisiones NetPay</dt><dd>{pesos(n.comisiones)}</dd></div>
        {/* Con días sin arqueo la tarjeta está incompleta: la diferencia va en tono neutro y dice cuántos días faltan. */}
        <div data-alerta={!faltan && n.diferencia !== null && Math.abs(n.diferencia) > 1 ? "si" : undefined}>
          <dt>Diferencia</dt><dd>{n.diferencia === null ? "Pendiente" : firmado(n.diferencia)}
            {faltan > 0 && <small className="cierre-dif"> Faltan arqueos de {faltan} {faltan === 1 ? "día" : "días"}</small>}</dd>
        </div>
      </dl>
      {n.pendiente && <p className="saldo-nota"><strong>Pendiente de estado de cuenta</strong> (último movimiento: {n.ultimoMovimiento ? fechaConAnio(n.ultimoMovimiento) : "sin movimientos"}).</p>}
      {cuentas === 0 && <p className="saldo-nota">La razón social de esta sucursal no tiene cuenta de banco registrada en Banca.</p>}
      {sinAsignar > 0 && <p className="saldo-nota">Hay {pesos(sinAsignar)} de NetPay en una cuenta compartida sin sucursal asignada; no se cuentan aquí.</p>}
      <p className="saldo-nota">Diferencia = tarjeta − (depositado + comisiones). La atribución es aproximada mientras no se concilie en Banca:
        se toman los depósitos conciliados contra ventas de esta semana (si la conciliación incluye ventas de otra sucursal, solo la parte proporcional)
        y, si no, los abonos y comisiones NetPay del martes de la semana al lunes siguiente que no estén conciliados.</p>
    </section>
  );
}

export default async function CierreSemanalPagina({ searchParams }: { searchParams: Promise<Filtros> }) {
  const q = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) notFound();
  const admin = puedeEditarFinanzas(perfil.rol);
  const hoy = hoyCalendarioMX();
  const semana = /^\d{4}-\d{2}-\d{2}$/.test(q.semana ?? "") && !Number.isNaN(Date.parse(`${q.semana}T00:00:00Z`))
    ? semanaDe(q.semana!) : sumarDias(semanaDe(hoy), -7);
  const dias = diasDeSemana(semana);
  const terminada = dias[6] < hoy;

  const { data: sucursales, error } = await supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>();
  if (error) throw new Error(`No se pudieron consultar las sucursales: ${error.message}`);
  const lista = sucursales ?? [];
  const suc = lista.find((s) => s.id === q.sucursal) ?? lista.find((s) => s.id === perfil.sucursal_id) ?? lista[0];
  if (!suc) return <EncabezadoPagina titulo="Cierre semanal" descripcion="No hay sucursales registradas." />;

  const { cierre, aprobacion, cambios, netpayCompletado, sinMigracion, netpaySinAsignar, cuentas } = await cargarCierreSemanal(supabase, suc.id, semana);
  let aprobador: string | null = null;
  if (aprobacion) {
    const r = await supabase.from("perfiles").select("nombre").eq("id", aprobacion.aprobadoPor).maybeSingle<{ nombre: string }>();
    if (r.error) throw new Error(`No se pudo consultar quién aprobó el cierre semanal: ${r.error.message}`);
    aprobador = r.data?.nombre ?? "un usuario que ya no aparece en perfiles";
  }
  const liga = (s: string) => `/ventas/cierre-semanal?${new URLSearchParams({ sucursal: suc.id, semana: s })}`;
  const rango = `lun ${MES.format(new Date(`${semana}T00:00:00Z`))} – dom ${MES.format(new Date(`${dias[6]}T00:00:00Z`))}`;

  return (
    <div className="cierre-semanal">
      <EncabezadoPagina
        titulo={<>Cierre semanal · {suc.nombre} · {rango}</>}
        descripcion="Venta por canal de cada día: efectivo y tarjeta de los arqueos, Rappi del portal de aliados. Debajo de cada cifra, la diferencia contra su referencia cuando pasa de $1."
        acciones={<Imprimir />}
      />
      <Aviso ok={q.ok} error={q.error} />
      <form className="barra-filtros no-imprimir" role="search">
        <div className="campo"><label htmlFor="sucursal" className="solo-lector">Sucursal</label>
          <select id="sucursal" name="sucursal" defaultValue={suc.id}>{lista.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
        <div className="campo"><label htmlFor="semana" className="solo-lector">Semana (cualquier día)</label>
          <input id="semana" name="semana" type="date" defaultValue={semana} /></div>
        <button className="boton boton-secundario boton-compacto" type="submit">Ver</button>
        <Link className="boton boton-secundario boton-compacto" href={liga(sumarDias(semana, -7))}>‹ Semana anterior</Link>
        <Link className="boton boton-secundario boton-compacto" href={liga(sumarDias(semana, 7))}>Semana siguiente ›</Link>
      </form>

      <section className="cierre-estado" data-estado={!aprobacion ? "sin" : cambios.length ? "cambio" : "ok"}>
        {!aprobacion && <p><strong>Sin aprobar</strong>{!terminada && " · la semana aún no termina"}</p>}
        {aprobacion && (
          <p><strong>{cambios.length ? "Cambió después de aprobar" : "Aprobado"}</strong> · aprobado por {aprobador} el {fechaTexto(fechaMX(aprobacion.aprobadoEn))} a las {hora(aprobacion.aprobadoEn)}
            {aprobacion.nota && <> · «{aprobacion.nota}»</>}</p>
        )}
        {sinMigracion && <p>La aprobación estará disponible cuando se aplique la migración.</p>}
        {cambios.length > 0 && (
          <>
            <p>La tabla muestra las cifras actuales, no la copia aprobada.</p>
            <ul>{cambios.map((c) => <li key={c}>{c}</li>)}</ul>
          </>
        )}
        {netpayCompletado !== null && <p>NetPay completado después de aprobar: depositado {pesos(netpayCompletado)}</p>}
      </section>

      <section className="akton-tabla-marco">
        <h2 className="akton-titulo">Venta por día</h2>
        <p className="akton-subtitulo">Efectivo = ventas en efectivo + diferencia del arqueo de cada turno · Rappi sin Turbo y Turbo, pedidos finalizados del portal.</p>
        <Tabla c={cierre} />
      </section>

      <NetPay c={cierre} sinAsignar={netpaySinAsignar} cuentas={cuentas} />

      {admin && terminada && !sinMigracion && (
        <section className="seccion no-imprimir" aria-labelledby="cierre-aprobar">
          <h2 id="cierre-aprobar">{aprobacion ? "Volver a aprobar" : "Aprobar semana"}</h2>
          <form action={aprobarSemana} className="cierre-aprobar">
            <input type="hidden" name="sucursal" value={suc.id} />
            <input type="hidden" name="semana" value={semana} />
            <div className="campo"><label htmlFor="nota">Nota (opcional)</label>
              <textarea id="nota" name="nota" maxLength={500} rows={2} defaultValue="" /></div>
            <button className="boton" type="submit">{aprobacion ? "Volver a aprobar" : "Aprobar semana"}</button>
            {cierre.netpay.pendiente && <small className="saldo-nota">NetPay sigue pendiente; se completará solo después de aprobar.</small>}
            <small className="saldo-nota">Se guarda una copia de los totales tal como se ven ahora.</small>
          </form>
        </section>
      )}

      <ConInfo titulo="Cierre semanal" etiqueta="Cómo se calcula">
        Para cada turno se toma el arqueo que cierra su venta (traspaso del matutino, cierre del vespertino) sin contar los anulados.
        Rappi y Turbo salen de las órdenes finalizadas del portal; la diferencia de Rappi compara ambos contra lo capturado en el arqueo, que no separa Turbo.
        «Sin datos del portal» significa que ese día no hay ninguna orden importada para la sucursal.
      </ConInfo>
    </div>
  );
}
