import {ConInfo} from '@/components/ConInfo';
import {MARCAS,aItemChecklist,type ItemApertura} from '@/lib/aperturas';
import {ChecklistEditable} from './ChecklistEditable';

// completo=false (responsable): sin «Abrir la lista con filtros», que lleva a las vistas de compras y técnico que no tiene.
export function Checklist({items,proyecto,base,edita,completo}:{items:ItemApertura[];proyecto:string;base:string;edita:boolean;completo:boolean}) {
 return <section className="seccion"><ChecklistEditable items={items.map(aItemChecklist)} proyecto={proyecto} base={base} edita={edita} completo={completo} encabezado={<>
  <h2>Checklist de apertura</h2><ConInfo titulo="Checklist de apertura" etiqueta="Cómo leer esto">Cada módulo junta sus etapas. Las actividades van una por línea; las validaciones técnicas y el equipo se resumen por grupo (el equipo, por categoría) y se abren para ver cada concepto. {edita?'Toca la casilla de un concepto para cambiar su estado; si el estado pide evidencia o cantidades, la ventana las solicita. ':''}Los cambios, tuyos o de otras personas, se ven al momento sin recargar. Listo es actividad completada o equipo instalado o verificado; no cuentan los que no aplican ni el equipo por validar. Cada partida suma según su etapa: el equipo, 25 % cotizado, 50 % pedido, 75 % recibido y 100 % instalado; las actividades, 1/3 en curso, 2/3 por cerrar y 100 % completadas. El % de cada módulo es el promedio de sus partidas, y el avance general pondera los módulos: Proyecto 20 %, Compras 35 %, Obra 30 % y Apertura 15 %. Solo llega a 100 % cuando todo está terminado.</ConInfo>
  <p className="ap-check-leyenda">{(['listo','curso','bloqueado','pendiente'] as const).map(m=><span key={m}><span className="ap-check-marca" data-marca={m} aria-hidden="true">{MARCAS[m].icono}</span>{MARCAS[m].texto}</span>)}</p></>}/></section>;
}
