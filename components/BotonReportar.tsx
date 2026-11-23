"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Abre el alta de ticket con la página actual, para que la sección venga llena. */
export function BotonReportar() {
  const ruta = usePathname();
  const desde = ruta.startsWith("/soporte") ? "" : `?desde=${encodeURIComponent(ruta)}`;
  return <Link href={`/soporte/nuevo${desde}`}>Reportar un problema</Link>;
}
