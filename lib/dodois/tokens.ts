/**
 * Token de acceso de Dodo IS. El token de renovación es de un solo uso: si se gasta y el nuevo no se guarda, la conexión
 * se pierde. Por eso se renueva uno a la vez, se reintenta guardar, y un invalid_grant solo marca "reconectar" si nadie
 * más renovó mientras tanto. Sin red ni base: recibe dónde leer/guardar y cómo pedir el token.
 */

export class ErrorDodo extends Error {
  readonly reconectar: boolean;
  constructor(mensaje: string, reconectar = false) { super(mensaje); this.reconectar = reconectar; }
}

export type Guardado = { refresh: string | null; access: string | null; access_expira: string | null; estado: string };
export type Almacen = {
  leer(): Promise<Guardado | null>;
  tomarRenovacion(): Promise<boolean>;
  guardar(refresh: string, access: string, expira: string): Promise<{ error: string | null }>;
  marcarError(mensaje: string, reconectar: boolean): Promise<void>;
};
export type TokensNuevos = { access_token: string; refresh_token: string; expires_in: number };

export async function tokenDeAcceso(almacen: Almacen, pedir: (refresh: string) => Promise<TokensNuevos>,
  o: { esperar: (ms: number) => Promise<void>; ahora: () => number }): Promise<string> {
  for (let intento = 0; intento < 5; intento++) {
    const d = await almacen.leer();
    if (!d) throw new ErrorDodo("Dodo IS no está conectado.");
    if (d.estado === "requiere_reconectar") throw new ErrorDodo("Hay que reconectar Dodo IS.", true);
    if (d.access && d.access_expira && Date.parse(d.access_expira) - o.ahora() > 5 * 60_000) return d.access;
    if (!(await almacen.tomarRenovacion())) { await o.esperar(2000); continue; }

    let t: TokensNuevos;
    try {
      t = await pedir(d.refresh ?? "");
    } catch (e) {
      const reconectar = e instanceof ErrorDodo && e.reconectar;
      if (reconectar) {
        const ahora = await almacen.leer();
        if (ahora?.refresh && ahora.refresh !== d.refresh) continue;   // otra sincronización ya renovó: usa el nuevo
      }
      await almacen.marcarError((e as Error).message, reconectar);
      throw e;
    }
    const expira = new Date(o.ahora() + t.expires_in * 1000).toISOString();
    let g = await almacen.guardar(t.refresh_token, t.access_token, expira);
    if (g.error) g = await almacen.guardar(t.refresh_token, t.access_token, expira);
    if (g.error) {
      await almacen.marcarError(`No se pudo guardar el token nuevo de Dodo IS: ${g.error}`, false);
      throw new ErrorDodo("No se pudo guardar el token nuevo de Dodo IS; si la siguiente sincronización falla, reconecta.");
    }
    return t.access_token;
  }
  throw new ErrorDodo("Otra sincronización está renovando el token; se reintenta en la siguiente.");
}
