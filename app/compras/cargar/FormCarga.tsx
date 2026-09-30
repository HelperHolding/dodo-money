"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ResultadoCarga } from "./acciones";

const TEXTOS = {
  proveedores: { etiqueta: "Excel de proveedores", ninguno: "No se guardó ningún proveedor.", boton: "Cargar proveedores", ver: "/compras", verTexto: "Ver proveedores" },
  articulos: { etiqueta: "Excel de artículos", ninguno: "No se guardó ningún artículo.", boton: "Cargar artículos", ver: "/compras/articulos", verTexto: "Ver artículos" },
} as const;

export function FormCarga({ que, accion }: {
  que: keyof typeof TEXTOS; accion: (previo: ResultadoCarga | null, fd: FormData) => Promise<ResultadoCarga>;
}) {
  const t = TEXTOS[que];
  const [resultado, enviar, pendiente] = useActionState<ResultadoCarga | null, FormData>(accion, null);
  return (
    <form action={enviar} className="seccion formulario">
      <div className="campo">
        <label htmlFor={`archivo-${que}`}>{t.etiqueta}</label>
        <input id={`archivo-${que}`} name="archivo" type="file" accept=".xlsx" required />
      </div>
      {resultado?.errores && (
        <div className="aviso aviso-error" role="alert">
          <p>{t.ninguno} Corrige esto y vuelve a subir el archivo:</p>
          <ul>{resultado.errores.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>
          {resultado.errores.length > 20 && <p>…y {resultado.errores.length - 20} más.</p>}
        </div>
      )}
      {resultado?.ok && <p className="aviso aviso-ok" role="status">{resultado.ok} <Link href={t.ver}>{t.verTexto}</Link></p>}
      <button className="boton" type="submit" disabled={pendiente}>{pendiente ? "Cargando…" : t.boton}</button>
    </form>
  );
}
