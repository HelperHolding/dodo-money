export type PortalProveedor = { url: string; usuario: string; notas: string | null; tiene_password: boolean };

export function leerPortal(valor: (campo: string) => string) {
  const url = valor("url").trim();
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || url.length > 2000) throw new Error();
  } catch { return { error: "Escribe un enlace HTTPS válido, sin credenciales en la dirección." } as const; }
  const usuario = valor("usuario").trim();
  const password = valor("password"); // Los espacios pueden ser parte de la contraseña.
  const notas = valor("notas").trim();
  const quitar = valor("quitar_password") === "on";
  if (!usuario || usuario.length > 200) return { error: "Escribe el usuario del portal (hasta 200 caracteres)." } as const;
  if (password.length > 1000 || notas.length > 2000) return { error: "Contraseña de hasta 1000 caracteres y notas de hasta 2000." } as const;
  if (quitar && password) return { error: "Elige entre cambiar o quitar la contraseña." } as const;
  return { datos: { url, usuario, password: password || null, notas: notas || null, quitar } } as const;
}
