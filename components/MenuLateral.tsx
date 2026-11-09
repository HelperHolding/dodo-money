"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BuscadorPaginas } from "@/components/BuscadorPaginas";
import { Icono, type NombreIcono } from "@/components/Icono";
import { InterruptorLuz } from "@/components/InterruptorLuz";
import { areaActiva, enlaceActivo, SECCIONES, type Enlace, type Menu } from "@/lib/roles";

/** Texto para lectores de pantalla del contador del menú. */
const etiquetaContador = ({ n, urgente }: { n: number; urgente: boolean }) =>
  `${n} ${n === 1 ? "pendiente" : "pendientes"}${urgente ? ", con vencidas" : ""}`;

/** Icono de cada acceso rápido de la barra inferior. */
const ICONO_ACCESO: Record<string, NombreIcono> = {
  "/": "casa", "/corporativo": "casa", "/arqueo": "billete", "/checklists": "lista", "/ventas": "grafica",
  "/compras/documentos": "carrito", "/finanzas": "banco",
};

/**
 * Menú lateral por áreas (ícono + nombre) agrupadas en secciones; las páginas de cada área van como pestañas
 * arriba de la página (PestanasArea). En computadora queda fijo a la izquierda;
 * en celular se abre como cajón con el botón de menú y se cierra al elegir una opción.
 * En celular, además, una barra inferior con los accesos que el puesto usa más y el botón del menú completo.
 */
export function MenuLateral({ menu, titulo, cabecera, pie, accesos }: {
  menu: Menu; titulo: string; cabecera: React.ReactNode; pie: React.ReactNode; accesos: readonly Enlace[];
}) {
  const ruta = usePathname();
  const areaActual = areaActiva(menu, ruta)?.titulo;
  const [cajon, setCajon] = useState(false);

  // Al cambiar de página se cierra el cajón.
  useEffect(() => { setCajon(false); }, [ruta]);

  useEffect(() => {
    if (!cajon) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") setCajon(false); };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [cajon]);

  const accesoActual = enlaceActivo(ruta, accesos);

  return (
    <>
      <div className="franja-movil">
        <button type="button" className="franja-movil-boton" aria-expanded={cajon} aria-controls="menu-lateral" onClick={() => setCajon(true)}>
          <Icono nombre="menu" tamano={24} /><span className="solo-lector">Abrir menú</span>
        </button>
        <img className="lateral-logo" src="/logo-dodo.png" alt="" width={28} height={28} />
        <span className="franja-movil-titulo">{titulo}</span>
        <InterruptorLuz />
      </div>
      {cajon && <button type="button" className="lateral-velo" aria-label="Cerrar menú" onClick={() => setCajon(false)} />}
      <aside id="menu-lateral" className="lateral" data-abierto={cajon ? "si" : undefined}>
        <div className="lateral-cabecera">
          {cabecera}
          <button type="button" className="lateral-cerrar" aria-label="Cerrar menú" onClick={() => setCajon(false)}><Icono nombre="cerrar" tamano={24} /></button>
        </div>
        <div className="lateral-buscar"><BuscadorPaginas menu={menu} /></div>
        <div className="lateral-luz"><InterruptorLuz /></div>
        <nav className="lateral-nav" aria-label="Secciones">
          {SECCIONES.map((s) => {
            const areas = menu.grupos.filter((g) => g.seccion === s);
            if (!areas.length) return null;
            return (
              <div key={s} className="lateral-seccion">
                <p className="lateral-seccion-titulo">{s}</p>
                <ul>
                  {areas.map((a) => {
                    const pendientes = a.enlaces.reduce((n, e) => n + (e.contador?.n ?? 0), 0);
                    const urgente = a.enlaces.some((e) => e.contador?.urgente);
                    return (
                      <li key={a.titulo}>
                        <Link className="lateral-enlace lateral-area" href={a.enlaces[0].href} aria-current={a.titulo === areaActual ? "page" : undefined}>
                          <Icono nombre={a.icono} tamano={18} /><span>{a.titulo}</span>
                          {pendientes > 0 && <span className="contador-menu" data-urgente={urgente || undefined}><span aria-hidden="true">{pendientes}</span><span className="solo-lector">{etiquetaContador({ n: pendientes, urgente })}</span></span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="lateral-pie">{pie}</div>
      </aside>
      <nav className="barra-inferior" aria-label="Accesos rápidos">
        {accesos.map((a) => (
          <Link key={a.href} href={a.href} aria-current={a.href === accesoActual ? "page" : undefined}>
            <Icono nombre={ICONO_ACCESO[a.href] ?? "derecha"} tamano={22} />{a.texto}
          </Link>
        ))}
        <button type="button" aria-expanded={cajon} aria-controls="menu-lateral" onClick={() => setCajon(true)}>
          <Icono nombre="menu" tamano={22} />Menú
        </button>
      </nav>
    </>
  );
}
