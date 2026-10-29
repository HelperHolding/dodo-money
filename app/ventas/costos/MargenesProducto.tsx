'use client';
import {useState} from 'react';
import {pesos} from '@/lib/formato';
import {margenProducto,margenConComision,precioParaMargen} from '@/lib/costeo/margenes';

const pct=(n:number)=>`${n.toLocaleString('es-MX',{maximumFractionDigits:1})} %`;
type Canal={canal:string;precio:number|null;comision:number|null;nombreComision:string;referencia:string};
/** Por canal, como el costeo de The Coffee: venta sin IVA, costo, margen bruto, comisión del canal, margen con comisión y utilidad. */
export function MargenesProducto({costo,pos,rappi,comisionPOS,comisionRappi,fechaCosto,referenciaPOS,referenciaRappi}:{costo:number|null;pos:number|null;rappi:number|null;comisionPOS:number|null;comisionRappi:number|null;fechaCosto?:string;referenciaPOS:string;referenciaRappi:string}) {
 const [objetivo,setObjetivo]=useState(''),meta=objetivo.trim()===''?null:Number(objetivo),precio=meta===null?null:precioParaMargen(costo,meta);
 const canales:Canal[]=[{canal:'POS',precio:pos,comision:comisionPOS,nombreComision:'Comisión terminal',referencia:referenciaPOS},{canal:'Rappi',precio:rappi,comision:comisionRappi,nombreComision:'Comisión Rappi',referencia:referenciaRappi}];
 return <section className="seccion"><h2>Márgenes por canal</h2><p className="saldo-nota">Sobre la venta sin IVA (16 %), con el costo vigente{fechaCosto?` del ${fechaCosto}`:''}, que ya incluye caja y periféricos. Cada canal descuenta su comisión sobre el precio con IVA.</p><div className="rejilla">{canales.map(c=>{const b=margenProducto(c.precio,costo),m=c.comision===null?null:margenConComision(c.precio,costo,c.comision);return <article className="seccion" key={c.canal}><h3>{c.canal}</h3><p className="cifra-grande" data-alerta={m&&m.utilidad<0?"si":undefined}>{m?pct(m.margenPct):'Pendiente'}</p><small>Margen con comisión</small><dl>
 <dt>Precio con IVA</dt><dd>{c.precio===null?'Sin precio':pesos(c.precio)}</dd>
 <dt>Venta sin IVA</dt><dd>{b?pesos(b.neto):'—'}</dd>
 <dt>Costo</dt><dd>{costo===null?'Sin costo':pesos(costo)}</dd>
 <dt>Margen bruto</dt><dd>{b?`${pct(b.margenPct)} · ${pesos(b.utilidad)}`:'—'}</dd>
 <dt>{c.nombreComision}{c.comision!==null?` (${c.comision.toLocaleString('es-MX',{maximumFractionDigits:2})} %)`:''}</dt><dd>{m?pesos(m.comision):c.comision===null?'Sin dato':'—'}</dd>
 <dt>Margen con comisión</dt><dd>{m?pct(m.margenPct):'—'}</dd>
 <dt>Utilidad</dt><dd><strong>{m?pesos(m.utilidad):'—'}</strong></dd>
 </dl><small>{c.referencia}</small>{meta!==null&&precio!==null&&m&&<p className={m.margenPct<meta?'alerta-texto':'saldo-nota'}>{m.margenPct<meta?'Por debajo':'Cumple'} del objetivo simulado de {meta} %.</p>}</article>;})}</div><p className="saldo-nota">Utilidad = venta sin IVA − costo − comisión. Antes de descuentos, regalías y otros gastos. El precio Rappi observado puede incluir opciones o combos.</p><details><summary>Simular un margen objetivo</summary><div className="formulario" style={{marginTop:16}}><label className="campo">Margen deseado sobre la venta (%)<input type="number" min="0" max="99.99" step="0.01" value={objetivo} onChange={e=>setObjetivo(e.target.value)} placeholder="Por ejemplo, 65"/></label>{meta!==null&&(precio===null?<p className="aviso">{costo===null?'Registra el costo para calcular el precio.':'El margen debe ser de 0 a menos de 100 %.'}</p>:<p>Precio necesario con IVA: <strong>{pesos(precio)}</strong> · antes de comisiones; para Rappi con comisión usa las Calculadoras.</p>)}<small>Esta simulación no cambia los precios ni guarda una meta. Margen = (venta sin IVA − costo) ÷ venta sin IVA.</small></div></details></section>;
}
