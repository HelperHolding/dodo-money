"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/", texto: "Inicio" },
  { href: "/arqueo", texto: "Arqueo de turno" },
  { href: "/movimientos", texto: "Movimientos" },
  { href: "/caja-chica", texto: "Caja chica" },
  { href: "/cierre", texto: "Cierre del día" },
  { href: "/checklists", texto: "Checklists" },
];

const activo = (ruta: string, href: string) => ruta === href || (href !== "/" && ruta.startsWith(`${href}/`));

export function Nav({ corporativo = false }: { corporativo?: boolean }) {
  const ruta = usePathname();
  const enlaces = corporativo ? [{ href: "/corporativo", texto: "Corporativo" }, ...ENLACES] : ENLACES;
  return (
    <nav className="nav" aria-label="Secciones">
      {enlaces.map((e) => (
        <Link key={e.href} href={e.href} aria-current={activo(ruta, e.href) ? "page" : undefined}>
          {e.texto}
        </Link>
      ))}
    </nav>
  );
}
