import {leerRazonesSociales} from '@/lib/compras/razonesSociales';
import {TablaFacturasPago} from './TablaFacturasPago';
import {validarFiltroCorrida} from '@/lib/compras/corridaPagos';
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { Icono } from "@/components/Icono";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import { nombreFactura, vencida, type EstadoFactura } from "@/lib/compras/facturas";
import { fechaDePago, grupoPorPagar, pagadoDelMes, resumenPagos } from "@/lib/compras/pagos";
import { NOMBRE_FORMA_PAGO, type FormaPago } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { CalendarioPagos, type FacturaDelDia } from "./CalendarioPagos";
import { diaDePagoSugerido } from "@/lib/compras/diasPago";
import { avisosCompromisos, filtrarPrevistos, previstosPorDia, tituloCompromiso, ventanaCompromisos } from "@/lib/compras/compromisos";
import { leerCompromisos, leerFechas, sucursalDe } from "./compromisos/datos";
import { diasDePago } from "../servidor";
import { FormComplementos } from "./FormComplementos";

type Factura = {
  rfc_receptor:string; id: string; uuid: string | null; uuid_manual:string|null; pdf_ruta:string|null; xml_ruta:string|null; serie: string | null; folio: string | null; saldo: number; vence_el: string; pago_programado_el: string | null;
  pago_programado_forma:FormaPago|null; estado: EstadoFactura; proveedor_id: string; sucursal_id: string | null; falta_complemento: boolean;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null;
};
type Pago = { id: string; fecha: string; monto: number; forma: FormaPago; referencia: string | null; anulado_en: string | null; proveedores: { razon_social: string; nombre_comercial: string | null } | null };
type Liga = { factura_id: string; ordenes_compra: { sucursal_id: string | null } | null };
type Aplicacion = { pago_id: string; factura_id: string; monto: number; facturas: { sucursal_id: string | null } | null; pagos: { fecha: string; anulado_en: string | null; proveedor_id: string } };

export default async function Pagos({ searchParams }: { searchParams: Promise<{ proveedor?: string; sucursal?: string; complemento?: string; ok?: string; error?: string;desde?:string;hasta?:string }> }) {
  const { proveedor = "", sucursal = "", complemento, ok, error,desde,hasta } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const hoy = hoyCalendarioMX();
  const [facturasLeidas, pagos, ligas, { data: proveedores }, { data: sucursales }, { data: conComplemento }, aplicacionesMes] = await Promise.all([
    leerTodo<Factura>((d, h) => supabase.from("facturas_saldo")
      .select("rfc_receptor, id, uuid, uuid_manual, pdf_ruta, xml_ruta, serie, folio, saldo, vence_el, pago_programado_el,pago_programado_forma, estado, proveedor_id, sucursal_id, falta_complemento, proveedores(razon_social, nombre_comercial)")
      .eq("tipo", "ingreso").in("estado", ["por_pagar", "parcial"]).order("vence_el").order("id").range(d, h).returns<Factura[]>()),
    leerTodo<Pago>((d, h) => supabase.from("pagos").select("id, fecha, monto, forma, referencia, anulado_en, proveedores(razon_social, nombre_comercial)")
      .gte("fecha", `${hoy.slice(0, 7)}-01`).order("fecha", { ascending: false }).order("id").range(d, h).returns<Pago[]>()),
    leerTodo<Liga>((d, h) => supabase.from("factura_ordenes").select("factura_id, ordenes_compra(sucursal_id)").order("factura_id").range(d, h).returns<Liga[]>()),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    // Falta complemento: cualquier estado (lo normal es una PPD ya pagada completa).
    supabase.from("facturas_saldo")
      .select("rfc_receptor, id, uuid, uuid_manual, pdf_ruta, xml_ruta, serie, folio, saldo, vence_el, pago_programado_el,pago_programado_forma, estado, proveedor_id, sucursal_id, falta_complemento, proveedores(razon_social, nombre_comercial)")
      .eq("falta_complemento", true).order("vence_el").returns<Factura[]>(),
    // Lo aplicado en el mes, para que "Pagado este mes" respete los filtros.
    leerTodo<Aplicacion>((d, h) => supabase.from("pago_aplicaciones")
      .select("pago_id, factura_id, monto, facturas(sucursal_id), pagos!inner(fecha, anulado_en, proveedor_id)")
      .gte("pagos.fecha", `${hoy.slice(0, 7)}-01`).order("id").range(d, h).returns<Aplicacion[]>()),
  ]);

  // Sin fecha programada, una factura se paga en su día de pago sugerido (el autorizado anterior a su vencimiento).
  const dias = await diasDePago(supabase);
  // Compromisos fijos: lo que aún no tiene factura sale como previsto. Si la migración no está, Pagos sigue igual.
  const [compromisos, fechasCompromiso] = await Promise.all([leerCompromisos(supabase), leerFechas(supabase, ventanaCompromisos(hoy).desde, ventanaCompromisos(hoy).hasta)])
    .catch(() => [[], []] as [Awaited<ReturnType<typeof leerCompromisos>>, Awaited<ReturnType<typeof leerFechas>>]);
  const compromisosVisibles = filtrarPrevistos(compromisos, { sucursal, proveedor });
  const idsCompromiso = new Set(compromisosVisibles.map((c) => c.id));
  const fechasVisibles = fechasCompromiso.filter((f) => idsCompromiso.has(f.compromiso_id));
  const previstos = previstosPorDia(fechasVisibles, new Map(compromisosVisibles.map((c) => [c.id, { monto: c.monto_estimado, titulo: tituloCompromiso(c, sucursalDe(c)) }])), hoy, (v) => diaDePagoSugerido(v, hoy, dias));
  const requiereServicio = new Map(compromisosVisibles.map((c) => [c.id, c.requiere_servicio]));
  const avisosFijos = avisosCompromisos(fechasVisibles, (id) => requiereServicio.get(id) ?? false, hoy);
  const facturas = facturasLeidas.map((f) => ({ ...f, pago_sugerido_el: diaDePagoSugerido(f.vence_el, hoy, dias) }));

  // Sucursal de una factura: la de sus órdenes o, sin orden, su destino ("oficina" = sin sucursal).
  const sucursalesDe = new Map<string, Set<string>>();
  for (const l of ligas) {
    const s = l.ordenes_compra?.sucursal_id ?? "oficina";
    sucursalesDe.set(l.factura_id, (sucursalesDe.get(l.factura_id) ?? new Set()).add(s));
  }
  const deSucursalId = (id: string, sucursalId: string | null, s: string) => (sucursalesDe.get(id) ?? new Set([sucursalId ?? "oficina"])).has(s);
  const deSucursal = (f: Factura, s: string) => deSucursalId(f.id, f.sucursal_id, s);
  const visibles = facturas.filter((f) => Number(f.saldo) > 0
    && (!proveedor || f.proveedor_id === proveedor)
    && (!sucursal || deSucursal(f, sucursal))
    && (complemento !== "si" || f.falta_complemento));
  const sinComplemento = (conComplemento ?? []).filter((f) => (!proveedor || f.proveedor_id === proveedor) && (!sucursal || deSucursal(f, sucursal)));

  const razones=await leerRazonesSociales(supabase);
  const empresas=new Map(razones.map(e=>[e.rfc,e.razon_social]));
  type Comprobante={href:string;nombre:string;formato:string};
  const comprobantesAdjuntos=new Map<string,Comprobante[]>();
  for(let i=0;i<visibles.length;i+=200){const ids=visibles.slice(i,i+200).map(f=>f.id);
   const adjuntos=await leerTodo<{id:string;factura_id:string;nombre:string;mime:string}>((d,h)=>supabase.from('compra_adjuntos').select('id,factura_id,nombre,mime').in('factura_id',ids).in('mime',['application/pdf','image/jpeg','image/png','image/webp']).not('confirmado_en','is',null).is('retirado_en',null).order('id').range(d,h));
   for(const a of adjuntos)comprobantesAdjuntos.set(a.factura_id,[...(comprobantesAdjuntos.get(a.factura_id)??[]),{href:`/compras/adjuntos/${a.id}?ver=si`,nombre:a.nombre,formato:a.mime==='application/pdf'?'PDF':'Foto'}]);
  }
  const comprobantesDe=(f:Factura):Comprobante[]=>[
   ...(/\.(pdf|jpe?g|png|webp)$/i.test(f.pdf_ruta??'')?[{href:`/compras/facturas/${f.id}/archivo?tipo=comprobante`,nombre:'Comprobante original',formato:/\.pdf$/i.test(f.pdf_ruta??'')?'PDF':'Foto'}]:[]),
   ...(comprobantesAdjuntos.get(f.id)??[])
  ];
  const empresaDe=(f:Factura)=>({empresa:empresas.get(f.rfc_receptor)??'Razón social por identificar',rfcReceptor:f.rfc_receptor});
  const r = resumenPagos(visibles, [], hoy);
  const aplicadas = aplicacionesMes.filter((a) => (!proveedor || a.pagos.proveedor_id === proveedor)
    && (!sucursal || deSucursalId(a.factura_id, a.facturas?.sucursal_id ?? null, sucursal)));
  const pagado = pagadoDelMes(aplicadas.map((a) => ({ pago_id: a.pago_id, fecha: a.pagos.fecha, monto: Number(a.monto), anulado: !!a.pagos.anulado_en })), hoy);
  const idsDelFiltro = new Set(aplicadas.map((a) => a.pago_id));
  const pagosVisibles = proveedor || sucursal ? pagos.filter((p) => idsDelFiltro.has(p.id)) : pagos;
  const nombre = (f: Factura) => nombreFactura(f);
  const proveedorDe = (f: { proveedores: { razon_social: string; nombre_comercial: string | null } | null }) => f.proveedores?.nombre_comercial ?? f.proveedores?.razon_social ?? "";
  const porDia: Record<string, FacturaDelDia[]> = {};
  for (const f of visibles) {
    const d = fechaDePago(f);
    (porDia[d] ??= []).push({ id: f.id, nombre: nombre(f), proveedor: proveedorDe(f), saldo: Number(f.saldo), vencida: vencida(f, hoy),proveedorId:f.proveedor_id,uuid:f.uuid??f.uuid_manual,uuidManual:!f.uuid&&!!f.uuid_manual,...empresaDe(f),comprobantes:comprobantesDe(f),xml:!!f.xml_ruta,fechaPago:d,formaPrevista:f.pago_programado_forma?NOMBRE_FORMA_PAGO[f.pago_programado_forma]:undefined });
  }
  const grupos = { vencidas: [] as Factura[], semana: [] as Factura[], despues: [] as Factura[] };
  for (const f of visibles) grupos[grupoPorPagar(f, hoy)].push(f);
  const edita = puedeEditarCompras(perfil.rol);
  const rangoValido=!!(desde&&hasta&&!validarFiltroCorrida({desde,hasta,fecha:hoy}));
  const rango=rangoValido?{desde:desde!,hasta:hasta!}:undefined;
  const deHoy=visibles.filter(f=>fechaDePago(f)===hoy);
  const delRango=rango?visibles.filter(f=>fechaDePago(f)>=rango.desde&&fechaDePago(f)<=rango.hasta):[];
  const suma=(fs:Factura[])=>fs.reduce((n,f)=>n+Math.round(Number(f.saldo)*100),0)/100;
  const nombreSucursal=new Map((sucursales??[]).map(s=>[s.id,s.nombre]));
  const datosTabla=(fs:typeof visibles)=>fs.map(f=>({id:f.id,nombre:nombre(f),proveedor:proveedorDe(f),saldo:Number(f.saldo),uuid:f.uuid??f.uuid_manual,uuidManual:!f.uuid&&!!f.uuid_manual,fechaPago:fechaDePago(f),formaPrevista:f.pago_programado_forma?NOMBRE_FORMA_PAGO[f.pago_programado_forma]:undefined,...empresaDe(f),comprobantes:comprobantesDe(f),xml:!!f.xml_ruta,proveedorId:f.proveedor_id,sucursal:[...(sucursalesDe.get(f.id)??new Set([f.sucursal_id??'oficina']))].map(s=>s==='oficina'?'Oficina':nombreSucursal.get(s)??s).join(', ')}));


  const Tarjetas = ({ lista }: { lista: Factura[] }) => (
    <div className="tarjetas">
      {lista.map((f) => (
        <article key={f.id} className="tarjeta factura-tarjeta" data-alerta={vencida(f, hoy) ? "si" : undefined}>
          <div className="tarjeta-encabezado">
            <div>
              <h3>{proveedorDe(f)}</h3>
              <p className="factura-tarjeta-folio"><Link href={`/compras/facturas/${f.id}`}>{nombre(f)}</Link></p>
            </div>
            <strong className="factura-tarjeta-monto">{pesos(f.saldo)}</strong>
          </div>
          <p className="factura-tarjeta-estados">
            {vencida(f, hoy) && <span className="insignia" data-tono="peligro">Vencida</span>}
            {f.estado === "parcial" && <span className="insignia" data-tono="info">Abonada</span>}
            {f.pago_programado_el && <span className="insignia" data-tono="exito">Programada</span>}
            {f.falta_complemento && <span className="insignia" data-tono="aviso">Falta complemento</span>}
          </p>
          <dl className="tarjeta-datos">
            <dt>Vence</dt><dd>{fechaTexto(f.vence_el)}{vencida(f, hoy) ? " · vencida" : ""}</dd>
            {f.pago_programado_el && <><dt>Programada</dt><dd>{fechaTexto(f.pago_programado_el)} · {f.pago_programado_forma?NOMBRE_FORMA_PAGO[f.pago_programado_forma]:"Forma por definir"}</dd></>}
          </dl>
          {edita && Number(f.saldo) > 0 && <Link className="boton boton-secundario" href={`/compras/pagos/nuevo?proveedor=${f.proveedor_id}&factura=${f.id}`}>Registrar pago</Link>}
        </article>
      ))}
    </div>
  );

  return (
    <>
      <EncabezadoPagina titulo="Pagos" descripcion={<>Lo que hay que pagar a proveedores, por fecha. <Link href="/compras/documentos?etapa=factura&articulo=si&ultima=si">Buscar la última factura por artículo</Link></>}
        acciones={<>
          <Link className="boton boton-secundario" href="/compras/pagos/programar"><Icono nombre="calendario" />Programar pagos</Link>
          <Link className="boton boton-secundario" href="/compras/pagos/compromisos"><Icono nombre="calendario" />Compromisos fijos</Link>
          {edita && <Link className="boton" href="/compras/pagos/nuevo"><Icono nombre="mas" />Registrar un pago</Link>}
        </>} />
      <div className="indicadores-marco"><section className="indicadores" aria-label="Resumen de pagos">
        <a className="indicador indicador-enlazado" href="#t-vencidas" data-alerta={r.vencido > 0 ? "peligro" : undefined}>
          <span className="indicador-etiqueta">Vencido</span><strong className="indicador-valor">{pesos(r.vencido)}</strong>
          <span className="indicador-detalle">{grupos.vencidas.length} {grupos.vencidas.length === 1 ? "factura" : "facturas"}</span>
        </a>
        <a className="indicador indicador-enlazado" href="#t-semana">
          <span className="indicador-etiqueta">Esta semana</span><strong className="indicador-valor">{pesos(r.semana)}</strong>
          <span className="indicador-detalle">hasta el domingo</span>
        </a>
        <a className="indicador indicador-enlazado" href="#t-despues">
          <span className="indicador-etiqueta">Próximos 30 días</span><strong className="indicador-valor">{pesos(r.treinta)}</strong>
          <span className="indicador-detalle">sin contar lo vencido</span>
        </a>
        <a className="indicador indicador-enlazado" href="#t-pagos">
          <span className="indicador-etiqueta">Pagado este mes</span><strong className="indicador-valor">{pesos(pagado.monto)}</strong>
          <span className="indicador-detalle">{pagado.pagos} {pagado.pagos === 1 ? "pago" : "pagos"}</span>
        </a>
      </section></div>
      <Aviso ok={ok} error={error??((desde||hasta)&&!rangoValido?'El rango de fechas no es válido. Se muestran los pagos de hoy.':undefined)} />
      <section className="seccion pagos-hoy" aria-labelledby="pagos-hoy-titulo"><div className="pagos-hoy-resumen"><div><h2 id="pagos-hoy-titulo">Por pagar hoy</h2><p>{fechaTexto(hoy)} · {deHoy.length} {deHoy.length===1?'factura':'facturas'} · con los filtros de proveedor y sucursal</p></div><strong className="pagos-hoy-monto">{pesos(suma(deHoy))}</strong></div><p className="saldo-nota">Saldo pendiente de las facturas programadas o sugeridas para hoy. Los abonos ya están descontados. Tipo de pago indica la forma prevista, no un pago realizado.</p>
      {deHoy.length?<TablaFacturasPago filas={datosTabla(deHoy)} edita={edita}/>:<p className="vacio">No hay facturas pendientes programadas o sugeridas para hoy con estos filtros.</p>}</section>
      {rango&&<section className="seccion" aria-labelledby="pagos-rango-titulo"><h2 id="pagos-rango-titulo">Rango de Tesorería: {fechaTexto(rango.desde)} al {fechaTexto(rango.hasta)}</h2><p><strong>{pesos(suma(delRango))}</strong> · {delRango.length} facturas pendientes actualmente. Los saldos pueden haber cambiado desde que se exportó el Excel.</p>{delRango.length?<TablaFacturasPago filas={datosTabla(delRango)} edita={edita}/>:<p>Sin saldo pendiente para este rango.</p>}</section>}




      <form className="barra-filtros pagos-filtros" role="search">
        {rango&&<><input type="hidden" name="desde" value={rango.desde}/><input type="hidden" name="hasta" value={rango.hasta}/></>}

        <div className="barra-filtros">
          <div className="campo">
            <label htmlFor="proveedor" className="solo-lector">Proveedor</label>
            <select id="proveedor" name="proveedor" defaultValue={proveedor}>
              <option value="">Todos los proveedores</option>
              {(proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="sucursal" className="solo-lector">Sucursal</label>
            <select id="sucursal" name="sucursal" defaultValue={sucursal}>
              <option value="">Todas las sucursales</option>
              {(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              <option value="oficina">Oficina</option>
            </select>
          </div>
          <label className="casilla pagos-casilla"><input type="checkbox" name="complemento" value="si" defaultChecked={complemento === "si"} /> Solo con complemento pendiente ({conComplemento?.length ?? 0})</label>
        </div>
        <button className="boton boton-secundario boton-compacto" type="submit">Filtrar</button>
      </form>

      {(avisosFijos.vencidosSinFactura > 0 || avisosFijos.serviciosSinComprobar > 0) && <p className="aviso aviso-error">
        <Link href="/compras/pagos/compromisos">{[avisosFijos.vencidosSinFactura ? `${avisosFijos.vencidosSinFactura} pagos fijos vencidos sin factura` : "", avisosFijos.serviciosSinComprobar ? `${avisosFijos.serviciosSinComprobar} servicios sin comprobar` : ""].filter(Boolean).join(" · ")}</Link></p>}
      <CalendarioPagos key={`${desde??''}:${hasta??''}:${proveedor}:${sucursal}:${complemento??''}`} hoy={hoy} porDia={porDia} previstos={previstos} filtros={{proveedor,sucursal,complemento}} rangoInicial={rango} />

      {complemento === "si" && sinComplemento.length > 0 && (
        <Plegable id="t-sin-complemento" titulo="Falta complemento de pago" resumen={`${sinComplemento.length} facturas`} alerta>
          <p className="saldo-nota">Facturas PPD con pagos que el proveedor aún no ampara con su complemento. Pídeselo y súbelo abajo.</p>
          <Tarjetas lista={sinComplemento} />
        </Plegable>
      )}
      {!visibles.length && !(complemento === "si" && sinComplemento.length) && <EstadoVacio icono="ok" titulo="Nada por pagar" descripcion="No hay facturas pendientes con estos filtros." />}
      {grupos.vencidas.length > 0 && <Plegable id="t-vencidas" titulo="Vencidas" resumen={pesos(r.vencido)} alerta><Tarjetas lista={grupos.vencidas} /></Plegable>}
      {grupos.semana.length > 0 && <Plegable id="t-semana" titulo="Esta semana" resumen={pesos(r.semana)}><Tarjetas lista={grupos.semana} /></Plegable>}
      {grupos.despues.length > 0 && <Plegable id="t-despues" titulo="Después" resumen={`${grupos.despues.length} facturas`}><Tarjetas lista={grupos.despues} /></Plegable>}

      <Plegable id="t-pagos" titulo="Pagos de este mes" resumen={pesos(pagado.monto)}>
        {!pagosVisibles.length && <p className="vacio">Aún no hay pagos este mes.</p>}
        <div className="tarjetas">
          {pagosVisibles.map((p) => (
            <article key={p.id} className="tarjeta" data-alerta={p.anulado_en ? "si" : undefined}>
              <div className="tarjeta-encabezado"><div>
                <h3><Link href={`/compras/pagos/${p.id}`}>{pesos(p.monto)}</Link> · {proveedorDe(p)}</h3>
                <p className="tarjeta-estado">{fechaTexto(p.fecha)} <span className="insignia">{NOMBRE_FORMA_PAGO[p.forma]}</span>{p.anulado_en && <span className="insignia" data-tono="peligro">Anulado</span>}</p>
              </div></div>
              {p.referencia && <dl className="tarjeta-datos"><dt>Referencia</dt><dd>{p.referencia}</dd></dl>}
            </article>
          ))}
        </div>
      </Plegable>

      {edita && (
        <Plegable id="t-complementos" titulo="Complementos de pago" resumen={`${conComplemento?.length ?? 0} facturas pendientes`}>
          <FormComplementos />
        </Plegable>
      )}
    </>
  );
}
