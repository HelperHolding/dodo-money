import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyMX } from "@/lib/formato";
import { NOMBRE_PARAMETRO, valorVigente, type ClaveParametro, type Parametro } from "@/lib/finanzas/parametros";
import { RENGLONES } from "@/lib/finanzas/pl";
import { puedeEditarFinanzas } from "@/lib/roles";
import { guardarMeta, guardarParametro } from "./acciones";

const NOMBRE_TIPO = { pct: "% de la venta neta", monto: "Monto fijo al mes", pct_rappi: "% de la venta Rappi con IVA", plantilla: "Costo de la plantilla" } as const;

export default async function Parametros({ searchParams }: { searchParams: Promise<{ sucursal?: string; ok?: string; error?: string }> }) {
  const q = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarFinanzas(perfil.rol);
  const hoy = hoyMX();
  const [{ data: params }, { data: sucursales }, { data: metas }] = await Promise.all([
    supabase.from("pl_parametros").select("clave, valor, vigente_desde").order("clave").order("vigente_desde").returns<Parametro[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("pl_metas").select("sucursal_id, renglon, tipo, valor").returns<{ sucursal_id: string; renglon: string; tipo: keyof typeof NOMBRE_TIPO; valor: number }[]>(),
  ]);
  const suc = (sucursales ?? []).find((s) => s.id === q.sucursal) ?? (sucursales ?? [])[0];
  const claves = Object.keys(NOMBRE_PARAMETRO) as ClaveParametro[];
  return (
    <>
      <div className="encabezado"><h1>Parámetros y metas</h1><p>Los parámetros valen desde su fecha (no cambian meses anteriores). Las metas son por sucursal.</p></div>
      <Aviso ok={q.ok} error={q.error} />
      <section className="seccion">
        <h2>Parámetros</h2>
        <ul className="lista-filas" style={{ "--columnas": 2 } as React.CSSProperties}>
          {claves.map((c) => {
            const historial = (params ?? []).filter((p) => p.clave === c);
            return (
              <li key={c} className="fila">
                <div className="fila-nombre"><strong>{NOMBRE_PARAMETRO[c]}</strong><small>{historial.map((p) => `${(Number(p.valor) * 100).toFixed(2)} % desde ${p.vigente_desde}`).join(" · ") || "Sin valor"}</small></div>
                <div className="fila-datos"><span>Hoy: {(valorVigente(params ?? [], c, hoy) * 100).toFixed(2)} %</span><span /></div>
              </li>
            );
          })}
        </ul>
        {edita && (
          <form action={guardarParametro} className="formulario">
            <div className="rejilla">
              <div className="campo"><label htmlFor="p-cla">Parámetro</label><select id="p-cla" name="clave">{claves.map((c) => <option key={c} value={c}>{NOMBRE_PARAMETRO[c]}</option>)}</select></div>
              <div className="campo"><label htmlFor="p-val">Valor (%)</label><input id="p-val" name="valor" inputMode="decimal" required /></div>
              <div className="campo"><label htmlFor="p-vig">Desde</label><input id="p-vig" name="vigente_desde" type="date" defaultValue={`${hoy.slice(0, 7)}-01`} required /></div>
            </div>
            <BotonEnviar>Guardar parámetro</BotonEnviar>
          </form>
        )}
      </section>
      {suc && (
        <section className="seccion">
          <h2>Metas · {suc.nombre}</h2>
          <form className="acciones" method="get"><select name="sucursal" defaultValue={suc.id} aria-label="Sucursal">{(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select><button className="boton boton-secundario" type="submit">Ver</button></form>
          <ul className="lista-filas" style={{ "--columnas": 1 } as React.CSSProperties}>
            {RENGLONES.filter((r) => r.tipo === "gasto").map((r) => {
              const m = (metas ?? []).find((x) => x.sucursal_id === suc.id && x.renglon === r.clave);
              const mostrar = m ? (m.tipo === "pct" || m.tipo === "pct_rappi" ? `${(Number(m.valor) * 100).toFixed(2)} %` : m.tipo === "plantilla" ? "plantilla" : `$${Number(m.valor).toLocaleString("es-MX")}`) : "Sin meta";
              return (
                <li key={r.clave} className="fila">
                  <div className="fila-nombre"><strong>{r.nombre}</strong><small>{m ? `${NOMBRE_TIPO[m.tipo]} · ${mostrar}` : "Sin meta"}</small></div>
                  <div className="fila-datos"><span>
                    {edita && (
                      <form action={guardarMeta} className="form-motivo">
                        <input type="hidden" name="sucursal_id" value={suc.id} />
                        <input type="hidden" name="renglon" value={r.clave} />
                        <select name="tipo" defaultValue={m?.tipo ?? "pct"} aria-label={`Tipo de meta de ${r.nombre}`}>{(Object.keys(NOMBRE_TIPO) as (keyof typeof NOMBRE_TIPO)[]).map((t) => <option key={t} value={t}>{NOMBRE_TIPO[t]}</option>)}</select>
                        <input name="valor" inputMode="decimal" aria-label={`Valor de la meta de ${r.nombre}`} defaultValue={m ? (m.tipo === "pct" || m.tipo === "pct_rappi" ? (Number(m.valor) * 100).toString() : String(m.valor)) : ""} />
                        <BotonEnviar className="boton boton-secundario">Guardar</BotonEnviar>
                      </form>
                    )}
                  </span></div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
