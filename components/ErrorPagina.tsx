"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icono } from "@/components/Icono";
import { codigoError, debeReintentarSolo, reporteError } from "@/lib/errorPantalla";

const leer = (k: string) => { try { const v = sessionStorage.getItem(k); return v === null ? null : Number(v); } catch { return null; } };
const guardar = (k: string, v: number) => { try { sessionStorage.setItem(k, String(v)); } catch { /* sin almacenamiento: no pasa nada */ } };

/**
 * Pantalla de error de un área (app/<área>/error.tsx): dice qué no cargó, da el código para buscarlo en Vercel
 * y un botón para intentar de nuevo. No muestra datos a medias.
 * La primera vez reintenta sola (casi siempre es una falla pasajera); si vuelve a fallar en el mismo minuto, se queda
 * la tarjeta. Reintentar vuelve a pedir los datos al servidor (router.refresh), no solo a dibujar la pantalla.
 */
export function ErrorPagina({ titulo, descripcion, error, reset }: {
  titulo: string;
  descripcion?: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const [cargando, iniciar] = useTransition();
  const [automatico, setAutomatico] = useState(false);
  const { codigo, delNavegador } = useMemo(() => codigoError(error), [error]);

  const reintentar = () => iniciar(() => { router.refresh(); reset(); });

  useEffect(() => {
    if (delNavegador) {
      // Los errores del navegador no llegan solos a Vercel: se mandan para que el código se pueda buscar.
      fetch("/api/errores-cliente", { method: "POST", keepalive: true, headers: { "content-type": "application/json" },
        body: JSON.stringify(reporteError(error, codigo, ruta)) }).catch(() => {});
    }
    const clave = `reintento-automatico:${ruta}`;
    // Si el reintento automático volvió a fallar, este es un error nuevo: se queda la tarjeta con su botón.
    if (!debeReintentarSolo(leer(clave), Date.now())) { setAutomatico(false); return; }
    guardar(clave, Date.now());
    setAutomatico(true);
    const t = setTimeout(reintentar, 800);
    return () => clearTimeout(t);
  }, [error]); // Solo al aparecer cada error.

  const ocupado = cargando || automatico;
  return (
    <section className="error-pagina" role="alert" aria-busy={ocupado}>
      <Icono nombre="alerta" tamano={36} />
      <h1>{titulo}</h1>
      <p>{ocupado ? "Volviendo a intentar…" : descripcion ?? "Algo no cargó bien. No mostramos datos a medias."}</p>
      <p className="saldo-nota">Si sigue pasando, comparte este código con quien administra la app: <code>{codigo}</code> (Vercel → Logs).</p>
      <div className="acciones">
        <button className="boton" type="button" onClick={reintentar} disabled={ocupado}>{ocupado ? "Intentando…" : "Intentar de nuevo"}</button>
      </div>
    </section>
  );
}
