"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getProfile, getMyBets, getMyTransactions, updateUserPassword, updateProfileSettings, type BetWithMarket } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { NavHeader } from "@/components/nav-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, User, ArrowLeft, Loader2, TrendingUp, TrendingDown, History, Pencil, Landmark, Lock, Camera } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const ACTIVE_STATUSES = ["active", "pending"];
const FINISHED_STATUSES = ["resolved", "rejected"];

function getMarket(bet: BetWithMarket) {
  return bet.markets ?? bet.market ?? null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [bets, setBets] = useState<BetWithMarket[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  
  const [isChecking, setIsChecking] = useState(true);
  const [isLoadingBets, setIsLoadingBets] = useState(true);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Estados para Modal de Perfil (Con Foto)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados para Modal de Contraseña
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    const load = async () => {
      const p = await getProfile();
      if (!p) {
        router.replace("/");
        return;
      }
      setProfile(p);
      setNewUsername(p.username || "");
      setPreviewUrl((p as any).avatar_url || null);
      setIsChecking(false);
    };
    load();
  }, [router]);

  useEffect(() => {
    if (!profile?.id) return;
    const loadData = async () => {
      setIsLoadingBets(true);
      setIsLoadingTransactions(true);
      
      const [betsRes, txRes] = await Promise.all([
        getMyBets(),
        getMyTransactions()
      ]);
      
      if (!betsRes.error && betsRes.data) setBets(betsRes.data);
      if (!txRes.error && txRes.data) setTransactions(txRes.data);
      
      setIsLoadingBets(false);
      setIsLoadingTransactions(false);
    };
    loadData();
  }, [profile?.id]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file)); // Muestra la previsualización al instante
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    
    setIsSaving(true);
    const supabase = createClient();
    let finalAvatarUrl = profile.avatar_url;

    // 1. Si seleccionó una foto, la subimos al storage primero
    if (selectedImage) {
      const fileExt = selectedImage.name.split('.').pop();
      const filePath = `${profile.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, selectedImage, { upsert: true });

      if (uploadError) {
        toast({ title: "Error", description: "No se pudo subir la imagen. Intenta con una más liviana.", variant: "destructive" });
        setIsSaving(false);
        return;
      }

      // Obtenemos el link público de la foto recién subida
      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      finalAvatarUrl = data.publicUrl;
    }

    // 2. Guardamos todo en la base de datos
    const { ok, error } = await updateProfileSettings(newUsername.trim(), finalAvatarUrl);
    setIsSaving(false);

    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    } else {
      toast({ title: "Perfil actualizado", description: "Tus datos se guardaron con éxito." });
      setProfile({ ...profile, username: newUsername.trim(), avatar_url: finalAvatarUrl });
      setIsEditModalOpen(false);
      setSelectedImage(null);
      router.refresh(); 
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Las contraseñas no coinciden.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "La contraseña debe tener al menos 6 caracteres.", variant: "destructive" });
      return;
    }

    setIsChangingPassword(true);
    const { ok, error } = await updateUserPassword(newPassword);
    setIsChangingPassword(false);

    if (error) {
      toast({ title: "Error al cambiar contraseña", description: error, variant: "destructive" });
    } else {
      toast({ title: "¡Contraseña actualizada!", description: "Tu contraseña se cambió correctamente." });
      setIsPasswordModalOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) return null;

  const displayName = profile.username || profile.email?.split("@")[0] || "Usuario";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader
        points={profile.points ?? 10000}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onPointsUpdate={() => {}}
        userId={profile.id}
        userEmail={profile.email ?? null}
        onOpenAuthModal={() => router.push("/")}
        onSignOut={async () => {
          await createClient().auth.signOut();
          router.replace("/");
        }}
        isAdmin={profile.role === "admin"}
        username={profile.username ?? null}
      />

      <main className="container mx-auto px-4 py-8 flex-1">
        <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2">
          <Link href="/" className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
        </Button>

        <div className="max-w-xl mx-auto">
          {/* Tarjeta de Datos del Perfil */}
          <Card className="bg-card border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-xl">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Mi Perfil
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsPasswordModalOpen(true)} title="Cambiar Contraseña">
                    <Lock className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    setNewUsername(profile.username || "");
                    setPreviewUrl(profile.avatar_url || null);
                    setSelectedImage(null);
                    setIsEditModalOpen(true);
                  }}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Editar
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary border-2 border-primary/20 overflow-hidden shrink-0">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-10 h-10" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Usuario</p>
                  <p className="text-2xl font-bold text-foreground truncate">
                    {displayName}
                  </p>
                  {profile.email && (
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                      {profile.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                <div>
                  <p className="text-sm text-muted-foreground">Nombre Completo</p>
                  <p className="font-medium text-foreground truncate">{profile.full_name || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fecha de Nacimiento</p>
                  <p className="font-medium text-foreground">
                    {profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString("es-AR", { timeZone: "UTC" }) : "—"}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/20 border border-secondary/30">
                <Coins className="w-10 h-10 text-amber-500 drop-shadow-md" />
                <div>
                  <p className="text-sm text-muted-foreground">Saldo Disponible</p>
                  <p className="text-3xl font-bold text-foreground">
                    {(profile.points ?? 0).toLocaleString()} <span className="text-lg text-muted-foreground font-medium">pts</span>
                  </p>
                </div>
              </div>

              {profile.role === "admin" && (
                <Button asChild className="w-full bg-slate-800 text-white hover:bg-slate-700">
                  <Link href="/admin" className="flex items-center justify-center gap-2">
                    Panel de Administración
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Tarjeta de Historiales (se mantiene igual, omito el código largo repetido de tu pestaña para que sea rápido, pero está acá abajo) */}
          <Card className="bg-card border-border/50 mt-6 shadow-md">
            <CardContent className="p-4 sm:p-6">
              <Tabs defaultValue="active" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-12 mb-6">
                  <TabsTrigger value="active" className="flex items-center gap-1.5 text-xs sm:text-sm">
                    <TrendingUp className="w-4 h-4" />
                    <span className="hidden sm:inline">Activas</span>
                  </TabsTrigger>
                  <TabsTrigger value="finished" className="flex items-center gap-1.5 text-xs sm:text-sm">
                    <History className="w-4 h-4" />
                    <span className="hidden sm:inline">Finalizadas</span>
                  </TabsTrigger>
                  <TabsTrigger value="bank" className="flex items-center gap-1.5 text-xs sm:text-sm">
                    <Landmark className="w-4 h-4" />
                    <span className="hidden sm:inline">Movimientos</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="space-y-3">
                  {isLoadingBets ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : bets.filter((b) => getMarket(b) && ACTIVE_STATUSES.includes(String(getMarket(b)!.status).toLowerCase())).length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No tenés apuestas activas en este momento.</p>
                  ) : (
                    bets
                      .filter((b) => getMarket(b) && ACTIVE_STATUSES.includes(String(getMarket(b)!.status).toLowerCase()))
                      .map((bet) => (
                        <div key={bet.id} className="rounded-lg border border-border/50 bg-muted/20 p-4 transition-colors hover:bg-muted/40">
                          <p className="font-medium text-foreground line-clamp-2 mb-2">
                            {getMarket(bet)?.title ?? "Mercado"}
                          </p>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Monto: <span className="font-bold text-foreground">{Number(bet.amount ?? 0).toLocaleString()} pts</span>
                            </span>
                            <span className="px-2 py-1 rounded bg-background border border-border/50 text-xs font-medium">
                              Apostaste: <span className={bet.outcome === "yes" ? "text-green-500" : "text-red-500"}>{bet.outcome === "yes" ? "SÍ" : "NO"}</span>
                            </span>
                          </div>
                        </div>
                      ))
                  )}
                </TabsContent>

                <TabsContent value="finished" className="space-y-3">
                  {isLoadingBets ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : bets.filter((b) => getMarket(b) && FINISHED_STATUSES.includes(String(getMarket(b)!.status).toLowerCase())).length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay resultados de tus apuestas.</p>
                  ) : (
                    bets
                      .filter((b) => getMarket(b) && FINISHED_STATUSES.includes(String(getMarket(b)!.status).toLowerCase()))
                      .map((bet) => {
                        const market = getMarket(bet);
                        const won = market?.winning_outcome === bet.outcome;
                        return (
                          <div key={bet.id} className="rounded-lg border border-border/50 bg-muted/20 p-4 opacity-80">
                            <p className="font-medium text-foreground line-clamp-2 mb-2">
                              {market?.title ?? "Mercado"}
                            </p>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                Monto: <span className="font-bold text-foreground">{Number(bet.amount ?? 0).toLocaleString()} pts</span>
                              </span>
                              <span className={`px-2 py-1 rounded border text-xs font-medium ${won ? "bg-green-500/10 border-green-500/30 text-green-500" : "bg-red-500/10 border-red-500/30 text-red-500"}`}>
                                {won ? "GANASTE" : "PERDISTE"}
                              </span>
                            </div>
                          </div>
                        );
                      })
                  )}
                </TabsContent>

                <TabsContent value="bank" className="space-y-3">
                  {isLoadingTransactions ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="text-center py-10 border-2 border-dashed border-border/50 rounded-xl bg-muted/10">
                      <Landmark className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                      <h3 className="font-semibold text-foreground mb-1">No hay movimientos</h3>
                      <p className="text-sm text-muted-foreground">Todavía no tenés transacciones registradas.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {transactions.map((tx) => {
                        const isPositive = tx.amount > 0;
                        return (
                          <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isPositive ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{tx.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(tx.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            <div className={`font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                              {isPositive ? '+' : ''}{tx.amount.toLocaleString()} pts
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Modal para Editar Perfil (FOTO + NOMBRE) */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Perfil</DialogTitle>
            <DialogDescription>
              Personalizá tu avatar y tu nombre de usuario para el ranking.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveProfile} className="space-y-6 pt-4">
            
            {/* Foto de Perfil */}
            <div className="flex flex-col items-center justify-center gap-3">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="relative w-24 h-24 rounded-full bg-muted border-2 border-dashed border-border flex items-center justify-center cursor-pointer overflow-hidden group hover:border-primary transition-colors"
              >
                {previewUrl ? (
                  <>
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground group-hover:text-primary transition-colors">
                    <Camera className="w-8 h-8 mb-1" />
                    <span className="text-[10px] uppercase font-bold">Subir</span>
                  </div>
                )}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageSelect} 
                accept="image/png, image/jpeg, image/webp" 
                className="hidden" 
              />
              <p className="text-xs text-muted-foreground">Recomendado: 1:1 (Cuadrada), máx 2MB</p>
            </div>

            {/* Nombre de Usuario */}
            <div className="space-y-2">
              <Label htmlFor="username">Nombre de Usuario</Label>
              <Input
                id="username"
                placeholder="Ej: lobodeWallStreet99"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                maxLength={20}
                required
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving || !newUsername.trim()}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Guardar Cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal para Cambiar Contraseña */}
      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nueva Contraseña</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Repetir Contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsPasswordModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isChangingPassword || !newPassword || !confirmPassword}>
                {isChangingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Actualizar Contraseña"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}