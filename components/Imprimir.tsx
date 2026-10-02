"use client";

export function Imprimir() {
  return <button className="boton no-imprimir" type="button" onClick={() => window.print()}>Imprimir o guardar como PDF</button>;
}
