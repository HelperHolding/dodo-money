"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { COLUMNAS, ESTADOS, PRIORIDADES, TIPOS, TONO_PRIORIDAD, clave, pideComentario, siguientes, type EstadoTicket, type Ticket } from "@/lib/soporte";
import { cambiarTicket } from "./acciones";

/**
 * Columnas por estado. En computadora se arrastra la tarjeta; en celular se elige la columna arriba y cada tarjeta trae
 * un selector. Resolver y descartar piden la respuesta para quien lo levantó: esos pasos se hacen desde el detalle.
 */
export function TableroSoporte({ tickets }: { tickets: Ticket[] }) {
  const [columna, setColumna] = useState<EstadoTicket>("nuevo");
  const [arrastrando, setArrastrando] = useState<Ticket | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const enviar = (t: Ticket, a: EstadoTicket) => {
    const f = form.current; if (!f) return;
    (f.elements.namedItem("numero") as HTMLInputElement).value = String(t.numero);
    (f.elements.namedItem("revision") as HTMLInputElement).value = String(t.revision);
    (f.elements.namedItem("estado") as HTMLInputElement).value = a;
    f.requestSubmit();
  };
  const directos = (t: Ticket): EstadoTicket[] => siguientes(t.estado).filter((a) => !pideComentario(a));
  const de = (c: EstadoTicket) => tickets.filter((t) => t.estado === c);
  return <>
    <form ref={form} action={cambiarTicket} hidden>
      <input name="numero" /><input name="revision" /><input name="estado" /><input name="volver_a" defaultValue="/soporte" />
    </form>
    <nav className="accesos solo-celular" aria-label="Columna">
      {COLUMNAS.map((c) => <button key={c} type="button" aria-pressed={columna === c} onClick={() => setColumna(c)}>{ESTADOS[c]} ({de(c).length})</button>)}
    </nav>
    <div className="tablero-tareas">
      {COLUMNAS.map((c) => (
        <section key={c} className="tablero-columna" data-activa={columna === c || undefined}
          onDragOver={(e) => { if (arrastrando && directos(arrastrando).includes(c)) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (arrastrando && directos(arrastrando).includes(c)) enviar(arrastrando, c); setArrastrando(null); }}>
          <h2>{ESTADOS[c]} <span className="insignia">{de(c).length}</span></h2>
          {de(c).map((t) => (
            <article key={t.id} className="tarjeta tarjeta-tarea tarjeta-ticket" data-sin-leer={t.sin_leer || undefined} draggable={directos(t).length > 0}
              onDragStart={() => setArrastrando(t)} onDragEnd={() => setArrastrando(null)}>
              <p className="tarea-cabecera"><Link href={`/soporte/${t.numero}`} className="tarea-clave">{clave(t.numero)}</Link>
                <span className="insignia">{TIPOS[t.tipo]}</span>
                <span className="insignia" data-tono={TONO_PRIORIDAD[t.prioridad]}>{PRIORIDADES[t.prioridad]}</span>
                {t.sin_leer && <span className="insignia" data-tono="aviso">Novedad</span>}</p>
              <h3><Link href={`/soporte/${t.numero}`}>{t.titulo}</Link></h3>
              <p className="tarea-datos"><span>{t.seccion}</span><span>{t.creador} · {t.sucursal ?? "Oficina"}</span>{t.responsable_nombre && <span>Atiende {t.responsable_nombre}</span>}</p>
              {directos(t).length > 0 && (
                <label className="tarea-mover">Mover a{" "}
                  <select defaultValue="" onChange={(e) => e.target.value && enviar(t, e.target.value as EstadoTicket)}>
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
