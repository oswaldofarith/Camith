import createClient, { type Middleware } from "openapi-fetch";

import type { paths } from "./schema";

/** Error de la API con el mensaje en español que devuelve Django. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errores?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

export function leerCookie(nombre: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${nombre}=`))
    ?.split("=")[1];
}

/** Garantiza la cookie `csrftoken` (Django la exige en POST/PUT/PATCH/DELETE). */
export async function asegurarCsrf(): Promise<string> {
  let token = leerCookie("csrftoken");
  if (!token) {
    await fetch("/api/csrf", { credentials: "same-origin" });
    token = leerCookie("csrftoken");
  }
  return token ?? "";
}

const csrf: Middleware = {
  async onRequest({ request }) {
    if (!METODOS_SEGUROS.has(request.method)) {
      request.headers.set("X-CSRFToken", await asegurarCsrf());
    }
    return request;
  },
};

export const api = createClient<paths>({ baseUrl: "", credentials: "same-origin" });
api.use(csrf);

/** Convierte el cuerpo de un error de Django/Ninja en un mensaje legible. */
export function mensajeDeError(status: number, cuerpo: unknown): string {
  if (cuerpo && typeof cuerpo === "object" && "detail" in cuerpo) {
    const detail = (cuerpo as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    // Errores de validación de Ninja (422): lista de {loc, msg}.
    if (Array.isArray(detail)) {
      return detail
        .map((e: { loc?: unknown[]; msg?: string }) =>
          [e.loc?.slice(-1)[0], e.msg].filter(Boolean).join(": "),
        )
        .join("; ");
    }
  }
  if (status === 401) return "Tu sesión ha expirado. Vuelve a iniciar sesión.";
  if (status === 403) return "No tienes permiso para realizar esta acción.";
  if (status >= 500) return "Error del servidor. Inténtalo de nuevo en unos minutos.";
  return `Error inesperado (${status}).`;
}

/** Devuelve `data` o lanza `ApiError`; pensado para usarse dentro de queryFn/mutationFn. */
export async function unwrap<T>(
  peticion: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await peticion;
  if (!response.ok) {
    const errores =
      error && typeof error === "object" && "errores" in error
        ? (error as { errores: Record<string, string[]> }).errores
        : undefined;
    throw new ApiError(response.status, mensajeDeError(response.status, error), errores);
  }
  return data as T;
}
