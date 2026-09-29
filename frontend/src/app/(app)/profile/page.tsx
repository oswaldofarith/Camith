
"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile, UserSkill } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { storage, auth } from "@/lib/firebase/firebase"; // Import auth
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import imageCompression from 'browser-image-compression';
import { Progress } from "@/components/ui/progress";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";


const profileFormSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido."),
});

const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, "La contraseña actual es requerida."),
  newPassword: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres."),
  confirmPassword: z.string().min(1, "Confirme la nueva contraseña."),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las nuevas contraseñas no coinciden.",
  path: ["confirmPassword"], // Path to show the error on
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;
type PasswordFormValues = z.infer<typeof passwordFormSchema>;

export default function ProfilePage() {
  const { userProfile, currentUser, updateUserProfileData, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isSubmittingName, setIsSubmittingName] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);


  const profileDetailsForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      nombre: "",
    },
  });

  const passwordChangeForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (userProfile) {
      profileDetailsForm.reset({
        nombre: userProfile.nombre,
      });
    }
  }, [userProfile, profileDetailsForm]);

  const onNameSubmit: SubmitHandler<ProfileFormValues> = async (data) => {
    if (!currentUser || !userProfile) {
      toast({ title: "Error", description: "No se pudo encontrar la información del usuario.", variant: "destructive" });
      return;
    }
    setIsSubmittingName(true);
    try {
      const updatePayload: Partial<Omit<UserProfile, "id">> = {
        nombre: data.nombre,
      };
      await updateUserProfileData(currentUser.uid, updatePayload);
      toast({ title: "Nombre Actualizado", description: "Tu nombre de perfil ha sido guardado." });
    } catch (error) {
      console.error("Error updating name:", error);
      toast({ title: "Error al Actualizar Nombre", description: (error as Error).message || "No se pudo guardar tu nombre.", variant: "destructive" });
    } finally {
      setIsSubmittingName(false);
    }
  };
  
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Archivo Inválido", description: "Por favor, seleccione un archivo de imagen.", variant: "destructive" });
        return;
      }
      if (file.size > 2 * 1024 * 1024) { // 2MB size limit before compression
        toast({ title: "Archivo Demasiado Grande", description: "Por favor, seleccione una imagen de menos de 2MB.", variant: "destructive" });
        return;
      }
      setSelectedFile(file);
      setImagePreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUploadAndSaveImage = async () => {
    if (!selectedFile || !currentUser) {
      toast({ title: "Error", description: "No hay archivo seleccionado o usuario no autenticado.", variant: "destructive" });
      return;
    }
    setIsUploadingImage(true);
    setUploadProgress(0);

    try {
      const options = {
        maxSizeMB: 0.5, 
        maxWidthOrHeight: 800, 
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(selectedFile, options);
      
      const storagePath = `profileImages/${currentUser.uid}/profilePicture.jpg`;
      const imageRef = ref(storage, storagePath);

      const metadata = {
        contentType: compressedFile.type, // Usar el tipo del archivo comprimido
      };
      
      const uploadTask = uploadBytesResumable(imageRef, compressedFile, metadata);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Error uploading image to Firebase Storage:", error);
          toast({ title: "Error de Subida", description: "No se pudo subir la imagen. " + error.message, variant: "destructive" });
          setIsUploadingImage(false);
          setUploadProgress(0);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          await updateUserProfileData(currentUser.uid, { fotoUrl: downloadURL });
          toast({ title: "Foto de Perfil Actualizada", description: "Tu nueva foto de perfil ha sido guardada." });
          setSelectedFile(null);
          setImagePreviewUrl(null); 
          if (fileInputRef.current) fileInputRef.current.value = ""; 
          setIsUploadingImage(false);
          setUploadProgress(0);
        }
      );
    } catch (error) {
      console.error("Error processing or uploading image:", error);
      toast({ title: "Error de Imagen", description: (error as Error).message || "Ocurrió un error al procesar la imagen.", variant: "destructive" });
      setIsUploadingImage(false);
      setUploadProgress(0);
    }
  };

  const onSubmitPasswordChange: SubmitHandler<PasswordFormValues> = async (data) => {
    if (!currentUser || !currentUser.email) {
      toast({ title: "Error", description: "Usuario no autenticado o correo no disponible.", variant: "destructive" });
      return;
    }
    setIsChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, data.currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      
      await updatePassword(currentUser, data.newPassword);
      toast({ title: "Contraseña Cambiada", description: "Tu contraseña ha sido actualizada exitosamente." });
      passwordChangeForm.reset();
    } catch (error: any) {
      console.error("Error changing password:", error);
      let errorMessage = "No se pudo cambiar la contraseña.";
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = "La contraseña actual es incorrecta.";
        passwordChangeForm.setError("currentPassword", { type: "manual", message: errorMessage });
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = "Demasiados intentos fallidos. Intenta más tarde.";
      }
      toast({ title: "Error al Cambiar Contraseña", description: errorMessage, variant: "destructive" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const getInitials = (name?: string): string => {
    if (!name || name.trim() === "") return "U";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1 && parts[0].length > 0 && parts[parts.length - 1].length > 0) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length > 0) {
      return parts[0].substring(0, Math.min(2, parts[0].length)).toUpperCase();
    }
    return "U";
  };

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Mi Perfil" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Mi Perfil" />
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No se pudo cargar la información del perfil.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentPhoto = imagePreviewUrl || userProfile.fotoUrl || "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mi Perfil" />
      <div className="grid lg:grid-cols-3 gap-6 max-w-6xl mx-auto w-full">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Foto de Perfil</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Avatar className="h-32 w-32">
              <AvatarImage src={currentPhoto} alt={userProfile.nombre} data-ai-hint="profile avatar" />
              <AvatarFallback className="text-4xl">{getInitials(profileDetailsForm.getValues("nombre") || userProfile.nombre)}</AvatarFallback>
            </Avatar>
            <input type="file" accept="image/*" onChange={handleFileSelect} ref={fileInputRef} className="hidden" id="profileImageInput"/>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploadingImage}>
              <Icons.edit className="mr-2 h-4 w-4" /> Seleccionar Foto
            </Button>
            {selectedFile && !isUploadingImage && (
              <Button type="button" onClick={handleUploadAndSaveImage} className="w-full">
                <Icons.upload className="mr-2 h-4 w-4" /> Subir y Guardar Foto
              </Button>
            )}
            {isUploadingImage && (
              <div className="w-full space-y-1">
                <Progress value={uploadProgress} className="w-full h-2" />
                <p className="text-xs text-center text-muted-foreground">Subiendo... {uploadProgress.toFixed(0)}%</p>
              </div>
            )}
             <p className="text-xs text-muted-foreground mt-2 text-center">
                Recomendado: cuadrado, máx 2MB (antes de compresión), ej. 500x500px.
             </p>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Form {...profileDetailsForm}>
            <form onSubmit={profileDetailsForm.handleSubmit(onNameSubmit)}>
              <Card>
                <CardHeader>
                  <CardTitle>Información Personal</CardTitle>
                  <CardDescription>Actualiza tu nombre y revisa otros detalles.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6">
                  <FormField
                    control={profileDetailsForm.control}
                    name="nombre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre Completo</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isSubmittingName || authLoading} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-2">
                    <Label htmlFor="cedula">Cédula</Label>
                    <Input id="cedula" value={userProfile.cedula || 'No asignada'} disabled />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="email">Correo Electrónico</Label>
                    <Input id="email" type="email" value={userProfile.email} disabled />
                    <p className="text-xs text-muted-foreground">El correo electrónico no se puede cambiar desde aquí.</p>
                  </div>
                  
                  {userProfile.numeroRol && (
                    <div className="grid gap-2">
                      <Label>Número de Rol (RRHH)</Label>
                      <Input value={userProfile.numeroRol} disabled />
                    </div>
                  )}

                  <div className="grid gap-2">
                    <Label>Roles</Label>
                    <div className="flex flex-wrap gap-2">
                      {userProfile.perfiles.map((perfil) => (
                        <Badge key={perfil} variant="secondary">{perfil}</Badge>
                      ))}
                    </div>
                  </div>

                  {userProfile.perfiles.includes("tecnicoDeCampo") && userProfile.habilidades && userProfile.habilidades.length > 0 && (
                    <div className="grid gap-2">
                      <Label>Habilidades (Técnico)</Label>
                      <ScrollArea className="h-20 rounded-md border p-2">
                        <div className="flex flex-wrap gap-2">
                          {userProfile.habilidades.map((habilidad: UserSkill) => (
                            <Badge key={habilidad} variant="outline">{habilidad}</Badge>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={isSubmittingName || authLoading}>
                    {isSubmittingName ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.save className="mr-2 h-4 w-4" />}
                    Guardar Nombre
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </Form>

          <Form {...passwordChangeForm}>
            <form onSubmit={passwordChangeForm.handleSubmit(onSubmitPasswordChange)}>
              <Card>
                <CardHeader>
                  <CardTitle>Seguridad de la Cuenta</CardTitle>
                  <CardDescription>Cambia tu contraseña.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6">
                  <FormField
                    control={passwordChangeForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña Actual</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} disabled={isChangingPassword} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordChangeForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nueva Contraseña</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} disabled={isChangingPassword} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordChangeForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar Nueva Contraseña</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} disabled={isChangingPassword} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={isChangingPassword}>
                    {isChangingPassword ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.key className="mr-2 h-4 w-4" />}
                    Cambiar Contraseña
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
