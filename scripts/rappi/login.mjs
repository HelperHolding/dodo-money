// Login automático del extractor en el Portal Aliados. La sesión del login clásico de Rappi dura 24 h y el portal no la
// renueva solo, así que el servicio vuelve a entrar con RAPPI_USUARIO / RAPPI_PASSWORD (en el .env del servidor; nunca
// en el repo ni en logs). Como mucho un intento por hora y se detiene tras 3 fallos seguidos para no bloquear la cuenta.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ESPERA = 60 * 60 * 1000, MAX_FALLOS = 3;

/**
 * @param {import("playwright-core").Page} pagina
 * @param {{portal: string, datos: string, usuario?: string, password?: string, pais?: string, ahora?: number}} cfg
 * @returns {Promise<{ok: boolean, motivo?: string}>}
 */
export async function iniciarSesion(pagina, { portal, datos, usuario, password, pais = "México", ahora = Date.now() }) {
  if (!usuario || !password) return { ok: false, motivo: "no hay RAPPI_USUARIO/RAPPI_PASSWORD en el servidor" };
  // Registro de intentos (sin credenciales): {ultimo, fallos, motivo}.
  const archivo = join(datos, "login.json");
  let reg = { ultimo: 0, fallos: 0 };
  try { reg = JSON.parse(readFileSync(archivo, "utf8")); } catch {}
  const guardar = (r) => writeFileSync(archivo, JSON.stringify(r));
  if (reg.fallos >= MAX_FALLOS) return { ok: false, motivo: `${reg.fallos} intentos fallidos seguidos (último: ${reg.motivo ?? "?"}); se detuvo para no bloquear la cuenta. Revisa usuario y contraseña y borra /datos/login.json` };
  if (ahora - reg.ultimo < ESPERA) return { ok: false, motivo: "ya hubo un intento de login hace menos de 1 h" };
  guardar({ ...reg, ultimo: ahora });
  const fallo = (motivo) => { guardar({ ultimo: ahora, fallos: reg.fallos + 1, motivo }); return { ok: false, motivo }; };
  try {
    await pagina.goto(`${portal}/login`, { waitUntil: "domcontentloaded" });
    await pagina.locator("#login-username").waitFor({ timeout: 60_000 });
    // País: hay un <select> nativo además del botón; si el botón no lo refleja, se elige en la lista.
    const nativo = pagina.locator("select").first();
    if (await nativo.count()) await nativo.selectOption({ label: pais }).catch(() => {});
    if (!(await pagina.locator("#login-country-trigger").innerText()).includes(pais)) {
      await pagina.locator("#login-country-trigger").click();
      await pagina.getByRole("option", { name: pais }).or(pagina.getByText(pais, { exact: true })).first().click();
    }
    await pagina.locator("#login-username").fill(usuario);
    await pagina.locator("#login-password").fill(password);
    await pagina.locator("button[type=submit]", { hasText: "Iniciar sesión" }).click();
    await pagina.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }).catch(() => {});
    if (new URL(pagina.url()).pathname.startsWith("/login")) {
      // Mensaje visible del portal (p. ej. credenciales inválidas o verificación adicional).
      const aviso = (await pagina.locator("[role=alert], [class*=error], [class*=Error]").allInnerTexts().catch(() => []))
        .map((t) => t.trim()).filter((t) => t && t !== pais).join(" / ").slice(0, 200);
      return fallo(aviso || "el portal siguió en /login tras enviar el formulario");
    }
    guardar({ ultimo: ahora, fallos: 0 });
    return { ok: true };
  } catch (e) {
    return fallo(String(e?.message ?? e).split("\n")[0].slice(0, 200));
  }
}
