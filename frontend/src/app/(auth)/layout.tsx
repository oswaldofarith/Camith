import { Icons } from "@/components/icons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Marco común de las pantallas de acceso (login, recuperación de contraseña). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="items-center">
          <Icons.logo className="text-foreground mx-auto mb-2 h-12 w-auto" />
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
