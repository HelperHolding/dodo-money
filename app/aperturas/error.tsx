"use client";

import { ErrorPagina } from "@/components/ErrorPagina";

/** Si algo no cargó, se dice claramente en lugar de mostrar datos a medias. */
export default function ErrorAperturas({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPagina titulo="No pudimos cargar Aperturas" descripcion="Algunos datos no llegaron, así que no mostramos el proyecto a medias." error={error} reset={reset} />;
}
