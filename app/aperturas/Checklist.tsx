import {ConInfo} from '@/components/ConInfo';
import {MARCAS,aItemChecklist,type ItemApertura} from '@/lib/aperturas';
import {ChecklistEditable} from './ChecklistEditable';

export function Checklist({items,proyecto,base,edita}:{items:ItemApertura[];proyecto:string;base:string;edita:boolean}) {
 return <section className="seccion"><ChecklistEditable items={items.map(aItemChecklist)} proyecto={proyecto} base={base} edita={edita} encabezado={<>
  <h2>Checklist de apertura</h2><ConInfo titulo="Checklist de apertura" etiqueta="Cómo leer esto">Cada módulo junta sus etapas. Las actividades van una por línea; las validaciones técnicas y el equipo se resumen por grupo (el equipo, por categoría) y se abren para ver cada concepto. {edita?'Toca la casilla de un concepto para cambiar su estado; si el estado pide evidencia o cantidades, la ventana las solicita. ':''}Los cambios, tuyos o de otras personas, se ven al momento sin recargar. Listo es actividad completada o equipo instalado o verificado; no cuentan los que no aplican ni el equipo por validar. El avance general promedia los cuatro módulos, para que las piezas de compras no tapen al resto.</ConInfo>
  <p className="ap-check-leyenda">{(['listo','curso','bloqueado','pendiente'] as const).map(m=><span key={m}><span className="ap-check-marca" data-marca={m} aria-hidden="true">{MARCAS[m].icono}</span>{MARCAS[m].texto}</span>)}</p></>}/></section>;
}
