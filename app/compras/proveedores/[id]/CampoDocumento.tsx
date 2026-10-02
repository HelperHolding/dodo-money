"use client";

import { MAX_BYTES_DOCUMENTO } from "@/lib/compras/documentos";

/**
 * Archivo del documento. El tamaño se revisa aquí: Vercel corta las peticiones de más de 4.5 MB antes de que
 * el servidor pueda responder con un mensaje claro.
 */
export function CampoDocumento() {
  return (
    <div className="campo">
      <label htmlFor="archivo">Archivo (PDF o foto, hasta 4 MB)</label>
      <input id="archivo" name="archivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.setCustomValidity(f && f.size > MAX_BYTES_DOCUMENTO
            ? "El archivo pesa más de 4 MB. Si es foto, tómala con menos resolución o súbela como PDF." : "");
          e.currentTarget.reportValidity();
        }} />
    </div>
  );
}
