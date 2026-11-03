import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTareas } from "@/app/tareas/datos";
import { TarjetaTarea } from "@/app/tareas/TarjetaTarea";
import { abierta, puedeLigar, type TipoDocumento } from "@/lib/tareas";
import type { Rol } from "@/lib/tipos";

/** Franja de tareas abiertas del documento y botón para asignar una nueva. Si la migración falta, no estorba. */
export async function TareasDelDocumento({ supabase, tipo, id, rol, hoy }: { supabase: SupabaseClient; tipo: TipoDocumento; id: string; rol: Rol; hoy: string }) {
  const tareas = await leerTareas(supabase, { documento: id }).then((ts) => ts.filter((t) => abierta(t.estado))).catch(() => null);
  if (tareas === null) return null;
  const liga = puedeLigar(rol, tipo);
  if (!tareas.length && !liga) return null;
  return (
    <section className="seccion tareas-documento">
      <h2>Tareas abiertas {tareas.length > 0 && <span className="insignia">{tareas.length}</span>}</h2>
      {tareas.length > 0 && <div className="tarjetas">{tareas.map((t) => <TarjetaTarea key={t.id} t={t} hoy={hoy} rol={rol} />)}</div>}
      {liga && <Link className="boton boton-secundario" href={`/tareas/nueva?tipo=${tipo}&id=${id}`}>Asignar tarea</Link>}
    </section>
  );
}
