"use client";

import { ErrorPagina } from "@/components/ErrorPagina";

/** Si algo no cargó, se dice claramente en lugar de mostrar datos a medias. */
export default function ErrorAdministracion({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPagina titulo="No pudimos cargar Administración" descripcion="Algunos datos no llegaron, así que no mostramos usuarios ni sucursales a medias." error={error} reset={reset} />;
}
