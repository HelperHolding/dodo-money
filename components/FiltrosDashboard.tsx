"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { urlDashboard, type ParametrosDashboard } from "@/lib/ventas/inicio";

/**
 * Filtros de mes y sucursal del dashboard de inicio. Navegan sin recargar la página: el servidor vuelve a calcular
 * solo el contenido y, mientras tanto, el dashboard se marca como cargando. Sin JavaScript, el formulario funciona igual.
 */
export function FiltrosDashboard({ ruta, parametros, mesMaximo, sucursales, children }: {
  ruta: string; parametros: ParametrosDashboard; mesMaximo: string;
  sucursales: readonly { id: string; nombre: string }[]; children: React.ReactNode;
}) {
  const router = useRouter();
  const [cargando, iniciar] = useTransition();

  const consultar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const ventas_sucursal = String(datos.get("ventas_sucursal") || "todas");
    // Al elegir una sucursal el historial empieza en esa sucursal; con todas, en toda la red.
    const url = urlDashboard(ruta, parametros, {
      ventas_mes: String(datos.get("ventas_mes") || parametros.ventas_mes), ventas_sucursal,
      alcance: ventas_sucursal === "todas" ? "red" : "sucursal",
    });
    iniciar(() => router.push(url, { scroll: false }));
  };

  return (
    <>
      <form action={ruta} method="get" className="acciones inicio-ventas-filtros" onSubmit={consultar}>
        {parametros.fecha && <input type="hidden" name="fecha" value={parametros.fecha} />}
        <input type="hidden" name="hist" value={parametros.hist} />
        <label className="campo">Mes<input type="month" name="ventas_mes" max={mesMaximo} defaultValue={parametros.ventas_mes} /></label>
        <label className="campo">Sucursal<select name="ventas_sucursal" defaultValue={parametros.ventas_sucursal}>
          <option value="todas">Todas las sucursales</option>
          {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select></label>
        <button className="boton" type="submit" disabled={cargando}>{cargando ? "Consultando…" : "Consultar"}</button>
      </form>
      <div className="inicio-ventas-cuerpo" aria-busy={cargando}>{children}</div>
    </>
  );
}
