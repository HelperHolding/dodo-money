import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto } from "@/lib/contexto";
import { hora, hoyMX, pesos, rangoDiaMX } from "@/lib/formato";
import { NOMBRE_MOVIMIENTO, type Movimiento } from "@/lib/tipos";
import { confirmarMovimiento } from "./actions";
import { FormMovimiento } from "./FormMovimiento";

export default async function Movimientos({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, cajas, soloLectura } = await obtenerContexto();
  const { desde, hasta } = rangoDiaMX(hoyMX());

  const [{ data: movimientos }, { data: nombres }] = await Promise.all([
    supabase.from("movimientos").select("*").eq("sucursal_id", sucursal.id)
      .gte("creado_en", desde).lt("creado_en", hasta).order("creado_en", { ascending: false })
      .returns<Movimiento[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const caja = new Map(cajas.map((c) => [c.id, c.nombre]));

  return (
    <>
      <div className="encabezado">
        <h1>Movimientos entre cajas</h1>
        <p>Cada vez que el efectivo pasa de una caja a otra se registra aquí. Quien lo recibe lo confirma con su propio usuario.</p>
      </div>
      <Aviso ok={ok} error={error} />
      {!soloLectura && <FormMovimiento limiteRetiro={Number(sucursal.limite_retiro)} />}

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
                      {m.estado === "pendiente" && m.registrado_por !== perfil.id && !soloLectura ? (
                        <form action={confirmarMovimiento} className="acciones">
                          <input type="hidden" name="id" value={m.id} />
                          <BotonEnviar name="aceptar" value="si" className="boton boton-secundario" pendiente="…">Confirmar</BotonEnviar>
                          <BotonEnviar name="aceptar" value="no" className="boton boton-alerta" pendiente="…">Rechazar</BotonEnviar>
                        </form>
                      ) : (
                        m.confirmado_por ? persona.get(m.confirmado_por) : ""
                      )}
                    </td>
                    <td data-label="Estado"><span className={`estado estado-${m.estado}`}>{m.estado}</span></td>
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
