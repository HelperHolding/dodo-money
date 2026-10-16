"use client";

import { ErrorPagina } from "@/components/ErrorPagina";

/** Si algo no cargó, se dice claramente en lugar de mostrar datos a medias. */
export default function ErrorFinanzas({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPagina titulo="No pudimos cargar Finanzas" descripcion="Algunos datos no llegaron, así que no mostramos un P&L incompleto." error={error} reset={reset} />;
}
