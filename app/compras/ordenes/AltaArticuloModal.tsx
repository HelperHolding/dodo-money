"use client";
import { Icono } from "@/components/Icono";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {CATEGORIAS_COMPRA,NOMBRE_CATEGORIA_COMPRA,TASAS_IVA,NOMBRE_TASA_IVA} from "@/lib/compras/proveedores";
import {crearArticuloDesdeCotizacion} from "./alta-articulo";
type Articulo={id:string;nombre:string;unidad:string};
export function AltaArticuloModal({ordenId,alCrear}:{ordenId:string;alCrear:(a:Articulo)=>void}) {
 const [montado,setMontado]=useState(false),[ocupado,setOcupado]=useState(false),[error,setError]=useState("");
 const modal=useRef<HTMLDialogElement>(null),form=useRef<HTMLFormElement>(null);
 useEffect(()=>setMontado(true),[]);
 return <><button type="button" className="boton boton-secundario" onClick={()=>{setError("");modal.current?.showModal();}}>Crear artículo</button>
 {montado&&createPortal(<dialog ref={modal} className="compra-filtros-modal" aria-labelledby="alta-articulo-titulo" onCancel={e=>{if(ocupado)e.preventDefault();}}>
 <header className="compra-modal-encabezado"><div><h2 id="alta-articulo-titulo">Nuevo artículo</h2><p>Se guardará en el catálogo y quedará seleccionado en la cotización.</p></div><button type="button" className="boton-icono compra-modal-cerrar" disabled={ocupado} aria-label="Cerrar alta de artículo" onClick={()=>modal.current?.close()}><Icono nombre="cerrar" tamano={22} /></button></header>
 <form ref={form} className="formulario" onSubmit={async e=>{e.preventDefault();e.stopPropagation();if(ocupado)return;const fd=new FormData(e.currentTarget);setOcupado(true);setError("");try{const r=await crearArticuloDesdeCotizacion(ordenId,fd);if("error" in r){setError(r.error??"No se pudo guardar.");return;}alCrear(r.articulo);form.current?.reset();modal.current?.close();}catch{setError("No se pudo confirmar el alta. Revisa el catálogo antes de intentar de nuevo.");}finally{setOcupado(false);}}}>
 <fieldset disabled={ocupado} style={{border:0,padding:0,margin:0}}><div className="rejilla">
 <div className="campo"><label htmlFor="alta-articulo-nombre">Nombre</label><input id="alta-articulo-nombre" name="nombre" required/></div>
 <div className="campo"><label htmlFor="alta-articulo-unidad">Unidad</label><input id="alta-articulo-unidad" name="unidad" placeholder="kg, pza, caja…" required/></div>
 <div className="campo"><label htmlFor="alta-articulo-tipo">Tipo de artículo</label><select id="alta-articulo-tipo" name="tipo" defaultValue="consumible">{CATEGORIAS_COMPRA.map(t=><option key={t} value={t}>{NOMBRE_CATEGORIA_COMPRA[t]}</option>)}</select></div>
 <div className="campo"><label htmlFor="alta-articulo-iva">IVA</label><select id="alta-articulo-iva" name="tasa_iva" defaultValue="16">{TASAS_IVA.map(t=><option key={t} value={t}>{NOMBRE_TASA_IVA[t]}</option>)}</select></div>
 <div className="campo"><label htmlFor="alta-articulo-dodo">ID de insumo de Dodo IS (opcional)</label><input id="alta-articulo-dodo" name="dodo_insumo_id" maxLength={32}/></div>
 </div></fieldset>
 {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
 <div className="acciones"><button type="submit" className="boton" disabled={ocupado}>{ocupado?"Guardando…":"Crear y seleccionar"}</button><button type="button" className="boton boton-secundario" disabled={ocupado} onClick={()=>modal.current?.close()}>Cancelar</button></div>
 </form></dialog>,document.body)}</>;
}

