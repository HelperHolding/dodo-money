import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaMX, fechaTexto, hora, hoyCalendarioMX, pesos } from "@/lib/formato";
import { puedeImportarVentas } from "@/lib/roles";
import { actualizarAhora, ligarUnidad } from "./acciones";

type Conexion = { conectado_en: string; estado: string; ultimo_error: string | null; unidades: { id: string; name: string }[]; perfiles: { nombre: string } | null };
type Registro = { id: number; inicio: string; origen: string; fecha: string | null; pedidos: number | null; total: number | null; estado: string; mensaje: string | null; sucursales: { nombre: string } | null };
// "Actualizar ahora" puede renovar el token y reintentar: que no se corte a la mitad.
export const maxDuration = 60;

const ORIGEN: Record<string, string> = { cron: "Cada 15 min", noche: "Cierre 3 a.m.", manual: "Manual" };

/** Conexión con Dodo IS: estado, sucursales ligadas, actualizar ahora y últimas sincronizaciones. Solo admin. */
export default async function PaginaDodoIS({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) redirect("/ventas");
  const [{ data: conexion }, { data: sucursales }, { data: registros }] = await Promise.all([
    supabase.from("dodois_conexion").select("conectado_en, estado, ultimo_error, unidades, perfiles(nombre)").maybeSingle<Conexion>(),
    supabase.from("sucursales").select("id, nombre, dodois_unit_id").order("nombre").returns<{ id: string; nombre: string; dodois_unit_id: string | null }[]>(),
    supabase.from("dodois_sincronizaciones").select("id, inicio, origen, fecha, pedidos, total, estado, mensaje, sucursales(nombre)")
      .order("inicio", { ascending: false }).limit(20).returns<Registro[]>(),
  ]);
  const unidades = conexion?.unidades ?? [];
  return (
    <>
      <EncabezadoPagina titulo="Dodo IS" descripcion="Las ventas llegan solas cada 15 minutos de 10:00 a 0:00 y el día anterior se cierra a las 3 a.m. Los días importados del Excel no se tocan." />
      <Aviso ok={ok} error={error} />

      <section className="seccion">
        <h2>Conexión</h2>
        {!conexion ? <p className="vacio">Dodo IS no está conectado.</p> : (
          <dl className="tarjeta-datos">
            <dt>Estado</dt><dd>{conexion.estado === "conectada" ? "Conectada" : "Hay que reconectar"}</dd>
            <dt>Conectada por</dt><dd>{conexion.perfiles?.nombre ?? "—"} · {fechaTexto(fechaMX(conexion.conectado_en))}</dd>
            {conexion.ultimo_error && <><dt>Último error</dt><dd>{conexion.ultimo_error}</dd></>}
          </dl>
        )}
        <p><a className={conexion?.estado === "conectada" ? "boton boton-secundario" : "boton"} href="/api/dodois/conectar">{conexion ? "Reconectar" : "Conectar con Dodo IS"}</a></p>
      </section>

      {conexion && (
        <section className="seccion">
          <h2>Sucursales</h2>
          <ul className="lista-filas" style={{ "--columnas": 1 } as React.CSSProperties}>
            {(sucursales ?? []).map((s) => (
              <li key={s.id} className="fila" data-alerta={s.dodois_unit_id ? undefined : "si"}>
                <div className="fila-nombre"><strong>{s.nombre}</strong><small>{s.dodois_unit_id ? "Sincroniza" : "Sin ligar: no sincroniza"}</small></div>
                <div className="fila-datos"><span>
                  <form action={ligarUnidad} className="acciones">
                    <input type="hidden" name="sucursal_id" value={s.id} />
                    <select name="unidad" defaultValue={s.dodois_unit_id ?? ""} aria-label={`Unidad de Dodo IS de ${s.nombre}`}>
                      <option value="">Sin ligar</option>
                      {unidades.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <BotonEnviar className="boton boton-secundario">Guardar</BotonEnviar>
                  </form>
                </span></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {conexion && (
        <section className="seccion">
          <h2>Actualizar ahora</h2>
          <form action={actualizarAhora} className="formulario">
            <div className="rejilla">
              <div className="campo"><label htmlFor="fecha">Día (vacío = hoy)</label><input id="fecha" name="fecha" type="date" max={hoyCalendarioMX()} /></div>
              <label className="campo"><span><input type="checkbox" name="simular" value="si" /> Solo calcular, sin guardar</span></label>
            </div>
            <BotonEnviar pendiente="Trayendo de Dodo IS…">Actualizar ahora</BotonEnviar>
          </form>
        </section>
      )}

      <section className="seccion">
        <h2>Últimas sincronizaciones</h2>
        {!(registros ?? []).length ? <p className="vacio">Todavía no hay sincronizaciones.</p> : (
          <ul className="lista-filas" style={{ "--columnas": 3 } as React.CSSProperties}>
            {(registros ?? []).map((r) => (
              <li key={r.id} className="fila" data-alerta={r.estado === "error" ? "si" : undefined}>
                <div className="fila-nombre"><strong>{r.sucursales?.nombre ?? "—"} · {r.fecha ? fechaTexto(r.fecha) : "—"}</strong><small>{ORIGEN[r.origen] ?? r.origen} · {fechaTexto(fechaMX(r.inicio))} {hora(r.inicio)}</small></div>
                <div className="fila-datos">
                  <span>{r.estado === "ok" ? "Al día" : r.estado === "omitido" ? "Sin cambios" : "Error"}</span>
                  <span>{r.pedidos ?? 0} pedidos · {pesos(Number(r.total ?? 0))}</span>
                  <span>{r.mensaje ?? ""}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p><Link href="/ventas/importar">Importar Datos brutos (respaldo) →</Link></p>
      </section>
    </>
  );
}
