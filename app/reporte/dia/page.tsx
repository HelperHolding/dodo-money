import { redirect } from "next/navigation";
import { cargarDia } from "@/app/(app)/turnos/datos";
import { lineaTurno, ResumenTurnoDatos, TablaArqueos, TablaGastos, TablaMovimientos } from "@/app/(app)/turnos/Secciones";
import { obtenerContexto } from "@/lib/contexto";
import { fechaElegida } from "@/lib/corporativo";
import { fechaTexto, hora, hoyMX, pesos } from "@/lib/formato";
import { NOMBRE_ORIGEN, ORIGENES, sumaPorOrigen } from "@/lib/gastos";
import { puedeVerTurnos } from "@/lib/roles";
import { resumenDia } from "@/lib/turnos";
import { EncabezadoReporte } from "../Encabezado";

export const dynamic = "force-dynamic";

const Fila = ({ texto, valor, fuerte }: { texto: string; valor: string; fuerte?: boolean }) => (
  <tr><td style={{ fontWeight: fuerte ? 700 : 400 }}>{texto}</td><td className="monto">{valor}</td></tr>
);

/** Reporte del día para imprimir o guardar como PDF: los turnos, todos los movimientos, los gastos y el cierre. */
export default async function ReporteDia({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: pedida } = await searchParams;
  const { supabase, perfil, sucursal, cajas } = await obtenerContexto();
  if (!puedeVerTurnos(perfil.rol)) redirect("/");
  const fecha = fechaElegida(pedida, hoyMX());
  const dia = await cargarDia(supabase, sucursal.id, fecha, new Date());
  const caja = new Map(cajas.map((c) => [c.id, c.nombre]));
  const total = resumenDia(dia.turnos.map((t) => t.resumen));
  const gastos = sumaPorOrigen(dia.gastos);
  const c = dia.cierre;

  return (
    <main className="pagina">
      <EncabezadoReporte titulo="Reporte del día" sucursal={sucursal.nombre}
        detalle={`${fechaTexto(fecha)} · ${total.turnos} ${total.turnos === 1 ? "turno" : "turnos"}`} generadoPor={perfil.nombre} />

      <section className="seccion">
        <h2>Cierre del día</h2>
        {!c ? <p className="vacio">Este día todavía no se cierra.</p> : (
          <table className="tabla"><tbody>
            <Fila texto="Venta total con IVA" valor={pesos(c.venta_total)} />
            <Fila texto="Venta neta sin IVA" valor={pesos(c.venta_neta)} fuerte />
            <Fila texto="Transacciones" valor={String(c.transacciones)} />
            <Fila texto="Ticket promedio sin IVA" valor={pesos(c.ticket_promedio)} />
            <Fila texto="Saldo de bóveda del cierre anterior" valor={pesos(c.boveda_inicial)} />
            <Fila texto="+ Retiros a bóveda" valor={pesos(c.retiros_dia)} />
            <Fila texto="− Fondos a caja de venta" valor={pesos(c.aperturas_dia)} />
            <Fila texto="− Salidas a corporativo" valor={pesos(c.deposito_dia)} />
            <Fila texto="− Gastos pagados de la bóveda" valor={pesos(c.gastos_boveda_dia)} />
            <Fila texto="= Bóveda esperada" valor={pesos(c.boveda_esperado)} fuerte />
            <Fila texto="Bóveda contada" valor={pesos(c.boveda_contado)} />
            <Fila texto="Diferencia de bóveda" valor={pesos(c.boveda_diferencia)} fuerte />
            <Fila texto="Fondo que se queda en bóveda" valor={pesos(sucursal.fondo_boveda)} />
            <Fila texto="Debe salir a corporativo" valor={pesos(Math.max(0, Number(c.boveda_contado) - Number(sucursal.fondo_boveda)))} />
            <Fila texto="Diferencia del fondo de cambios" valor={pesos(c.cambios_diferencia)} />
            <Fila texto="Rappi según Dodo IS" valor={pesos(c.rappi)} />
            <Fila texto="Corte de Rappi" valor={c.rappi_corte === null ? "Sin registrar" : `${pesos(c.rappi_corte)} (diferencia ${pesos(Number(c.rappi_corte) - Number(c.rappi))})`} />
            <Fila texto="Folio de la salida a corporativo" valor={c.deposito_ficha ?? "Sin salida"} />
            <Fila texto="Cerró" valor={`${dia.persona.get(c.cerrado_por) ?? "—"} a las ${hora(c.cerrado_en)}`} />
          </tbody></table>
        )}
      </section>

      <section className="seccion">
        <h2>Resumen de turnos</h2>
        <table className="tabla"><tbody>
          <Fila texto="Diferencia de los arqueos de cierre" valor={pesos(total.diferencia)} fuerte />
          {total.abiertos > 0 && <Fila texto="Turnos sin arqueo de cierre" valor={String(total.abiertos)} />}
          {ORIGENES.map((o) => <Fila key={o} texto={`Gastos · ${NOMBRE_ORIGEN[o]}`} valor={pesos(gastos[o])} />)}
        </tbody></table>
      </section>

      {dia.turnos.map((t) => (
        <section key={t.turno.id} className="seccion">
          <h2>Turno {t.turno.tipo}</h2>
          <p>{lineaTurno(t.turno, dia.persona)}</p>
          <ResumenTurnoDatos t={t} />
          <h3>Arqueos</h3>
          <TablaArqueos arqueos={t.arqueos} persona={dia.persona} />
          <h3>Movimientos ({t.movimientos.length})</h3>
          <TablaMovimientos movimientos={t.movimientos} persona={dia.persona} caja={caja} />
          <h3>Gastos ({t.gastos.length})</h3>
          <TablaGastos gastos={t.gastos} persona={dia.persona} />
        </section>
      ))}

      {(dia.fuera.movimientos.length > 0 || dia.fuera.gastos.length > 0) && (
        <section className="seccion">
          <h2>Fuera de turno</h2>
          <p className="saldo-nota">Registrado cuando no había un turno abierto.</p>
          {dia.fuera.movimientos.length > 0 && <><h3>Movimientos</h3><TablaMovimientos movimientos={dia.fuera.movimientos} persona={dia.persona} caja={caja} /></>}
          {dia.fuera.gastos.length > 0 && <><h3>Gastos</h3><TablaGastos gastos={dia.fuera.gastos} persona={dia.persona} /></>}
        </section>
      )}
    </main>
  );
}
