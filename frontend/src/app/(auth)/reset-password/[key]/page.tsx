"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { restablecerPassword, validarClaveRecuperacion } from "@/lib/api/auth";

import { FormularioNuevaPassword } from "../../formulario-nueva-password";

export default function ResetPasswordPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const router = useRouter();
  const valida = useQuery({
    queryKey: ["reset-key", key],
    queryFn: () => validarClaveRecuperacion(decodeURIComponent(key)),
    retry: false,
  });

  if (valida.isPending) {
    return <Loader2 className="text-muted-foreground mx-auto animate-spin" />;
  }
  if (!valida.data) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            El enlace no es válido o ya caducó. Solicita uno nuevo.
          </AlertDescription>
        </Alert>
        <Button asChild className="w-full">
          <Link href="/recuperar">Solicitar otro enlace</Link>
        </Button>
      </div>
    );
  }
  return (
    <FormularioNuevaPassword
      titulo="Crea tu contraseña"
      descripcion="Elige la contraseña con la que entrarás al sistema."
      onGuardar={async (nueva) => {
        await restablecerPassword(decodeURIComponent(key), nueva);
        toast.success("Contraseña guardada. Ya puedes iniciar sesión.");
        router.replace("/login");
      }}
    />
  );
}
