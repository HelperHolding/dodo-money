import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import { ESTADOS_FACTURA, NOMBRE_ESTADO_FACTURA, nombreEstadoFactura, nombreFactura, vencida, type EstadoFactura } from "@/lib/compras/facturas";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";

type Factura = {
  id: string; uuid: string | null; origen: "cfdi" | "manual"; serie: string | null; folio: string | null; tipo: "ingreso" | "egreso"; fecha_emision: string; total: number; saldo: number;
  estado: EstadoFactura; vence_el: string; revisada: boolean; proveedor_id: string; uuid_relacionado: string | null;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null;
};

export default async function Facturas({ searchParams }: { searchParams: Promise<{ ver?: string; proveedor?: string; ok?: string; error?: string }> }) {
  const { ver = "", proveedor = "", ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const hoy = hoyCalendarioMX();
  const [facturas, { data: empresa }, { data: proveedores }] = await Promise.all([
    leerTodo<Factura>((d, h) => supabase.from("facturas_saldo")
      .select("id, uuid, origen, serie, folio, tipo, fecha_emision, total, saldo, estado, vence_el, revisada, proveedor_id, uuid_relacionado, proveedores(razon_social, nombre_comercial)")
      .order("vence_el").order("id").range(d, h).returns<Factura[]>()),
    supabase.from("empresa").select("rfc, razon_social").maybeSingle<{ rfc: string; razon_social: string }>(),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
  ]);
  const uuids = new Set(facturas.map((f) => f.uuid).filter(Boolean));
  const visibles = facturas.filter((f) =>
    (!proveedor || f.proveedor_id === proveedor)
    && (ver === "vencidas" ? vencida(f, hoy)
      : ver === "sin_cfdi" ? f.origen === "manual" && f.estado !== "cancelada"
      : ver === "notas" ? f.tipo === "egreso"
      : (ESTADOS_FACTURA as readonly string[]).includes(ver) ? f.estado === ver && f.tipo === "ingreso"
      : f.tipo === "ingreso" && (f.estado === "por_pagar" || f.estado === "parcial")));

  return (
    <>
      <div className="encabezado">
        <h1>Facturas</h1>
        <p>{empresa ? `A nombre de ${empresa.razon_social} (${empresa.rfc}).` : "Falta configurar el RFC de la empresa."} <Link href="/compras/facturas/empresa">Datos de la empresa</Link></p>
      </div>
      <Aviso ok={ok} error={error} />
      <form className="seccion formulario" role="search">
        <div className="rejilla">
          <div className="campo">
            <label htmlFor="ver">Ver</label>
            <select id="ver" name="ver" defaultValue={ver}>
              <option value="">Por pagar</option>
              <option value="vencidas">Vencidas</option>
              {ESTADOS_FACTURA.filter((e) => e !== "por_pagar").map((e) => <option key={e} value={e}>{NOMBRE_ESTADO_FACTURA[e]}</option>)}
              <option value="notas">Notas de crédito</option>
              <option value="sin_cfdi">Sin CFDI</option>
            </select>
          </div>
          <div className="campo">
            <label htmlFor="proveedor">Proveedor</label>
            <select id="proveedor" name="proveedor" defaultValue={proveedor}>
              <option value="">Todos</option>
              {(proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
            </select>
          </div>
        </div>
        <div className="acciones">
          <button className="boton boton-secundario" type="submit">Filtrar</button>
          {puedeEditarCompras(perfil.rol) && <Link className="boton" href="/compras/facturas/subir">Subir facturas</Link>}
          {puedeEditarCompras(perfil.rol) && <Link className="boton boton-secundario" href="/compras/facturas/nueva">Agregar sin CFDI</Link>}
        </div>
      </form>
      {!visibles.length && <p className="vacio">No hay facturas con ese filtro.</p>}
      <div className="tarjetas">
        {visibles.map((f) => {
          const atrasada = vencida(f, hoy);
          return (
            <article key={f.id} className="tarjeta" data-alerta={atrasada || (f.tipo === "egreso" && f.uuid_relacionado && !uuids.has(f.uuid_relacionado)) ? "si" : undefined}>
              <div className="tarjeta-encabezado">
                <div>
                  <h3><Link href={`/compras/facturas/${f.id}`}>{f.tipo === "egreso" ? "Nota de crédito" : f.origen === "manual" ? "Gasto" : "Factura"} {nombreFactura(f)}</Link></h3>
                  <p className="tarjeta-estado">{f.proveedores?.nombre_comercial ?? f.proveedores?.razon_social} · {nombreEstadoFactura(f.tipo, f.estado)}{f.origen === "manual" ? " · Sin CFDI" : ""}</p>
                </div>
              </div>
              <dl className="tarjeta-datos">
                <dt>Total</dt><dd>{pesos(f.total)}{f.tipo === "ingreso" && Number(f.saldo) !== Number(f.total) ? ` · saldo ${pesos(f.saldo)}` : ""}</dd>
                {f.tipo === "ingreso" && <><dt>Vence</dt><dd>{fechaTexto(f.vence_el)}{atrasada ? " · vencida" : ""}</dd></>}
                <dt>Emitida</dt><dd>{fechaTexto(f.fecha_emision)}{f.revisada ? " · revisada" : ""}</dd>
                {f.tipo === "egreso" && f.uuid_relacionado && !uuids.has(f.uuid_relacionado) && <><dt>Aviso</dt><dd>Aún no se sube la factura que corrige</dd></>}
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}
