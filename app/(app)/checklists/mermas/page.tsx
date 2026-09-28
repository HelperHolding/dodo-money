import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { diaOperativoMX } from "@/lib/franjas";
import { hora, numeroCorto } from "@/lib/formato";
import { NOMBRE_MOTIVO, type CierreMerma, type Merma, type MotivoMerma, type ProductoMerma } from "@/lib/tipos";
import { cerrarMermas, registrarMerma } from "./actions";

export default async function Mermas({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();
  const fecha = diaOperativoMX(new Date());

  const [{ data: productos }, { data: mermas }, { data: cierre }, { data: nombres }] = await Promise.all([
    supabase.from("productos_merma").select("id, categoria, nombre, unidad, orden, activo").order("orden").returns<ProductoMerma[]>(),
    supabase.from("mermas").select("id, fecha, producto_id, cantidad, motivo, empleado, registrado_por, creado_en")
      .eq("sucursal_id", sucursal.id).eq("fecha", fecha).order("creado_en", { ascending: false }).returns<Merma[]>(),
    supabase.from("cierres_merma").select("fecha, capturado_dodo, cerrado_por, cerrado_en")
      .eq("sucursal_id", sucursal.id).eq("fecha", fecha).maybeSingle<CierreMerma>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);

  // El mapa incluye productos inactivos para que las mermas viejas sigan mostrando su nombre.
  const producto = new Map((productos ?? []).map((p) => [p.id, p]));
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const activos = (productos ?? []).filter((p) => p.activo);
  const categorias = [...new Set(activos.map((p) => p.categoria))];

  const suma = new Map<string, number>();
  for (const m of mermas ?? []) suma.set(m.producto_id, (suma.get(m.producto_id) ?? 0) + Number(m.cantidad));
  const totales = [...suma.entries()]
    .map(([id, cantidad]) => ({ id, p: producto.get(id), cantidad }))
    .sort((a, b) => (a.p?.orden ?? 0) - (b.p?.orden ?? 0));

  return (
    <>
      <div className="encabezado">
        <h1>Mermas</h1>
        <p>Registra cada merma cuando pase, con el nombre de quien la hizo. Al final del día el encargado las captura en Dodo IS y cierra la lista.</p>
      </div>
      <Aviso ok={ok} error={error} />

      {cierre ? (
        <p className="aviso aviso-info">
          Las mermas de hoy se cerraron a las {hora(cierre.cerrado_en)} ({persona.get(cierre.cerrado_por)}). Ya no se pueden agregar.
        </p>
      ) : soloLectura ? null : (
        <form action={registrarMerma} className="seccion" aria-labelledby="t-registrar">
          <h2 id="t-registrar">Registrar merma</h2>
          <div className="rejilla">
            <div className="campo">
              <label htmlFor="producto_id">Producto</label>
              <select id="producto_id" name="producto_id" required defaultValue="">
                <option value="" disabled>Elige el producto</option>
                {categorias.map((c) => (
                  <optgroup key={c} label={c}>
                    {activos.filter((p) => p.categoria === c).map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre} ({p.unidad})</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="cantidad">Cantidad</label>
              <input id="cantidad" name="cantidad" inputMode="decimal" required placeholder="Ej. 0.5" autoComplete="off" />
              <small>En la unidad del producto: kg, pieza, bola…</small>
            </div>
            <div className="campo">
              <label htmlFor="motivo">Motivo</label>
              <select id="motivo" name="motivo" required defaultValue="">
                <option value="" disabled>Elige el motivo</option>
                {(Object.keys(NOMBRE_MOTIVO) as MotivoMerma[]).map((m) => (
                  <option key={m} value={m}>{NOMBRE_MOTIVO[m]}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="empleado">Quién hizo la merma</label>
              <input id="empleado" name="empleado" required autoComplete="off" placeholder="Nombre y apellido" />
            </div>
          </div>
          <div className="acciones"><BotonEnviar>Registrar merma</BotonEnviar></div>
        </form>
      )}

      <section className="seccion" aria-labelledby="t-totales">
        <h2 id="t-totales">Totales para Dodo IS</h2>
        {!totales.length ? <p className="vacio">No hay mermas hoy.</p> : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead><tr><th>Producto</th><th>Cantidad</th></tr></thead>
              <tbody>
                {totales.map(({ id, p, cantidad }) => (
                  <tr key={id}><td>{p?.nombre}</td><td className="monto">{numeroCorto(cantidad)} {p?.unidad}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!cierre && puedeSupervisar(perfil.rol) && (
          <form action={cerrarMermas} className="acciones">
            <label className="casilla">
              <input type="checkbox" name="capturado_dodo" value="si" required /> Ya capturé estas mermas en Dodo IS
            </label>
            <BotonEnviar className="boton boton-secundario" pendiente="Cerrando…">Cerrar mermas del día</BotonEnviar>
          </form>
        )}
      </section>

      <section className="seccion" aria-labelledby="t-lista">
        <h2 id="t-lista">Mermas de hoy</h2>
        {!mermas?.length ? <p className="vacio">Todavía no hay mermas registradas.</p> : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead><tr><th>Hora</th><th>Producto</th><th>Cantidad</th><th>Motivo</th><th>Quién</th><th>Sesión</th></tr></thead>
              <tbody>
                {mermas.map((m) => {
                  const p = producto.get(m.producto_id);
                  return (
                    <tr key={m.id}>
                      <td data-label="Hora">{hora(m.creado_en)}</td>
                      <td data-label="Producto">{p?.nombre}</td>
                      <td data-label="Cantidad" className="monto">{numeroCorto(Number(m.cantidad))} {p?.unidad}</td>
                      <td data-label="Motivo">{NOMBRE_MOTIVO[m.motivo]}</td>
                      <td data-label="Quién">{m.empleado}</td>
                      <td data-label="Sesión">{persona.get(m.registrado_por)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
