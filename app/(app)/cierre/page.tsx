import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeGestionar } from "@/lib/contexto";
import { hoyMX, pesos } from "@/lib/formato";
import { cerrarDia } from "./actions";
import { datosDelDia } from "./datos";

type Cierre = {
  venta_total: number; venta_neta: number; ticket_promedio: number; transacciones: number;
  boveda_esperado: number; boveda_contado: number; boveda_diferencia: number; gastos_boveda_dia: number;
  cambios_diferencia: number; diferencia_turnos: number; deposito_ficha: string | null;
};

/** "$4,500.00 (de ellos $3,000.00 de emergencia)" */
const fondoBoveda = (s: { fondo_boveda: number; fondo_emergencia: number }) =>
  `${pesos(s.fondo_boveda)} (de ellos ${pesos(s.fondo_emergencia)} de emergencia)`;
/** Lo que pasa del fondo de la bóveda y debe salir a corporativo. */
const porSalir = (bovedaHay: number, fondo: number) => Math.max(0, Math.round((bovedaHay - Number(fondo)) * 100) / 100);

const Fila = ({ texto, valor, fuerte }: { texto: string; valor: string; fuerte?: boolean }) => (
  <tr><td style={{ fontWeight: fuerte ? 700 : 400 }}>{texto}</td><td className="monto">{valor}</td></tr>
);

export default async function PaginaCierre({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, turno, soloLectura } = await obtenerContexto();
  const fecha = hoyMX();

  const { data: cierre } = await supabase.from("cierres_dia")
    .select("venta_total, venta_neta, ticket_promedio, transacciones, boveda_esperado, boveda_contado, boveda_diferencia, gastos_boveda_dia, cambios_diferencia, diferencia_turnos, deposito_ficha")
    .eq("sucursal_id", sucursal.id).eq("fecha", fecha).maybeSingle<Cierre>();

  if (cierre) {
    return (
      <>
        <div className="encabezado"><h1>Cierre del día {fecha}</h1><p>Este día ya está cerrado.</p></div>
        <Aviso ok={ok} error={error} />
        <section className="seccion">
          <table className="tabla"><tbody>
            <Fila texto="Venta total con IVA" valor={pesos(cierre.venta_total)} />
            <Fila texto="Venta neta sin IVA" valor={pesos(cierre.venta_neta)} fuerte />
            <Fila texto="Transacciones" valor={String(cierre.transacciones)} />
            <Fila texto="Ticket promedio sin IVA" valor={pesos(cierre.ticket_promedio)} />
            <Fila texto="Diferencia de los arqueos de turno" valor={pesos(cierre.diferencia_turnos)} fuerte />
            {Number(cierre.gastos_boveda_dia) > 0 && <Fila texto="Gastos pagados de la bóveda" valor={pesos(cierre.gastos_boveda_dia)} />}
            <Fila texto="Bóveda esperada" valor={pesos(cierre.boveda_esperado)} />
            <Fila texto="Bóveda contada" valor={pesos(cierre.boveda_contado)} />
            <Fila texto="Diferencia de bóveda" valor={pesos(cierre.boveda_diferencia)} fuerte />
            <Fila texto="Fondo que se queda en bóveda" valor={fondoBoveda(sucursal)} />
            <Fila texto="Debe salir a corporativo" valor={pesos(porSalir(Number(cierre.boveda_contado), sucursal.fondo_boveda))} fuerte />
            <Fila texto="Diferencia del fondo de cambios" valor={pesos(cierre.cambios_diferencia)} />
            <Fila texto="Folio de la salida a corporativo" valor={cierre.deposito_ficha ?? "Sin salida"} />
          </tbody></table>
        </section>
      </>
    );
  }

  if (!puedeGestionar(perfil.rol)) {
    return (
      <>
        <div className="encabezado"><h1>Cierre del día</h1></div>
        <p className="aviso aviso-info">{soloLectura ? "Este día todavía no se cierra." : "El cierre del día lo hace el gerente."}</p>
      </>
    );
  }

  const d = await datosDelDia(supabase, sucursal.id, fecha);
  const esperado = d.bovedaInicial + d.retiros - d.aperturas - d.depositos - d.gastosBoveda;
  const bloqueado = !!turno || d.pendientes > 0;

  const campo = (id: string, texto: string, ayuda?: string) => (
    <div className="campo">
      <label htmlFor={id}>{texto}</label>
      <input id={id} name={id} type="number" inputMode="decimal" min="0" step="0.01" required />
      {ayuda && <small>{ayuda}</small>}
    </div>
  );

  return (
    <>
      <div className="encabezado">
        <h1>Cierre del día {fecha}</h1>
        <p>Las ventas se copian del reporte de Dodo IS. Los datos de bóveda salen de los movimientos confirmados.</p>
      </div>
      <Aviso ok={ok} error={error} />
      {turno && <p className="aviso aviso-error">Hay un turno abierto. Ciérralo con su <Link href="/arqueo">arqueo de cierre</Link> primero.</p>}
      {d.pendientes > 0 && <p className="aviso aviso-error">Hay {d.pendientes} movimientos sin confirmar en <Link href="/movimientos">Movimientos</Link>.</p>}

      <form action={cerrarDia} className="formulario-pagina">
        <section className="seccion" aria-labelledby="t-ventas">
          <h2 id="t-ventas">Ventas según Dodo IS</h2>
          <div className="rejilla rejilla-corta">
            {campo("efectivo", "Efectivo")}
            {campo("tarjeta", "Tarjeta")}
            {campo("app", "App o pago en línea")}
            {campo("rappi", "Rappi")}
            {campo("descuentos", "Descuentos otorgados")}
            {campo("iva", "IVA incluido", "Venta neta = venta total − IVA")}
            <div className="campo">
              <label htmlFor="transacciones">Transacciones</label>
              <input id="transacciones" name="transacciones" type="number" inputMode="numeric" min="0" step="1" required />
            </div>
          </div>
        </section>

        <section className="seccion" aria-labelledby="t-boveda">
          <h2 id="t-boveda">Bóveda</h2>
          <table className="tabla"><tbody>
            <Fila texto="Saldo del cierre anterior" valor={pesos(d.bovedaInicial)} />
            <Fila texto="+ Retiros a bóveda de hoy" valor={pesos(d.retiros)} />
            <Fila texto="− Fondos entregados a caja de venta" valor={pesos(d.aperturas)} />
            <Fila texto="− Salidas a corporativo de hoy" valor={pesos(d.depositos)} />
            <Fila texto="− Gastos pagados de la bóveda hoy" valor={pesos(d.gastosBoveda)} />
            <Fila texto="= Debe haber en bóveda" valor={pesos(esperado)} fuerte />
            <Fila texto="Fondo que se queda en bóveda" valor={fondoBoveda(sucursal)} />
            <Fila texto="Puede salir a corporativo" valor={pesos(porSalir(esperado, sucursal.fondo_boveda))} />
            <Fila texto="Diferencia de los arqueos de turno" valor={pesos(d.diferenciaTurnos)} />
          </tbody></table>
          <div className="rejilla rejilla-corta">
            {campo("boveda_contado", "Efectivo contado en bóveda")}
            {campo("cambios_contado", "Fondo de cambios contado", `Debe sumar ${pesos(sucursal.fondo_cambios)}`)}
          </div>
        </section>

        <section className="seccion" aria-labelledby="t-deposito">
          <h2 id="t-deposito">Salida a corporativo</h2>
          <p className="saldo-nota">Si hoy salió efectivo a corporativo, el movimiento ya debe estar registrado y confirmado. Aquí quedan los datos de la entrega.</p>
          <div className="rejilla">
            <div className="campo"><label htmlFor="deposito_banco">Quién la recibió</label><input id="deposito_banco" name="deposito_banco" /></div>
            <div className="campo"><label htmlFor="deposito_ficha">Folio o recibo</label><input id="deposito_ficha" name="deposito_ficha" /></div>
            <div className="campo"><label htmlFor="deposito_fecha">Fecha y hora</label><input id="deposito_fecha" name="deposito_fecha" type="datetime-local" /></div>
          </div>
        </section>

        <div className="acciones">
          <BotonEnviar pendiente="Cerrando…">Cerrar el día</BotonEnviar>
          {bloqueado && <span className="saldo-nota">Resuelve los avisos de arriba antes de cerrar.</span>}
        </div>
      </form>
    </>
  );
}
