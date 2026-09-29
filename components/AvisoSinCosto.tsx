"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Aviso discreto para el admin: "! 62" junto al título de Costos. Al pasar el mouse o tocarlo abre la lista
 * de productos sin costo del periodo. Va dentro del <summary> de un Plegable: los clics no deben plegarlo.
 */
export function AvisoSinCosto({ productos, piezas }: { productos: readonly { dodo_id: number; nombre: string; piezas: number }[]; piezas: number }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent | TouchEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("touchstart", cerrar);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("touchstart", cerrar);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  if (!productos.length) return null;
  const detener = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <span ref={caja} className="aviso-sin-costo" 
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setAbierto(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setAbierto(false); }}>
      <button type="button" className="aviso-sin-costo-boton" aria-expanded={abierto}
        aria-label={`${productos.length} productos sin costo`}
        onClick={(e) => { detener(e); setAbierto(!abierto); }} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") e.stopPropagation(); }}>
        ! {productos.length}
      </button>
      {abierto && (
        <span className="aviso-sin-costo-caja" role="dialog" aria-label="Productos sin costo"
          onClick={(e) => { e.stopPropagation(); if (!(e.target as HTMLElement).closest("a")) e.preventDefault(); }}>
          <span className="aviso-sin-costo-titulo">
            {productos.length} productos sin costo · {piezas} piezas · no cuentan en el costo %
          </span>
          <span className="aviso-sin-costo-lista">
            {productos.map((p) => (
              <span key={p.dodo_id} className="aviso-sin-costo-fila">
                <span>{p.nombre}</span><span>{p.piezas} pzs</span>
              </span>
            ))}
          </span>
          <Link href="/ventas/costos?ver=sin-costo" className="aviso-sin-costo-enlace">Asignar costos →</Link>
        </span>
      )}
    </span>
  );
}
