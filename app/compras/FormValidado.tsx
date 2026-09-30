"use client";

import { useState } from "react";
import { leerArticulo, leerProveedor } from "@/lib/compras/proveedores";

const VALIDAR = {
  proveedor: (fd: FormData) => leerProveedor((c) => (c === "categorias" ? fd.getAll("categorias").join(",") : String(fd.get(c) ?? ""))),
  articulo: (fd: FormData) => leerArticulo((c) => String(fd.get(c) ?? "")),
};

/**
 * Formulario que revisa en el navegador con las mismas reglas del servidor antes de enviar:
 * un RFC o una CLABE mal escritos se avisan sin perder lo capturado. El servidor vuelve a validar.
 */
export function FormValidado({ tipo, action, className, children }: {
  tipo: keyof typeof VALIDAR; action: (fd: FormData) => Promise<void>; className?: string; children: React.ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        const r = VALIDAR[tipo](new FormData(e.currentTarget));
        if ("error" in r) { e.preventDefault(); setError(r.error); } else setError(null);
      }}
    >
      {error && <p className="aviso aviso-error" role="alert">{error}</p>}
      {children}
    </form>
  );
}
