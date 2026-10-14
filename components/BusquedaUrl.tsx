"use client";
import {useEffect,useState,useRef} from 'react';
import {useRouter,usePathname,useSearchParams} from 'next/navigation';
/** Búsqueda en vistas renderizadas por servidor; conserva los otros filtros de la URL. */
export function BusquedaUrl({id,titulo,inicial}:{id:string;titulo:string;inicial:string}) {
 const [q,setQ]=useState(inicial);const router=useRouter();const ruta=usePathname();const params=useSearchParams();const query=params.toString();const ultima=useRef(inicial);
 useEffect(()=>{if(q===ultima.current)return;const timer=setTimeout(()=>{const p=new URLSearchParams(query);if(q.trim())p.set('q',q);else p.delete('q');ultima.current=q;router.replace(`${ruta}${p.size?`?${p}`:''}`,{scroll:false});},200);return()=>clearTimeout(timer);},[q,query,ruta,router]);
 return <div className="campo"><label htmlFor={id}>{titulo}</label><input id={id} name="q" type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Escribe para buscar…"/></div>;
}
