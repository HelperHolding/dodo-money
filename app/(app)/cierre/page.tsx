import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { CampoContado } from "./CampoContado";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeCerrarDia } from "@/lib/contexto";
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
  boveda_esperado: number; boveda_contado: number; boveda_diferencia: number; gastos_boveda_dia: number; gastos_ventas_dia:number;
  cambios_diferencia: number; diferencia_turnos: number; deposito_ficha: string | null;
};

const fondoBoveda = (s: { fondo_boveda: number }) => pesos(s.fondo_boveda);
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
    .select("id, rappi, rappi_corte, rappi_corte_ruta, venta_total, venta_neta, ticket_promedio, transacciones, boveda_esperado, boveda_contado, boveda_diferencia, gastos_boveda_dia, gastos_ventas_dia, cambios_diferencia, diferencia_turnos, deposito_ficha")
    .eq("sucursal_id", sucursal.id).eq("fecha", fecha).maybeSingle<Cierre>();

  if (cierre) {
    const difRappi = diferenciaRappi(Number(cierre.rappi), cierre.rappi_corte === null ? null : Number(cierre.rappi_corte));
    const urlCorte = cierre.rappi_corte_ruta
      ? (await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(cierre.rappi_corte_ruta, 3600)).data?.signedUrl ?? null
      : null;
    return (
      <>
        <EncabezadoPagina titulo={`Cierre del día ${fecha}`} descripcion={<span className="insignia" data-tono="exito">Día cerrado</span>} />
        <Aviso ok={ok} error={error} />
        <div className="indicadores-marco"><section className="indicadores" aria-label="Resumen del cierre">
          <div className="indicador"><span className="indicador-etiqueta">Venta neta sin IVA</span><strong className="indicador-valor">{pesos(cierre.venta_neta)}</strong><span className="indicador-detalle">{cierre.transacciones} transacciones</span></div>
          <div className="indicador" data-alerta={Number(cierre.diferencia_turnos) !== 0 ? "peligro" : undefined}><span className="indicador-etiqueta">Diferencia de arqueos</span><strong className="indicador-valor">{pesos(cierre.diferencia_turnos)}</strong></div>
          <div className="indicador" data-alerta={Number(cierre.boveda_diferencia) !== 0 ? "peligro" : undefined}><span className="indicador-etiqueta">Diferencia de bóveda</span><strong className="indicador-valor">{pesos(cierre.boveda_diferencia)}</strong></div>
          <div className="indicador"><span className="indicador-etiqueta">Puede salir a corporativo</span><strong className="indicador-valor">{pesos(salidaSugerida(disponibilidad))}</strong><Link className="indicador-enlace" href="/recolecciones">Recolecciones</Link></div>
        </section></div>
        <section className="seccion">
          <table className="tabla"><tbody>
            <Fila texto="Venta total con IVA" valor={pesos(cierre.venta_total)} />
            <Fila texto="Venta neta sin IVA" valor={pesos(cierre.venta_neta)} fuerte />
            <Fila texto="Transacciones" valor={String(cierre.transacciones)} />
            <Fila texto="Ticket promedio sin IVA" valor={pesos(cierre.ticket_promedio)} />
            <Fila texto="Diferencia de los arqueos de turno" valor={pesos(cierre.diferencia_turnos)} fuerte />
            {Number(cierre.gastos_boveda_dia) !== 0 && <Fila texto="Gastos y pagos de bóveda, netos de anulaciones" valor={pesos(cierre.gastos_boveda_dia)} />}
            <Fila texto="Pagos desde efectivo de ventas" valor={pesos(cierre.gastos_ventas_dia)} />
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
          {cierre.rappi_corte === null && puedeCerrarDia(perfil.rol) && !soloLectura && (
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

  if (!puedeCerrarDia(perfil.rol)) {
    return (
      <>
        <EncabezadoPagina titulo="Cierre del día" />
        <p className="aviso aviso-info">{soloLectura ? "Este día todavía no se cierra." : "El cierre del día lo hace el encargado o el gerente."}</p>
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
      <EncabezadoPagina titulo={`Cierre del día ${fecha}`} descripcion="Las ventas se copian del reporte de Dodo IS. La bóveda incluye los movimientos confirmados desde el último cierre, aunque haya días sin corte." />
      <Aviso ok={ok} error={error} />
      {turno && <p className="aviso aviso-error">Hay un turno abierto. Ciérralo con su <Link href="/arqueo">arqueo de cierre</Link> primero.</p>}
      {d.pendientes > 0 && <p className="aviso aviso-error">Hay {d.pendientes} movimientos sin confirmar en <Link href="/movimientos">Movimientos</Link>.</p>}

      <form action={cerrarDia} className="formulario-pagina">
        <section className="seccion" aria-labelledby="t-ventas">
          <h2 id="t-ventas"><span className="paso">1</span>Ventas según Dodo IS</h2>
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
          <h2 id="t-corte-rappi"><span className="paso">2</span>Corte de Rappi</h2>
          <p className="saldo-nota">Mientras no esté la integración con Rappi: el total del reporte de Rappi del día y su foto o PDF. Si aún no lo tienes, lo puedes registrar después.</p>
          <div className="rejilla">
            <div className="campo"><label htmlFor="rappi_corte">Total del corte de Rappi</label><input id="rappi_corte" name="rappi_corte" inputMode="decimal" placeholder="Opcional" /></div>
            <CampoArchivo id="rappi_corte_archivo" name="rappi_corte_archivo" etiqueta="Foto o PDF del corte" accept="image/*,application/pdf" />
          </div>
        </section>

        <section className="seccion" aria-labelledby="t-boveda">
          <h2 id="t-boveda"><span className="paso">3</span>Bóveda</h2>
          <p className="saldo-nota">{d.ultimoCierre ? `Acumulado desde el cierre del ${d.ultimoCierre}.` : "Acumulado desde el saldo inicial de bóveda."} Los conteos de cierres anteriores se conservan.</p>
          <table className="tabla"><tbody>
            <Fila texto="Saldo del cierre anterior" valor={pesos(d.bovedaInicial)} />
            <Fila texto="+ Entradas a bóveda desde el último cierre" valor={pesos(d.retiros)} />
            <Fila texto="− Fondos y reposiciones desde el último cierre" valor={pesos(d.aperturas)} />
            <Fila texto="− Salidas a corporativo desde el último cierre" valor={pesos(d.depositos)} />
            <Fila texto="− Gastos y pagos de bóveda, netos de anulaciones" valor={pesos(d.gastosBoveda - (d.ajustesBoveda ?? 0))} />
            {!!d.ajustesBoveda && <Fila texto="− Ajustes de conciliación de bóveda" valor={pesos(d.ajustesBoveda)} />}
            <Fila texto="= Debe haber en bóveda" valor={pesos(esperado)} fuerte />
            <Fila texto="Fondo que se queda en bóveda" valor={fondoBoveda(sucursal)} />
            <Fila texto="Reservado para pagos" valor={pesos(disponibilidad.reservas)} />
            <Fila texto="Puede salir a corporativo ahora" valor={pesos(salidaSugerida(disponibilidad))} />
            <Fila texto="Diferencia de los arqueos de turno" valor={pesos(d.diferenciaTurnos)} />
          </tbody></table>
          <div className="rejilla rejilla-corta">
            <CampoContado id="boveda_contado" texto="Efectivo contado en bóveda" esperado={esperado} />
            <CampoContado id="cambios_contado" texto="Fondo de cambios contado" esperado={Number(sucursal.fondo_cambios)} />
          </div>
        </section>

        <section className="seccion"><h2><span className="paso">4</span>Recolección de efectivo</h2><p>Prepara la salida a corporativo por rango de cierres en <Link href="/recolecciones">Recolecciones</Link>. El cierre conserva sus datos de efectivo; la entrega se registra por separado.</p></section>

        <div className="acciones cierre-enviar">
          <BotonEnviar pendiente="Cerrando…">Cerrar el día</BotonEnviar>
          {bloqueado && <span className="saldo-nota">Resuelve los avisos de arriba antes de cerrar.</span>}
        </div>
      </form>
    </>
  );
}
