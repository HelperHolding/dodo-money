"use client";
import { ConInfo } from "@/components/ConInfo";
import { Dona } from "@/components/Dona";
import {useState} from 'react';
import {CATEGORIAS_RAPPI,type CategoriaRappi,type ProductoUnidades} from '@/lib/ventas/rappiProductos';
import {fechaTexto,porcentaje} from '@/lib/formato';
type Resumen={filas:ProductoUnidades[];grupos:{categoria:string;nombre:string;unidades:number}[];unidades:number;ordenes:number;enDodo:number;desde:string|null;hasta:string|null};
/* Color fijo por categoría, el mismo del tablero de Ventas (validado con la skill dataviz): sigue a la categoría, no a su
   lugar. Sale de la clase cat-<clave> de globals.css; «Sin categoría» usa la de Ventas (cat-sin). */
const claseCategoria=(categoria:string)=>`cat-${categoria==='sin_categoria'?'sin':categoria}`;
const numero=(n:number)=>n.toLocaleString('es-MX');
const normal=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
/**
 * Unidades vendidas en Rappi como tablero: cifras chicas, los 10 más vendidos con el color de su categoría, la dona por
 * categoría y la lista completa con búsqueda, filtro y vista por categoría o consolidada. `children` va junto al ranking
 * (el top 5 con opciones, que se calcula en el servidor).
 */
export function ProductosRappi({resumen:r,children}:{resumen:Resumen;children?:React.ReactNode}) {
 const [q,setQ]=useState(''),[categoria,setCategoria]=useState(''),[agrupar,setAgrupar]=useState(true);
 const filas=r.filas.filter(p=>(!categoria||p.categoria===categoria)&&normal(q).trim().split(/\s+/).filter(Boolean).every(t=>normal([p.nombre,...p.variantes.map(v=>v.nombre)].join(' ')).includes(t)));
 const grupos:{id:CategoriaRappi|null;nombre:string;filas:ProductoUnidades[]}[]=agrupar?(Object.entries(CATEGORIAS_RAPPI) as [CategoriaRappi,string][]).map(([id,nombre])=>({id,nombre,filas:filas.filter(p=>p.categoria===id)})).filter(g=>g.filas.length):[{id:null,nombre:'Consolidado de productos',filas}];
 const top=r.filas.slice(0,10),pizzas=r.filas.filter(p=>p.categoria==='pizza');
 const parte=(n:number)=>r.unidades?n/r.unidades:null;
 return <div className="tablero-graficas rappi-unidades"><div className="tablero-rejilla">
  <section className="seccion tablero-ancha" aria-labelledby="r-unidades">
   <div className="seccion-cabecera detalle-cabecera">
    <span className="plegable-titulo"><h2 id="r-unidades">Unidades vendidas en Rappi</h2></span>
    <ConInfo titulo="Unidades vendidas en Rappi" etiqueta="Cómo leer esto">Órdenes finalizadas recibidas en vivo del portal, incluidas las que ya están en Dodo IS. No registra ventas adicionales en el P&amp;L. Canceladas y con reclamo quedan fuera.</ConInfo>
   </div>
   <dl className="mini-cifras">
    <div><dt>Unidades de productos</dt><dd>{numero(r.unidades)}</dd><dd className="mini-nota">Suma de cantidades de todos los renglones finalizados</dd></div>
    <div><dt>Pizzas individuales</dt><dd>{numero(pizzas.reduce((s,p)=>s+p.unidades,0))}</dd><dd className="mini-nota">Los combos permanecen separados</dd></div>
    <div><dt>Productos distintos</dt><dd>{r.filas.length}</dd><dd className="mini-nota">Variantes consolidadas por producto y categoría</dd></div>
    <div><dt>Órdenes finalizadas</dt><dd>{numero(r.ordenes)}</dd><dd className="mini-nota">{r.enDodo} ya incluidas en Dodo IS</dd></div>
   </dl>
   <p className="saldo-nota">{r.desde&&r.hasta?`Datos disponibles del ${fechaTexto(r.desde)} al ${fechaTexto(r.hasta)}.`:'Sin órdenes finalizadas del portal en este periodo.'} El reporte usa el periodo y la sucursal seleccionados.</p>
   <div className="detalle-bloque rappi-categorias">
    <h3>Distribución por categoría</h3>
    <Dona titulo="Unidades por categoría" partes={r.grupos.map(g=>({clave:claseCategoria(g.categoria).slice(4),etiqueta:g.nombre,valor:g.unidades,detalle:`${numero(g.unidades)} · ${porcentaje(parte(g.unidades))}`}))}/>
   </div>
  </section>

  {children}

  <section className="seccion detalle-completo" aria-labelledby="r-top">
   <div className="seccion-cabecera detalle-cabecera">
    <span className="plegable-titulo"><h2 id="r-top">Productos más vendidos · unidades</h2></span>
    <span className="plegable-resumen">{top.length} de {r.filas.length}</span>
   </div>
   {top.length?<ol className="ranking rappi-ranking rappi-ranking-ancho" aria-label="Productos más vendidos por unidades">{top.map((p,i)=><li key={p.clave} className={claseCategoria(p.categoria)}>
    <span className="ranking-lugar" data-podio={i<3?'si':undefined}>{i+1}</span>
    <div className="ranking-cuerpo">
     <p className="ranking-linea"><strong>{p.nombre}</strong><span className="ranking-importe">{numero(p.unidades)} uds.</span></p>
     <span className="ranking-barra" aria-hidden="true"><span style={{width:`${p.unidades/top[0].unidades*100}%`}}/></span>
     <p className="ranking-linea ranking-detalle"><span><span className={`dona-punto ${claseCategoria(p.categoria)}`} aria-hidden="true"/>{CATEGORIAS_RAPPI[p.categoria]} · {p.ordenes} órdenes</span><span>{porcentaje(parte(p.unidades))}</span></p>
    </div>
   </li>)}</ol>:<p className="vacio">Sin productos para mostrar.</p>}
  </section>

  <section className="seccion detalle-completo rappi-lista" aria-labelledby="r-lista">
   <div className="seccion-cabecera detalle-cabecera">
    <span className="plegable-titulo"><h2 id="r-lista">Lista completa de productos · unidades</h2></span>
    <span className="plegable-resumen" role="status">{filas.length} productos · {numero(filas.reduce((s,p)=>s+p.unidades,0))} unidades</span>
   </div>
   <div className="rappi-filtros">
    <label className="campo">Buscar producto o variante<input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Escribe para buscar…"/></label>
    <label className="campo">Categoría<select value={categoria} onChange={e=>setCategoria(e.target.value)}><option value="">Todas las categorías</option>{Object.entries(CATEGORIAS_RAPPI).map(([id,n])=><option key={id} value={id}>{n}</option>)}</select></label>
    <div className="segmentos" role="group" aria-label="Vista de la lista"><button type="button" aria-pressed={agrupar} onClick={()=>setAgrupar(true)}>Por categoría</button><button type="button" aria-pressed={!agrupar} onClick={()=>setAgrupar(false)}>Consolidado</button></div>
    {(q||categoria)&&<button type="button" className="boton boton-secundario" onClick={()=>{setQ('');setCategoria('');}}>Limpiar filtros</button>}
   </div>
   <ConInfo titulo="Lista completa de productos" etiqueta="Cómo leer esto">Se consolidan tamaños y opciones del mismo producto. La categoría viene del catálogo vinculado o se sugiere por nombre; las sugeridas se marcan para revisión. Un combo cuenta como una unidad de combo y no se desarma en pizzas. Los porcentajes usan las {numero(r.unidades)} unidades del periodo.</ConInfo>
   {!filas.length&&<p className="vacio">No hay productos con estos filtros.</p>}
   {filas.length>0&&<p className="saldo-nota">Toca un producto para ver sus variantes.</p>}
   {grupos.filter(g=>g.filas.length).map(g=>{const mayor=Math.max(1,...g.filas.map(p=>p.unidades));return <section className="rappi-grupo" key={g.nombre} aria-label={`${g.nombre}: productos vendidos por Rappi`}>
    <h3>{g.id&&<span className={`dona-punto ${claseCategoria(g.id)}`} aria-hidden="true"/>}{g.nombre} · {numero(g.filas.reduce((s,p)=>s+p.unidades,0))} unidades</h3>
    {/* Cada producto como renglón de ranking: lugar, nombre con sus etiquetas, unidades y %, y la barra contra el más
        vendido del grupo; al tocarlo se despliegan sus variantes */}
    <ol className="rappi-productos">{g.filas.map((p,i)=><li key={p.clave} className={claseCategoria(p.categoria)}><details>
     <summary>
      <span className="ranking-lugar" data-podio={i<3?'si':undefined}>{i+1}</span>
      <span className="rp-nombre">
       <strong>{p.nombre}</strong>
       {!g.id&&<span className="insignia insignia-punto rp-categoria">{CATEGORIAS_RAPPI[p.categoria]}</span>}
       {p.inferido&&<span className="insignia" data-tono="aviso">Sugerida por nombre</span>}
       <small>{p.ordenes} {p.ordenes===1?'orden':'órdenes'} · {p.variantes.length} {p.variantes.length===1?'variante':'variantes'}</small>
      </span>
      <span className="rp-valor"><strong>{numero(p.unidades)} uds.</strong><small>{r.unidades?(p.unidades/r.unidades*100).toFixed(1):'0.0'} %</small></span>
      <span className="rp-barra" aria-hidden="true"><span style={{width:`${p.unidades/mayor*100}%`}}/></span>
     </summary>
     <ul className="rp-variantes">{p.variantes.map(v=><li key={v.nombre}><span>{v.nombre}</span><strong>{numero(v.unidades)} uds.</strong></li>)}</ul>
    </details></li>)}</ol>
   </section>;})}
  </section>
 </div></div>;
}
