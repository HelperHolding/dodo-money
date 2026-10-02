import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { fechaElegida } from "@/lib/corporativo";
import { fechaTexto, hoyMX, pesos } from "@/lib/formato";
import { sumaPorOrigen } from "@/lib/gastos";
import { puedeVerTurnos } from "@/lib/roles";
import { resumenDia } from "@/lib/turnos";
import { cargarDia } from "./datos";
import { lineaTurno } from "./Secciones";

export default async function Turnos({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: pedida } = await searchParams;
  const { supabase, perfil, sucursal } = await obtenerContexto();
  if (!puedeVerTurnos(perfil.rol)) redirect("/");
  const hoy = hoyMX();
  const fecha = fechaElegida(pedida, hoy);
  const dia = await cargarDia(supabase, sucursal.id, fecha, new Date());
  const total = resumenDia(dia.turnos.map((t) => t.resumen));
  const hayFuera = dia.fuera.movimientos.length > 0 || dia.fuera.gastos.length > 0;

  return (
    <>
      <div className="encabezado">
        <h1>Turnos</h1>
        <p>Qué pasó en cada turno de {fechaTexto(fecha)}: arqueos, movimientos y gastos.</p>
      </div>

      <form className="acciones" method="get">
        <label htmlFor="fecha" className="etiqueta">Día</label>
        <input id="fecha" name="fecha" type="date" defaultValue={fecha} max={hoy} />
        <button className="boton boton-secundario" type="submit">Ver</button>
        <Link className="boton" href={`/reporte/dia?fecha=${fecha}`} target="_blank">Reporte del día (PDF)</Link>
      </form>

      <div className="rejilla">
        <div className="saldo"><span>Turnos</span><span className="saldo-monto">{total.turnos}</span>
          {total.abiertos > 0 && <span className="saldo-nota">{total.abiertos} sin cerrar</span>}</div>
        <div className="saldo" style={Math.round(total.diferencia * 100) !== 0 ? { borderLeftColor: "var(--alerta)" } : undefined}>
          <span>Diferencia de cierres</span><span className="saldo-monto">{pesos(total.diferencia)}</span>
        </div>
        <div className="saldo"><span>Cierre del día</span><span className="saldo-monto">{dia.cierre ? "Hecho" : "Falta"}</span></div>
      </div>

      {!dia.turnos.length && <p className="vacio">No hubo turnos este día.</p>}
      <div className="tarjetas">
        {dia.turnos.map(({ turno, arqueos, gastos, resumen }) => {
          const g = sumaPorOrigen(gastos);
          return (
            <article key={turno.id} className="tarjeta" data-alerta={resumen.alerta ? "si" : undefined}>
              <div className="tarjeta-encabezado">
                <div>
                  <h2><Link href={`/turnos/${turno.id}`}>Turno {turno.tipo}</Link></h2>
                  <p className="tarjeta-estado">{lineaTurno(turno, dia.persona)}</p>
                </div>
              </div>
              <dl className="tarjeta-datos">
                <dt>Arqueos</dt>
                <dd>
                  <span>{arqueos.length} {arqueos.length === 1 ? "arqueo" : "arqueos"}</span>
                  <span className={resumen.descuadrados ? "celda-alerta" : undefined}>
                    {resumen.diferenciaCierre === null ? "Sin arqueo de cierre" : `Diferencia al cierre ${pesos(resumen.diferenciaCierre)}`}
                  </span>
                </dd>
                <dt>Movimientos</dt>
                <dd>
                  <span>{resumen.movimientos}</span>
                  {resumen.sinConfirmar > 0 && <span className="celda-alerta">{resumen.sinConfirmar} sin confirmar</span>}
                </dd>
                <dt>Gastos</dt>
                <dd>{gastos.length ? `${pesos(g.caja_chica + g.boveda + g.empleado)} (${gastos.length})` : "Ninguno"}</dd>
              </dl>
              <div className="acciones">
                <Link className="boton boton-secundario" href={`/turnos/${turno.id}`}>Ver turno</Link>
                <Link href={`/reporte/turno/${turno.id}`} target="_blank">Reporte (PDF)</Link>
              </div>
            </article>
          );
        })}
        {hayFuera && (
          <article className="tarjeta">
            <div className="tarjeta-encabezado"><div><h2>Fuera de turno</h2><p className="tarjeta-estado">Registrado sin turno abierto</p></div></div>
            <dl className="tarjeta-datos">
              <dt>Movimientos</dt><dd>{dia.fuera.movimientos.length}</dd>
              <dt>Gastos</dt><dd>{dia.fuera.gastos.length}</dd>
            </dl>
            <p className="saldo-nota">Aparecen en el reporte del día.</p>
          </article>
        )}
      </div>
    </>
  );
}
