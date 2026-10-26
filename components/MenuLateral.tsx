"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BuscadorPaginas } from "@/components/BuscadorPaginas";
import { Icono, type NombreIcono } from "@/components/Icono";
import { enlaceActivo, enlacesDelMenu, grupoAbierto, type Enlace, type Menu } from "@/lib/roles";

/** Icono de cada grupo del menú (por título; un grupo nuevo sin icono se muestra sin él). */
const ICONO_GRUPO: Record<string, NombreIcono> = {
  Sucursal: "tienda", Efectivo: "cartera", Ventas: "grafica", Compras: "carrito", Finanzas: "banco",
  "Proyectos y admin.": "maletin", Conocimiento: "libro", Catálogos: "lista",
};
/** Icono de cada acceso rápido de la barra inferior. */
const ICONO_ACCESO: Record<string, NombreIcono> = {
  "/": "casa", "/corporativo": "casa", "/arqueo": "billete", "/checklists": "lista", "/ventas": "grafica",
  "/compras/documentos": "carrito", "/finanzas": "banco",
};

/**
 * Menú lateral con grupos plegables. En computadora queda fijo a la izquierda;
 * en celular se abre como cajón con el botón de menú y se cierra al elegir una opción.
 * En celular, además, una barra inferior con los accesos que el puesto usa más y el botón del menú completo.
 */
export function MenuLateral({ menu, titulo, cabecera, pie, accesos }: {
  menu: Menu; titulo: string; cabecera: React.ReactNode; pie: React.ReactNode; accesos: readonly Enlace[];
}) {
  const ruta = usePathname();
  const actual = enlaceActivo(ruta, enlacesDelMenu(menu));
  const grupoActual = grupoAbierto(menu, ruta);
  const [abiertos, setAbiertos] = useState<string[]>(grupoActual ? [grupoActual] : []);
  const [cajon, setCajon] = useState(false);

  // Al cambiar de página: se abre el grupo de la página nueva y se cierra el cajón.
  useEffect(() => {
    if (grupoActual) setAbiertos((a) => (a.includes(grupoActual) ? a : [...a, grupoActual]));
    setCajon(false);
  }, [ruta, grupoActual]);

  useEffect(() => {
    if (!cajon) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") setCajon(false); };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [cajon]);

  const alternar = (grupo: string, abierto: boolean) =>
    setAbiertos((a) => (abierto ? (a.includes(grupo) ? a : [...a, grupo]) : a.filter((g) => g !== grupo)));
  const marcar = (href: string) => (href === actual ? "page" : undefined);
  const accesoActual = enlaceActivo(ruta, accesos);

  return (
    <>
      <div className="franja-movil">
        <button type="button" className="franja-movil-boton" aria-expanded={cajon} aria-controls="menu-lateral" onClick={() => setCajon(true)}>
          <Icono nombre="menu" tamano={24} /><span className="solo-lector">Abrir menú</span>
        </button>
        <img className="lateral-logo" src="/logo-dodo.png" alt="" width={28} height={28} />
        <span className="franja-movil-titulo">{titulo}</span>
      </div>
      {cajon && <button type="button" className="lateral-velo" aria-label="Cerrar menú" onClick={() => setCajon(false)} />}
      <aside id="menu-lateral" className="lateral" data-abierto={cajon ? "si" : undefined}>
        <div className="lateral-cabecera">
          {cabecera}
          <button type="button" className="lateral-cerrar" aria-label="Cerrar menú" onClick={() => setCajon(false)}><Icono nombre="cerrar" tamano={24} /></button>
        </div>
        <div className="lateral-buscar"><BuscadorPaginas menu={menu} /></div>
        <nav className="lateral-nav" aria-label="Secciones">
          <Link className="lateral-enlace" href={menu.inicio.href} aria-current={marcar(menu.inicio.href)}>{menu.inicio.texto}</Link>
          {menu.grupos.map((g) => (
            <details key={g.titulo} className="lateral-grupo" open={abiertos.includes(g.titulo)}
              onToggle={(e) => alternar(g.titulo, e.currentTarget.open)}>
              <summary>{ICONO_GRUPO[g.titulo] && <Icono nombre={ICONO_GRUPO[g.titulo]} tamano={18} />}<span>{g.titulo}</span></summary>
              <ul>
                {g.enlaces.map((e) => (
                  <li key={e.href}>
                    <Link className="lateral-enlace" href={e.href} aria-current={marcar(e.href)}>{e.texto}</Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
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
