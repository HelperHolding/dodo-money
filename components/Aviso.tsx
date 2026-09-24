export function Aviso({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p className="aviso aviso-error" role="alert">{error}</p>;
  if (ok) return <p className="aviso aviso-ok" role="status">{ok}</p>;
  return null;
}
