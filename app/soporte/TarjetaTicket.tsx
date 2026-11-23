import Link from "next/link";
import { fechaMX, fechaTexto } from "@/lib/formato";
import { ESTADOS, PRIORIDADES, TIPOS, TONO_ESTADO, TONO_PRIORIDAD, clave, type Ticket } from "@/lib/soporte";

/** Tarjeta de un ticket: clave, tipo, estado, prioridad, título, quién y desde dónde. */
export function TarjetaTicket({ t, soporte }: { t: Ticket; soporte: boolean }) {
  return (
    <article className="tarjeta tarjeta-tarea tarjeta-ticket" data-sin-leer={t.sin_leer || undefined}>
      <p className="tarea-cabecera">
        <Link href={`/soporte/${t.numero}`} className="tarea-clave">{clave(t.numero)}</Link>
        <span className="insignia">{TIPOS[t.tipo]}</span>
        <span className="insignia" data-tono={TONO_ESTADO[t.estado]}>{ESTADOS[t.estado]}</span>
        {soporte && <span className="insignia" data-tono={TONO_PRIORIDAD[t.prioridad]}>{PRIORIDADES[t.prioridad]}</span>}
        {t.sin_leer && <span className="insignia" data-tono="aviso">{soporte ? "Novedad" : "Respuesta nueva"}</span>}
      </p>
      <h3><Link href={`/soporte/${t.numero}`}>{t.titulo}</Link></h3>
      <p className="tarea-datos">
        <span>{t.seccion}</span>
        {soporte && <span>{t.creador} · {t.sucursal ?? "Oficina"}</span>}
        <span>{fechaTexto(fechaMX(t.creado_en))}</span>
      </p>
    </article>
  );
}
