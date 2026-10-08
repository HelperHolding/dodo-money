import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeGestionar } from "@/lib/contexto";
import { hoyMX, pesos } from "@/lib/formato";
import { CampoArchivo } from "@/components/CampoArchivo";
import { BUCKET_FOTOS } from "@/lib/fotos";
import { diferenciaRappi } from "@/lib/rappi";
import { cerrarDia, registrarCorteRappi } from "./actions";
import { datosDelDia } from "./datos";
import { bovedaDe } from "../movimientos/datos";
import { salidaSugerida } from "@/lib/fondos";

type Cierre = {
  id: string; rappi: number; rappi_corte: number | null; rappi_corte_ruta: string | null;
  venta_total: number; venta_neta: number; ticket_promedio: number; transacciones: number;
  boveda_esperado: number; boveda_contado: number; boveda_diferencia: number; gastos_boveda_dia: number;
  cambios_diferencia: number; diferencia_turnos: number; deposito_ficha: string | null;
};

/** "$4,500.00 (de ellos $3,000.00 de emergencia)" */
const fondoBoveda = (s: { fondo_boveda: number; fondo_emergencia: number }) =>
  `${pesos(s.fondo_boveda)} (de ellos ${pesos(s.fondo_emergencia)} de emergencia)`;
/** Lo que pasa del fondo de la bóveda y debe salir a corporativo. */

const Fila = ({ texto, valor, fuerte }: { texto: string; valor: string; fuerte?: boolean }) => (
  <tr><td style={{ fontWeight: fuerte ? 700 : 400 }}>{texto}</td><td className="monto">{valor}</td></tr>
);

export default async function PaginaCierre({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, turno, soloLectura } = await obtenerContexto();
  const fecha = hoyMX();
  const disponibilidad=await bovedaDe(supabase,sucursal.id,Number(sucursal.fondo_boveda));

  const { data: cierre } = await supabase.from("cierres_dia")
    .select("id, rappi, rappi_corte, rappi_corte_ruta, venta_total, venta_neta, ticket_promedio, transacciones, boveda_esperado, boveda_contado, boveda_diferencia, gastos_boveda_dia, cambios_diferencia, diferencia_turnos, deposito_ficha")
    .eq("sucursal_id", sucursal.id).eq("fecha", fecha).maybeSingle<Cierre>();

  if (cierre) {
    const difRappi = diferenciaRappi(Number(cierre.rappi), cierre.rappi_corte === null ? null : Number(cierre.rappi_corte));
    const urlCorte = cierre.rappi_corte_ruta
      ? (await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(cierre.rappi_corte_ruta, 3600)).data?.signedUrl ?? null
      : null;
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
            {Number(cierre.gastos_boveda_dia) !== 0 && <Fila texto="Gastos y pagos de bóveda, netos de anulaciones" valor={pesos(cierre.gastos_boveda_dia)} />}
            <Fila texto="Bóveda esperada" valor={pesos(cierre.boveda_esperado)} />
            <Fila texto="Bóveda contada" valor={pesos(cierre.boveda_contado)} />
            <Fila texto="Diferencia de bóveda" valor={pesos(cierre.boveda_diferencia)} fuerte />
            <Fila texto="Fondo que se queda en bóveda" valor={fondoBoveda(sucursal)} />
            <Fila texto="Reservado actualmente para pagos" valor={pesos(disponibilidad.reservas)} />
            <Fila texto="Puede salir a corporativo ahora" valor={pesos(salidaSugerida(disponibilidad))} fuerte />
            <Fila texto="Diferencia del fondo de cambios" valor={pesos(cierre.cambios_diferencia)} />
            <Fila texto="Folio de la salida a corporativo" valor={cierre.deposito_ficha ?? "Sin salida"} />
          </tbody></table>
        </section>
        <section className="seccion" aria-labelledby="t-rappi">
          <h2 id="t-rappi">Corte de Rappi</h2>
          <table className="tabla"><tbody>
            <Fila texto="Rappi según Dodo IS" valor={pesos(cierre.rappi)} />
            <Fila texto="Corte de Rappi" valor={cierre.rappi_corte === null ? "Sin registrar" : pesos(cierre.rappi_corte)} />
            {difRappi !== null && <Fila texto="Diferencia (Rappi − Dodo IS)" valor={pesos(difRappi)} fuerte />}
          </tbody></table>
          {urlCorte && <p><a href={urlCorte} target="_blank" rel="noopener noreferrer">Ver el corte de Rappi</a></p>}
          {cierre.rappi_corte === null && puedeGestionar(perfil.rol) && !soloLectura && (
            <form action={registrarCorteRappi} className="formulario">
              <input type="hidden" name="cierre_id" value={cierre.id} />
              <input type="hidden" name="fecha" value={fecha} />
              <p className="saldo-nota">Si el reporte de Rappi llegó después del cierre, regístralo aquí (una sola vez).</p>
              <div className="rejilla">
                <div className="campo"><label htmlFor="rappi_corte">Total del corte de Rappi</label><input id="rappi_corte" name="rappi_corte" inputMode="decimal" required /></div>
                <CampoArchivo id="rappi_corte_archivo" name="rappi_corte_archivo" etiqueta="Foto o PDF del corte" accept="image/*,application/pdf" />
              </div>
              <BotonEnviar pendiente="Guardando…">Registrar corte de Rappi</BotonEnviar>
            </form>
          )}
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

        <section className="seccion" aria-labelledby="t-corte-rappi">
          <h2 id="t-corte-rappi">Corte de Rappi</h2>
          <p className="saldo-nota">Mientras no esté la integración con Rappi: el total del reporte de Rappi del día y su foto o PDF. Si aún no lo tienes, lo puedes registrar después.</p>
          <div className="rejilla">
            <div className="campo"><label htmlFor="rappi_corte">Total del corte de Rappi</label><input id="rappi_corte" name="rappi_corte" inputMode="decimal" placeholder="Opcional" /></div>
            <CampoArchivo id="rappi_corte_archivo" name="rappi_corte_archivo" etiqueta="Foto o PDF del corte" accept="image/*,application/pdf" />
          </div>
        </section>

        <section className="seccion" aria-labelledby="t-boveda">
          <h2 id="t-boveda">Bóveda</h2>
          <table className="tabla"><tbody>
            <Fila texto="Saldo del cierre anterior" valor={pesos(d.bovedaInicial)} />
            <Fila texto="+ Retiros a bóveda de hoy" valor={pesos(d.retiros)} />
            <Fila texto="− Fondos entregados a caja de venta" valor={pesos(d.aperturas)} />
            <Fila texto="− Salidas a corporativo de hoy" valor={pesos(d.depositos)} />
            <Fila texto="− Gastos y pagos de bóveda, netos de anulaciones" valor={pesos(d.gastosBoveda)} />
            <Fila texto="= Debe haber en bóveda" valor={pesos(esperado)} fuerte />
            <Fila texto="Fondo que se queda en bóveda" valor={fondoBoveda(sucursal)} />
            <Fila texto="Reservado para pagos" valor={pesos(disponibilidad.reservas)} />
            <Fila texto="Puede salir a corporativo ahora" valor={pesos(salidaSugerida(disponibilidad))} />
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
