import { Aviso } from "@/components/Aviso";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { claveFranjas, diaOperativoMX, etiquetaHora, franjasAbiertas, siguienteFranja } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import type { Checklist, PuntoChecklist } from "@/lib/tipos";
import { FormRecorrido, type OpcionRecorrido } from "./FormRecorrido";

type RecorridoDia = {
  id: string; checklist_id: string; fecha: string; hora: number; registrado_por: string; creado_en: string;
  recorrido_respuestas: { punto_id: string; cumple: boolean; comentario: string | null }[];
};

export default async function Recorrido({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal } = await obtenerContexto();
  const ahora = new Date();
  const fecha = diaOperativoMX(ahora);

  const [{ data: checklists }, { data: puntos }, { data: recorridos }, { data: nombres }] = await Promise.all([
    supabase.from("checklists").select("id, clave, nombre, horas, roles, tipo, en_ronda, orden").eq("tipo", "recorrido").returns<Checklist[]>(),
    supabase.from("checklist_puntos").select("id, checklist_id, orden, texto, detalle_por_hora, momento, dia_semana").eq("momento", "hora").order("orden").returns<PuntoChecklist[]>(),
    supabase.from("recorridos")
      .select("id, checklist_id, fecha, hora, registrado_por, creado_en, recorrido_respuestas(punto_id, cumple, comentario)")
      .eq("sucursal_id", sucursal.id).eq("fecha", fecha).order("hora").returns<RecorridoDia[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);

  const listas = [...(checklists ?? [])].sort((a, b) => a.horas[0] - b.horas[0]);
  const registrados = new Set((recorridos ?? []).map((r) => `${r.checklist_id}|${r.fecha}|${r.hora}`));
  const opciones: OpcionRecorrido[] = listas
    .flatMap((c) =>
      franjasAbiertas(c.horas, ahora)
        .filter((f) => !registrados.has(`${c.id}|${f.fecha}|${f.hora}`))
        .map((f) => ({ checklistId: c.id, nombre: c.nombre, fecha: f.fecha, hora: f.hora })))
    .sort((a, b) => (a.fecha === b.fecha ? b.hora - a.hora : b.fecha.localeCompare(a.fecha)));
  const puntosPorChecklist = Object.fromEntries(listas.map((c) => [c.id, (puntos ?? []).filter((p) => p.checklist_id === c.id)]));
  const puntoPorId = new Map((puntos ?? []).map((p) => [p.id, p]));
  const nombreChecklist = new Map(listas.map((c) => [c.id, c.nombre]));
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));

  const hayAbierta = listas.some((c) => franjasAbiertas(c.horas, ahora).length > 0);
  const siguiente = siguienteFranja(listas.flatMap((c) => c.horas), ahora);
  const sinFormulario =
    (hayAbierta ? "Ya se registró el recorrido de esta hora." : "No hay recorrido abierto.") +
    (siguiente !== null ? ` El siguiente es a las ${etiquetaHora(siguiente)}.` : " Ya no hay más recorridos hoy.");

  return (
    <>
      <div className="encabezado">
        <h1>Recorrido de supervisor</h1>
        <p>Cada hora recorre la pizzería y marca cada punto. Si algo no cumple, escribe qué pasó.</p>
      </div>
      <Aviso ok={ok} error={error} />

      <section className="seccion" aria-labelledby="t-registro">
        <h2 id="t-registro">Registrar recorrido</h2>
        {!puedeSupervisar(perfil.rol) ? <p className="vacio">El recorrido lo registra el encargado o el gerente.</p>
          : opciones.length ? <FormRecorrido key={opciones.map((o) => claveFranjas([o], o.checklistId)).join(";")} opciones={opciones} puntosPorChecklist={puntosPorChecklist} />
          : <p className="vacio">{sinFormulario}</p>}
      </section>

      <section className="seccion" aria-labelledby="t-hechos">
        <h2 id="t-hechos">Recorridos de hoy</h2>
        {!recorridos?.length ? <p className="vacio">Todavía no hay recorridos hoy.</p> : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead><tr><th>Hora</th><th>Checklist</th><th>Resultado</th><th>Registró</th></tr></thead>
              <tbody>
                {recorridos.map((r) => {
                  const fallas = r.recorrido_respuestas.filter((x) => !x.cumple);
                  return (
                    <tr key={r.id}>
                      <td data-label="Hora">{etiquetaHora(r.hora)}</td>
                      <td data-label="Checklist">{nombreChecklist.get(r.checklist_id)}</td>
                      <td data-label="Resultado">
                        {fallas.length === 0 ? <span className="estado estado-confirmado">Todo cumple</span> : (
                          <ul className="fallas">
                            {fallas.map((x) => (
                              <li key={x.punto_id}><strong>{puntoPorId.get(x.punto_id)?.texto}</strong> {x.comentario}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td data-label="Registró">{persona.get(r.registrado_por)} · {hora(r.creado_en)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
