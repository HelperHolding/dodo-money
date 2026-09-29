"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Aviso discreto (admin y corporativo): "! 62" junto al título de Costos. Al pasar el mouse o tocarlo abre la
 * lista de productos sin costo del periodo; el enlace a Costos solo sale a quien puede asignarlos.
 * Va dentro del <summary> de un Plegable: los clics no deben plegarlo.
 */
export function AvisoSinCosto({ productos, piezas, puedeAsignar }: {
  productos: readonly { dodo_id: number; nombre: string; piezas: number }[];
  piezas: number;
  puedeAsignar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLSpanElement>(null);
  // Al salir con el mouse se espera un momento antes de cerrar: así da tiempo de cruzar el hueco hasta el recuadro.
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelarCierre = () => { if (temporizador.current) clearTimeout(temporizador.current); temporizador.current = null; };
  useEffect(() => cancelarCierre, []);

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
      onPointerEnter={(e) => { if (e.pointerType === "mouse") { cancelarCierre(); setAbierto(true); } }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") { cancelarCierre(); temporizador.current = setTimeout(() => setAbierto(false), 400); } }}>
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
          {puedeAsignar && <Link href="/ventas/costos?ver=sin-costo" className="aviso-sin-costo-enlace">Asignar costos →</Link>}
        </span>
      )}
    </span>
  );
}
