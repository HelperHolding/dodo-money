import { Aviso } from "@/components/Aviso";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { claveFranjas, diaOperativoMX, etiquetaHora, franjasAbiertas, siguienteFranja } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import type { Checklist, PuntoChecklist, RegistroChecklist } from "@/lib/tipos";
import { Revisar } from "../Revisar";
import { FormRonda, type ZonaRonda } from "./FormRonda";

export default async function Ronda({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();
  const ahora = new Date();
  const fecha = diaOperativoMX(ahora);

  const [{ data: checklists }, { data: puntos }, { data: registros }, { data: nombres }] = await Promise.all([
    supabase.from("checklists").select("id, clave, nombre, horas, roles, tipo, en_ronda, orden")
      .eq("tipo", "lista").eq("en_ronda", true).order("orden").returns<Checklist[]>(),
    supabase.from("checklist_puntos").select("id, checklist_id, orden, texto, detalle_por_hora, momento, dia_semana")
      .eq("momento", "hora").order("orden").returns<PuntoChecklist[]>(),
    supabase.from("registros_checklist")
      .select("id, checklist_id, fecha, momento, hora, empleado, registrado_por, creado_en, revisado_por, revisado_en, registro_respuestas(punto_id, cumple, comentario)")
      .eq("sucursal_id", sucursal.id).eq("fecha", fecha).eq("momento", "hora").order("hora", { ascending: false })
      .returns<RegistroChecklist[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);

  const zonas: ZonaRonda[] = (checklists ?? []).map((c) => ({
    id: c.id, nombre: c.nombre, horas: c.horas,
    puntos: (puntos ?? []).filter((p) => p.checklist_id === c.id).map((p) => ({ id: p.id, orden: p.orden, texto: p.texto })),
  }));
  const horas = [...new Set(zonas.flatMap((z) => z.horas))].sort((a, b) => a - b);
  const abiertas = franjasAbiertas(horas, ahora);
  const registradas = (registros ?? []).map((r) => `${r.checklist_id}|${r.fecha}|${r.hora}`);
  const siguiente = siguienteFranja(horas, ahora);
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const nombreZona = new Map(zonas.map((z) => [z.id, z.nombre]));
  const textoPunto = new Map((puntos ?? []).map((p) => [p.id, p.texto]));

  return (
    <>
      <EncabezadoPagina titulo="Ronda de la hora" descripcion="Limpieza, zona caliente, caja y sala, y baño. Cada hora se puede registrar hasta 10 minutos después de que termina." />
      <Aviso ok={ok} error={error} />

      <section className="seccion" aria-labelledby="t-ronda">
        <h2 id="t-ronda">Registrar</h2>
        {soloLectura ? <p className="vacio">Corporativo solo puede consultar.</p>
          : abiertas.length ? <FormRonda key={claveFranjas(abiertas)} franjas={abiertas} zonas={zonas} registradas={registradas} />
          : <p className="vacio">No hay ronda abierta.{siguiente !== null ? ` La siguiente es a las ${etiquetaHora(siguiente)}.` : " Ya no hay más rondas hoy."}</p>}
      </section>

      <section className="seccion" aria-labelledby="t-hechas">
        <h2 id="t-hechas">Rondas de hoy</h2>
        {!registros?.length ? <p className="vacio">Todavía no hay rondas hoy.</p> : (
          <div className="tarjetas">
            {registros.map((r) => {
              const fallas = r.registro_respuestas.filter((x) => !x.cumple);
              return (
                <article key={r.id} className="tarjeta zona" data-alerta={fallas.length ? "si" : undefined}>
                  <h3>{nombreZona.get(r.checklist_id)} · {etiquetaHora(r.hora ?? 0)}</h3>
                  <p className="saldo-nota">{r.empleado} · {hora(r.creado_en)} · sesión de {persona.get(r.registrado_por)}</p>
                  {fallas.length ? (
                    <ul className="fallas">{fallas.map((x) => <li key={x.punto_id}><strong>{textoPunto.get(x.punto_id)}</strong> {x.comentario}</li>)}</ul>
                  ) : <span className="estado estado-confirmado">Todo cumple</span>}
                  <Revisar tipo="checklist" id={r.id} volver="/checklists/ronda"
                    revisadoPor={r.revisado_por ? persona.get(r.revisado_por) : null} revisadoEn={r.revisado_en}
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
