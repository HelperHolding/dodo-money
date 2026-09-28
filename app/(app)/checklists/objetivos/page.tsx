import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { diaOperativoMX } from "@/lib/franjas";
import type { ObjetivoTurno } from "@/lib/tipos";
import { registrarObjetivo } from "./actions";

const TURNO = { manana: "Mañana", tarde: "Tarde" } as const;

export default async function Objetivos({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();
  const fecha = diaOperativoMX(new Date());
  const { data: objetivos } = await supabase.from("objetivos_turno").select("*").eq("sucursal_id", sucursal.id).eq("fecha", fecha)
    .order("creado_en").returns<ObjetivoTurno[]>();

  return (
    <>
      <div className="encabezado">
        <h1>Objetivos del turno</h1>
        <p>Específico (qué hacer), medible (cuánto o en cuánto tiempo), con fecha límite. Pide al empleado que lo repita para confirmar que quedó claro.</p>
      </div>
      <Aviso ok={ok} error={error} />
      {!soloLectura && puedeSupervisar(perfil.rol) && (
        <form action={registrarObjetivo} className="seccion" aria-labelledby="t-nuevo">
          <h2 id="t-nuevo">Nuevo objetivo</h2>
          <div className="rejilla">
            <div className="campo"><label htmlFor="turno">Turno</label>
              <select id="turno" name="turno" defaultValue="manana"><option value="manana">Mañana</option><option value="tarde">Tarde</option></select></div>
            <div className="campo"><label htmlFor="empleado">Empleado</label><input id="empleado" name="empleado" required autoComplete="off" /></div>
          </div>
          <div className="campo"><label htmlFor="objetivo">Objetivo</label>
            <textarea id="objetivo" name="objetivo" rows={2} required placeholder="Ej. Preparar 3 kg de pepperoni antes de las 12:00" /></div>
          <div className="acciones"><BotonEnviar>Registrar objetivo</BotonEnviar></div>
        </form>
      )}
      <section className="seccion" aria-labelledby="t-hoy">
        <h2 id="t-hoy">Objetivos de hoy</h2>
        {!objetivos?.length ? <p className="vacio">Todavía no hay objetivos hoy.</p> : (
          <ul className="estados-lista">
            {objetivos.map((o) => (
              <li key={o.id}><span><strong>{o.empleado}</strong> · {o.objetivo}</span><span className="estado-lista" data-estado="hecho">{TURNO[o.turno]}</span></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
