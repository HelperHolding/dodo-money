import { Imprimir } from "@/components/Imprimir";
import { fechaMX, fechaTexto, pesos } from "@/lib/formato";
import type { DatosEmpresa } from "@/lib/compras/empresa";
import { impuestosPorTasa, NOMBRE_ESTADO_ORDEN, totalesOrden, type EstadoOrden } from "@/lib/compras/ordenes";
import { nombreRegimen, NOMBRE_TASA_IVA, type TasaIva } from "@/lib/compras/proveedores";
import { ESTILOS_FORMATO } from "./estilos";

export type Orden = {
  folio: string; estado: EstadoOrden; notas: string | null; creado_en: string; confirmada_en: string | null; entrega_esperada: string | null;
  proveedores: {
    razon_social: string; nombre_comercial: string | null; rfc: string; contacto_nombre: string | null; telefono: string | null; correo: string | null;
    numero_cliente: string | null; dias_credito: number;
  } | null;
  sucursales: { nombre: string } | null;
};
export type Renglon = { id: string; descripcion: string; cantidad: number; precio: number; tasa_iva: TasaIva; articulos: { nombre: string; unidad: string } | null };

const NOMBRE_LINEA: Record<TasaIva, string> = { "16": "IVA 16 %", "0": "IVA tasa 0 %", exento: "Exento de IVA" };
const cantidad = (n: number) => new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(n);

/** El documento: estructura del formato de Zoho con el branding de Dodo. Recibe los datos ya cargados. */
export function FormatoOrden({ o, renglones, empresa }: { o: Orden; renglones: Renglon[]; empresa: DatosEmpresa | null }) {
  const rs = renglones;
  const t = totalesOrden(rs);
  const lineas = impuestosPorTasa(rs);
  const esOrden = o.estado === "confirmada" || o.estado === "cerrada";
  const p = o.proveedores;
  const conPrecio = rs.every((r) => Number(r.precio) > 0);

  return (
    <>
    <style>{ESTILOS_FORMATO}</style>
    <div className="oc-acciones no-imprimir"><Imprimir /></div>
    <main className="oc">

      <header className="oc-cabecera">
        <div className="oc-empresa">
          <img src="/logo-dodo.png" alt="Dodo Pizza" width={64} height={64} />
          <div>
            <p className="oc-empresa-nombre">{empresa?.razon_social ?? "Dodo Pizza"}</p>
            {empresa?.domicilio && <p>{empresa.domicilio}</p>}
            {empresa?.codigo_postal && <p>CP {empresa.codigo_postal} · México</p>}
            {empresa?.rfc && <p>RFC {empresa.rfc}</p>}
            {empresa?.regimen_fiscal && <p>Régimen fiscal: {empresa.regimen_fiscal} · {nombreRegimen(empresa.regimen_fiscal)}</p>}
            {empresa?.correo_compras && <p>{empresa.correo_compras}</p>}
          </div>
        </div>
        <div className="oc-titulo">
          <h1>{esOrden ? "Orden de compra" : "Solicitud de cotización"}</h1>
          <p className="oc-folio">N.º {o.folio}</p>
          {o.estado === "cancelada" && <p className="oc-sello">Cancelada</p>}
          <div className="oc-total-caja">
            <span>{esOrden ? "Total" : "Total estimado"}</span>
            <strong>{conPrecio || esOrden ? `MXN ${pesos(t.total)}` : "Por cotizar"}</strong>
          </div>
        </div>
      </header>

      <section className="oc-datos">
        <div className="oc-proveedor">
          <h2>Proveedor</h2>
          <p className="oc-proveedor-nombre">{p?.razon_social}</p>
          {p?.nombre_comercial && p.nombre_comercial !== p.razon_social && <p>{p.nombre_comercial}</p>}
          <p>RFC {p?.rfc}</p>
          {(p?.contacto_nombre || p?.telefono || p?.correo) && <p>{[p?.contacto_nombre, p?.telefono, p?.correo].filter(Boolean).join(" · ")}</p>}
          {p?.numero_cliente && <p>Nuestro n.º de cliente: <strong>{p.numero_cliente}</strong></p>}
        </div>
        <dl className="oc-claves">
          <dt>{esOrden ? "Fecha de la orden" : "Fecha de la solicitud"}</dt><dd>{fechaTexto(fechaMX(o.confirmada_en ?? o.creado_en))}</dd>
          {esOrden && <><dt>Entrega esperada</dt><dd>{o.entrega_esperada ? fechaTexto(o.entrega_esperada) : "Por confirmar"}</dd></>}
          <dt>Términos</dt><dd>{p?.dias_credito ? `Crédito ${p.dias_credito} días` : "Contado"}</dd>
          <dt>Entregar en</dt><dd>Dodo Pizza {o.sucursales?.nombre ?? "Oficina"}</dd>
          {!esOrden && o.estado !== "cancelada" && <><dt>Estado</dt><dd>{NOMBRE_ESTADO_ORDEN[o.estado]}</dd></>}
        </dl>
      </section>

      <table className="oc-tabla">
        <thead>
          <tr><th className="oc-num">#</th><th>Artículo y descripción</th><th className="oc-der">Cant.</th><th className="oc-der">Precio</th><th className="oc-der">Importe</th></tr>
        </thead>
        <tbody>
          {rs.map((r, i) => (
            <tr key={r.id}>
              <td className="oc-num">{i + 1}</td>
              <td>
                <span className="oc-articulo">{r.descripcion}</span>
                <span className="oc-detalle">{NOMBRE_TASA_IVA[r.tasa_iva]}</span>
              </td>
              <td className="oc-der">{cantidad(Number(r.cantidad))} <span className="oc-detalle-linea">{r.articulos?.unidad}</span></td>
              <td className="oc-der">{Number(r.precio) > 0 ? pesos(r.precio) : "Por cotizar"}</td>
              <td className="oc-der">{Number(r.precio) > 0 ? pesos(Number(r.cantidad) * Number(r.precio)) : "—"}</td>
            </tr>
          ))}
          {!rs.length && <tr><td colSpan={5} className="oc-vacio">Sin artículos.</td></tr>}
        </tbody>
      </table>

      <section className="oc-pie">
        <div className="oc-notas">
          {o.notas && <><h2>Notas</h2><p>{o.notas}</p></>}
          <div className="oc-firma"><span>Autorizó</span></div>
        </div>
        <dl className="oc-totales">
          <dt>Subtotal</dt><dd>{pesos(t.subtotal)}</dd>
          {lineas.map((l) => (
            <div key={l.tasa} className="oc-linea">
              <dt>{NOMBRE_LINEA[l.tasa]}{l.tasa === "16" ? <span className="oc-detalle-linea"> sobre {pesos(l.base)}</span> : null}</dt>
              <dd>{pesos(l.iva)}</dd>
            </div>
          ))}
          <div className="oc-total"><dt>Total</dt><dd>MXN {pesos(t.total)}</dd></div>
        </dl>
      </section>
    </main>
    </>
  );
}
