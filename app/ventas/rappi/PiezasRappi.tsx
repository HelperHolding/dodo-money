"use client";
import {useState} from "react";
import {BotonEnviar} from "@/components/BotonEnviar";
import {guardarPiezas} from "./acciones";
type Pieza={dodo_id:string;cantidad:string};
/** Liga un producto de Rappi a varias piezas del catálogo (pizza + dip, refresco, rolls, o un combo). El costo es la suma de sus piezas. */
export function PiezasRappi({id,inicial,catalogo}:{id:number;inicial:{dodo_id:number;cantidad:number}[];catalogo:{dodo_id:number;nombre:string}[]}){
 const [piezas,setPiezas]=useState<Pieza[]>(inicial.length?inicial.map(p=>({dodo_id:String(p.dodo_id),cantidad:String(p.cantidad)})):[{dodo_id:"",cantidad:"1"},{dodo_id:"",cantidad:"1"}]);
 const cambiar=(i:number,c:Partial<Pieza>)=>setPiezas(piezas.map((p,j)=>j===i?{...p,...c}:p));
 const validas=piezas.filter(p=>p.dodo_id&&Number(p.cantidad)>0);
 const repetida=new Set(validas.map(p=>p.dodo_id)).size!==validas.length;
 return <form action={guardarPiezas} className="rappi-piezas">
  <input type="hidden" name="id" value={id}/>
  <input type="hidden" name="piezas" value={JSON.stringify(validas.map(p=>({dodo_id:Number(p.dodo_id),cantidad:Number(p.cantidad)})))}/>
  {piezas.map((p,i)=><div className="combo-linea" key={i}>
   <label className="campo">Pieza {i+1}<select value={p.dodo_id} onChange={e=>cambiar(i,{dodo_id:e.target.value})}><option value="">Seleccionar producto</option>{catalogo.map(d=><option key={d.dodo_id} value={d.dodo_id}>{d.nombre}</option>)}</select></label>
   <label className="campo">Cantidad<input type="number" inputMode="decimal" min="0.001" max="100" step="any" value={p.cantidad} onChange={e=>cambiar(i,{cantidad:e.target.value})}/></label>
   <button type="button" className="boton boton-secundario" aria-label={`Quitar pieza ${i+1}`} onClick={()=>setPiezas(piezas.filter((_,j)=>j!==i))}>Quitar</button>
  </div>)}
  <div className="acciones"><button type="button" className="boton boton-secundario" onClick={()=>setPiezas([...piezas,{dodo_id:"",cantidad:"1"}])}>+ Agregar pieza</button>
  {repetida?<p className="aviso">Un producto se repite: súmalo en una sola pieza.</p>:<BotonEnviar>{validas.length?"Guardar piezas":"Quitar piezas"}</BotonEnviar>}</div>
 </form>;
}
