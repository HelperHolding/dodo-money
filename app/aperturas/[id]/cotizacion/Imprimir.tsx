'use client';

export function Imprimir() {
 return <button type="button" className="boton" onClick={()=>window.print()}>Imprimir / PDF</button>;
}
