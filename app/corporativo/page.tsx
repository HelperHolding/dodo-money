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

      {!filas.length ? <p className="vacio">No hay sucursales.</p> : (
        <div className="tarjetas">
          {filas.map((f) => {
            const n = f.alertas.length;
            return (
              <article key={f.id} className="tarjeta" data-alerta={n > 0 ? "si" : undefined} aria-labelledby={`s-${f.id}`}>
                <div className="tarjeta-encabezado">
                  <div>
                    <h2 id={`s-${f.id}`}>{f.nombre}</h2>
                    <p className="tarjeta-estado">{n ? `⚠ ${n} ${n === 1 ? "cosa" : "cosas"} por revisar` : "Todo en orden"}</p>
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
                    <span className={clases(alerta(f, "deposito"))}>Depósito {pesos(f.deposito)}</span>
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
                  </dd>
                  <dt>Caja chica</dt>
                  <dd>
                    <span>Mermas {f.mermas}</span>
                    <span>Gastos {pesos(f.gastos)}</span>
                    <span className={clases(alerta(f, "comprobantes"))}>Sin comprobante {f.sinComprobante}</span>
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
