"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { migas } from "@/lib/migas";
import type { Menu } from "@/lib/roles";

/** Dónde estás (grupo › pantalla › subpágina) y botón para regresar; en celular solo el botón. */
export function MigasDePan({ menu }: { menu: Menu }) {
  const r = migas(usePathname(), menu);
  if (!r.migas.length) return null;
  return (
    <nav className="migas" aria-label="Estás en">
      <ol className="migas-ruta">
        {r.migas.map((m, i) => (
          <li key={i}>
            {m.href ? <Link href={m.href}>{m.texto}</Link> : <span aria-current={i === r.migas.length - 1 ? "page" : undefined}>{m.texto}</span>}
          </li>
        ))}
      </ol>
      {r.regresar?.href && <Link className="migas-regresar" href={r.regresar.href}>← {r.regresar.texto}</Link>}
    </nav>
  );
}
