"use client";

import { ErrorPagina } from "@/components/ErrorPagina";

/** Si algo no cargó, se dice claramente en lugar de mostrar fechas a medias. */
export default function ErrorCumplimiento({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPagina titulo="No pudimos cargar el calendario de cumplimiento" descripcion="Algunos datos no llegaron, así que no mostramos el calendario a medias." error={error} reset={reset} />;
}
