"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { COLUMNAS, ESTADOS, PRIORIDADES, TONO_PRIORIDAD, clave, pideComentario, vencida, type EstadoTarea, type Tarea } from "@/lib/tareas";
import { fechaTexto } from "@/lib/formato";
import { moverTarea } from "../acciones";

/**
 * Columnas por estado. En computadora se arrastra la tarjeta a otra columna; en celular (o sin ratón) cada tarjeta
 * trae un selector con los estados a los que esta persona puede moverla. Ambos envían el mismo formulario.
 * Regresar y cancelar piden texto: esos pasos se hacen desde el detalle.
 */
export function TableroTareas({ tareas, pasos, volverA, hoy }: { tareas: Tarea[]; pasos: Record<string, EstadoTarea[]>; volverA: string; hoy: string }) {
  const [columna, setColumna] = useState<EstadoTarea>("por_hacer");
  const [arrastrando, setArrastrando] = useState<Tarea | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const enviar = (t: Tarea, a: EstadoTarea) => {
    const f = form.current; if (!f) return;
    (f.elements.namedItem("numero") as HTMLInputElement).value = String(t.numero);
    (f.elements.namedItem("revision") as HTMLInputElement).value = String(t.revision);
    (f.elements.namedItem("estado") as HTMLInputElement).value = a;
    f.requestSubmit();
  };
  const directos = (t: Tarea) => (pasos[t.id] ?? []).filter((a) => !pideComentario(t.estado, a));
  return <>
    <form ref={form} action={moverTarea} hidden>
      <input name="numero" /><input name="revision" /><input name="estado" /><input name="volver_a" defaultValue={volverA} />
    </form>
    <nav className="accesos solo-celular" aria-label="Columna">
      {COLUMNAS.map((c) => <button key={c} type="button" aria-pressed={columna === c} onClick={() => setColumna(c)}>{ESTADOS[c]} ({tareas.filter((t) => t.estado === c).length})</button>)}
    </nav>
    <div className="tablero-tareas">
      {COLUMNAS.map((c) => (
        <section key={c} className="tablero-columna" data-activa={columna === c || undefined}
          onDragOver={(e) => { if (arrastrando && directos(arrastrando).includes(c)) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (arrastrando && directos(arrastrando).includes(c)) enviar(arrastrando, c); setArrastrando(null); }}>
          <h2>{ESTADOS[c]} <span className="insignia">{tareas.filter((t) => t.estado === c).length}</span></h2>
          {tareas.filter((t) => t.estado === c).map((t) => (
            <article key={t.id} className="tarjeta tarjeta-tarea" draggable={directos(t).length > 0}
              onDragStart={() => setArrastrando(t)} onDragEnd={() => setArrastrando(null)}>
              <p className="tarea-cabecera"><Link href={`/tareas/${t.numero}`} className="tarea-clave">{clave(t.numero)}</Link>
                <span className="insignia" data-tono={TONO_PRIORIDAD[t.prioridad]}>{PRIORIDADES[t.prioridad]}</span></p>
              <h3><Link href={`/tareas/${t.numero}`}>{t.titulo}</Link></h3>
              <p className="tarea-datos"><span>{t.asignado}</span><span>{t.sucursal ?? "Oficina"}</span>{t.vence && <span>{vencida(t, hoy) ? "Venció" : "Vence"} {fechaTexto(t.vence)}</span>}</p>
              {directos(t).length > 0 && (
                <label className="tarea-mover">Mover a{" "}
                  <select defaultValue="" onChange={(e) => e.target.value && enviar(t, e.target.value as EstadoTarea)}>
                    <option value="" disabled>Elegir</option>{directos(t).map((a) => <option key={a} value={a}>{ESTADOS[a]}</option>)}
                  </select>
                </label>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  </>;
}
