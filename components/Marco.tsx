import Link from "next/link";
import { MenuLateral } from "@/components/MenuLateral";
import { MigasDePan } from "@/components/MigasDePan";
import { cerrarSesion } from "@/app/login/actions";
import { accesosRapidos, menuLateral, NOMBRE_ROL } from "@/lib/roles";
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
  const { abiertas, vencidas } = await contarMisTareas(await crearClienteServidor()).catch(() => ({ abiertas: 0, vencidas: 0 }));
  const menu = !abiertas ? base : { ...base, grupos: base.grupos.map((g) => ({ ...g, enlaces: g.enlaces.map((e) =>
    e.href === "/tareas" ? { ...e, contador: { n: abiertas, urgente: vencidas > 0 } } : e) })) };
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
              <Link href="/cuenta">Mi contraseña</Link>
              <form action={cerrarSesion}><button type="submit">Salir</button></form>
            </div>
          </>
        }
      />
      <div className="marco-contenido">
        {aviso}
        <main className="pagina"><MigasDePan menu={menu} />{children}</main>
      </div>
    </div>
  );
}
