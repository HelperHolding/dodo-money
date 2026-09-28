"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ACCESOS = [
  { href: "/checklists", texto: "Resumen" },
  { href: "/checklists/ronda", texto: "Ronda de la hora" },
  { href: "/checklists/turno", texto: "Listas del turno" },
  { href: "/checklists/masa", texto: "Masa" },
  { href: "/checklists/recorrido", texto: "Recorrido" },
  { href: "/checklists/amasado", texto: "Amasado" },
  { href: "/checklists/mermas", texto: "Mermas" },
  { href: "/checklists/limpieza-profunda", texto: "Limpieza profunda" },
  { href: "/checklists/objetivos", texto: "Objetivos" },
];

export function AccesosChecklists() {
  const ruta = usePathname();
  const barra = useRef<HTMLElement>(null);
  // En celular la barra se desliza: deja visible el acceso de la pantalla actual.
  useEffect(() => {
    barra.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [ruta]);
  return (
    <nav className="accesos" aria-label="Checklists" ref={barra}>
      {ACCESOS.map((a) => (
        <Link key={a.href} href={a.href} aria-current={ruta === a.href ? "page" : undefined}>{a.texto}</Link>
      ))}
    </nav>
  );
}
