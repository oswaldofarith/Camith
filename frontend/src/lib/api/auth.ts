/**
 * Autenticación con allauth "headless" (cliente browser: cookie de sesión + CSRF).
 * Referencia: https://docs.allauth.org/en/latest/headless/openapi-specification/
 */
import { ApiError, asegurarCsrf } from "./client";

const BASE = "/api/auth/browser/v1";

type RespuestaAllauth = {
  status: number;
  errors?: { message: string; param?: string }[];
  meta?: { is_authenticated?: boolean };
};

async function llamar(
  ruta: string,
  metodo: "GET" | "POST" | "DELETE",
  cuerpo?: object,
  encabezados: Record<string, string> = {},
): Promise<RespuestaAllauth> {
  const headers: Record<string, string> = { ...encabezados };
  if (metodo !== "GET") headers["X-CSRFToken"] = await asegurarCsrf();
  if (cuerpo) headers["Content-Type"] = "application/json";
  const resp = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    credentials: "same-origin",
    headers,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const json = (await resp.json().catch(() => ({ status: resp.status }))) as RespuestaAllauth;
  return { ...json, status: resp.status };
}

function fallar(r: RespuestaAllauth, porDefecto: string): never {
  let mensaje = r.errors?.map((e) => e.message).join(" ");
  if (!mensaje) {
    if (r.status === 403) mensaje = "La solicitud fue bloqueada por seguridad. Recarga la página e inténtalo de nuevo.";
    else if (r.status === 429) mensaje = "Demasiados intentos. Espera unos minutos.";
    else if (r.status >= 500) mensaje = "Error del servidor. Inténtalo de nuevo en unos minutos.";
    else mensaje = porDefecto;
  }
  throw new ApiError(r.status, mensaje);
}

export async function iniciarSesion(email: string, password: string) {
  const r = await llamar("/auth/login", "POST", { email, password });
  if (r.status !== 200) fallar(r, "Correo o contraseña incorrectos.");
}

export async function cerrarSesion() {
  // allauth responde 401 al cerrar la sesión: es el comportamiento esperado.
  await llamar("/auth/session", "DELETE");
}

export async function solicitarRecuperacion(email: string) {
  const r = await llamar("/auth/password/request", "POST", { email });
  if (r.status !== 200) fallar(r, "No se pudo enviar el correo de recuperación.");
}

export async function validarClaveRecuperacion(key: string): Promise<boolean> {
  const r = await llamar("/auth/password/reset", "GET", undefined, {
    "X-Password-Reset-Key": key,
  });
  return r.status === 200;
}

export async function restablecerPassword(key: string, password: string) {
  const r = await llamar("/auth/password/reset", "POST", { key, password });
  // 401 = contraseña cambiada correctamente pero sin iniciar sesión automáticamente.
  if (r.status !== 200 && r.status !== 401) fallar(r, "El enlace no es válido o ha caducado.");
}

export async function cambiarPassword(actual: string, nueva: string) {
  const r = await llamar("/account/password/change", "POST", {
    current_password: actual,
    new_password: nueva,
  });
  if (r.status !== 200) fallar(r, "No se pudo cambiar la contraseña.");
}
