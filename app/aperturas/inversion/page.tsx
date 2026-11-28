import Link from 'next/link';import {obtenerPerfil} from '@/lib/contexto';import {puedeEditarCompras,puedeVerAperturasCompleto} from '@/lib/roles';import {redirect} from 'next/navigation';import {leerTodo} from '@/lib/ventas/paginar';import {analisisInversion,type DetalleInversion,type FuenteInversion} from '@/lib/inversionApertura';import {pesos} from '@/lib/formato';import {Kpi} from '@/app/finanzas/PLAkton';import {LecturaProyecto} from '../AktonProyecto';import {Fragment} from 'react';import {vincular} from './acciones';
type Vinculo={id:string;fuente_id:string;detalle_id:string;proveedor_id:string|null;factura_id:string|null;activo_id:string|null;motivo:string;creado_en:string};
export default async function Inversion({searchParams}:{searchParams:Promise<{q?:string;tipo?:string;fuente?:string;error?:string;ok?:string}>}){
 const params=await searchParams;const {supabase,perfil}=await obtenerPerfil();
 // Inversión es dinero: solo la vista completa de Aperturas (admin y corporativo), no un responsable (HD-27).
 if(!puedeVerAperturasCompleto(perfil.rol))redirect('/aperturas');
 const {data:fuentes,error}=await supabase.from('inversion_apertura_fuentes').select('*,sucursales(nombre)').returns<FuenteInversion[]>();
 if(error)return <><h1>Inversión de apertura</h1><p className="aviso aviso-error">Falta aplicar la migración 0055 o no se pudo consultar la inversión.</p></>;
 const f=fuentes?.find(x=>x.id===params.fuente)??fuentes?.[0];if(!f)return <><h1>Inversión de apertura</h1><p>No hay CAPEX cargado.</p></>;
 const [vinculos,proveedores,facturas,activos]=await Promise.all([
 leerTodo((d,h)=>supabase.from('inversion_apertura_vinculos').select('*').eq('fuente_id',f.id).order('id').range(d,h).returns<Vinculo[]>()),
 leerTodo((d,h)=>supabase.from('proveedores').select('id,razon_social').order('id').range(d,h).returns<{id:string;razon_social:string}[]>()),
 leerTodo((d,h)=>supabase.from('facturas').select('id,folio').eq('sucursal_id',f.sucursal_id).order('id').range(d,h).returns<{id:string;folio:string|null}[]>()),
 leerTodo((d,h)=>supabase.from('activos').select('id,nombre,costo').eq('sucursal_id',f.sucursal_id).order('id').range(d,h).returns<{id:string;nombre:string;costo:number|null}[]>())]);
 const a=analisisInversion(f.datos.detalles,Number(f.total));const q=(params.q??'').toLocaleLowerCase('es-MX');const filas=f.datos.detalles.filter(d=>(!params.tipo||d.tipo===params.tipo)&&[d.id,d.mayor,d.proveedor,d.concepto,d.categoria].join(' ').toLocaleLowerCase('es-MX').includes(q));
 const edita=puedeEditarCompras(perfil.rol);
 // Vínculos de un movimiento con proveedor, factura o activo; no generan pagos ni gastos nuevos.
 const trazabilidad=(d:DetalleInversion)=>{const de=vinculos.filter(v=>v.detalle_id===d.id);return <details><summary>Vínculos ({de.length})</summary><p>{d.fuente}</p>{de.map(v=><p key={v.id}><Link href={v.activo_id?`/activos/${v.activo_id}`:v.factura_id?`/compras/facturas/${v.factura_id}`:`/compras/proveedores/${v.proveedor_id}`}>{v.activo_id?'Activo':v.factura_id?'Factura':'Proveedor'}</Link><br/>{v.motivo} · {v.creado_en.slice(0,10)}</p>)}{edita&&<form action={vincular}><input type="hidden" name="fuente" value={f.id}/><input type="hidden" name="detalle" value={d.id}/><label>Tipo<select name="tipo"><option value="proveedor">Proveedor</option><option value="factura">Factura</option><option value="activo">Activo</option></select></label><label>Registro<select name="destino" required><option value="">Selecciona el registro del tipo elegido</option><optgroup label="Proveedores">{proveedores.map(v=><option key={v.id} value={v.id}>{v.razon_social}</option>)}</optgroup><optgroup label="Facturas">{facturas.map(v=><option key={v.id} value={v.id}>{v.folio??v.id}</option>)}</optgroup><optgroup label="Activos">{activos.map(v=><option key={v.id} value={v.id}>{v.nombre} · {v.id.slice(0,8)}</option>)}</optgroup></select></label><label>Motivo<input name="motivo" required minLength={5} maxLength={2000}/></label><button className="boton">Registrar vínculo</button></form>}</details>;};
 return <><div className="encabezado"><Link href="/aperturas">← Aperturas</Link><h1>Inversión de apertura · {f.sucursales?.nombre}</h1><p>Fuente: {f.nombre} · {f.fecha}. Pagador registrado en la fuente: {f.pagador_fuente}.</p></div>
 {params.error&&<p className="aviso aviso-error">{params.error}</p>}{params.ok&&<p className="aviso">{params.ok}</p>}
 <div className="akton">
  <section className="akton-kpis" aria-label="Indicadores de la inversión">
   <Kpi etiqueta="Inversión registrada" tono="destacado" valor={pesos(a.total)} pie="Detalle clasificado, sumado una vez"/>
   <Kpi etiqueta="Movimientos" valor={a.movimientos} pie="Del detalle de la fuente"/>
   <Kpi etiqueta="Clasificaciones" valor={a.grupos.length} pie={a.grupos[0]?`Mayor: ${a.grupos[0].tipo}`:'—'}/>
   <Kpi etiqueta="Cuadre con la fuente" tono={a.cuadra?'si':'no'} valor={a.cuadra?'Cuadra':`Diferencia de ${pesos(Math.abs(a.diferencia))}`} pie={`Total de la fuente: ${pesos(Number(f.total))}`}/>
  </section>
  <LecturaProyecto lecturas={a.lectura}/>
  <form className="akton-tabla-marco formulario" method="get"><div className="rejilla"><div className="campo"><label htmlFor="inv-fuente">Fuente</label><select id="inv-fuente" name="fuente" defaultValue={f.id}>{fuentes?.map(z=><option key={z.id} value={z.id}>{z.sucursales?.nombre} · {z.fecha}</option>)}</select></div><div className="campo"><label htmlFor="inv-q">Buscar proveedor, concepto o referencia</label><input id="inv-q" name="q" defaultValue={params.q}/></div><div className="campo"><label htmlFor="inv-tipo">Clasificación</label><select id="inv-tipo" name="tipo" defaultValue={params.tipo??''}><option value="">Todas</option>{a.grupos.map(g=><option key={g.tipo}>{g.tipo}</option>)}</select></div></div><div className="acciones"><button className="boton">Filtrar</button><Link className="boton boton-secundario" href={`/aperturas/inversion?fuente=${f.id}`}>Limpiar</Link></div></form>
  <section className="akton-tabla-marco" aria-labelledby="inv-movimientos">
   <h2 id="inv-movimientos" className="akton-titulo">Movimientos por clasificación · {filas.length}</h2>
   <p className="akton-subtitulo">El costo de activos y la inversión total tienen distinto alcance; no se suman entre sí. Los vínculos no generan pagos ni gastos nuevos.</p>
   {filas.length===0?<p className="akton-subtitulo">Sin movimientos con estos filtros.</p>:
   <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla">
    <thead><tr><th>Movimiento</th><th>Clasificación</th><th>Importe</th><th>Trazabilidad</th></tr></thead>
    <tbody>{a.grupos.map(g=>{const de=filas.filter(d=>d.tipo===g.tipo);if(!de.length)return null;const sub=de.reduce((s,d)=>s+Math.round(Number(d.monto)*100),0)/100;return <Fragment key={g.tipo}>
     <tr className="akton-seccion"><th colSpan={4}>{g.tipo} · {de.length} {de.length===1?'movimiento':'movimientos'}</th></tr>
     {de.map(d=><tr key={d.id}>
      <td data-label="Movimiento"><div style={{minWidth:0}}><strong>{d.proveedor}</strong><small className="ap-lista-sub">{d.concepto}</small><small className="ap-lista-sub">{d.fecha} · {d.id} · {d.mayor}</small>{d.nota&&<p className="akton-nota">{d.nota}</p>}</div></td>
      <td data-label="Clasificación">{d.categoria}</td>
      <td data-label="Importe" className="ap-crono-fecha">{pesos(d.monto)}</td>
      <td data-label="Trazabilidad">{trazabilidad(d)}</td>
     </tr>)}
     <tr className="akton-subtotal"><td data-label="Movimiento">Subtotal {g.tipo}</td><td data-label="Clasificación">{a.total?`${Math.round(sub/a.total*100)} % del total`:'—'}</td><td data-label="Importe" className="ap-crono-fecha">{pesos(sub)}</td><td data-label="Trazabilidad"/></tr>
    </Fragment>;})}</tbody>
   </table></div>}
  </section>
 </div></>;
}
