/** El botón de confirmar solo se ve mientras el archivo sea el de la previa: `cambioSobre` es la huella de la previa que estaba a la vista cuando se eligió otro archivo. */
export function confirmarVisible(previa: string | null, huella: string, cambioSobre: string | null): boolean {
  return Boolean(previa) && cambioSobre !== huella;
}
