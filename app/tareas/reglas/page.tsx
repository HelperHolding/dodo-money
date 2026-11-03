import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { PRIORIDADES, type Prioridad } from "@/lib/tareas";
import { generarAhora, guardarRegla } from "../acciones";
import { leerPersonas, leerReglas, type Persona, type ReglaTarea } from "../datos";

/** Qué significa N en cada regla. */
const DIAS: Record<string, string> = {
  factura_sin_revisar: "Días desde que se cargó",
  factura_por_vencer: "Días antes del vencimiento",
  dia_sin_ventas: "Días hacia atrás que revisa",
  orden_sin_recibir: "Días de tolerancia tras la entrega esperada",
  apertura_item_atrasado: "Días de tolerancia tras la fecha fin",
};

export default async function ReglasTareas({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const p = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (perfil.rol !== "admin") redirect("/tareas");
  let reglas: ReglaTarea[], admins: Persona[];
  try { [reglas, admins] = await Promise.all([leerReglas(supabase), leerPersonas(supabase, null).then((l) => l.filter((x) => x.rol === "admin"))]); }
  catch { return <p className="aviso aviso-error">No se pudieron consultar las reglas. Revisa que la migración 20261102200000_tareas_automaticas esté aplicada y vuelve a intentar.</p>; }
  return <>
    <EncabezadoPagina titulo="Tareas automáticas"
      info="El sistema crea estas tareas cada mañana y las cierra solo cuando el pendiente se resuelve. Si cancelas una, no se vuelve a crear para ese documento."
      acciones={<>
        <Link className="boton boton-secundario" href="/tareas/tablero?origen=automatica">Ver en el tablero</Link>
        <form action={generarAhora}><BotonEnviar pendiente="Generando…" confirmar="¿Correr ahora las reglas prendidas?">Generar ahora</BotonEnviar></form>
      </>} />
    <Aviso ok={p.ok} error={p.error} />
    <div className="tarjetas">
      {reglas.map((r) => {
        const sinResponsable = r.activa && !admins.some((a) => a.id === r.asignado_default);
        return (
          <article className="tarjeta" key={r.clave} data-alerta={sinResponsable || undefined}>
            <div className="tarjeta-encabezado">
              <h2>{r.nombre}</h2>
              <span className="insignia" data-tono={r.activa ? "info" : undefined}>{r.activa ? "Prendida" : "Apagada"}</span>
            </div>
            <p>{r.descripcion}</p>
            <p className="tarea-datos">
              <span>Abiertas: <strong>{r.abiertas}</strong></span>
              <span>{r.activa ? "Faltan por crear" : "Crearía hoy"}: <strong>{r.por_crear}</strong></span>
            </p>
            {sinResponsable && <p className="aviso aviso-error">El responsable ya no es un admin activo: no se crean tareas nuevas hasta elegir otro.</p>}
            <form action={guardarRegla} className="formulario">
              <input type="hidden" name="clave" value={r.clave} />
              <label><input type="checkbox" name="activa" value="1" defaultChecked={r.activa} /> Prendida</label>
              <div className="campo">
                <label htmlFor={`asignado-${r.clave}`}>{r.clave === "orden_sin_recibir" ? "Responsable (oficina o sin gerente)" : "Responsable"}</label>
                <select id={`asignado-${r.clave}`} name="asignado_default" defaultValue={r.asignado_default ?? ""}>
                  <option value="">Sin elegir</option>
                  {admins.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
                {r.clave === "orden_sin_recibir" && <small>Las órdenes de sucursal van a su gerente.</small>}
              </div>
              <div className="campo">
                <label htmlFor={`dias-${r.clave}`}>{DIAS[r.clave] ?? "Días"}</label>
                <input id={`dias-${r.clave}`} name="dias" type="number" inputMode="numeric" min={0} max={365} required defaultValue={r.dias} />
              </div>
              <div className="campo">
                <label htmlFor={`prioridad-${r.clave}`}>Prioridad</label>
                <select id={`prioridad-${r.clave}`} name="prioridad" defaultValue={r.prioridad}>
                  {(Object.keys(PRIORIDADES) as Prioridad[]).map((k) => <option key={k} value={k}>{PRIORIDADES[k]}</option>)}
                </select>
              </div>
              <BotonEnviar>Guardar</BotonEnviar>
            </form>
          </article>
        );
      })}
    </div>
  </>;
}
