import {DashboardVentasInicio} from "@/components/DashboardVentasInicio";
import Link from "next/link";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Icono } from "@/components/Icono";
import { resumenPagos, type PorPagar } from "@/lib/compras/pagos";
import { diaDePagoSugerido } from "@/lib/compras/diasPago";
import { diasDePago } from "@/app/compras/servidor";
import { obtenerPerfil } from "@/lib/contexto";
import { alertasDeSucursal, fechaElegida, ordenarSucursales, type Alerta } from "@/lib/corporativo";
import { diaOperativoMX } from "@/lib/franjas";
import { hora, hoyCalendarioMX, pesos } from "@/lib/formato";
import { resumenEnCamino, type Recepcion } from "@/lib/salidas";
import type { EstadoMovimiento } from "@/lib/tipos";
import { verSucursal } from "./actions";
import { datosCorporativo } from "./datos";

const clases = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ") || undefined;

export default async function Corporativo({ searchParams }: { searchParams: Promise<{ fecha?: string;ventas_mes?:string;ventas_sucursal?:string }> }) {
  const { fecha: pedida,ventas_mes,ventas_sucursal } = await searchParams;
  const ahora = new Date();
  const hoy = diaOperativoMX(ahora);
  const fecha = fechaElegida(pedida, hoy);
  const { supabase,perfil } = await obtenerPerfil();

  const datos = await datosCorporativo(supabase, fecha, ahora);
  const hoyCalendario = hoyCalendarioMX();
  const [{ data: porPagar }, { data: pagosMes }, { data: salidas }] = await Promise.all([
    supabase.from("facturas_saldo").select("id, saldo, vence_el, pago_programado_el, estado").eq("tipo", "ingreso").in("estado", ["por_pagar", "parcial"]).returns<PorPagar[]>(),
    supabase.from("pagos").select("fecha, monto, anulado_en").gte("fecha", `${hoyCalendario.slice(0, 7)}-01`).returns<{ fecha: string; monto: number; anulado_en: string | null }[]>(),
    supabase.from("movimientos").select("estado, recepcion, monto").eq("tipo", "salida_corporativo")
      .or("estado.eq.pendiente,and(estado.eq.confirmado,recepcion.is.null)")
      .returns<{ estado: EstadoMovimiento; recepcion: Recepcion | null; monto: number }[]>(),
  ]);
  const efectivo = resumenEnCamino(salidas ?? []);
  const dias = await diasDePago(supabase);
  const conSugerido = (porPagar ?? []).map((f) => ({ ...f, pago_sugerido_el: diaDePagoSugerido(f.vence_el, hoyCalendario, dias) }));
  const proveedoresResumen = resumenPagos(conSugerido, (pagosMes ?? []).map((p) => ({ fecha: p.fecha, monto: Number(p.monto), anulado: !!p.anulado_en })), hoyCalendario);
  const filas = ordenarSucursales(datos.map((d) => ({ ...d, alertas: alertasDeSucursal(d, fecha < hoy) })));
  const conAlertas = filas.filter((f) => f.alertas.length > 0).length;
  const venta = filas.reduce((suma, f) => suma + (f.cierre?.ventaTotal ?? 0), 0);
  const alerta = (f: { alertas: readonly Alerta[] }, a: Alerta) => f.alertas.includes(a) && "celda-alerta";

  return (
    <>
      <div className="encabezado">
        <h1>Vista general</h1>
        <p>
          {filas.length} {filas.length === 1 ? "sucursal" : "sucursales"} · {conAlertas} con algo por revisar · venta total {pesos(venta)}
        </p>
      </div>

      <DashboardVentasInicio supabase={supabase} rol={perfil.rol} mes={ventas_mes} sucursal={ventas_sucursal} porDefecto={null} ruta="/corporativo" fecha={fecha}/>
      <form className="acciones" method="get">
        <label htmlFor="fecha" className="etiqueta">Día</label>
        <input id="fecha" name="fecha" type="date" defaultValue={fecha} max={hoy} />
        <button className="boton boton-secundario" type="submit">Ver</button>
      </form>

      <section className="seccion" aria-labelledby="t-proveedores">
        <h2 id="t-proveedores">Pagos a proveedores</h2>
        <div className="rejilla">
          <div className="saldo" data-alerta={proveedoresResumen.vencido > 0 ? "si" : undefined}>
            <span>Vencido</span><span className="saldo-monto">{pesos(proveedoresResumen.vencido)}</span>
          </div>
          <div className="saldo"><span>Esta semana</span><span className="saldo-monto">{pesos(proveedoresResumen.semana)}</span></div>
        </div>
        <Link href="/compras/pagos">Ver calendario de pagos</Link>
      </section>

      <section className="seccion" aria-labelledby="t-efectivo">
        <h2 id="t-efectivo">Efectivo por recibir</h2>
        <div className="rejilla">
          <div className="saldo" data-alerta={efectivo.cuantas > 0 ? "si" : undefined}>
            <span>En camino ({efectivo.cuantas})</span><span className="saldo-monto">{pesos(efectivo.total)}</span>
          </div>
          <div className="saldo"><span>Por recoger</span><span className="saldo-monto">{efectivo.porRecoger}</span></div>
        </div>
        <Link href="/efectivo">Recibir efectivo</Link>
      </section>

      {!filas.length ? <p className="vacio">No hay sucursales.</p> : (
        <div className="tarjetas">
          {filas.map((f) => {
            const n = f.alertas.length;
            return (
              <article key={f.id} className="tarjeta" data-alerta={n > 0 ? "si" : undefined} aria-labelledby={`s-${f.id}`}>
                <div className="tarjeta-encabezado">
                  <div>
                    <h2 id={`s-${f.id}`}>{f.nombre}</h2>
                    <p className="tarjeta-estado">{n ? <><Icono nombre="alerta" /> {n} {n === 1 ? "cosa" : "cosas"} por revisar</> : "Todo en orden"}</p>
                  </div>
                  <form action={verSucursal}>
                    <input type="hidden" name="sucursal_id" value={f.id} />
                    <BotonEnviar pendiente="Abriendo…">Ver sucursal</BotonEnviar>
                  </form>
                </div>
                <dl className="tarjeta-datos">
                  <dt>Efectivo</dt>
                  <dd>
                    <span>Turnos {f.turnosAbiertos} abiertos · {f.turnosCerrados} cerrados</span>
                    <span className={clases(alerta(f, "arqueos"))}>Arqueos {pesos(f.diferenciaArqueos)}</span>
                    <span className={clases(alerta(f, "pendientes"))}>Pendientes {f.pendientes}</span>
                    <span className={clases(alerta(f, "deposito"))}>Salida {pesos(f.deposito)}</span>
                  </dd>
                  <dt>Cierre</dt>
                  <dd>
                    <span className={clases(alerta(f, "cierre"))}>{f.cierre ? `Cerrado a las ${hora(f.cierre.cerradoEn)}` : "Falta"}</span>
                    {f.cierre && <span>Venta {pesos(f.cierre.ventaTotal)}</span>}
                    {f.cierre && <span className={clases(alerta(f, "boveda"))}>Bóveda {pesos(f.cierre.bovedaDiferencia)}</span>}
                  </dd>
                  <dt>Checklists</dt>
                  <dd>
                    <span className={clases(alerta(f, "masa"))}>
                      Masa {f.masa.registradas}/{f.masa.total}{f.masa.fueraDeNorma ? ` · ${f.masa.fueraDeNorma} fuera de norma` : ""}
                    </span>
                    <span className={clases(alerta(f, "recorrido"))}>
                      Recorrido {f.recorrido.hechos}/{f.recorrido.total}{f.recorrido.conFallas ? ` · ${f.recorrido.conFallas} con fallas` : ""}
                    </span>
                    <span className={clases(alerta(f, "mermas"))}>Mermas cerradas: {f.mermasCerradas ? "sí" : "no"}</span>
                    <span className={clases(alerta(f, "rondas"))}>
                      Rondas {f.rondas.hechas}/{f.rondas.total}{f.rondas.conFallas ? ` · ${f.rondas.conFallas} con fallas` : ""}
                    </span>
                    <span className={clases(alerta(f, "listas"))}>Listas del turno {f.listas.hechas}/{f.listas.total}</span>
                    {f.amasadoFuera > 0 && <span className={clases(alerta(f, "amasado"))}>Amasado: {f.amasadoFuera} fuera de rango</span>}
                    <span className={clases(alerta(f, "limpieza"))}>Limpieza profunda: {f.limpiezaProfunda ? "sí" : "no"}</span>
                  </dd>
                  <dt>Caja chica</dt>
                  <dd>
                    <span>Mermas {f.mermas}</span>
                    <span>Gastos {pesos(f.gastos)}</span>
                    <span className={clases(alerta(f, "comprobantes"))}>Sin comprobante {f.sinComprobante}</span>
                    {f.porReponerEmpleados > 0 && <span>Por reponer a empleados {pesos(f.porReponerEmpleados)}</span>}
                  </dd>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
