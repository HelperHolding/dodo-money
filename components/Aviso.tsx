import { Icono } from "@/components/Icono";

export function Aviso({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p className="aviso aviso-error" role="alert"><Icono nombre="alerta" /><span>{error}</span></p>;
  if (ok) return <p className="aviso aviso-ok" role="status"><Icono nombre="ok" /><span>{ok}</span></p>;
  return null;
}
