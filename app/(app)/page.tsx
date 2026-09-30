import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeAbrirTurno } from "@/lib/contexto";
import { hora, pesos } from "@/lib/formato";
import { NOMBRE_MOVIMIENTO, type Movimiento } from "@/lib/tipos";
import { abrirTurno } from "./actions";
import { confirmarMovimiento, rechazarMovimiento } from "./movimientos/actions";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, turno, cajas, soloLectura } = await obtenerContexto();

  const [{ data: saldos }, { data: pendientes }, { data: nombres }] = await Promise.all([
    supabase.from("saldos_cajas").select("tipo, nombre, saldo").eq("sucursal_id", sucursal.id)
      .returns<{ tipo: string; nombre: string; saldo: number }[]>(),
    supabase.from("movimientos").select("*").eq("sucursal_id", sucursal.id).eq("estado", "pendiente")
      .order("creado_en").returns<Movimiento[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);

  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const caja = new Map(cajas.map((c) => [c.id, c.nombre]));
  const saldo = (tipo: string) => saldos?.find((s) => s.tipo === tipo)?.saldo ?? 0;
  const cambios = saldo("cambios");

  return (
    <>
      <div className="encabezado">
        <h1>Efectivo de la sucursal</h1>
        <p>Saldos calculados con los movimientos confirmados. La caja de venta se revisa en cada arqueo de turno.</p>
      </div>
      <Aviso ok={ok} error={error} />

      <section className="seccion" aria-labelledby="t-turno">
        <h2 id="t-turno">Turno</h2>
        {turno ? (
          <div className="acciones">
            <p>Turno {turno.tipo} abierto desde las {hora(turno.abierto_en)}</p>
            {!soloLectura && <Link className="boton" href="/arqueo">Registrar arqueo</Link>}
          </div>
        ) : puedeAbrirTurno(perfil.rol) ? (
          <form action={abrirTurno} className="acciones">
            <select name="tipo" aria-label="Turno" defaultValue="matutino">
              <option value="matutino">Matutino</option>
              <option value="vespertino">Vespertino</option>
            </select>
            <BotonEnviar pendiente="Abriendo…">Abrir turno</BotonEnviar>
          </form>
        ) : (
          <p className="vacio">{soloLectura ? "No hay turno abierto." : "No hay turno abierto. Pide al encargado que lo abra."}</p>
        )}
      </section>

      <section className="seccion" aria-labelledby="t-saldos">
        <h2 id="t-saldos">Saldos</h2>
        <div className="rejilla">
          <div className="saldo">
            <span>Bóveda</span>
            <span className="saldo-monto">{pesos(saldo("boveda"))}</span>
            <span className="saldo-nota">Efectivo de ventas por entregar a corporativo</span>
          </div>
          <div className="saldo">
            <span>Caja chica</span>
            <span className="saldo-monto">{pesos(saldo("caja_chica"))}</span>
            <span className="saldo-nota">Fondo autorizado {pesos(sucursal.fondo_caja_chica)}</span>
          </div>
          <div className="saldo">
            <span>Fondo de cambios</span>
            <span className="saldo-monto">{pesos(cambios)}</span>
            <span className="saldo-nota">
              {Number(cambios) === Number(sucursal.fondo_cambios)
                ? "Completo"
                : `Debe sumar ${pesos(sucursal.fondo_cambios)}`}
            </span>
          </div>
        </div>
      </section>

      <section className="seccion" aria-labelledby="t-pendientes">
        <h2 id="t-pendientes">Por confirmar</h2>
        {!pendientes?.length ? (
          <p className="vacio">No hay movimientos esperando confirmación.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead><tr><th>Hora</th><th>Movimiento</th><th>De → a</th><th>Registró</th><th>Monto</th><th></th></tr></thead>
              <tbody>
                {pendientes.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Hora">{hora(m.creado_en)}</td>
                    <td data-label="Movimiento">{NOMBRE_MOVIMIENTO[m.tipo]}</td>
                    <td data-label="De → a">{caja.get(m.caja_origen_id)} → {caja.get(m.caja_destino_id)}</td>
                    <td data-label="Registró">{persona.get(m.registrado_por)}</td>
                    <td data-label="Monto" className="monto">{pesos(m.monto)}</td>
                    <td data-label="">
                      {soloLectura ? null : m.registrado_por === perfil.id ? (
                        <span className="saldo-nota">Lo confirma otra persona</span>
                      ) : (
                        <div className="acciones">
                          <form action={confirmarMovimiento}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="volver" value="/" />
                            <BotonEnviar pendiente="…">Recibí el efectivo</BotonEnviar>
                          </form>
                          <form action={rechazarMovimiento}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="volver" value="/" />
                            <BotonEnviar className="boton boton-alerta" pendiente="…" confirmar="¿Rechazar este movimiento? No se puede deshacer; habría que registrarlo de nuevo.">Rechazar</BotonEnviar>
                          </form>
                        </div>
                      )}
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
