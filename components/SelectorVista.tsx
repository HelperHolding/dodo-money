import Link from "next/link";
import { hrefVista, type Vista } from "@/lib/vista";

/** Pastillas Tarjetas | Lista. */
export function SelectorVista({ ruta, params, vista, predeterminada="tarjetas" }: { ruta: string; params: Record<string, string | undefined>; vista: Vista; predeterminada?:Vista }) {
  return (
    <nav className="accesos" aria-label="Vista">
      <Link href={hrefVista(ruta, params, "tarjetas",predeterminada)} aria-current={vista === "tarjetas" ? "page" : undefined}>Tarjetas</Link>
      <Link href={hrefVista(ruta, params, "lista",predeterminada)} aria-current={vista === "lista" ? "page" : undefined}>Lista</Link>
    </nav>
  );
}
