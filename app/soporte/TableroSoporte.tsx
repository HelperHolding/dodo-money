"use client";
import { useEffect, useRef, useState } from "react";
import { COLUMNAS, ESTADOS, clave, pideComentario, siguientes, type EstadoTicket, type Ticket } from "@/lib/soporte";
import { cambiarTicket } from "./acciones";
import { TarjetaTicket } from "./TarjetaTicket";

/**
 * Columnas por estado. En computadora se arrastra la tarjeta y se iluminan las columnas donde se puede soltar;
 * en celular se elige la columna arriba y cada tarjeta trae un selector. Llevar a Resuelto abre un cuadro para
 * escribir la respuesta a quien lo levantó, porque cerrar la exige.
 */
export function TableroSoporte({ tickets }: { tickets: Ticket[] }) {
  const [columna, setColumna] = useState<EstadoTicket>("nuevo");
  const [arrastrando, setArrastrando] = useState<Ticket | null>(null);
  const [sobre, setSobre] = useState<EstadoTicket | null>(null);
  const [cerrando, setCerrando] = useState<Ticket | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);

  // Al guardar, la página se vuelve a pedir con los tickets nuevos: el cuadro se cierra solo.
  useEffect(() => { setCerrando(null); }, [tickets]);
  useEffect(() => {
    const d = dialogo.current; if (!d) return;
    if (cerrando && !d.open) d.showModal();
    if (!cerrando && d.open) d.close();
  }, [cerrando]);

  const destinos = (t: Ticket): EstadoTicket[] => siguientes(t.estado).filter((a) => COLUMNAS.includes(a));
  const de = (c: EstadoTicket) => tickets.filter((t) => t.estado === c);
  const mover = (t: Ticket, a: EstadoTicket) => {
    if (pideComentario(a)) { setCerrando(t); return; }
    const f = form.current; if (!f) return;
    (f.elements.namedItem("numero") as HTMLInputElement).value = String(t.numero);
    (f.elements.namedItem("revision") as HTMLInputElement).value = String(t.revision);
    (f.elements.namedItem("estado") as HTMLInputElement).value = a;
    f.requestSubmit();
  };
  const soltar = () => { setArrastrando(null); setSobre(null); };

  return <>
    <form ref={form} action={cambiarTicket} hidden>
      <input name="numero" /><input name="revision" /><input name="estado" /><input name="volver_a" defaultValue="/soporte" />
    </form>
    <nav className="accesos solo-celular" aria-label="Columna">
      {COLUMNAS.map((c) => <button key={c} type="button" aria-pressed={columna === c} onClick={() => setColumna(c)}>{ESTADOS[c]} ({de(c).length})</button>)}
    </nav>
    <div className="tablero-tareas">
      {COLUMNAS.map((c) => {
        const valida = !!arrastrando && destinos(arrastrando).includes(c);
        return (
          <section key={c} className="tablero-columna" data-activa={columna === c || undefined}
            data-destino={valida || undefined} data-sobre={(valida && sobre === c) || undefined}
            onDragOver={(e) => { if (valida) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (sobre !== c) setSobre(c); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && sobre === c) setSobre(null); }}
            onDrop={(e) => { e.preventDefault(); const t = arrastrando; soltar(); if (t && valida) mover(t, c); }}>
            <h2>{ESTADOS[c]} <span className="insignia">{de(c).length}</span></h2>
            {de(c).map((t) => (
              <TarjetaTicket key={t.id} t={t} soporte conEstado={false}
                arrastre={destinos(t).length > 0 ? {
                  levantada: arrastrando?.id === t.id,
                  onDragStart: (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", clave(t.numero)); setArrastrando(t); },
                  onDragEnd: soltar,
                } : undefined}>
                {destinos(t).length > 0 && (
                  <label className="tarea-mover solo-celular">Mover a{" "}
                    <select value="" onChange={(e) => e.target.value && mover(t, e.target.value as EstadoTicket)}>
                      <option value="" disabled>Elegir</option>{destinos(t).map((a) => <option key={a} value={a}>{ESTADOS[a]}</option>)}
                    </select>
                  </label>
                )}
              </TarjetaTicket>
            ))}
          </section>
        );
      })}
    </div>
    <dialog ref={dialogo} className="dialogo-resolver" onClose={() => setCerrando(null)} aria-labelledby="titulo-resolver">
      {cerrando && (
        <form action={cambiarTicket}>
          <h2 id="titulo-resolver">Resolver {clave(cerrando.numero)}</h2>
          <p>{cerrando.titulo}</p>
          <input type="hidden" name="numero" value={cerrando.numero} /><input type="hidden" name="revision" value={cerrando.revision} />
          <input type="hidden" name="estado" value="resuelto" /><input type="hidden" name="volver_a" value="/soporte" />
          <label className="campo">Respuesta para {cerrando.creador}
            <textarea name="comentario" required rows={4} autoFocus placeholder="Qué se hizo o por qué ya quedó" />
          </label>
          <div className="acciones">
            <button type="button" className="boton boton-secundario" onClick={() => setCerrando(null)}>Cancelar</button>
            <button type="submit" className="boton">Resolver</button>
          </div>
        </form>
      )}
    </dialog>
  </>;
}
