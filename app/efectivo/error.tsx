"use client";

import { ErrorPagina } from "@/components/ErrorPagina";

/** Si algo no cargó, se dice claramente en lugar de mostrar datos a medias. */
export default function ErrorEfectivo({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPagina titulo="No pudimos cargar Salidas a corporativo" descripcion="Algunos datos no llegaron, así que no mostramos saldos a medias." error={error} reset={reset} />;
}
