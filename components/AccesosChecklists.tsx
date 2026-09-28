"use client";

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
  return (
    <nav className="accesos" aria-label="Checklists">
      {ACCESOS.map((a) => (
        <Link key={a.href} href={a.href} aria-current={ruta === a.href ? "page" : undefined}>{a.texto}</Link>
      ))}
    </nav>
  );
}
