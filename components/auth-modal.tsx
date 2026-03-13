"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: () => void;
  isDarkMode: boolean; // Lo mantenemos por si lo usás en el futuro, aunque los inputs de shadcn se adaptan solos
}

export function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
}: AuthModalProps) {
  const supabase = createClient();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados del formulario
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [dob, setDob] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Limpiar el formulario cuando se abre/cierra
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setPassword("");
      setConfirmPassword("");
    }
  }, [isOpen]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message);
      setIsLoading(false);
      return;
    }

    onAuthSuccess();
    onClose();
    setIsLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    // 1. Validar que las contraseñas coincidan
    if (password !== confirmPassword) {
      setErrorMsg("Las contraseñas no coinciden.");
      setIsLoading(false);
      return;
    }

    // 2. Formatear y validar nombre de usuario
    const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, "");
    if (cleanUsername.length < 3) {
      setErrorMsg("El nombre de usuario debe tener al menos 3 caracteres.");
      setIsLoading(false);
      return;
    }

    // 3. Verificar si el nombre de usuario ya existe en la base de datos
    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", cleanUsername)
      .single();

    if (existingUser) {
      setErrorMsg("Ese nombre de usuario ya está en uso. Por favor elegí otro.");
      setIsLoading(false);
      return;
    }

    // 4. Registrar al usuario en Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: cleanUsername,
          full_name: fullName.trim(),
          date_of_birth: dob,
        },
      },
    });

    if (error) {
      setErrorMsg(error.message === "User already registered" ? "Ya existe una cuenta con este correo." : error.message);
      setIsLoading(false);
      return;
    }

    // 5. Forzar la actualización del perfil por si el trigger automático falla
    if (data?.user) {
      await supabase.from("profiles").update({
        username: cleanUsername,
        full_name: fullName.trim(),
        date_of_birth: dob,
      }).eq("id", data.user.id);
    }

    toast({ title: "¡Cuenta creada!", description: "Bienvenido a PredicAR." });
    onAuthSuccess();
    onClose();
    setIsLoading(false);
  };

  if (!mounted) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold">
            Bienvenido a <span className="text-primary">Predic</span><span className="text-secondary">AR</span>
          </DialogTitle>
          <DialogDescription className="text-center">
            {activeTab === "login" ? "Iniciá sesión para seguir jugando." : "Creá tu cuenta y empezá a predecir."}
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-3 rounded-md flex items-center gap-2 text-sm mt-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p>{errorMsg}</p>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "register")} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Iniciar Sesión</TabsTrigger>
            <TabsTrigger value="register">Registrarse</TabsTrigger>
          </TabsList>

          {/* PESTAÑA DE LOGIN */}
          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Correo electrónico</Label>
                <Input id="login-email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Contraseña</Label>
                <Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full mt-2" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isLoading ? "Ingresando..." : "Iniciar Sesión"}
              </Button>
            </form>
          </TabsContent>

          {/* PESTAÑA DE REGISTRO */}
          <TabsContent value="register">
            <form onSubmit={handleRegister} className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-fullname">Nombre completo</Label>
                  <Input id="reg-fullname" placeholder="Juan Pérez" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-dob">Nacimiento</Label>
                  <Input id="reg-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().split("T")[0]} required />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="reg-username">Nombre de usuario (único)</Label>
                <Input id="reg-username" placeholder="ej: lobodeWallStreet99" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-email">Correo electrónico</Label>
                <Input id="reg-email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-password">Contraseña</Label>
                  <Input id="reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-confirm">Repetir contraseña</Label>
                  <Input id="reg-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} required />
                </div>
              </div>

              <Button type="submit" className="w-full mt-4" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isLoading ? "Creando cuenta..." : "Crear Cuenta"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}