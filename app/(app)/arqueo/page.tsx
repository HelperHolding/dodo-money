import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto } from "@/lib/contexto";
import { hora, pesos } from "@/lib/formato";
import { NOMBRE_MOMENTO, type Arqueo, type MomentoArqueo } from "@/lib/tipos";
import { recibirArqueo } from "./actions";
import { fondoYRetirosDelTurno } from "./datos";
import { FormArqueo } from "./FormArqueo";

export default async function PaginaArqueo({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, turno, soloLectura } = await obtenerContexto();

  if (!turno) {
    return (
      <>
        <div className="encabezado"><h1>Arqueo de turno</h1></div>
        <Aviso ok={ok} error={error} />
        <p className="aviso aviso-info">No hay turno abierto. El encargado lo abre desde <Link href="/">Inicio</Link>.</p>
      </>
    );
  }

  const [{ fondo, fondoDeMovimientos, retiros }, { data: arqueos }, { count: pendientes }, { data: nombres }] = await Promise.all([
    fondoYRetirosDelTurno(supabase, turno.id, Number(sucursal.fondo_caja_venta)),
    supabase.from("arqueos").select("id, turno_id, momento, total_contado, esperado, diferencia, entrega_id, recibe_id, creado_en")
      .eq("turno_id", turno.id).order("creado_en").returns<Arqueo[]>(),
    supabase.from("movimientos").select("id", { count: "exact", head: true })
      .eq("turno_id", turno.id).eq("estado", "pendiente").in("tipo", ["apertura", "retiro_boveda"]),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const momentoSugerido: MomentoArqueo = !arqueos?.length ? "inicio" : "traspaso";

  return (
    <>
      <div className="encabezado">
        <h1>Arqueo de turno</h1>
        <p>Cuenta el efectivo por denominación. El fondo y los retiros a bóveda salen de los movimientos confirmados del turno.</p>
      </div>
      <Aviso ok={ok} error={error} />
      {!!pendientes && (
        <p className="aviso aviso-error">
          Hay {pendientes} {pendientes === 1 ? "movimiento" : "movimientos"} del turno sin confirmar. No cuentan en el esperado hasta que alguien los confirme en <Link href="/movimientos">Movimientos</Link>.
        </p>
      )}

      {!!arqueos?.length && (
        <section className="seccion" aria-labelledby="t-turno">
          <h2 id="t-turno">Arqueos de este turno</h2>
          <div className="tabla-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead><tr><th>Hora</th><th>Momento</th><th>Entregó</th><th>Recibió</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr></thead>
              <tbody>
                {arqueos.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Hora">{hora(a.creado_en)}</td>
                    <td data-label="Momento">{NOMBRE_MOMENTO[a.momento]}</td>
                    <td data-label="Entregó">{persona.get(a.entrega_id)}</td>
                    <td data-label="Recibió">
                      {a.recibe_id ? persona.get(a.recibe_id) : soloLectura || a.entrega_id === perfil.id ? (
                        <span className="saldo-nota">Pendiente</span>
                      ) : (
                        <form action={recibirArqueo}>
                          <input type="hidden" name="id" value={a.id} />
                          <BotonEnviar className="boton boton-secundario" pendiente="…">Recibir</BotonEnviar>
                        </form>
                      )}
                    </td>
                    <td data-label="Esperado" className="monto">{pesos(a.esperado)}</td>
                    <td data-label="Contado" className="monto">{pesos(a.total_contado)}</td>
                    <td data-label="Diferencia" className="monto" style={{ color: Number(a.diferencia) === 0 ? "var(--cuadra)" : "var(--alerta)" }}>{pesos(a.diferencia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!soloLectura && <FormArqueo fondoInicial={fondo} fondoDeMovimientos={fondoDeMovimientos} retirosBoveda={retiros} momentoSugerido={momentoSugerido} />}
    </>
  );
}
