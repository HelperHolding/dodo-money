'use client';
import {useRouter} from 'next/navigation';
import { Icono } from '@/components/Icono';

export default function Volver404({className}:{className:string}) {
  const router=useRouter();
  function volver(){
    if(window.history.length>1){router.back();return;}
    router.replace('/');
  }
  return <button type="button" className={className} onClick={volver}><Icono nombre="regresar" /> Volver atrás</button>;
}
