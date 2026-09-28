import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { diaOperativoMX } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import { NOMBRE_DIA, areaDelDia, diaSemanaISO } from "@/lib/limpiezaProfunda";
import type { AreaLimpieza, LimpiezaProfunda } from "@/lib/tipos";
import { Revisar } from "../Revisar";
import { registrarLimpiezaProfunda } from "./actions";

export default async function LimpiezaProfundaPagina({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();
  const fecha = diaOperativoMX(new Date());
  const hace14 = new Date(`${fecha}T00:00:00Z`);
  hace14.setUTCDate(hace14.getUTCDate() - 13);

  const [{ data: areas }, { data: registros }, { data: nombres }] = await Promise.all([
    supabase.from("areas_limpieza_profunda").select("semana, dia_semana, area").returns<AreaLimpieza[]>(),
    supabase.from("limpiezas_profundas").select("*").eq("sucursal_id", sucursal.id)
      .gte("fecha", hace14.toISOString().slice(0, 10)).order("fecha", { ascending: false }).returns<LimpiezaProfunda[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const areaHoy = areaDelDia(areas ?? [], fecha);
  const deHoy = (registros ?? []).find((r) => r.fecha === fecha);

  return (
    <>
      <div className="encabezado">
        <h1>Limpieza profunda</h1>
        <p>Un área distinta cada día, en un ciclo de dos semanas. El encargado la revisa al terminar.</p>
      </div>
      <Aviso ok={ok} error={error} />
      <section className="seccion" aria-labelledby="t-hoy">
        <h2 id="t-hoy">Hoy toca: {NOMBRE_DIA[diaSemanaISO(fecha)]} · {areaHoy ?? "sin área"}</h2>
        {deHoy ? (
          <>
            <p>Hecha por {deHoy.empleado} a las {hora(deHoy.creado_en)}.</p>
            <Revisar tipo="limpieza" id={deHoy.id} volver="/checklists/limpieza-profunda"
              revisadoPor={deHoy.revisado_por ? persona.get(deHoy.revisado_por) : null} revisadoEn={deHoy.revisado_en}
              puede={puedeSupervisar(perfil.rol)} />
          </>
        ) : soloLectura ? <p className="vacio">Todavía no se registra hoy.</p> : (
          <form action={registrarLimpiezaProfunda} className="acciones">
            <div className="campo">
              <label htmlFor="empleado">¿Quién la hizo?</label>
              <input id="empleado" name="empleado" required autoComplete="off" placeholder="Nombre y apellido" />
            </div>
            <BotonEnviar>Registrar limpieza</BotonEnviar>
          </form>
        )}
      </section>
      <section className="seccion" aria-labelledby="t-historial">
        <h2 id="t-historial">Últimos 14 días</h2>
        {!registros?.length ? <p className="vacio">Sin registros.</p> : (
          <ul className="estados-lista">
            {registros.map((r) => (
              <li key={r.id}>
                <span>{r.fecha} · {r.area} · {r.empleado}</span>
                <span className="estado-lista" data-estado={r.revisado_por ? "revisado" : "hecho"}>{r.revisado_por ? "Revisado" : "Hecho"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
