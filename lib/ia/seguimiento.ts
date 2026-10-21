import type {FuenteIA} from './validacion.ts';

/** Preguntas de seguimiento sin llamadas adicionales al modelo ni acceso a nuevas fuentes. */
export function siguientesConsultas(pregunta:string,fuentes:FuenteIA[],gerente:boolean):string[]{
 const contexto=`${pregunta} ${fuentes.map(f=>f.titulo+' '+f.href).join(' ')}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const opciones=/corte|arqueo|diferencia/.test(contexto)
  ? ['Desglosa las diferencias por día del mismo periodo.','¿Qué cortes faltan por registrar en ese periodo?','¿Qué debo revisar primero para conciliar esas diferencias?']
  : /costo|costeo|producto|margen/.test(contexto)
  ? ['Desglosa el costo de los productos que acabamos de revisar.','¿Qué productos de esta consulta tienen costos pendientes?','¿Qué vigencia y fuentes tienen esos costos?']
  : /ventas|vendimos|venta|rappi/.test(contexto)
  ? ['Desglosa esas ventas por día y forma de pago.','Compara ese periodo con el periodo anterior de la misma duración.','¿Hay días sin información o costos pendientes en ese periodo?']
  : !gerente&&/p&l|resultado|utilidad|gasto/.test(contexto)
  ? ['Desglosa los gastos del mismo periodo.','¿Qué datos pendientes podrían cambiar ese resultado?','¿Qué rubros explican el resultado del periodo?']
  : ['Explícame paso a paso cómo revisar lo anterior en DODO MX.','¿Qué información falta para completar esta consulta?','Resume los puntos que debería revisar primero.'];
 return opciones.filter(o=>o!==pregunta.trim());
}
