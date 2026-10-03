"use client";

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Campo de archivo que revisa el tamaño antes de enviar: Vercel corta las peticiones de más de 4.5 MB
 * antes de que el servidor pueda responder con un mensaje claro.
 */
export function CampoArchivo({ id, name, etiqueta, accept, required = false }: {
  id: string; name: string; etiqueta: string; accept: string; required?: boolean;
}) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} name={name} type="file" accept={accept} required={required}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.setCustomValidity(f && f.size > MAX_BYTES ? "El archivo pesa más de 4 MB. Si es foto, tómala con menos resolución." : "");
          e.currentTarget.reportValidity();
        }} />
    </div>
  );
}
