"use client";

import { ErrorPagina } from "@/components/ErrorPagina";

/** Si algo no cargó, se dice claramente en lugar de mostrar datos a medias. */
export default function ErrorVentas({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPagina titulo="No pudimos cargar las ventas" descripcion="Algunos datos no llegaron, así que no mostramos reportes incompletos." error={error} reset={reset} />;
}
