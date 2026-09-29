import { NextResponse, type NextRequest } from "next/server";

// Rutas accesibles sin sesión.
const PUBLICAS = ["/login", "/recuperar", "/reset-password"];

/**
 * Redirige al login si no hay cookie de sesión. Es solo una comodidad para
 * evitar el parpadeo: la autorización real la hace siempre Django.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLICAS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!request.cookies.has("sessionid")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Excluye la API y los archivos estáticos (Django y Caddy los atienden).
  matcher: ["/((?!api|media|_next|favicon|images).*)"],
};
