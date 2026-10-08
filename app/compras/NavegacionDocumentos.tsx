"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
/** Conserva la puerta de entrada unificada también al abrir enlaces antiguos o documentos. */
export function NavegacionDocumentos(){
 const ruta=usePathname();
 if(!ruta.startsWith("/compras/ordenes")&&!ruta.startsWith("/compras/facturas"))return null;
 return <nav className="compra-regreso" aria-label="Documentos de compra"><Link href="/compras/documentos">← Compras y facturas</Link><span>Cotización → Orden de compra → Factura</span></nav>;
}
