"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/", texto: "Inicio" },
  { href: "/arqueo", texto: "Arqueo de turno" },
  { href: "/movimientos", texto: "Movimientos" },
  { href: "/caja-chica", texto: "Caja chica" },
  { href: "/cierre", texto: "Cierre del día" },
];

export function Nav() {
  const ruta = usePathname();
  return (
    <nav className="nav" aria-label="Secciones">
      {ENLACES.map((e) => (
        <Link key={e.href} href={e.href} aria-current={ruta === e.href ? "page" : undefined}>
          {e.texto}
        </Link>
      ))}
    </nav>
  );
}
