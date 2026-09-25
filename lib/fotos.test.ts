import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_FOTO_BYTES, rutaFoto, validarFoto } from "./fotos.ts";

test("sin foto no hay error: la foto es opcional", () => {
  assert.equal(validarFoto(null), null);
});

test("acepta fotos JPG, PNG, WebP y HEIC dentro del límite", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]) {
    assert.equal(validarFoto({ type, size: 300_000 }), null, type);
  }
});

test("rechaza archivos que no son foto", () => {
  assert.match(validarFoto({ type: "application/pdf", size: 1000 }) ?? "", /Adjunta una foto/);
  assert.match(validarFoto({ type: "", size: 1000 }) ?? "", /Adjunta una foto/);
});

test("rechaza fotos más grandes que el límite", () => {
  assert.equal(validarFoto({ type: "image/jpeg", size: MAX_FOTO_BYTES }), null);
  assert.match(validarFoto({ type: "image/jpeg", size: MAX_FOTO_BYTES + 1 }) ?? "", /muy pesada/);
});

test("la ruta empieza con la carpeta de la sucursal y usa la extensión del tipo", () => {
  assert.equal(rutaFoto("suc-1", "abc", "image/jpeg"), "suc-1/abc.jpg");
  assert.equal(rutaFoto("suc-1", "abc", "image/png"), "suc-1/abc.png");
  assert.equal(rutaFoto("suc-1", "abc", "image/heic"), "suc-1/abc.heic");
});
