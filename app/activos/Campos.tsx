import {CATEGORIAS,ESTADOS_ACTIVO,type Activo,type Mantenimiento} from '@/lib/activos';
export function Campo({nombre,titulo,valor,tipo='text',required=false,min,max}:{nombre:string;titulo:string;valor?:string|number|null;tipo?:string;required?:boolean;min?:string;max?:string}) {
 return <label className="campo">{titulo}<input name={nombre} type={tipo} defaultValue={valor??''} required={required} min={min} max={max} maxLength={4000} step={tipo==='number'?'0.01':undefined}/></label>;
}
export function CamposActivo({a,sucursales,facturas,proveedores}:{a:Partial<Activo>;sucursales:{id:string;nombre:string}[];facturas:{id:string;folio:string|null;sucursal_id:string|null}[];proveedores:{id:string;razon_social:string}[]}) {
 return <><input type="hidden" name="id" value={a.id??''}/><input type="hidden" name="revision" value={a.revision??0}/><input type="hidden" name="apertura_item_id" value={a.apertura_item_id??''}/><div className="rejilla">
 <label className="campo">Sucursal<select name="sucursal_id" defaultValue={a.sucursal_id??''} required><option value="">Elige sucursal</option>{sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
 <Campo nombre="nombre" titulo="Nombre" valor={a.nombre} required/>
 <label className="campo">Categoría<select name="categoria" defaultValue={a.categoria??'otros'}>{Object.entries(CATEGORIAS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label className="campo">Estado<select name="estado" defaultValue={a.estado??'en_uso'}>{Object.entries(ESTADOS_ACTIVO).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 {(['ubicacion','responsable','marca','modelo','serie','condicion'] as const).map(c=><Campo key={c} nombre={c} titulo={({ubicacion:'Ubicación',responsable:'Responsable',marca:'Marca',modelo:'Modelo',serie:'Número de serie',condicion:'Condición física'})[c]} valor={a[c]}/>)}
 <Campo nombre="adquirido" titulo="Fecha de adquisición" tipo="date" valor={a.adquirido}/><Campo nombre="costo" titulo="Costo de adquisición MXN (con IVA)" tipo="number" min="0" max="999999999999" valor={a.costo}/><Campo nombre="garantia_hasta" titulo="Garantía hasta" tipo="date" valor={a.garantia_hasta}/>
 <label className="campo">Proveedor<select name="proveedor_id" defaultValue={a.proveedor_id??""}><option value="">Sin proveedor registrado</option>{proveedores.map(p=><option key={p.id} value={p.id}>{p.razon_social}</option>)}</select></label>
 <label className="campo">Factura de adquisición<select name="factura_id" defaultValue={a.factura_id??""}><option value="">Sin factura</option>{facturas.map(f=><option key={f.id} value={f.id}>{f.folio??"Sin folio"} · {sucursales.find(s=>s.id===f.sucursal_id)?.nombre??"Sin sucursal"}</option>)}</select><small>Al vincular una factura nueva debe corresponder a la sucursal del activo.</small></label></div>
 <label className="campo">Evidencia, fotos y notas<textarea name="evidencia" rows={3} maxLength={4000} defaultValue={a.evidencia??''} placeholder="Enlaces a fotografías o documentos; motivo obligatorio para dar de baja"/></label><p>Un registro representa una unidad. Deja el costo vacío si se desconoce; registra la estimación en Valuación.</p></>;
}
export function CamposMantenimiento({activo,m}:{activo:string;m?:Mantenimiento}) {
 return <><input type="hidden" name="activo_id" value={activo}/><input type="hidden" name="id" value={m?.id??''}/><input type="hidden" name="revision" value={m?.revision??0}/><div className="rejilla">
 <label className="campo">Tipo<select name="tipo" defaultValue={m?.tipo??'preventivo'}><option value="preventivo">Preventivo</option><option value="correctivo">Correctivo</option></select></label>
 <Campo nombre="tarea" titulo="Trabajo a realizar" valor={m?.tarea} required/><Campo nombre="programado" titulo="Fecha programada" tipo="date" valor={m?.programado} required/>
 <label className="campo">Estado<select name="estado" defaultValue={m?.estado??'pendiente'}><option value="pendiente">Pendiente</option><option value="completado">Completado</option><option value="anulado">Anulado</option></select></label>
 <Campo nombre="realizado" titulo="Fecha realizada" tipo="date" valor={m?.realizado}/><Campo nombre="costo" titulo="Costo del servicio con IVA MXN (0 si no tuvo costo)" tipo="number" min="0" max="999999999999" valor={m?.costo}/><Campo nombre="tecnico" titulo="Proveedor o técnico" valor={m?.tecnico}/></div>
 <label className="campo">Evidencia o motivo de anulación<textarea name="evidencia" rows={3} maxLength={4000} defaultValue={m?.evidencia??''}/></label><small>Para completar registra fecha, costo y evidencia. Al cerrar el servicio se conserva el registro; programa el siguiente por separado.</small></>;
}
