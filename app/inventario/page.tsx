import Link from "next/link";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { existenciasDe, tokenDeAcceso } from "@/lib/dodois/cliente";
import { pesos } from "@/lib/formato";
import {
  CATEGORIAS, DIAS_ALERTA, agruparPorCategoria, cantidadTexto, filtrarExistencias, porAcabarse, traducirExistencias,
  type Existencia,
} from "@/lib/inventario";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Leer las existencias puede renovar el token de Dodo IS: que no se corte a la mitad.
export const maxDuration = 60;

type Filtros = { sucursal?: string; categoria?: string; q?: string; alerta?: string };
type Sucursal = { id: string; nombre: string; dodois_unit_id: string };

/** Existencias actuales de insumos en Dodo IS por sucursal, en vivo (no se guardan). */
export default async function InsumosDodoIS({ searchParams }: { searchParams: Promise<Filtros> }) {
  const f = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const { data } = await supabase.from("sucursales").select("id, nombre, dodois_unit_id").not("dodois_unit_id", "is", null)
    .order("nombre").returns<Sucursal[]>();
  const sucursales = data ?? [];
  const encabezado = <EncabezadoPagina titulo="Insumos Dodo IS" info={`Existencias actuales que calcula Dodo IS para cada sucursal. "Estimado" significa que aún no lo confirma una revisión de inventario. Se marcan los insumos que alcanzan para ${DIAS_ALERTA} días o menos.`} acciones={<Link className="boton boton-secundario" href="/inventario/uniformes">Uniformes</Link>} />;
  if (!sucursales.length) return <>{encabezado}<p className="vacio">No hay sucursales ligadas a Dodo IS. Lígalas en Ventas → Dodo IS.</p></>;

  // Por omisión, la sucursal del usuario si está ligada; si no, la primera. "todas" consulta todas juntas.
  const elegida = f.sucursal === "todas" ? "" : sucursales.some((s) => s.id === f.sucursal) ? f.sucursal!
    : sucursales.find((s) => s.id === perfil.sucursal_id)?.id ?? sucursales[0].id;
  const consultar = elegida ? sucursales.filter((s) => s.id === elegida) : sucursales;

  let existencias: Existencia[];
  try {
    const token = await tokenDeAcceso(crearClienteAdmin());
    const api = await existenciasDe(token, consultar.map((s) => s.dodois_unit_id));
    existencias = traducirExistencias(api, new Map(consultar.map((s) => [s.dodois_unit_id, s.id])));
  } catch (e) {
    return <>{encabezado}<p className="aviso aviso-error" role="alert">No se pudieron leer las existencias de Dodo IS: {(e as Error).message} Si persiste, revisa la conexión en Ventas → Dodo IS.</p></>;
  }

  const nombreSucursal = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const lista = filtrarExistencias(existencias, { categoria: f.categoria, q: f.q, alerta: f.alerta === "1" });
  const grupos = agruparPorCategoria(lista);
  const valor = lista.reduce((s, e) => s + e.valor, 0), alertas = lista.filter(porAcabarse).length;
  const estimados = lista.filter((e) => !e.confirmado).length;
  const calculado = existencias.map((e) => e.calculado).sort().at(-1);

  return (
    <>
      {encabezado}
      <form method="get" className="rejilla">
        <label className="campo">Sucursal
          <select name="sucursal" defaultValue={elegida || "todas"}>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            {sucursales.length > 1 && <option value="todas">Todas</option>}
          </select>
        </label>
        <label className="campo">Categoría
          <select name="categoria" defaultValue={f.categoria ?? ""}>
            <option value="">Todas</option>
            {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="campo">Buscar<input name="q" defaultValue={f.q ?? ""} placeholder="Nombre del insumo" /></label>
        <label className="campo">Mostrar
          <select name="alerta" defaultValue={f.alerta ?? ""}>
            <option value="">Todos</option>
            <option value="1">Solo por acabarse</option>
          </select>
        </label>
        <button className="boton" style={{ alignSelf: "end" }}>Filtrar</button>
      </form>

      <section className="seccion">
        <p><strong>{lista.length} insumos</strong> · Valor en almacén: {pesos(valor)} · {alertas} por acabarse · {estimados} estimados</p>
        {calculado && <small>Calculado por Dodo IS: {calculado.replace("T", " ")} (hora de la sucursal).</small>}
      </section>

      {!grupos.length && <p className="vacio">No hay insumos con estos filtros.</p>}
      {grupos.map((g) => (
        <section className="seccion" key={g.categoria}>
          <h2>{g.nombre} <small>· {g.items.length} · {pesos(g.valor)}</small></h2>
          <ul className="lista-filas" style={{ "--columnas": 3 } as React.CSSProperties}>
            {g.items.map((e) => (
              <li key={`${e.sucursalId}-${e.insumoId}`} className="fila" data-alerta={porAcabarse(e) ? "si" : undefined}>
                <div className="fila-nombre">
                  <strong>{e.nombre}</strong>
                  <small>{elegida ? "" : `${nombreSucursal.get(e.sucursalId)} · `}{e.confirmado ? "Confirmado por revisión" : "Estimado"}</small>
                </div>
                <div className="fila-datos">
                  <span>Existencia {cantidadTexto(e.cantidad, e.unidad)}</span>
                  <span>Valor {pesos(e.valor)}</span>
                  <span>{e.consumoDia > 0 ? `Alcanza ${e.dias} ${e.dias === 1 ? "día" : "días"} · usa ${cantidadTexto(e.consumoDia, e.unidad)}/día` : "Sin consumo reciente"}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
