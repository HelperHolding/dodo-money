import Link from 'next/link';
import {avanceCategorias,type ItemApertura} from '@/lib/aperturas';

// Avance por categoría del plano en tabla Akton; cada nombre filtra la lista de abajo.
export function AvanceCategorias({items,base,activa}:{items:ItemApertura[];base:string;activa?:string}) {
 const filas=avanceCategorias(items);
 return <section className="akton-tabla-marco" aria-labelledby="ap-categorias">
  <h2 id="ap-categorias" className="akton-titulo">Avance por categoría</h2>
  <p className="akton-subtitulo">Equipo instalado o verificado y actividades completadas. No cuenta lo que no aplica ni el equipo por validar. Obra se instala en sitio.</p>
  <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla">
   <thead><tr><th>Categoría</th><th>Conceptos</th><th>Listos</th><th>Avance</th><th>En curso</th><th>Recibidos</th><th>Notas</th></tr></thead>
   <tbody>{filas.map(c=>{const valor=c.clave??'sin',activo=activa===valor;return <tr key={valor} aria-current={activo||undefined}>
    <td data-label="Categoría"><Link href={activo?`${base}?vista=compras`:`${base}?vista=compras&cat=${valor}`}>{c.hoja?`${c.hoja} · `:''}{c.nombre}</Link>{c.obra&&<small className="ap-lista-sub">Obra</small>}</td>
    <td data-label="Conceptos">{c.conceptos}</td><td data-label="Listos">{c.listos}</td>
    <td data-label="Avance">{c.porcentaje===null?'—':`${c.porcentaje} %`}</td>
    <td data-label="En curso">{c.pedidos}</td><td data-label="Recibidos">{c.recibidos}</td>
    <td data-label="Notas" className="akton-nota-celda">{c.bloqueados>0&&<p className="akton-nota">{c.bloqueados} {c.bloqueados===1?'bloqueado':'bloqueados'}</p>}</td>
   </tr>;})}</tbody>
  </table></div>
 </section>;
}
