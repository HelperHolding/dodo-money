import Link from "next/link";
import { Icono } from "@/components/Icono";
import { ligaSegura } from "@/lib/ligas";

/** `liga` llega por la URL: solo se muestra si es una ruta interna conocida (el registro que ya tiene el UUID). */
export function Aviso({ ok, error, liga }: { ok?: string; error?: string; liga?: string }) {
  const destino = ligaSegura(liga);
  if (error) return <p className="aviso aviso-error" role="alert"><Icono nombre="alerta" /><span>{error}{destino && <> <Link href={destino}>Ver registro</Link></>}</span></p>;
  if (ok) return <p className="aviso aviso-ok" role="status"><Icono nombre="ok" /><span>{ok}</span></p>;
  return null;
}
