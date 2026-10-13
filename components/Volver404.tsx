'use client';
import {useRouter} from 'next/navigation';

export default function Volver404({className}:{className:string}) {
  const router=useRouter();
  function volver(){
    if(window.history.length>1){router.back();return;}
    router.replace('/');
  }
  return <button type="button" className={className} onClick={volver}><span aria-hidden="true">←</span> Volver atrás</button>;
}
