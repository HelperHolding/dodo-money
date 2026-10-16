"use client";

import { ErrorPagina } from "@/components/ErrorPagina";

/** Si algo no cargó, se dice claramente en lugar de mostrar datos a medias. */
export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPagina titulo="No pudimos cargar esta pantalla" descripcion="Algo no cargó bien. No mostramos datos a medias." error={error} reset={reset} />;
}
