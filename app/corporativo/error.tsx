"use client";

import { ErrorPagina } from "@/components/ErrorPagina";

/** Si algo no cargó, se dice claramente en lugar de mostrar datos a medias. */
export default function ErrorCorporativo({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPagina titulo="No pudimos cargar la vista general" descripcion="Algunos datos no llegaron, así que no mostramos la tabla para no dar una imagen equivocada." error={error} reset={reset} />;
}
