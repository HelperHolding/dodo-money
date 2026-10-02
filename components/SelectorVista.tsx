import Link from "next/link";
import { hrefVista, type Vista } from "@/lib/vista";

/** Pastillas Tarjetas | Lista. */
export function SelectorVista({ ruta, params, vista }: { ruta: string; params: Record<string, string | undefined>; vista: Vista }) {
  return (
    <nav className="accesos" aria-label="Vista">
      <Link href={hrefVista(ruta, params, "tarjetas")} aria-current={vista === "tarjetas" ? "page" : undefined}>Tarjetas</Link>
      <Link href={hrefVista(ruta, params, "lista")} aria-current={vista === "lista" ? "page" : undefined}>Lista</Link>
    </nav>
  );
}
