"use client";

import { useFormStatus } from "react-dom";

export function BotonEnviar({
  children, pendiente = "Guardando…", className = "boton", name, value,
}: {
  children: React.ReactNode; pendiente?: string; className?: string; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} name={name} value={value}>
      {pending ? pendiente : children}
    </button>
  );
}
