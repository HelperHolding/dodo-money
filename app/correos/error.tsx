"use client";

import { ErrorPagina } from "@/components/ErrorPagina";

/** Si algo no cargó, se dice claramente en lugar de mostrar campañas a medias. */
export default function ErrorCorreos({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPagina titulo="No pudimos cargar Correos" descripcion="Algunos datos no llegaron, así que no mostramos la lista a medias." error={error} reset={reset} />;
}
