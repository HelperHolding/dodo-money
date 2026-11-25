import Link from "next/link";
import type { DragEventHandler, ReactNode } from "react";
import { Icono } from "@/components/Icono";
import { fechaMX, fechaTexto } from "@/lib/formato";
import { ESTADOS, PRIORIDADES, TIPOS, TONO_ESTADO, TONO_PRIORIDAD, clave, type Ticket } from "@/lib/soporte";

const iniciales = (nombre: string) => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

/**
 * Tarjeta de un ticket: clave y prioridad arriba, título, y abajo tipo, sección y quién atiende.
 * En el tablero no muestra el estado (lo dice la columna) y se puede arrastrar; los enlaces no se arrastran
 * para que el gesto mueva la tarjeta completa.
 */
export function TarjetaTicket({ t, soporte, conEstado = true, arrastre, children }: {
  t: Ticket; soporte: boolean; conEstado?: boolean;
  arrastre?: { onDragStart: DragEventHandler<HTMLElement>; onDragEnd: DragEventHandler<HTMLElement>; levantada: boolean };
  children?: ReactNode;
}) {
  const href = `/soporte/${t.numero}`;
  return (
    <article className="tarjeta ticket-card" data-sin-leer={t.sin_leer || undefined}
      draggable={arrastre ? true : undefined} onDragStart={arrastre?.onDragStart} onDragEnd={arrastre?.onDragEnd}
      data-levantada={arrastre?.levantada || undefined}>
      <div className="ticket-arriba">
        <Link href={href} className="ticket-clave" draggable={false}>{clave(t.numero)}</Link>
        {t.sin_leer && <span className="insignia" data-tono="marca">{soporte ? "Novedad" : "Respuesta nueva"}</span>}
        {soporte && t.agente_estado && <span className="insignia" data-tono="info" title={`Agente: ${t.agente_estado}`}>Agente</span>}
        <span className="ticket-relleno" />
        {conEstado && <span className="insignia" data-tono={TONO_ESTADO[t.estado]}>{ESTADOS[t.estado]}</span>}
        {soporte && <span className="insignia" data-tono={TONO_PRIORIDAD[t.prioridad]}>{PRIORIDADES[t.prioridad]}</span>}
      </div>
      <h3 className="ticket-titulo"><Link href={href} draggable={false}>{t.titulo}</Link></h3>
      <div className="ticket-pie">
        <Icono nombre={t.tipo === "problema" ? "alerta" : "brillo"} etiqueta={TIPOS[t.tipo]} />
        <span>{t.seccion}</span>
        <span className="ticket-relleno" />
        {soporte
          ? (t.responsable_nombre
            ? <span className="ticket-avatar" title={`Atiende ${t.responsable_nombre}`} aria-label={`Atiende ${t.responsable_nombre}`}>{iniciales(t.responsable_nombre)}</span>
            : <span className="ticket-avatar" data-vacio title="Sin asignar" aria-label="Sin asignar">?</span>)
          : <span>{fechaTexto(fechaMX(t.creado_en))}</span>}
      </div>
      {children}
    </article>
  );
}
