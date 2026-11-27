import Link from "next/link";
import { MenuLateral } from "@/components/MenuLateral";
import { MigasDePan } from "@/components/MigasDePan";
import { PestanasArea } from "@/components/PestanasArea";
import { cerrarSesion } from "@/app/login/actions";
import { accesosRapidos, menuLateral, NOMBRE_ROL } from "@/lib/roles";
import { BotonReportar } from "@/components/BotonReportar";
import { contarSoporte } from "@/app/soporte/datos";
import { contarMisTareas } from "@/app/tareas/datos";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Rol } from "@/lib/tipos";

/** Estructura de toda la app: menú lateral a la izquierda y la página a la derecha. */
export async function Marco({ perfil, titulo, detalle, aviso, children }: {
  perfil: { nombre: string; rol: Rol };
  /** Sucursal o sección: "Dodo Coyoacán", "Compras". */
  titulo: string;
  /** Línea de contexto: turno abierto, "Oficina central", etc. */
  detalle: string;
  /** Franja arriba del contenido (p. ej. corporativo viendo una sucursal). */
  aviso?: React.ReactNode;
  children: React.ReactNode;
}) {
  const base = menuLateral(perfil.rol);
  const supabase = await crearClienteServidor();
  const [{ abiertas, vencidas }, soporte] = await Promise.all([
    contarMisTareas(supabase).catch(() => ({ abiertas: 0, vencidas: 0 })),
    contarSoporte(supabase),
  ]);
  const contadores: Record<string, { n: number; urgente: boolean }> = {};
  if (abiertas) contadores["/tareas"] = { n: abiertas, urgente: vencidas > 0 };
  if (soporte.pendientes) contadores["/soporte"] = { n: soporte.pendientes, urgente: soporte.urgente };
  const menu = { ...base, grupos: base.grupos.map((g) => ({ ...g, enlaces: g.enlaces.map((e) => (contadores[e.href] ? { ...e, contador: contadores[e.href] } : e)) })) };
  return (
    <div className="marco">
      <MenuLateral
        menu={menu}
        accesos={accesosRapidos(perfil.rol)}
        titulo={titulo}
        cabecera={
          <div className="lateral-identidad">
            <img className="lateral-logo" src="/logo-dodo.png" alt="Dodo Pizza" width={36} height={36} />
            <div>
              <p className="lateral-marca">{titulo}</p>
              <p className="lateral-detalle">{detalle}</p>
            </div>
          </div>
        }
        pie={
          <>
            <p className="lateral-usuario">{perfil.nombre}<span>{NOMBRE_ROL[perfil.rol]}</span></p>
            <div className="lateral-acciones">
              <BotonReportar />
              <Link href="/cuenta">Mi contraseña</Link>
              <form action={cerrarSesion}><button type="submit">Salir</button></form>
            </div>
          </>
        }
      />
      <div className="marco-contenido">
        {aviso}
        <main className="pagina"><div className="pagina-cabeza"><MigasDePan menu={menu} /><PestanasArea menu={menu} /></div>{children}</main>
      </div>
    </div>
  );
}
