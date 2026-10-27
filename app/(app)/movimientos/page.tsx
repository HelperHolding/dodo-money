import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto } from "@/lib/contexto";
import { hora, hoyMX, pesos, rangoDiaMX } from "@/lib/formato";
import { CLASE_ESTADO_SALIDA, estadoSalida, NOMBRE_ESTADO_SALIDA } from "@/lib/salidas";
import { NOMBRE_MOVIMIENTO, type Movimiento } from "@/lib/tipos";
import { confirmarMovimiento, rechazarMovimiento } from "./actions";
import { bovedaDe } from "./datos";
import { FormMovimiento } from "./FormMovimiento";

export default async function Movimientos({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, cajas, soloLectura } = await obtenerContexto();
  const { desde, hasta } = rangoDiaMX(hoyMX());

  const [{ data: movimientos }, { data: nombres }, boveda] = await Promise.all([
    supabase.from("movimientos").select("*").eq("sucursal_id", sucursal.id)
      .gte("creado_en", desde).lt("creado_en", hasta).order("creado_en", { ascending: false })
      .returns<Movimiento[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
    bovedaDe(supabase, sucursal.id, Number(sucursal.fondo_boveda)),
  ]);
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const caja = new Map(cajas.map((c) => [c.id, c.nombre]));

  return (
    <>
      <EncabezadoPagina titulo="Movimientos entre cajas" descripcion="Cada vez que el efectivo pasa de una caja a otra se registra aquí. Quien lo recibe lo confirma con su propio usuario." />
      <Aviso ok={ok} error={error} />
      {!soloLectura && <FormMovimiento limiteRetiro={Number(sucursal.limite_retiro)} fondoCajon={Number(sucursal.fondo_caja_venta)}
        boveda={boveda} />}

      <section className="seccion" aria-labelledby="t-hoy">
        <h2 id="t-hoy">Movimientos de hoy</h2>
        {!movimientos?.length ? (
          <p className="vacio">Todavía no hay movimientos hoy. El primero suele ser el fondo inicial de la caja de venta.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead>
                <tr><th>Hora</th><th>Movimiento</th><th>De → a</th><th>Folio</th><th>Registró</th><th>Confirmó</th><th>Estado</th><th>Monto</th></tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Hora">{hora(m.creado_en)}</td>
                    <td data-label="Movimiento">{NOMBRE_MOVIMIENTO[m.tipo]}</td>
                    <td data-label="De → a">{caja.get(m.caja_origen_id)} → {caja.get(m.caja_destino_id)}</td>
                    <td data-label="Folio">{m.folio ?? ""}</td>
                    <td data-label="Registró">{persona.get(m.registrado_por)}</td>
                    <td data-label="Confirmó">
                      {m.estado === "pendiente" && m.tipo === "salida_corporativo" && perfil.rol !== "admin" ? (
                        "Espera al admin"
                      ) : m.estado === "pendiente" && m.registrado_por !== perfil.id && !soloLectura ? (
                        <div className="acciones">
                          <form action={confirmarMovimiento}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="volver" value="/movimientos" />
                            <BotonEnviar className="boton boton-secundario" pendiente="…">Confirmar</BotonEnviar>
                          </form>
                          <form action={rechazarMovimiento}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="volver" value="/movimientos" />
                            <BotonEnviar className="boton boton-alerta" pendiente="…" confirmar="¿Rechazar este movimiento? No se puede deshacer; habría que registrarlo de nuevo.">Rechazar</BotonEnviar>
                          </form>
                        </div>
                      ) : m.tipo === "salida_corporativo" && m.estado === "confirmado" && m.confirmado_por ? (
                        `Recogió ${persona.get(m.confirmado_por) ?? "un admin"}`
                      ) : (
                        m.confirmado_por ? persona.get(m.confirmado_por) : ""
                      )}
                    </td>
                    <td data-label="Estado">
                      {m.tipo === "salida_corporativo" ? (() => {
                        const e = estadoSalida(m);
                        return (
                          <>
                            <span className={`estado estado-${CLASE_ESTADO_SALIDA[e]}`}>{NOMBRE_ESTADO_SALIDA[e]}</span>
                            {e === "no_cuadro" && m.nota_recepcion ? <small className="nota-estado">{m.nota_recepcion}</small> : null}
                          </>
                        );
                      })() : <span className={`estado estado-${m.estado}`}>{m.estado}</span>}
                    </td>
                    <td data-label="Monto" className="monto">{pesos(m.monto)}</td>
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
