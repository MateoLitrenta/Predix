"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NavHeader } from "@/components/nav-header";
import { AuthModal } from "@/components/auth-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ArrowLeft, TrendingUp, TrendingDown, Clock, Coins, History, CheckCheck, X, User as UserIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface MarketDetailClientProps {
  marketId: string;
}

export default function MarketDetailClient({ marketId }: MarketDetailClientProps) {
  const router = useRouter();
  const supabase = createClient();
  
  const [market, setMarket] = useState<any>(null);
  const [bets, setBets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Panel de Apuestas
  const [selectedOption, setSelectedOption] = useState<"yes" | "no" | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [isPlacingBet, setIsPlacingBet] = useState(false);

  // Modal de Resumen de Perfil
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLoadingProfileStats, setIsLoadingProfileStats] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState<any>(null);

  const fetchUserAndProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      setUser(currentUser);
      const { data: pData } = await supabase.from("profiles").select("*").eq("id", currentUser.id).single();
      setProfile(pData);
    } else {
      setUser(null);
      setProfile(null);
    }
  }, [supabase]);

  const fetchData = useCallback(async () => {
    // 1. Traer Mercado
    const { data: mData, error: mError } = await supabase.from("markets").select("*").eq("id", marketId).single();
    if (mError) {
      toast({ title: "Error", description: "Mercado no encontrado", variant: "destructive" });
      router.push("/");
      return;
    }
    setMarket(mData);

    // 2. Traer Historial de Apuestas (Método Infalible)
    const { data: betsData } = await supabase
      .from("bets")
      .select("*")
      .eq("market_id", marketId)
      .order("created_at", { ascending: false });
    
    if (betsData && betsData.length > 0) {
      const userIds = [...new Set(betsData.map(b => b.user_id))];
      
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds);
        
      const profileMap: Record<string, string> = {};
      if (profilesData) {
        profilesData.forEach(p => {
          profileMap[p.id] = p.username || "Usuario Anónimo";
        });
      }

      const finalBets = betsData.map(bet => ({
        ...bet,
        profiles: { username: profileMap[bet.user_id] || "Usuario Anónimo" }
      }));
      
      setBets(finalBets);
    } else {
      setBets([]);
    }
    
    setIsLoading(false);
  }, [marketId, router, supabase]);

  useEffect(() => {
    fetchUserAndProfile();
    fetchData();

    const channel = supabase.channel(`market-${marketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bets", filter: `market_id=eq.${marketId}` }, () => {
        fetchData();
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchUserAndProfile, fetchData, marketId, supabase]);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDarkMode]);

  const handlePlaceBet = async () => {
    if (!user) { setIsAuthModalOpen(true); return; }
    if (!selectedOption || !betAmount) return;

    const numericAmount = parseInt(betAmount, 10);
    const userPoints = profile?.points || 0;

    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast({ title: "Monto inválido", description: "Ingresá una cantidad mayor a 0", variant: "destructive" });
      return;
    }
    if (numericAmount > userPoints) {
      toast({ title: "Saldo Insuficiente", description: `Solo tenés ${userPoints} pts disponibles.`, variant: "destructive" });
      return;
    }

    setIsPlacingBet(true);
    const { error } = await supabase.rpc("realizar_apuesta", {
      p_amount: numericAmount,
      p_market_id: marketId,
      p_outcome: selectedOption,
    });
    setIsPlacingBet(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "¡Apuesta confirmada!", description: `Invertiste ${numericAmount} pts al ${selectedOption.toUpperCase()}` });
      setBetAmount("");
      fetchUserAndProfile();
    }
  };

  // Función para abrir la mini-tarjeta del usuario
  const openUserProfile = async (userId: string, username: string) => {
    setSelectedUserProfile({ id: userId, username, points: 0, rank: 0, winRate: 0, totalResolved: 0, avatar_url: null });
    setIsProfileModalOpen(true);
    setIsLoadingProfileStats(true);

    try {
      // 1. Puntos y Foto del usuario (ACÁ AGREGAMOS avatar_url)
      const { data: pData } = await supabase.from('profiles').select('points, avatar_url').eq('id', userId).single();
      const userPoints = pData?.points || 0;
      const userAvatarUrl = pData?.avatar_url || null;

      // 2. Ranking Global
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gt('points', userPoints);
      const userRank = (count || 0) + 1;

      // 3. Tasa de Acierto (Win Rate)
      const { data: bData } = await supabase
        .from('bets')
        .select('outcome, markets(status, winning_outcome)')
        .eq('user_id', userId);

      let wins = 0;
      let resolvedCount = 0;

      if (bData) {
        bData.forEach((bet) => {
          const m = Array.isArray(bet.markets) ? bet.markets[0] : bet.markets;
          if (m && m.status === 'resolved') {
            resolvedCount++;
            if (m.winning_outcome === bet.outcome) wins++;
          }
        });
      }

      const winRate = resolvedCount > 0 ? Math.round((wins / resolvedCount) * 100) : 0;

      setSelectedUserProfile({
        id: userId,
        username,
        points: userPoints,
        rank: userRank,
        winRate,
        totalResolved: resolvedCount,
        avatar_url: userAvatarUrl // Pasamos la foto al estado del modal
      });
    } catch (err) {
      console.error("Error al cargar resumen del perfil", err);
    } finally {
      setIsLoadingProfileStats(false);
    }
  };

  if (isLoading) return <div className="min-h-screen bg-background flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!market) return null;

  const totalVotes = Number(market.yes_votes) + Number(market.no_votes);
  const yesPercentage = totalVotes === 0 ? 50 : Math.round((Number(market.yes_votes) / totalVotes) * 100);
  const noPercentage = 100 - yesPercentage;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader
        points={profile?.points ?? 10000}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onPointsUpdate={() => fetchUserAndProfile()}
        userId={user?.id ?? null}
        userEmail={user?.email ?? null}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onSignOut={async () => { await supabase.auth.signOut(); fetchUserAndProfile(); }}
        isAdmin={profile?.role === "admin"}
        username={profile?.username}
      />

      <main className="container mx-auto px-4 py-8 flex-1">
        <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/"><ArrowLeft className="w-4 h-4 mr-2" />Volver a Mercados</Link>
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* COLUMNA IZQUIERDA */}
          <div className="lg:col-span-2 space-y-8">
            <div className="flex gap-4 sm:gap-6 items-start">
              {market.image_url && (
                <img src={market.image_url} alt="Mercado" className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shrink-0 shadow-md border border-border/50" />
              )}
              <div>
                <Badge variant="secondary" className="mb-3 capitalize">{market.category}</Badge>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-2">{market.title}</h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-3">
                  <div className="flex items-center gap-1.5"><Coins className="w-4 h-4" />{market.total_volume.toLocaleString()} pts Vol.</div>
                  <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Cierra: {new Date(market.end_date).toLocaleDateString()}</div>
                </div>
              </div>
            </div>

            {market.description && (
              <div className="p-5 rounded-xl bg-muted/30 border border-border/50 text-muted-foreground leading-relaxed">
                {market.description}
              </div>
            )}

            <div className="p-6 rounded-xl border border-border/50 bg-card">
              <h3 className="font-semibold mb-6 flex justify-between">
                <span>Distribución Actual</span>
                <span className="text-muted-foreground font-normal">{totalVotes.toLocaleString()} pts en juego</span>
              </h3>
              <div className="flex justify-between font-bold text-lg mb-3">
                <span className="text-primary">Sí {yesPercentage}%</span>
                <span className="text-red-500">No {noPercentage}%</span>
              </div>
              <div className="h-4 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${yesPercentage}%` }} />
                <div className="h-full bg-red-500 transition-all duration-1000" style={{ width: `${noPercentage}%` }} />
              </div>
              <div className="flex justify-between text-sm text-muted-foreground mt-3 font-medium">
                <span>{market.yes_votes.toLocaleString()} pts</span>
                <span>{market.no_votes.toLocaleString()} pts</span>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><History className="w-5 h-5 text-primary" /> Últimas Apuestas</h3>
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                {bets.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">Nadie ha apostado aún. ¡Sé el primero!</p>
                ) : (
                  <div className="divide-y divide-border/50">
                    {bets.map((bet) => (
                      <div key={bet.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", bet.outcome === 'yes' ? "bg-primary/20 text-primary" : "bg-red-500/20 text-red-500")}>
                            {bet.outcome === 'yes' ? <CheckCheck className="w-4 h-4" /> : <X className="w-4 h-4" />}
                          </div>
                          <div>
                            <button 
                              onClick={() => openUserProfile(bet.user_id, bet.profiles?.username || "Usuario Anónimo")}
                              className="font-medium text-sm hover:text-primary transition-colors hover:underline text-left"
                            >
                              {bet.profiles?.username || "Usuario Anónimo"}
                            </button>
                            <p className="text-xs text-muted-foreground block">{new Date(bet.created_at).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-foreground">{bet.amount.toLocaleString()} pts</p>
                          <p className={cn("text-xs font-medium uppercase", bet.outcome === 'yes' ? "text-primary" : "text-red-500")}>{bet.outcome}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA */}
          <div className="lg:col-span-1 lg:sticky lg:top-24">
            <div className="rounded-2xl border border-border/50 bg-card shadow-xl p-5 sm:p-6">
              <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-500" /> Operar Mercado
              </h2>
              
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setSelectedOption("yes")}
                  className={cn("flex-1 py-3 px-4 rounded-xl font-bold transition-all border-2", selectedOption === "yes" ? "bg-primary border-primary text-primary-foreground shadow-md" : "bg-transparent border-border hover:border-primary/50 text-foreground")}
                >
                  Comprar Sí
                </button>
                <button
                  onClick={() => setSelectedOption("no")}
                  className={cn("flex-1 py-3 px-4 rounded-xl font-bold transition-all border-2", selectedOption === "no" ? "bg-red-500 border-red-500 text-white shadow-md" : "bg-transparent border-border hover:border-red-500/50 text-foreground")}
                >
                  Comprar No
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <Label className="text-muted-foreground mb-1.5 block">Monto a invertir</Label>
                  <div className="relative">
                    <Input type="number" placeholder="Ej: 1000" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="pl-4 h-12 text-lg font-medium" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">pts</span>
                  </div>
                </div>

                {user && (
                  <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-muted/40 border border-border/50">
                    <span className="text-muted-foreground">Tu balance:</span>
                    <span className="font-bold text-foreground">{(profile?.points || 0).toLocaleString()} pts</span>
                  </div>
                )}
                
                <div className="flex gap-2">
                  {[100, 500, 1000].map((amt) => (
                    <Button key={amt} variant="outline" size="sm" className="flex-1 bg-background" onClick={() => setBetAmount(amt.toString())} disabled={!user || amt > (profile?.points || 0)}>+{amt}</Button>
                  ))}
                </div>
              </div>

              <Button size="lg" className={cn("w-full h-12 text-base font-bold", selectedOption === 'no' ? "bg-red-600 hover:bg-red-700 text-white" : "")} disabled={!selectedOption || !betAmount || isPlacingBet} onClick={handlePlaceBet}>
                {isPlacingBet ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Procesando...</> : !user ? "Ingresar para Operar" : !selectedOption ? "Seleccioná Sí o No" : `Confirmar Inversión`}
              </Button>
              <p className="text-center text-xs text-muted-foreground mt-4">Al operar, aceptás bloquear tus puntos hasta que el mercado finalice.</p>
            </div>
          </div>

        </div>
      </main>

      {/* MODAL DE RESUMEN DE PERFIL CON FOTO */}
      <Dialog open={isProfileModalOpen} onOpenChange={setIsProfileModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Resumen del Jugador</DialogTitle>
          </DialogHeader>
          
          {isLoadingProfileStats ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-sm">Analizando estadísticas...</p>
            </div>
          ) : selectedUserProfile ? (
            <div className="flex flex-col items-center gap-4 py-2">
              
              {/* ACÁ ESTÁ EL CAMBIO 3: La foto en el modal */}
              <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center shadow-sm overflow-hidden">
                {selectedUserProfile.avatar_url ? (
                  <img src={selectedUserProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-10 h-10 text-primary" />
                )}
              </div>
              
              <h3 className="text-2xl font-bold text-foreground mt-1">{selectedUserProfile.username}</h3>
              
              <div className="grid grid-cols-2 gap-3 w-full text-center mt-2">
                <div className="bg-muted/30 p-3 rounded-xl border border-border/50 shadow-sm">
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">Puntos</p>
                  <p className="font-bold text-lg text-amber-500">{selectedUserProfile.points.toLocaleString()}</p>
                </div>
                <div className="bg-muted/30 p-3 rounded-xl border border-border/50 shadow-sm">
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">Ranking</p>
                  <p className="font-bold text-lg text-foreground">#{selectedUserProfile.rank}</p>
                </div>
                <div className="bg-muted/30 p-3 rounded-xl border border-border/50 col-span-2 shadow-sm">
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">Tasa de Acierto</p>
                  <p className="font-bold text-2xl text-green-500">
                    {selectedUserProfile.totalResolved > 0 ? `${selectedUserProfile.winRate}%` : 'Sin datos'}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium mt-0.5">
                    De {selectedUserProfile.totalResolved} predicciones finalizadas
                  </p>
                </div>
              </div>

              <Button asChild className="w-full mt-4" size="lg">
                <Link href={`/profile/${selectedUserProfile.id}`}>
                  Ver Perfil Completo
                </Link>
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={() => { setIsAuthModalOpen(false); fetchUserAndProfile(); }} isDarkMode={isDarkMode} />
    </div>
  );
}