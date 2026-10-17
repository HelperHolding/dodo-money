"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icono } from "@/components/Icono";
import type { Menu } from "@/lib/roles";

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Ir a cualquier página del menú escribiendo su nombre (Ctrl K o ⌘ K en cualquier pantalla).
 * Solo lista las páginas que el menú del puesto ya muestra: no abre accesos nuevos.
 */
export function BuscadorPaginas({ menu }: { menu: Menu }) {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [elegido, setElegido] = useState(0);

  const paginas = useMemo(() => [
    { href: menu.inicio.href, texto: menu.inicio.texto, grupo: "" },
    ...menu.grupos.flatMap((g) => g.enlaces.map((e) => ({ href: e.href, texto: e.texto, grupo: g.titulo }))),
  ], [menu]);
  const q = normal(texto.trim());
  const lista = q ? paginas.filter((p) => normal(`${p.texto} ${p.grupo}`).includes(q)) : paginas;

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setAbierto((a) => !a); }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) { setTexto(""); setElegido(0); d.showModal(); }
    if (!abierto && d.open) d.close();
  }, [abierto]);

  const ir = (href: string | undefined) => { if (!href) return; setAbierto(false); router.push(href); };

  return (
    <>
      <button type="button" className="buscador-boton" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        <Icono nombre="buscar" tamano={18} /><span>Buscar página</span><kbd>Ctrl K</kbd>
      </button>
      <dialog ref={dialogo} className="buscador" aria-label="Buscar página" onClose={() => setAbierto(false)}
        onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false); }}>
        <div className="buscador-caja">
          <label className="buscador-campo">
            <Icono nombre="buscar" tamano={20} />
            <span className="solo-lector">Nombre de la página</span>
            <input value={texto} autoFocus placeholder="Ir a… ventas, nómina, proveedores" autoComplete="off"
              role="combobox" aria-expanded="true" aria-controls="buscador-lista"
              aria-activedescendant={lista.length ? `buscador-op-${elegido}` : undefined}
              onChange={(e) => { setTexto(e.target.value); setElegido(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setElegido((i) => Math.min(lista.length - 1, i + 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setElegido((i) => Math.max(0, i - 1)); }
                if (e.key === "Enter") { e.preventDefault(); ir(lista[elegido]?.href); }
              }} />
            <kbd>Esc</kbd>
          </label>
          <ul id="buscador-lista" role="listbox" className="buscador-lista">
            {lista.map((p, i) => (
              <li key={p.href} id={`buscador-op-${i}`} role="option" aria-selected={i === elegido}
                onClick={() => ir(p.href)} onMouseMove={() => setElegido(i)}>
                <span>{p.texto}</span>{p.grupo && <small>{p.grupo}</small>}
              </li>
            ))}
            {!lista.length && <li className="buscador-vacio" role="option" aria-selected={false} aria-disabled="true">Ninguna página se llama así</li>}
          </ul>
        </div>
      </dialog>
    </>
  );
}
