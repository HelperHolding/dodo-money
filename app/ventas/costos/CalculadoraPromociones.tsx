"use client";
import {useState} from "react";
import {pesos,fechaTexto} from "@/lib/formato";
import {simularPromocion,compararCanales} from "@/lib/costeo/promociones";
import {resumirCombo} from "@/lib/costeo/combos";
export type ProductoSimulacion={id:number;nombre:string;costo:number|null;desde:string|null;fuente:string|null;pos?:number|null;rappi?:number|null};
type Modo="rappi"|"producto"|"combo";
type Canal="pos"|"rappi";
const MODOS:[Modo,string][]=[["rappi","Precio Rappi"],["producto","Un producto"],["combo","Combo de varios productos"]];
const NOMBRE:Record<Canal,string>={pos:"POS",rappi:"Rappi"};
const pct=(n:number)=>`${n.toLocaleString("es-MX",{maximumFractionDigits:1})} %`;
const texto=(n:number|null|undefined)=>n==null?"":String(n);
/** Como la calculadora de The Coffee: precio Rappi, una promoción o un combo, comparando POS y Rappi al mismo precio. Nada se guarda. */
export function CalculadoraPromociones({productos,inicial,modoInicial="producto",comisionRappi=null,comisionPOS=null}:{productos:ProductoSimulacion[];inicial?:number;modoInicial?:Modo;comisionRappi?:number|null;comisionPOS?:number|null}){
 const elegido=productos.find(p=>p.id===inicial);
 const [modo,setModo]=useState<Modo>(modoInicial);
 const [producto,setProducto]=useState(elegido?String(elegido.id):"");
 const [canal,setCanal]=useState<Canal|"">("pos");
 const [costo,setCosto]=useState(texto(elegido?.costo)),[precio,setPrecio]=useState(texto(elegido?.pos));
 const [unidades,setUnidades]=useState("1"),[descuento,setDescuento]=useState("0"),[iva,setIva]=useState("16");
 const [comision,setComision]=useState(texto(comisionPOS??0)),[extra,setExtra]=useState("0"),[objetivo,setObjetivo]=useState("50");
 const [base,setBase]=useState<"con-iva"|"sin-iva">("con-iva");
 const [combo,setCombo]=useState([{producto:"",cantidad:"1"},{producto:"",cantidad:"1"}]),[precioCombo,setPrecioCombo]=useState<string|null>(null);
 // Precio Rappi: el precio sigue la lista del producto hasta que se captura uno; se descarta al cambiar de producto.
 const [productoRappi,setProductoRappi]=useState(elegido?String(elegido.id):""),[edicionRappi,setEdicionRappi]=useState<string|null>(null);
 const comisiones:Record<Canal,number|null>={pos:comisionPOS,rappi:comisionRappi};
 const esCombo=modo==="combo",esRappi=modo==="rappi";
 const seleccionadoRappi=productos.find(p=>String(p.id)===productoRappi),precioRappi=edicionRappi??texto(seleccionadoRappi?.rappi);
 const canalPrecio:Canal=canal==="rappi"?"rappi":"pos";
 const lineas=combo.map(l=>({...l,p:productos.find(p=>String(p.id)===l.producto),cantidadNum:Number(l.cantidad)}));
 const resumen=resumirCombo(lineas.map(l=>({costo:l.p?l.p.costo:null,precio:l.p?l.p[canalPrecio]??null:null,cantidad:l.cantidadNum})));
 const comboListo=lineas.every(l=>l.p)&&resumen.costo!==null;
 const precioEfectivo=esCombo?precioCombo??(comboListo&&resumen.precio!==null?String(resumen.precio):""):precio;
 const elegirProducto=(id:string)=>{setProducto(id);const p=productos.find(p=>String(p.id)===id);setCosto(texto(p?.costo));setPrecio(texto(p?.[canalPrecio]));};
 const elegirCanal=(c:Canal|"")=>{setCanal(c);if(!c)return;setComision(texto(comisiones[c]));setBase("con-iva");const p=productos.find(p=>String(p.id)===producto);if(p&&!esCombo)setPrecio(texto(p[c]));};
 const cambiarCombo=(i:number,cambio:Partial<(typeof combo)[number]>)=>setCombo(combo.map((l,j)=>j===i?{...l,...cambio}:l));
 const campos:{nombre:string;valor:string;cambiar:(v:string)=>void;min?:number;max?:number;step:string}[]=[
  ...(esCombo?[]:[{nombre:"Costo por unidad, sin IVA",valor:costo,cambiar:setCosto,min:0,step:"0.0001"},{nombre:"Unidades del producto en la promoción",valor:unidades,cambiar:setUnidades,min:1,step:"1"}]),
  {nombre:esCombo?"Precio total del combo, con IVA":"Precio total de la promoción, con IVA",valor:precioEfectivo,cambiar:esCombo?setPrecioCombo:setPrecio,min:.01,step:"0.01"},
  {nombre:"Descuento del restaurante (%)",valor:descuento,cambiar:setDescuento,min:0,max:99.99,step:"0.01"},
  {nombre:"IVA de la venta (%)",valor:iva,cambiar:setIva,min:0,max:100,step:"0.01"},
  {nombre:"Comisión del canal (%)",valor:comision,cambiar:setComision,min:0,max:99.99,step:"0.01"},
  {nombre:"Costos extra por promoción, sin IVA",valor:extra,cambiar:setExtra,min:0,step:"0.01"},
  {nombre:"Objetivo de contribución (%)",valor:objetivo,cambiar:setObjetivo,min:0,max:99.99,step:"0.01"},
 ];
 const incompleto=campos.some(c=>c.valor.trim()==="")||(esCombo&&!comboListo);
 const escenario={costo:esCombo?resumen.costo??0:Number(costo),unidades:esCombo?1:Number(unidades),precio:Number(precioEfectivo),descuento:Number(descuento),iva:Number(iva),comision:Number(comision),baseComision:base,extra:Number(extra),objetivo:Number(objetivo)};
 const r=esRappi
  ?seleccionadoRappi?.costo!=null&&comisionRappi!==null&&precioRappi.trim()!==""?simularPromocion({costo:seleccionadoRappi.costo,unidades:1,precio:Number(precioRappi),descuento:0,iva:16,comision:comisionRappi,baseComision:"con-iva",extra:0,objetivo:50}):null
  :incompleto?null:simularPromocion(escenario);
 const meta=esRappi?50:Number(objetivo),extraEfectivo=esRappi?0:Number(extra);
 const tarjetas=esRappi?[{id:"rappi" as Canal,r}]:r?compararCanales(escenario,(["pos","rappi"] as Canal[]).map(id=>({id,comision:comisiones[id]})),canal||null):[];
 const listaCombo=esCombo&&resumen.precio!==null?resumen.precio:null;
 const aviso=esRappi
  ?!seleccionadoRappi?"Elige un producto para probar su precio Rappi.":seleccionadoRappi.costo===null?"Este producto no tiene costo vigente; no se puede simular.":comisionRappi===null?"Falta la comisión Rappi vigente en Finanzas → Parámetros.":"Captura un precio Rappi mayor a cero."
  :esCombo&&!comboListo?(lineas.some(l=>l.p&&l.p.costo===null)?"Un producto del combo no tiene costo vigente; no se puede simular.":"Elige los productos del combo con cantidades enteras positivas.")
  :incompleto?"Completa costo y precio para ver el escenario.":"Revisa los importes: cantidades enteras positivas y porcentajes de descuento, comisión y objetivo menores a 100 %.";
 return <section className="seccion calculadora-promos"><h2>Simular una promoción</h2><p className="saldo-nota">Prueba escenarios; los precios y costos registrados no cambian. El costo vigente ya incluye caja y periféricos: agrega solo costos extra que no estén incluidos.</p>
 <div className="promo-distribucion"><div>
 <div className="segmentos promo-modos" role="group" aria-label="Tipo de promoción">{MODOS.map(([valor,etiqueta])=><button key={valor} type="button" aria-pressed={modo===valor} onClick={()=>setModo(valor)}>{etiqueta}</button>)}</div>
 {esRappi?<>
  <p className="saldo-nota">Elige un producto y prueba su precio de venta. Se aplican el costo vigente y la comisión Rappi de Finanzas → Parámetros.</p>
  <label className="campo">Producto Rappi<select value={productoRappi} onChange={e=>{setProductoRappi(e.target.value);setEdicionRappi(null);}}><option value="">Seleccionar producto</option>{productos.map(p=><option key={p.id} value={p.id}>{p.nombre}{p.costo===null?" · sin costo":""}</option>)}</select></label>
  <label className="campo">Precio de venta Rappi, con IVA<input type="number" inputMode="decimal" min="0.01" step="0.01" value={precioRappi} onChange={e=>setEdicionRappi(e.target.value)}/>{edicionRappi!==null&&seleccionadoRappi?.rappi!=null&&<button type="button" className="boton-enlace" onClick={()=>setEdicionRappi(null)}>Usar el registrado ({pesos(seleccionadoRappi.rappi)})</button>}</label>
  <p className="saldo-nota">Comisión Rappi: {comisionRappi===null?"sin parámetro":pct(comisionRappi)} sobre el precio con IVA · IVA 16 %{seleccionadoRappi&&<> · Costo vigente {seleccionadoRappi.costo===null?"sin registrar":pesos(seleccionadoRappi.costo)} · Precio Rappi registrado {seleccionadoRappi.rappi==null?"sin registrar":pesos(seleccionadoRappi.rappi)}</>}</p>
 </>:<>
  {esCombo?<fieldset className="combo-lineas"><legend>Productos del combo</legend>{lineas.map((l,i)=><div className="combo-linea" key={i}>
   <label className="campo">Producto {i+1}<select value={l.producto} onChange={e=>cambiarCombo(i,{producto:e.target.value})}><option value="">Seleccionar producto</option>{productos.map(p=><option key={p.id} value={p.id}>{p.nombre}{p.costo===null?" · sin costo":""}</option>)}</select>{l.p&&<small>Costo {l.p.costo===null?"sin registrar":pesos(l.p.costo)} · Precio {NOMBRE[canalPrecio]} {l.p[canalPrecio]==null?"sin registrar":pesos(l.p[canalPrecio]!)}</small>}</label>
   <label className="campo">Cantidad<input type="number" inputMode="numeric" min="1" step="1" value={l.cantidad} onChange={e=>cambiarCombo(i,{cantidad:e.target.value})}/></label>
   <button type="button" className="boton boton-secundario" aria-label={`Quitar producto ${i+1} del combo`} disabled={combo.length<=2} onClick={()=>setCombo(combo.filter((_,j)=>j!==i))}>Quitar</button>
  </div>)}
  <button type="button" className="boton boton-secundario" onClick={()=>setCombo([...combo,{producto:"",cantidad:"1"}])}>+ Agregar producto</button>
  <dl className="tarjeta-datos combo-resumen"><dt>Costo del combo, sin IVA</dt><dd>{resumen.costo===null?"—":pesos(resumen.costo)}</dd><dt>Suma de precios {NOMBRE[canalPrecio]}</dt><dd>{resumen.precio===null?"—":pesos(resumen.precio)}</dd></dl>
  {precioCombo!==null&&resumen.precio!==null&&<button type="button" className="boton-enlace" onClick={()=>setPrecioCombo(null)}>Usar la suma de precios ({pesos(resumen.precio)})</button>}
  </fieldset>
  :<><label className="campo">Producto de referencia<select value={producto} onChange={e=>elegirProducto(e.target.value)}><option value="">Captura manual / otro producto</option>{productos.map(p=><option key={p.id} value={p.id}>{p.nombre}{p.costo===null?" · sin costo":""}</option>)}</select></label>
  {(()=>{const o=productos.find(p=>String(p.id)===producto);return o&&<details className="costeo-origen"><summary>Ver origen del costo</summary><p>{o.fuente??"Fuente no indicada"} · vigente desde {o.desde?fechaTexto(o.desde):"sin fecha"}</p><small>Modificar el costo aquí solo afecta esta simulación.</small></details>;})()}</>}
  <label className="campo">Canal de referencia<select value={canal} onChange={e=>elegirCanal(e.target.value as Canal|"")}><option value="">Captura manual</option><option value="pos">POS · terminal {comisionPOS===null?"sin dato":pct(comisionPOS)}</option><option value="rappi">Rappi · {comisionRappi===null?"sin dato":pct(comisionRappi)}</option></select></label>
  <div className="rejilla">{campos.map(c=><label className="campo" key={c.nombre}>{c.nombre}<input type="number" inputMode="decimal" min={c.min} max={c.max} step={c.step} value={c.valor} onChange={e=>c.cambiar(e.target.value)}/></label>)}</div>
  <label className="campo">Base de la comisión<select value={base} onChange={e=>setBase(e.target.value as typeof base)}><option value="sin-iva">Venta después del descuento, sin IVA</option><option value="con-iva">Cobro después del descuento, con IVA</option></select></label>
 </>}
 </div>
 <div className="promo-resultados" aria-live="polite" aria-atomic="true">{r?<>
  <dl className="promo-canales" aria-label="Márgenes de la simulación">{tarjetas.flatMap(({id,r:t})=>[["bruto",`Margen bruto ${NOMBRE[id]}`,t?pct(t.margenBruto):"—",t?`${pesos(t.bruto)} por venta`:"Sin comisión vigente"],["comision",`Margen con comisión ${NOMBRE[id]}`,t?pct(t.margen):"—",t?`${pesos(t.contribucion)} por venta`:"Sin comisión vigente"]].map(([tipo,etiqueta,valor,importe])=><div key={`${id}-${tipo}`}><dt>{etiqueta}</dt><dd><strong>{valor}</strong><small>{importe}</small></dd></div>))}</dl>
  {!esRappi&&<p className="saldo-nota">Comparación al mismo precio y descuento, con la comisión vigente de cada canal sobre el cobro con IVA. El canal de referencia usa la comisión y la base capturadas.</p>}
  <span className="ficha-estado" data-estado={r.contribucion<0?"cancelada":r.margen<meta?"parcial":"pagada"}>{r.contribucion<0?"Contribución negativa":r.margen<meta?"Por debajo del objetivo":"Cumple el objetivo simulado"}</span>
  <h3>Contribución por {esCombo?"combo":"promoción"}</h3><strong className="promo-cifra">{pesos(r.contribucion)}</strong><p className="promo-porcentaje">{pct(r.margen)} de la venta sin IVA</p>
  <dl className="tarjeta-datos"><dt>Cobro al cliente</dt><dd>{pesos(r.cobro)}</dd>{listaCombo!==null&&<><dt>Ahorro para el cliente vs. precios {NOMBRE[canalPrecio]}</dt><dd>{pesos(listaCombo-r.cobro)}</dd></>}<dt>Venta sin IVA</dt><dd>{pesos(r.neto)}</dd><dt>Costo de productos</dt><dd>{pesos(r.costo)}</dd><dt>Margen bruto</dt><dd>{pesos(r.bruto)} · {pct(r.margenBruto)}</dd><dt>Comisión</dt><dd>{pesos(r.comision)}</dd><dt>Costos extra</dt><dd>{pesos(extraEfectivo)}</dd><dt>Precio de lista para equilibrio</dt><dd>{r.precioEquilibrio===null?"No alcanzable con esta comisión":pesos(r.precioEquilibrio)}</dd><dt>Precio de lista para el objetivo</dt><dd>{r.precioObjetivo===null?"No alcanzable con esta comisión y objetivo":pesos(r.precioObjetivo)}</dd></dl>
  <p className="saldo-nota">Los precios sugeridos son el total con IVA antes de aplicar el descuento indicado.{esCombo&&" En combo, el costo es la suma de los costos vigentes de sus productos."}{esRappi&&" Objetivo de 50 %."}</p>
 </>:<p className="aviso">{aviso}</p>}
 <small>Contribución = venta sin IVA − costo − comisión − extras. No incluye regalías ni los demás gastos del negocio. Usa la comisión y su base acordadas para el canal.</small></div></div></section>;
}
