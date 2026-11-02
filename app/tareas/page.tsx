import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { GRUPOS_VENCE, abierta, agrupar, meTocaCerrar, puedeCrearTareas, veTablero, type Quien } from "@/lib/tareas";
import { leerTareas } from "./datos";
import { TarjetaTarea } from "./TarjetaTarea";

const PESTANAS = { asignadas: "Asignadas a mí", creadas: "Creadas por mí", revision: "En revisión (me toca cerrar)" } as const;
type Pestana = keyof typeof PESTANAS;

export default async function MisTareas({ searchParams }: { searchParams: Promise<{ ver?: string; ok?: string; error?: string }> }) {
  const p = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const quien: Quien = { id: perfil.id, rol: perfil.rol, sucursal_id: perfil.sucursal_id };
  const ver: Pestana = p.ver && Object.hasOwn(PESTANAS, p.ver) ? (p.ver as Pestana) : "asignadas";
  let tareas;
  try { tareas = await leerTareas(supabase); }
  catch { return <p className="aviso aviso-error">No se pudieron consultar las tareas. Revisa que la migración 20261102120000_tareas esté aplicada y vuelve a intentar.</p>; }
  const hoy = hoyCalendarioMX();
  const lista = tareas.filter((t) => abierta(t.estado) && (
    ver === "asignadas" ? t.asignado_a === perfil.id : ver === "creadas" ? t.creado_por === perfil.id : meTocaCerrar(t, quien)));
  return <>
    <EncabezadoPagina titulo="Mis tareas" info="Lo que tienes pendiente, lo que pediste y lo que te toca revisar para cerrar."
      acciones={<>
        {veTablero(perfil.rol) && <Link className="boton boton-secundario" href="/tareas/tablero">Tablero</Link>}
        {puedeCrearTareas(perfil.rol) && <Link className="boton" href="/tareas/nueva">Nueva tarea</Link>}
      </>} />
    <Aviso ok={p.ok} error={p.error} />
    <nav className="accesos" aria-label="Pestañas">
      {(Object.keys(PESTANAS) as Pestana[]).filter((k) => k === "asignadas" || puedeCrearTareas(perfil.rol)).map((k) =>
        <Link key={k} href={k === "asignadas" ? "/tareas" : `/tareas?ver=${k}`} aria-current={ver === k ? "page" : undefined}>{PESTANAS[k]}</Link>)}
    </nav>
    {lista.length === 0
      ? <EstadoVacio titulo="Nada pendiente aquí" descripcion={ver === "asignadas" ? "Cuando alguien te asigne una tarea aparecerá en esta lista." : undefined} />
      : agrupar(lista, hoy).map(([g, ts]) => (
        <section className="seccion" key={g}>
          <h2>{GRUPOS_VENCE[g]} <span className="insignia" data-tono={g === "vencidas" ? "peligro" : undefined}>{ts.length}</span></h2>
          <div className="tarjetas">{ts.map((t) => <TarjetaTarea key={t.id} t={t} hoy={hoy} rol={perfil.rol} />)}</div>
        </section>
      ))}
  </>;
}
