"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLAVE_ME } from "@/hooks/use-sesion";
import { iniciarSesion } from "@/lib/api/auth";

import { CampoPassword } from "../campo-password";

function FormularioLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setEnviando(true);
    setError(null);
    try {
      await iniciarSesion(String(datos.get("email")), String(datos.get("password")));
      // Se descarta el usuario en caché para que el layout espere al nuevo.
      queryClient.removeQueries({ queryKey: CLAVE_ME });
      const destino = params.get("next");
      // Solo rutas internas, para evitar redirecciones abiertas.
      router.replace(destino?.startsWith("/") && !destino.startsWith("//") ? destino : "/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <p className="text-muted-foreground text-center text-sm">
        Inicia sesión para acceder al sistema
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Contraseña</Label>
          <Link href="/recuperar" className="text-primary text-sm hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <CampoPassword id="password" name="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" /> : <LogIn />}
        Ingresar
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  );
}
