"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { CLAVE_ME } from "@/hooks/use-sesion";
import { cambiarPassword } from "@/lib/api/auth";

import { FormularioNuevaPassword } from "../formulario-nueva-password";

/** Obligatoria cuando el usuario entra con una contraseña temporal. */
export default function CambiarPasswordPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return (
    <FormularioNuevaPassword
      titulo="Cambia tu contraseña temporal"
      descripcion="Por seguridad, antes de continuar debes elegir una contraseña propia."
      pedirActual
      onGuardar={async (nueva, actual) => {
        await cambiarPassword(actual, nueva);
        // Se descarta el usuario en caché (aún con la marca de temporal).
        queryClient.removeQueries({ queryKey: CLAVE_ME });
        toast.success("Contraseña actualizada.");
        router.replace("/dashboard");
      }}
    />
  );
}
