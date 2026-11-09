"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { areaActiva, enlaceActivo, type Menu } from "@/lib/roles";

/** Pestañas del área actual (las páginas que antes eran enlaces del menú). Con una sola página no se pinta nada. */
export function PestanasArea({ menu }: { menu: Menu }) {
  const ruta = usePathname();
  const area = areaActiva(menu, ruta);
  if (!area || area.enlaces.length < 2) return null;
  const actual = enlaceActivo(ruta, area.enlaces);
  return (
    <nav className="pestanas-area" aria-label={`Secciones de ${area.titulo}`}>
      {area.enlaces.map((e) => (
        <Link key={e.href} href={e.href} aria-current={e.href === actual ? "page" : undefined}>
          {e.texto}
          {e.contador && <span className="contador-menu" data-urgente={e.contador.urgente || undefined}>{e.contador.n}</span>}
        </Link>
      ))}
    </nav>
  );
}
