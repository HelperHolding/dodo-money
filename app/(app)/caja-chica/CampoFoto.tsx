"use client";

import { useState } from "react";

const LADO_MAX = 1600;

/** Reduce la foto en el dispositivo (≈300 KB en vez de 3–5 MB). Si no se puede, deja la original. */
async function reducir(archivo: File): Promise<File> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  lienzo.getContext("2d")?.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, "image/jpeg", 0.8));
  if (!blob || blob.size >= archivo.size) return archivo;
  return new File([blob], `${archivo.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
}

export function CampoFoto() {
  const [estado, setEstado] = useState<string | null>(null);

  return (
    <div className="campo">
      <label htmlFor="foto">Foto del ticket (opcional)</label>
      <input
        id="foto" name="foto" type="file" accept="image/*" capture="environment"
        onChange={async (e) => {
          const input = e.currentTarget;
          const archivo = input.files?.[0];
          if (!archivo) return setEstado(null);
          setEstado("Preparando foto…");
          try {
            const reducida = await reducir(archivo);
            const lista = new DataTransfer();
            lista.items.add(reducida);
            input.files = lista.files;
            setEstado(`Foto lista (${Math.max(1, Math.round(reducida.size / 1024))} KB)`);
          } catch {
            // Formatos que el navegador no puede abrir (HEIC en Chrome): se sube la original.
            setEstado("Foto lista");
          }
        }}
      />
      {estado && <small role="status">{estado}</small>}
    </div>
  );
}
