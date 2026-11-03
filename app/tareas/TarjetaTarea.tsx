import Link from "next/link";
import { fechaTexto } from "@/lib/formato";
import { ESTADOS, PRIORIDADES, REPITE, TONO_PRIORIDAD, clave, puedeAbrirDocumento, vencida, type Tarea } from "@/lib/tareas";
import type { Rol } from "@/lib/tipos";

/** Tarjeta de una tarea: clave, título, prioridad, vencimiento, persona, sucursal y documento ligado. */
export function TarjetaTarea({ t, hoy, rol }: { t: Tarea; hoy: string; rol: Rol }) {
  const abrir = t.documento_tipo && t.documento_ruta && puedeAbrirDocumento(rol, t.documento_tipo);
  return (
    <article className="tarjeta tarjeta-tarea" data-vencida={vencida(t, hoy) || undefined}>
      <p className="tarea-cabecera">
        <Link href={`/tareas/${t.numero}`} className="tarea-clave">{clave(t.numero)}</Link>
        <span className="insignia" data-tono={TONO_PRIORIDAD[t.prioridad]}>{PRIORIDADES[t.prioridad]}</span>
        <span className="insignia">{ESTADOS[t.estado]}</span>
        {t.origen === "automatica" && <span className="insignia" data-tono="info">Automática</span>}
        {t.repite && <span className="insignia" data-tono="info">{REPITE[t.repite]}</span>}
      </p>
      <h3><Link href={`/tareas/${t.numero}`}>{t.titulo}</Link></h3>
      <p className="tarea-datos">
        <span>{t.asignado}{!t.asignado_activo && <> · <strong>asignado inactivo</strong></>}</span>
        <span>{t.sucursal ?? "Oficina"}</span>
        <span>{t.vence ? <>{vencida(t, hoy) ? "Venció" : "Vence"} {fechaTexto(t.vence)}</> : "Sin fecha"}</span>
      </p>
      {t.documento_texto && (
        <p className="tarea-documento">
          {abrir ? <Link href={t.documento_ruta!}>{t.documento_texto}</Link> : t.documento_texto}
          {t.documento_anulado && <> · <span className="insignia" data-tono="peligro">documento anulado</span></>}
        </p>
      )}
    </article>
  );
}
