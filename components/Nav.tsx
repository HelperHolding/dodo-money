"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { enlaceActivo, type Enlace } from "@/lib/roles";

export function Nav({ enlaces }: { enlaces: readonly Enlace[] }) {
  const actual = enlaceActivo(usePathname(), enlaces);
  return (
    <nav className="nav" aria-label="Secciones">
      {enlaces.map((e) => (
        <Link key={e.href} href={e.href} aria-current={e.href === actual ? "page" : undefined}>
          {e.texto}
        </Link>
      ))}
    </nav>
  );
}
