import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { alertasDeSucursal, fechaElegida, ordenarSucursales, type Alerta } from "@/lib/corporativo";
import { diaOperativoMX } from "@/lib/franjas";
import { hora, pesos } from "@/lib/formato";
import { verSucursal } from "./actions";
import { datosCorporativo } from "./datos";

const clases = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ") || undefined;

export default async function Corporativo({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: pedida } = await searchParams;
  const ahora = new Date();
  const hoy = diaOperativoMX(ahora);
  const fecha = fechaElegida(pedida, hoy);
  const { supabase } = await obtenerPerfil();

  const datos = await datosCorporativo(supabase, fecha, ahora);
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

      <form className="acciones" method="get">
        <label htmlFor="fecha" className="etiqueta">Día</label>
        <input id="fecha" name="fecha" type="date" defaultValue={fecha} max={hoy} />
        <button className="boton boton-secundario" type="submit">Ver</button>
      </form>

      <section className="seccion" aria-labelledby="t-sucursales">
        <h2 id="t-sucursales">Sucursales</h2>
        {!filas.length ? <p className="vacio">No hay sucursales.</p> : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-corporativo">
              <thead>
                <tr className="grupos">
                  <th /><th colSpan={4}>Efectivo</th><th colSpan={3}>Cierre</th><th colSpan={3}>Checklists</th><th colSpan={3}>Mermas y caja chica</th><th />
                </tr>
                <tr>
                  <th>Sucursal</th>
                  <th>Turnos</th><th>Dif. arqueos</th><th>Pendientes</th><th>Depósito</th>
                  <th>Cierre</th><th>Venta</th><th>Bóveda</th>
                  <th>Masa</th><th>Recorrido</th><th>Mermas cerradas</th>
                  <th>Mermas</th><th>Gastos</th><th>Sin comprobante</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <th scope="row">{f.nombre}</th>
                    <td>{f.turnosAbiertos} abiertos · {f.turnosCerrados} cerrados</td>
                    <td className={clases("monto", alerta(f, "arqueos"))}>{pesos(f.diferenciaArqueos)}</td>
                    <td className={clases(alerta(f, "pendientes"))}>{f.pendientes}</td>
                    <td className={clases("monto", alerta(f, "deposito"))}>{pesos(f.deposito)}</td>
                    <td className={clases(alerta(f, "cierre"))}>{f.cierre ? hora(f.cierre.cerradoEn) : "Falta"}</td>
                    <td className="monto">{f.cierre ? pesos(f.cierre.ventaTotal) : "—"}</td>
                    <td className={clases("monto", alerta(f, "boveda"))}>{f.cierre ? pesos(f.cierre.bovedaDiferencia) : "—"}</td>
                    <td className={clases(alerta(f, "masa"))}>
                      {f.masa.registradas}/{f.masa.total}{f.masa.fueraDeNorma ? ` · ${f.masa.fueraDeNorma} fuera de norma` : ""}
                    </td>
                    <td className={clases(alerta(f, "recorrido"))}>
                      {f.recorrido.hechos}/{f.recorrido.total}{f.recorrido.conFallas ? ` · ${f.recorrido.conFallas} con fallas` : ""}
                    </td>
                    <td className={clases(alerta(f, "mermas"))}>{f.mermasCerradas ? "Sí" : "No"}</td>
                    <td>{f.mermas}</td>
                    <td className="monto">{pesos(f.gastos)}</td>
                    <td className={clases(alerta(f, "comprobantes"))}>{f.sinComprobante}</td>
                    <td>
                      <form action={verSucursal}>
                        <input type="hidden" name="sucursal_id" value={f.id} />
                        <BotonEnviar className="boton boton-secundario" pendiente="Abriendo…">Ver sucursal</BotonEnviar>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
