"use client";

import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { solicitarRecuperacion } from "@/lib/api/auth";

export default function RecuperarPage() {
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await solicitarRecuperacion(String(new FormData(e.currentTarget).get("email")));
      setEnviado(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="text-primary mx-auto size-10" />
        <p className="text-sm">
          Si el correo está registrado, recibirás un enlace para crear tu contraseña. Revisa
          también la carpeta de correo no deseado.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Volver al inicio de sesión</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold">Recuperar contraseña</h1>
        <p className="text-muted-foreground text-sm">
          Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>
      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando && <Loader2 className="animate-spin" />}
        Enviar enlace
      </Button>
      <Button asChild variant="link" className="w-full">
        <Link href="/login">Volver al inicio de sesión</Link>
      </Button>
    </form>
  );
}
