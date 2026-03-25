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
  isDarkMode: boolean; 
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

  // NUEVO ESTADO: Guarda el código de referido si vino por link
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // Estados del formulario
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [dob, setDob] = useState("");

  useEffect(() => {
    setMounted(true);
    
    // TRAMPA DE REFERIDOS: Lee la URL apenas carga el componente
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) {
        setReferralCode(ref);
        // Si vino con link de referido, le abrimos la pestaña de registro de una
        setActiveTab("register");
      }
    }
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

    if (password !== confirmPassword) {
      setErrorMsg("Las contraseñas no coinciden.");
      setIsLoading(false);
      return;
    }

    const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, "");
    if (cleanUsername.length < 3) {
      setErrorMsg("El nombre de usuario debe tener al menos 3 caracteres.");
      setIsLoading(false);
      return;
    }

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

    // Registrar al usuario en Supabase Auth
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

    if (data?.user) {
      // 1. Forzamos la actualización del perfil básico
      await supabase.from("profiles").update({
        username: cleanUsername,
        full_name: fullName.trim(),
        date_of_birth: dob,
      }).eq("id", data.user.id);

      // 2. DISPARADOR DE REFERIDOS MULTINIVEL BLINDADO
      if (referralCode) {
        try {
          // Pausa de 1.5 segundos para asegurar que Supabase haya terminado de crear el perfil
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          const { error: rpcError, data: rpcData } = await supabase.rpc('process_referral', {
            referrer_username: referralCode,
            p_new_user_id: data.user.id // <--- LA CLAVE MÁGICA: Le mandamos el ID a la fuerza
          });
          
          if (!rpcError && rpcData === true) {
             console.log("¡Bono de referido pagado con éxito!");
             toast({ title: "¡Bono de Invitación!", description: `Recibiste 1000 pts extra gracias a ${referralCode}.` });
          } else {
             console.error("No se pudo procesar el referido:", rpcError || "Función devolvió FALSE");
          }
        } catch (err) {
          console.error("Error catcheado al procesar referido:", err);
        }
      }
    }

    toast({ title: "¡Cuenta creada!", description: "Bienvenido a PREDIX." });
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
            Bienvenido a <span className="text-primary">PREDIX</span>
          </DialogTitle>
          <DialogDescription className="text-center">
            {activeTab === "login" ? "Iniciá sesión para seguir jugando." : "Creá tu cuenta y empezá a predecir."}
          </DialogDescription>
        </DialogHeader>

        {/* CARTELITO DE REFERIDO: Para que el usuario sepa que le funcionó el link */}
        {referralCode && activeTab === "register" && (
           <div className="bg-primary/10 border border-primary/30 text-primary p-3 rounded-md flex items-center justify-center text-sm font-medium mt-1">
              ✨ ¡Fuiste invitado por {referralCode}! Registrate ahora y ganá 1000 pts de bono.
           </div>
        )}

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