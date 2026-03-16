"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NavHeader } from "@/components/nav-header";
import { AuthModal } from "@/components/auth-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ArrowLeft, User as UserIcon, Calendar, Trophy, Coins, History, CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface ProfileClientProps {
  profileId: string;
}

export default function ProfileClient({ profileId }: ProfileClientProps) {
  const router = useRouter();
  const supabase = createClient();
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const [viewedProfile, setViewedProfile] = useState<any>(null);
  const [userBets, setUserBets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAuth = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user);
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setMyProfile(data);
    }
  }, [supabase]);

  const fetchViewedProfileData = useCallback(async () => {
    // ACÁ ESTÁ EL CAMBIO 1: Agregamos avatar_url al select
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, points, avatar_url") 
      .eq("id", profileId)
      .single();

    if (profileError) {
      console.error("Error de Supabase cargando el perfil:", profileError);
      toast({ title: "Error", description: "No se pudo cargar el perfil del usuario.", variant: "destructive" });
      router.push("/ranking");
      return;
    }
    setViewedProfile(profileData);

    const { data: betsData, error: betsError } = await supabase
      .from("bets")
      .select("*, markets(title, category, status, winning_outcome)")
      .eq("user_id", profileId)
      .order("created_at", { ascending: false });

    if (betsError) {
      console.error("Error cargando apuestas:", betsError);
    }

    setUserBets(betsData || []);
    setIsLoading(false);
  }, [profileId, router, supabase]);

  useEffect(() => {
    fetchAuth();
    fetchViewedProfileData();
  }, [fetchAuth, fetchViewedProfileData]);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDarkMode]);

  if (isLoading) return <div className="min-h-screen bg-background flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!viewedProfile) return null;

  const isMe = currentUser?.id === profileId;
  const displayName = viewedProfile.username || "Usuario Anónimo";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader
        points={myProfile?.points ?? 10000}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onPointsUpdate={() => fetchAuth()}
        userId={currentUser?.id ?? null}
        userEmail={currentUser?.email ?? null}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onSignOut={async () => { await supabase.auth.signOut(); router.push("/"); }}
        isAdmin={myProfile?.role === "admin"}
        username={myProfile?.username}
      />

      <main className="container mx-auto px-4 py-8 flex-1 max-w-5xl">
        <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/ranking"><ArrowLeft className="w-4 h-4 mr-2" />Volver al Ranking</Link>
        </Button>

        {/* CABECERA DEL PERFIL */}
        <div className="bg-card border border-border/50 rounded-2xl p-6 sm:p-8 mb-8 shadow-sm flex flex-col sm:flex-row items-center sm:items-start gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          
          {/* ACÁ ESTÁ EL CAMBIO 2: Mostramos la foto si existe */}
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-primary/10 border-4 border-background shadow-lg flex items-center justify-center shrink-0 relative z-10 overflow-hidden">
            {viewedProfile.avatar_url ? (
              <img src={viewedProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-12 h-12 sm:w-16 sm:h-16 text-primary" />
            )}
          </div>

          <div className="flex-1 text-center sm:text-left relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <h1 className="text-3xl font-bold text-foreground">{displayName}</h1>
              {isMe && <Badge variant="default" className="w-fit mx-auto sm:mx-0">Tu Perfil Público</Badge>}
            </div>
            
            <div className="flex flex-wrap justify-center sm:justify-start gap-4 mt-6">
              <div className="bg-background border border-border/50 rounded-xl p-4 flex items-center gap-4 min-w-[200px]">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center"><Trophy className="w-6 h-6 text-amber-500" /></div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-0.5">Puntos Totales</p>
                  <p className="text-2xl font-bold text-foreground">{viewedProfile.points.toLocaleString()}</p>
                </div>
              </div>
              <div className="bg-background border border-border/50 rounded-xl p-4 flex items-center gap-4 min-w-[200px]">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center"><History className="w-6 h-6 text-blue-500" /></div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-0.5">Apuestas</p>
                  <p className="text-2xl font-bold text-foreground">{userBets.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* HISTORIAL DE APUESTAS PÚBLICO */}
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <History className="w-6 h-6 text-primary" /> Historial de Predicciones
        </h2>
        
        <Card className="bg-card border-border/50 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {userBets.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>{isMe ? "Aún no hiciste ninguna predicción." : "Este usuario aún no ha realizado predicciones."}</p>
                {isMe && <Button asChild className="mt-4"><Link href="/">Ir a apostar</Link></Button>}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {userBets.map((bet) => {
                  const market = bet.markets;
                  const isResolved = market?.status === 'resolved';
                  const won = isResolved && market?.winning_outcome === bet.outcome;
                  const lost = isResolved && market?.winning_outcome !== bet.outcome;

                  return (
                    <Link href={`/market/${bet.market_id}`} key={bet.id} className="block p-5 sm:p-6 hover:bg-muted/30 transition-colors group">
                      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-[10px] uppercase">{market?.category || "Mercado"}</Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {new Date(bet.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <h3 className="font-semibold text-base sm:text-lg text-foreground group-hover:text-primary transition-colors line-clamp-2 pr-4">
                            {market?.title || "Mercado no disponible"}
                          </h3>
                        </div>

                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 sm:gap-8 bg-muted/10 sm:bg-transparent p-4 sm:p-0 rounded-xl border sm:border-none border-border/50">
                          
                          <div className="flex flex-col min-w-[100px]">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Inversión</p>
                            <p className="font-bold text-foreground flex items-center gap-1.5 text-base">
                              <Coins className="w-4 h-4 text-amber-500" /> {bet.amount.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">pts</span>
                            </p>
                          </div>

                          <div className="flex flex-col min-w-[80px]">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Posición</p>
                            <div className={cn(
                              "inline-flex items-center justify-center px-3 py-1 rounded-md text-sm font-bold w-fit",
                              bet.outcome === 'yes' ? "bg-primary/10 text-primary border border-primary/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
                            )}>
                              {bet.outcome === 'yes' ? 'SÍ' : 'NO'}
                            </div>
                          </div>

                          <div className="flex flex-col min-w-[100px] sm:items-end w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1 hidden sm:block">Estado</p>
                            <div className="w-full sm:w-auto">
                              {!isResolved ? (
                                <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 w-full sm:w-auto justify-center sm:justify-end text-xs py-1">En Juego</Badge>
                              ) : won ? (
                                <Badge variant="default" className="bg-green-500 hover:bg-green-600 w-full sm:w-auto justify-center sm:justify-end gap-1.5 text-xs py-1"><CheckCircle2 className="w-3.5 h-3.5" /> ¡Ganó!</Badge>
                              ) : lost ? (
                                <Badge variant="destructive" className="w-full sm:w-auto justify-center sm:justify-end gap-1.5 opacity-90 text-xs py-1"><XCircle className="w-3.5 h-3.5" /> Perdió</Badge>
                              ) : null}
                            </div>
                          </div>

                        </div>

                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </main>
      
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={() => { setIsAuthModalOpen(false); fetchAuth(); }} isDarkMode={isDarkMode} />
    </div>
  );
}