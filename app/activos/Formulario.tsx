'use client';
import {useActionState} from 'react';
import type {Resultado} from './acciones';
export function Formulario({accion,children,texto='Guardar'}:{accion:(prev:Resultado,fd:FormData)=>Promise<Resultado>;children:React.ReactNode;texto?:string}) {
 const [resultado,action,pending]=useActionState(accion,{error:''});
 return <form action={action} className="formulario">{children}{resultado.error&&<p role="alert" className="aviso aviso-error">{resultado.error}</p>}<button className="boton" type="submit" disabled={pending}>{pending?'Guardando…':texto}</button></form>;
}
