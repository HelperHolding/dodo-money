"use client";
import {useState} from "react";
import {pesos} from "@/lib/formato";
import {resumirCombo} from "@/lib/costeo/combos";
import {simularPromocion} from "@/lib/costeo/promociones";
import type {ProductoCalculo} from "./CalculadoraMargen";
const pct=(n:number)=>`${n.toLocaleString("es-MX",{maximumFractionDigits:1})} %`;
/** Combo de varios productos: suma costos y precios del canal; el precio del combo sigue esa suma hasta que lo editas. */
export function CalculadoraCombo({productos,comisionRappi}:{productos:ProductoCalculo[];comisionRappi:number|null}){
 const [lineas,setLineas]=useState([{producto:"",cantidad:"1"},{producto:"",cantidad:"1"}]);
 const [canal,setCanal]=useState<"pos"|"rappi">("pos"),[precio,setPrecio]=useState<string|null>(null);
 const [descuento,setDescuento]=useState("0"),[objetivo,setObjetivo]=useState("60");
 const detalle=lineas.map(l=>({...l,p:productos.find(p=>String(p.id)===l.producto),cantidadNum:Number(l.cantidad)}));
 const resumen=resumirCombo(detalle.map(l=>({costo:l.p?l.p.costo:null,precio:l.p?l.p[canal]:null,cantidad:l.cantidadNum})));
 const listo=detalle.every(l=>l.p)&&resumen.costo!==null;
 const precioCombo=precio??(resumen.precio===null?"":String(resumen.precio));
 const comision=canal==="rappi"?comisionRappi:0;
 const r=comision!==null&&listo&&precioCombo.trim()!==""&&descuento.trim()!==""&&objetivo.trim()!==""?simularPromocion({costo:resumen.costo!,unidades:1,precio:Number(precioCombo),descuento:Number(descuento),iva:16,comision,baseComision:"con-iva",extra:0,objetivo:Number(objetivo)}):null;
 const cambiar=(i:number,cambio:Partial<(typeof lineas)[number]>)=>{setLineas(lineas.map((l,j)=>j===i?{...l,...cambio}:l));};
 return <section className="seccion calculadora-promos"><h2>Combo de varios productos</h2><p className="saldo-nota">Arma el combo con sus cantidades: se suman el costo vigente y el precio de referencia del canal. Cambia el precio del combo para ver su margen. Nada se guarda.</p>
 <div className="promo-distribucion"><div>
 <fieldset className="combo-lineas"><legend>Productos del combo</legend>{detalle.map((l,i)=><div className="combo-linea" key={i}><label className="campo">Producto {i+1}<select value={l.producto} onChange={e=>cambiar(i,{producto:e.target.value})}><option value="">Seleccionar producto</option>{productos.map(p=><option key={p.id} value={p.id}>{p.nombre}{p.costo===null?" · sin costo":""}</option>)}</select></label><label className="campo">Cantidad<input type="number" inputMode="numeric" min="1" step="1" value={l.cantidad} onChange={e=>cambiar(i,{cantidad:e.target.value})}/></label>{lineas.length>2&&<button type="button" className="boton boton-secundario" aria-label={`Quitar producto ${i+1}`} onClick={()=>{setLineas(lineas.filter((_,j)=>j!==i));}}>Quitar</button>}</div>)}
 <button type="button" className="boton boton-secundario" onClick={()=>{setLineas([...lineas,{producto:"",cantidad:"1"}]);}}>Agregar producto</button></fieldset>
 <div className="rejilla"><label className="campo">Canal<select value={canal} onChange={e=>{setCanal(e.target.value as typeof canal);}}><option value="pos">POS · sin comisión</option><option value="rappi">Rappi · comisión {comisionRappi===null?"sin dato":pct(comisionRappi)} sobre el cobro con IVA</option></select></label>
 <label className="campo">Precio del combo, con IVA<input type="number" inputMode="decimal" min="0.01" step="0.01" aria-label="Precio del combo, con IVA" value={precioCombo} onChange={e=>setPrecio(e.target.value)}/>{precio!==null&&resumen.precio!==null&&<button type="button" className="boton-enlace" onClick={()=>setPrecio(null)}>Usar la suma de precios ({pesos(resumen.precio)})</button>}</label>
 <label className="campo">Descuento del restaurante (%)<input type="number" inputMode="decimal" min="0" max="99.99" step="0.01" value={descuento} onChange={e=>setDescuento(e.target.value)}/></label>
 <label className="campo">Margen objetivo (%)<input type="number" inputMode="decimal" min="0" max="99.99" step="0.01" value={objetivo} onChange={e=>setObjetivo(e.target.value)}/></label></div></div>
 <div className="promo-resultados" aria-live="polite" aria-atomic="true">{!listo?<p className="aviso">{detalle.some(l=>!l.p)?"Elige todos los productos del combo.":detalle.some(l=>!Number.isInteger(l.cantidadNum)||l.cantidadNum<1)?"Las cantidades deben ser enteras y positivas.":"Un producto del combo no tiene costo vigente; no se puede simular."}</p>:r?<>
 <span className="ficha-estado" data-estado={r.contribucion<0?"cancelada":r.margen<Number(objetivo)?"parcial":"pagada"}>{r.contribucion<0?"Contribución negativa":r.margen<Number(objetivo)?"Por debajo del objetivo":"Cumple el objetivo"}</span>
 <h3>Margen del combo{canal==="rappi"?" con comisión Rappi":""}</h3><strong className="promo-cifra">{pesos(r.contribucion)}</strong><p className="promo-porcentaje">{pct(r.margen)} de la venta sin IVA</p>
 <dl className="tarjeta-datos"><dt>Piezas</dt><dd>{resumen.piezas}</dd><dt>Costo del combo</dt><dd>{pesos(r.costo)}</dd><dt>Suma de precios {canal==="rappi"?"Rappi":"POS"}</dt><dd>{resumen.precio===null?"Falta el precio de un producto":pesos(resumen.precio)}</dd><dt>Cobro al cliente</dt><dd>{pesos(r.cobro)}</dd>{resumen.precio!==null&&resumen.precio>0&&<><dt>Ahorro para el cliente</dt><dd>{pesos(resumen.precio-r.cobro)} · {pct((resumen.precio-r.cobro)/resumen.precio*100)}</dd></>}<dt>Venta sin IVA</dt><dd>{pesos(r.neto)}</dd><dt>Comisión</dt><dd>{pesos(r.comision)}</dd><dt>Precio para el objetivo</dt><dd>{r.precioObjetivo===null?"No alcanzable con esta comisión":pesos(r.precioObjetivo)}</dd><dt>Precio de equilibrio</dt><dd>{r.precioEquilibrio===null?"No alcanzable con esta comisión":pesos(r.precioEquilibrio)}</dd></dl></>:<p className="aviso">{comision===null?"Falta la comisión Rappi vigente; no se puede calcular el margen de este canal.":"Revisa el precio, el descuento y el objetivo: importes positivos y porcentajes menores a 100 %."}</p>}
 <small>Margen = venta sin IVA − costo − comisión. Los precios sugeridos son el total con IVA antes del descuento. No incluye regalías ni otros gastos.</small></div></div></section>;
}
