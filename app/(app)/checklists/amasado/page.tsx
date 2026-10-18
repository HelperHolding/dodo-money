import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { Aviso } from "@/components/Aviso";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { fueraDeRango } from "@/lib/amasado";
import { diaOperativoMX } from "@/lib/franjas";
import type { LoteAmasado } from "@/lib/tipos";
import { Revisar } from "../Revisar";
import { FormAmasado } from "./FormAmasado";

export default async function Amasado({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();
  const fecha = diaOperativoMX(new Date());
  const [{ data: lotes }, { data: nombres }] = await Promise.all([
    supabase.from("lotes_amasado").select("*").eq("sucursal_id", sucursal.id).eq("fecha", fecha)
      .order("creado_en", { ascending: false }).returns<LoteAmasado[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));

  return (
    <>
      <EncabezadoPagina titulo="Amasado de masa" descripcion="Un registro por lote. La masa debe quedar entre 24 y 26 °C; si alguna temperatura sale de norma, escribe qué pasó." />
      <Aviso ok={ok} error={error} />
      <section className="seccion" aria-labelledby="t-lote">
        <h2 id="t-lote">Registrar lote</h2>
        {soloLectura ? <p className="vacio">Corporativo solo puede consultar.</p> : <FormAmasado />}
      </section>
      <section className="seccion" aria-labelledby="t-lotes">
        <h2 id="t-lotes">Lotes de hoy</h2>
        {!lotes?.length ? <p className="vacio">Todavía no hay lotes hoy.</p> : (
          <div className="tarjetas">
            {lotes.map((l) => {
              const fuera = fueraDeRango({ masa: Number(l.temp_masa), sala: Number(l.temp_sala), harina: Number(l.temp_harina), agua: Number(l.temp_agua) });
              return (
                <article key={l.id} className="tarjeta zona" data-alerta={fuera.length ? "si" : undefined}>
                  <h3>{l.inicio.slice(0, 5)} a {l.fin.slice(0, 5)} · {l.bolas_resultado} de {l.plan_bolas} bolas</h3>
                  <p>Masa <span className={fuera.includes("masa") ? "alerta-texto" : undefined}>{Number(l.temp_masa)} °C</span> · sala {Number(l.temp_sala)} · harina {Number(l.temp_harina)} · agua {Number(l.temp_agua)} °C · {Number(l.minutos_amasado)} min</p>
                  <p className="saldo-nota">{l.empleado}{l.comentario ? ` · ${l.comentario}` : ""}</p>
                  <Revisar tipo="amasado" id={l.id} volver="/checklists/amasado"
                    revisadoPor={l.revisado_por ? persona.get(l.revisado_por) : null} revisadoEn={l.revisado_en}
                    puede={puedeSupervisar(perfil.rol)} />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
