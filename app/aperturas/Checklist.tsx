import {ConInfo} from '@/components/ConInfo';
import {MARCAS,checklistApertura,marcaItem,type ItemApertura} from '@/lib/aperturas';
import {ChecklistEditable,type ConceptoChecklist} from './ChecklistEditable';

export function Checklist({items,base,edita}:{items:ItemApertura[];base:string;edita:boolean}) {
 const {modulos,general}=checklistApertura(items);
 // Solo lo que la ventana de estado necesita de cada concepto.
 const conceptos:Record<string,ConceptoChecklist>=Object.fromEntries(items.map(i=>[i.id,{id:i.id,nombre:i.nombre,tipo:i.tipo,estado:i.estado,marca:marcaItem(i),cantidad:i.cantidad===null?null:Number(i.cantidad),recibido:Number(i.recibido),evidencia:i.evidencia,notas:i.notas,revision:i.revision,unidad:typeof i.original.unidad==='string'?i.original.unidad:null}]));
 return <section className="seccion"><div className="ap-check-encabezado"><div className="ap-dona" style={{width:96,height:96,flexBasis:96}}><svg viewBox="0 0 120 120" role="img" aria-label={`Avance general: ${general??0} %`}><circle cx="60" cy="60" r="46" fill="none" style={{stroke:'var(--dato-pista)'}} strokeWidth="14"/>{general?<circle cx="60" cy="60" r="46" fill="none" style={{stroke:'var(--cuadra)'}} strokeWidth="14" pathLength="100" strokeDasharray={`${general} ${100-general}`} transform="rotate(-90 60 60)"/>:null}</svg><div><strong style={{fontSize:'1.3rem'}}>{general===null?'—':`${general} %`}</strong></div></div>
 <div><h2>Checklist de apertura</h2><ConInfo titulo="Checklist de apertura" etiqueta="Cómo leer esto">Cada módulo junta sus etapas. Las actividades van una por línea; las validaciones técnicas y el equipo se resumen por grupo (el equipo, por categoría) y se abren para ver cada concepto. {edita?'Toca la casilla de un concepto para cambiar su estado; si el estado pide evidencia o cantidades, la ventana las solicita. ':''}Listo es actividad completada o equipo instalado o verificado; no cuentan los que no aplican ni el equipo por validar. El avance general promedia los cuatro módulos, para que las piezas de compras no tapen al resto.</ConInfo>
 <p className="ap-check-leyenda">{(['listo','curso','bloqueado','pendiente'] as const).map(m=><span key={m}><span className="ap-check-marca" data-marca={m} aria-hidden="true">{MARCAS[m].icono}</span>{MARCAS[m].texto}</span>)}</p></div></div>
 <ChecklistEditable modulos={modulos} conceptos={conceptos} base={base} edita={edita}/></section>;
}
