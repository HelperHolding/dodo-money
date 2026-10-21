"use client";
import {useState} from 'react';
import {BotonEnviar} from '@/components/BotonEnviar';
import {asignarContrasenaTemporal} from './accionesPasswordTemporal';
export function ContrasenaTemporal({usuario,nombre}:{usuario:string;nombre:string}) {
 const [solicitud]=useState(()=>crypto.randomUUID());
 return <details className="seccion"><summary>Asignar contraseña temporal</summary>
  <p>Se sustituirá la contraseña de {nombre}. Al entrar deberá elegir una nueva antes de operar.</p>
  <form action={asignarContrasenaTemporal} className="formulario">
   <input type="hidden" name="usuario" value={usuario}/><input type="hidden" name="solicitud" value={solicitud}/>
   <label className="campo">Contraseña temporal<input name="temporal" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label>
   <label className="campo">Confirmar contraseña temporal<input name="confirmar" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label>
   <label className="campo">Motivo<textarea name="motivo" required minLength={5} maxLength={1000}/></label>
   <BotonEnviar confirmar={`¿Sustituir la contraseña de ${nombre} por una temporal y exigir su cambio al entrar?`}>Asignar contraseña temporal</BotonEnviar>
  </form>
 </details>;
}
