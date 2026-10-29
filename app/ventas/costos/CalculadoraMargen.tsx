"use client";
import {useState} from "react";
import {pesos} from "@/lib/formato";
import {margenConComision,precioParaMargenConComision} from "@/lib/costeo/margenes";
export type ProductoCalculo={id:number;nombre:string;costo:number|null;pos:number|null;rappi:number|null};
const texto=(n:number|null)=>n===null?"":String(n);
const pct=(n:number)=>`${n.toLocaleString("es-MX",{maximumFractionDigits:1})} %`;
type Campo="costo"|"pos"|"rappi";
/** Juega con el precio de un producto: los valores siguen al producto elegido hasta que los editas; nada se guarda. */
export function CalculadoraMargen({productos,inicial,comisionRappi,comisionPOS}:{productos:ProductoCalculo[];inicial?:number;comisionRappi:number|null;comisionPOS:number|null}){
 const [producto,setProducto]=useState(productos.some(p=>p.id===inicial)?String(inicial):"");
 const [edicion,setEdicion]=useState<Partial<Record<Campo,string>>>({});
 const [comision,setComision]=useState(texto(comisionRappi)),[terminal,setTerminal]=useState(texto(comisionPOS)),[objetivo,setObjetivo]=useState("60");
 const elegido=productos.find(p=>String(p.id)===producto);
 const valor=(c:Campo)=>edicion[c]??texto(elegido?.[c]??null);
 const numero=(c:Campo)=>valor(c).trim()===""?null:Number(valor(c));
 const costo=numero("costo"),meta=objetivo.trim()===""?null:Number(objetivo),com=comision.trim()===""?null:Number(comision),term=terminal.trim()===""?null:Number(terminal);
 const canales=[
  {nombre:"POS con comisión",precio:numero("pos"),m:term===null?null:margenConComision(numero("pos"),costo,term),sugerido:meta===null||term===null?null:precioParaMargenConComision(costo,meta,term),nota:`Terminal ${term===null?"sin dato":pct(term)} sobre el precio con IVA`},
  {nombre:"Rappi con comisión",precio:numero("rappi"),m:com===null?null:margenConComision(numero("rappi"),costo,com),sugerido:meta===null||com===null?null:precioParaMargenConComision(costo,meta,com),nota:`Comisión ${com===null?"sin dato":pct(com)} sobre el precio con IVA`},
 ];
 const campos:[Campo,string,string][]=[["costo","Costo por unidad, sin IVA","0.0001"],["pos","Precio POS, con IVA","0.01"],["rappi","Precio Rappi, con IVA","0.01"]];
 return <section className="seccion calculadora-promos"><h2>Margen por precio</h2><p className="saldo-nota">Elige un producto y prueba otros precios o costos: los márgenes se recalculan al instante. Los precios y costos registrados no cambian.</p>
 <div className="promo-distribucion"><div>
 <label className="campo">Producto<select value={producto} onChange={e=>{setProducto(e.target.value);setEdicion({});}}><option value="">Captura manual / otro producto</option>{productos.map(p=><option key={p.id} value={p.id}>{p.nombre}{p.costo===null?" · sin costo":""}</option>)}</select></label>
 <div className="rejilla">{campos.map(([c,nombre,step])=><label className="campo" key={c}>{nombre}<input type="number" inputMode="decimal" min="0" step={step} aria-label={nombre} value={valor(c)} onChange={e=>setEdicion(x=>({...x,[c]:e.target.value}))}/>{elegido&&edicion[c]!==undefined&&<button type="button" className="boton-enlace" onClick={()=>setEdicion(x=>{const y={...x};delete y[c];return y;})}>Usar el registrado ({elegido[c]===null?"sin dato":pesos(elegido[c])})</button>}</label>)}
 <label className="campo">Comisión POS, terminal (%)<input type="number" inputMode="decimal" min="0" max="99.99" step="0.01" value={terminal} onChange={e=>setTerminal(e.target.value)}/></label>
 <label className="campo">Comisión Rappi (%)<input type="number" inputMode="decimal" min="0" max="99.99" step="0.01" value={comision} onChange={e=>setComision(e.target.value)}/></label>
 <label className="campo">Margen objetivo (%)<input type="number" inputMode="decimal" min="0" max="99.99" step="0.01" value={objetivo} onChange={e=>setObjetivo(e.target.value)}/></label></div></div>
 <div className="promo-resultados" aria-live="polite" aria-atomic="true">{costo===null?<p className="aviso">Captura el costo para ver los márgenes.</p>:canales.map(c=>{const estado=!c.m?null:c.m.utilidad<0?"negativo":meta!==null&&c.m.margenPct<meta?"bajo":"ok";return <article key={c.nombre} className="calculo-canal"><h3>{c.nombre}</h3>{c.m?<><p className="calculo-cifra"><span className="costeo-chip" data-estado={estado??undefined}>{pct(c.m.margenPct)}</span> <strong>{pesos(c.m.utilidad)}</strong> <small>por venta</small></p><dl className="tarjeta-datos"><dt>Precio con IVA</dt><dd>{pesos(c.precio)}</dd><dt>Venta sin IVA</dt><dd>{pesos(c.m.neto)}</dd>{"comision" in c.m&&<><dt>Comisión</dt><dd>{pesos(c.m.comision as number)}</dd></>}</dl></>:<p className="costeo-sin-dato">Captura el precio para calcular.</p>}
 {meta!==null&&<p className="saldo-nota">Para {pct(meta)}: {c.sugerido===null?"no alcanzable con esta comisión":<strong>{pesos(c.sugerido)} con IVA</strong>}</p>}<small>{c.nota}</small></article>;})}
 <small>Margen = (venta sin IVA − costo − comisión) ÷ venta sin IVA. IVA 16 %. No incluye regalías ni otros gastos del negocio.</small></div></div></section>;
}
