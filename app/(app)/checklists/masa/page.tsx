import { Aviso } from "@/components/Aviso";
import { obtenerContexto } from "@/lib/contexto";
import { claveFranjas, diaOperativoMX, etiquetaHora, franjasAbiertas, siguienteFranja } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import { bolasNorma } from "@/lib/masa";
import type { LecturaMasa, NormaMasa } from "@/lib/tipos";
import { FormMasa } from "./FormMasa";

export default async function Masa({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, sucursal } = await obtenerContexto();
  const ahora = new Date();
  const fecha = diaOperativoMX(ahora);

  const [{ data: normas }, { data: lecturas }, { data: nombres }] = await Promise.all([
    supabase.from("normas_masa").select("hora, bolas_25, bolas_30, bolas_35").order("hora").returns<NormaMasa[]>(),
    supabase.from("lecturas_masa")
      .select("id, fecha, hora, temp_area, bolas, temperatura, en_norma, comentario, registrado_por, creado_en")
      .eq("sucursal_id", sucursal.id).eq("fecha", fecha).order("hora").returns<LecturaMasa[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);

  const horas = (normas ?? []).map((n) => n.hora);
  const normaPorHora = new Map((normas ?? []).map((n) => [n.hora, n]));
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const registradas = new Set((lecturas ?? []).map((l) => `${l.fecha}|${l.hora}`));
  const enHorario = franjasAbiertas(horas, ahora);
  const abiertas = enHorario.filter((f) => !registradas.has(`${f.fecha}|${f.hora}`));
  const siguiente = siguienteFranja(horas, ahora);
  const sinFormulario =
    (enHorario.length ? "Ya se registró la hora de ahora." : "No hay hora abierta.") +
    (siguiente !== null ? ` La siguiente es a las ${etiquetaHora(siguiente)}.` : " Ya no hay más horas hoy.");

  return (
    <>
      <div className="encabezado">
        <h1>Temperatura de masa</h1>
        <p>Cada hora saca las bolas que marca la norma para la temperatura del área y toma la temperatura de la masa. En norma: de 12 a 22 °C.</p>
      </div>
      <Aviso ok={ok} error={error} />

      <section className="seccion" aria-labelledby="t-registro">
        <h2 id="t-registro">Registrar</h2>
        {abiertas.length ? <FormMasa key={claveFranjas(abiertas)} franjas={abiertas} normas={normas ?? []} /> : <p className="vacio">{sinFormulario}</p>}
      </section>

      <section className="seccion" aria-labelledby="t-lecturas">
        <h2 id="t-lecturas">Lecturas de hoy</h2>
        {!lecturas?.length ? <p className="vacio">Todavía no hay lecturas hoy.</p> : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead><tr><th>Hora</th><th>Área</th><th>Bolas / norma</th><th>Masa</th><th>Comentario</th><th>Registró</th></tr></thead>
              <tbody>
                {lecturas.map((l) => {
                  const n = normaPorHora.get(l.hora);
                  return (
                    <tr key={l.id}>
                      <td>{etiquetaHora(l.hora)}</td>
                      <td>{l.temp_area} °C</td>
                      <td>{l.bolas} / {n ? bolasNorma(n, l.temp_area) : "—"}</td>
                      <td>
                        <span className={`estado ${l.en_norma ? "estado-confirmado" : "estado-pendiente"}`}>{Number(l.temperatura)} °C</span>
                      </td>
                      <td>{l.comentario ?? ""}</td>
                      <td>{persona.get(l.registrado_por)} · {hora(l.creado_en)}</td>
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
