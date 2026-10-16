import Link from "next/link";
import { Icono } from "@/components/Icono";

/**
 * Quien ve las dos recepciones (admin) tiene una sola entrada "Recepciones" en el menú
 * y cambia entre ellas con estas pestañas. Solo navegan: cada página sigue igual.
 */
export function PestanasRecepciones({ actual }: { actual: "tienda" | "compras" }) {
  return (
    <nav className="pestanas-nav" aria-label="Recepciones">
      <Link href="/recepciones" aria-current={actual === "tienda" ? "page" : undefined}><Icono nombre="tienda" /> En tienda</Link>
      <Link href="/compras/recepciones" aria-current={actual === "compras" ? "page" : undefined}><Icono nombre="carrito" /> De compras</Link>
    </nav>
  );
}
