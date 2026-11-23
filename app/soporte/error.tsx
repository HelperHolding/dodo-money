"use client";

import { ErrorPagina } from "@/components/ErrorPagina";

/** Si algo no cargó, se dice claramente en lugar de mostrar el Help Desk a medias. */
export default function ErrorSoporte({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPagina titulo="No pudimos cargar el Help Desk" descripcion="Algunos datos no llegaron, así que no mostramos la lista a medias." error={error} reset={reset} />;
}
