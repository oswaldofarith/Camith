
"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/icons"; 
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase/firebase"; // Import auth directly
import { sendPasswordResetEmail } from "firebase/auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordResetLoading, setIsPasswordResetLoading] = useState(false);
  const [emailForReset, setEmailForReset] = useState("");
  const [isPasswordResetDialogOpen, setIsPasswordResetDialogOpen] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard"); 
    } catch (error: any) {
      let errorMessage = "Error al iniciar sesión. Verifique sus credenciales.";
      if (error.code) {
        switch (error.code) {
          case "auth/user-not-found":
          case "auth/wrong-password":
          case "auth/invalid-credential":
            errorMessage = "Correo electrónico o contraseña incorrectos.";
            break;
          case "auth/invalid-email":
            errorMessage = "El formato del correo electrónico no es válido.";
            break;
          default:
            errorMessage = "Ocurrió un error inesperado. Intente nuevamente.";
        }
      }
      console.error("Login error:", error);
      toast({
        title: "Error de Inicio de Sesión",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordResetRequest = async () => {
    if (!emailForReset.trim()) {
      toast({ title: "Correo Requerido", description: "Por favor, ingrese su correo electrónico.", variant: "destructive" });
      return;
    }
    setIsPasswordResetLoading(true);
    try {
      auth.languageCode = 'es'; // Solicitar correo en español
      await sendPasswordResetEmail(auth, emailForReset);
      toast({
        title: "Enlace Enviado",
        description: "Si tu correo está registrado, recibirás un enlace para restablecer tu contraseña.",
      });
      setIsPasswordResetDialogOpen(false);
      setEmailForReset("");
    } catch (error: any) {
      console.error("Password reset error:", error);
      let errorMessage = "No se pudo enviar el enlace de restablecimiento.";
      if (error.code === 'auth/invalid-email') {
        errorMessage = "El formato del correo electrónico no es válido.";
      } else if (error.code === 'auth/user-not-found') {
         toast({ // Show success-like message even if user not found for security
            title: "Enlace Enviado",
            description: "Si tu correo está registrado, recibirás un enlace para restablecer tu contraseña.",
          });
          setIsPasswordResetDialogOpen(false);
          setEmailForReset("");
          setIsPasswordResetLoading(false);
          return;
      }
      toast({
        title: "Error al Restablecer",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsPasswordResetLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <Icons.logo className="mx-auto h-12 w-auto mb-4 text-foreground" />
          <CardDescription>Inicie sesión para acceder al sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Correo Electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.login className="mr-2 h-4 w-4" /> 
              )}
              Ingresar
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <AlertDialog open={isPasswordResetDialogOpen} onOpenChange={setIsPasswordResetDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="link" className="p-0 h-auto" onClick={() => { setEmailForReset(email); setIsPasswordResetDialogOpen(true); }}>
                  ¿Olvidaste tu contraseña?
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Restablecer Contraseña</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ingresa tu correo electrónico para enviarte un enlace de restablecimiento.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2 py-2">
                  <Label htmlFor="emailForReset">Correo Electrónico</Label>
                  <Input
                    id="emailForReset"
                    type="email"
                    placeholder="tu_correo@example.com"
                    value={emailForReset}
                    onChange={(e) => setEmailForReset(e.target.value)}
                    disabled={isPasswordResetLoading}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPasswordResetLoading}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handlePasswordResetRequest} disabled={isPasswordResetLoading}>
                    {isPasswordResetLoading && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
                    Enviar Enlace
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

if (Icons && !(Icons as any).login) {
  (Icons as any).login = Icons.logOut; 
}
