"use client";

import { useFormStatus } from "react-dom";

export function BotonEnviar({
  children, pendiente = "Guardando…", className = "boton", confirmar,
}: {
  children: React.ReactNode; pendiente?: string; className?: string;
  /** Si viene, pregunta antes de enviar; cancelar no envía el formulario. */
  confirmar?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      type="submit"
      disabled={pending}
      onClick={confirmar ? (e) => { if (!window.confirm(confirmar)) e.preventDefault(); } : undefined}
    >
      {pending ? pendiente : children}
    </button>
  );
}
