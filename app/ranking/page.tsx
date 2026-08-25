"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NavHeader } from "@/components/nav-header";
import { AuthModal } from "@/components/auth-modal";
import { getProfile } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, User, Loader2, ArrowLeft, BarChart3, Wallet, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams } from 'next/navigation';
import { useTheme } from "next-themes";
import { calculateUserROI } from "@/lib/utils/roi";
import { getMultipleUsersBaseCapital } from "@/lib/utils/capital";

interface LeaderboardUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  points: number;
  portfolio_value: number;
  total_volume: number;
  total_predictions: number;
  roi: number; 
}

type TimeframeType = '1D' | '1W' | '1M' | 'ALL';

export default function RankingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { isDarkMode, toggleDarkMode } = useTheme();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeType>('ALL');


  const loadData = async (selectedTimeframe: TimeframeType) => {
    if (users.length === 0) {
      setIsLoading(true);
    } else {
      setIsFetching(true);
    }
    const userProfile = await getProfile();
    setCurrentUser(userProfile);

    const { data: rpcData, error } = await supabase
      .rpc('get_leaderboard_by_timeframe', { p_timeframe: selectedTimeframe });
    
    if (!error && rpcData) {
      const userIds = rpcData.map((u: any) => u.user_id);
      if (userIds.length > 0) {
        // 1. Fetch liquid balance (points) from profiles
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, points')
          .in('id', userIds);

        // 2. Fetch market options for AMM pricing
        const { data: optionsData } = await supabase
          .from('market_options')
          .select('*');

        // 3. Fetch user shares with active markets
        const { data: sharesData } = await supabase
          .from('user_shares')
          .select('*, market_options(*, markets(*))')
          .in('user_id', userIds);

        // 4. Fetch Base Capitals via RPC
        const baseCapitalsMap = await getMultipleUsersBaseCapital(supabase, userIds, selectedTimeframe);

        const allOptions = optionsData || [];
        const allShares = sharesData || [];

        // Lógica de cálculo AMM con normalización visual
        const getNormalizedPrice = (optId: string, direction: string) => {
          const opt = allOptions.find((o: any) => o.id === optId);
          if (!opt || opt.is_eliminated) return 0;
          
          const mOptions = allOptions.filter((o: any) => o.market_id === opt.market_id && !o.is_eliminated);
          const rawProbs = mOptions.reduce((acc: any, o: any) => {
            const py = Number(o.pool_yes || 0);
            const pn = Number(o.pool_no || 0);
            const totalPool = py + pn;
            acc[o.id] = totalPool > 0 ? Math.max(0.01, Math.min(0.99, pn / totalPool)) : (1 / (mOptions.length || 1));
            return acc;
          }, {});
          
          const totalProb = Object.values(rawProbs).reduce((sum: any, p: any) => sum + p, 0) as number;
          let probYes = totalProb > 0 ? ((rawProbs[optId] || 0) / totalProb) : (1 / (mOptions.length || 1));
          
          return direction === 'yes' ? probYes : (1 - probYes);
        };

        const profilesMap = new Map((profilesData || []).map((p: any) => [p.id, p]));

        const mergedData = rpcData.map((u: any) => {
          const profileInfo = profilesMap.get(u.user_id);
          
          // Calcular portfolio activo (dinámico)
          let dynamicActiveValue = 0;
          const userSharesList = allShares.filter((s: any) => s.user_id === u.user_id);
          
          userSharesList.forEach((share: any) => {
            const opt = share.market_options;
            const market = opt?.markets;
            if (!market || !opt) return;

            const marketStatus = String(market.status).toLowerCase();
            if (!['active', 'pending'].includes(marketStatus)) return; // solo mercados activos

            const syStr = share.shares_yes_owned !== undefined && share.shares_yes_owned !== null ? share.shares_yes_owned : (share.share_type === 'yes' ? share.shares : 0);
            const snStr = share.shares_no_owned !== undefined && share.shares_no_owned !== null ? share.shares_no_owned : (share.share_type === 'no' ? share.shares : 0);
            const sy = parseFloat(String(syStr)) || 0;
            const sn = parseFloat(String(snStr)) || 0;

            if (sy > 0) dynamicActiveValue += sy * getNormalizedPrice(opt.id, 'yes');
            if (sn > 0) dynamicActiveValue += sn * getNormalizedPrice(opt.id, 'no');
          });

          const dynamicPoints = profileInfo?.points ?? u.points ?? 0;
          const totalPortfolio = Number(dynamicPoints) + Number(dynamicActiveValue);
          
          const baseCapital = baseCapitalsMap[u.user_id] || 10000;
          const { percentage: dynamicRoi } = calculateUserROI(totalPortfolio, baseCapital);

          return {
            ...u,
            points: dynamicPoints,
            portfolio_value: dynamicActiveValue,
            roi: dynamicRoi
          };
        });

        setUsers(mergedData as LeaderboardUser[]);
      } else {
        setUsers([]);
      }
    } else {
      console.error("Error cargando ranking:", error?.message || error);
    }
    setIsLoading(false);
    setIsFetching(false);
  };

  useEffect(() => {
    loadData(timeframe);
  }, [timeframe]); 

  const topROI = useMemo(() => [...users].sort((a, b) => b.roi - a.roi).slice(0, 100), [users]);
  const topPortfolio = useMemo(() => [...users].sort((a, b) => {
    const totalA = Number(a.points || 0) + Number(a.portfolio_value || 0);
    const totalB = Number(b.points || 0) + Number(b.portfolio_value || 0);
    return totalB - totalA;
  }).slice(0, 10), [users]);
  const topVolume = useMemo(() => [...users].sort((a, b) => Number(b.portfolio_value) - Number(a.portfolio_value)).slice(0, 10), [users]);

  const renderRankBadge = (index: number) => {
    if (index === 0) return <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-xs md:text-sm shrink-0 shadow-[0_0_10px_rgba(245,158,11,0.2)]"><Medal className="w-3 h-3 md:w-4 md:h-4" /></div>;
    if (index === 1) return <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-400/20 text-slate-400 flex items-center justify-center font-bold text-xs md:text-sm shrink-0 shadow-[0_0_10px_rgba(148,163,184,0.2)]"><Medal className="w-3 h-3 md:w-4 md:h-4" /></div>;
    if (index === 2) return <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-orange-600/20 text-orange-500 flex items-center justify-center font-bold text-xs md:text-sm shrink-0 shadow-[0_0_10px_rgba(234,88,12,0.2)]"><Medal className="w-3 h-3 md:w-4 md:h-4" /></div>;
    return <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-muted/50 text-muted-foreground flex items-center justify-center font-bold text-[10px] md:text-xs shrink-0">{index + 1}</div>;
  };

  // --- ACÁ ESTÁ EL SKELETON LOADER PARA EL RANKING ---
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavHeader points={currentUser?.points ?? 0} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} onPointsUpdate={() => {}} userId={null} userEmail={null} onOpenAuthModal={() => {}} onSignOut={async () => {}} isAdmin={false} />
        
        <main className="container mx-auto px-4 py-8 flex-1 max-w-6xl">
          <div className="h-8 w-32 bg-muted/60 rounded animate-pulse mb-6" />
          
          <div className="mb-8 md:mb-10">
            <div className="h-10 w-64 bg-muted/60 rounded animate-pulse mb-4" />
            <div className="h-4 w-96 bg-muted/60 rounded animate-pulse" />
          </div>

          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
            {/* Esqueleto Columna Izquierda (Top Rendimiento) */}
            <div className="lg:w-2/3 flex flex-col">
              <div className="bg-card border-border/50 shadow-lg rounded-2xl overflow-hidden flex-1 flex flex-col h-[600px] border">
                <div className="p-6 md:p-8 border-b border-border/20 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-muted/60 animate-pulse shrink-0" />
                    <div className="space-y-2">
                      <div className="h-6 w-32 bg-muted/60 animate-pulse rounded" />
                      <div className="h-3 w-24 bg-muted/60 animate-pulse rounded" />
                    </div>
                  </div>
                  <div className="h-10 w-64 bg-muted/60 animate-pulse rounded-xl" />
                </div>
                <div className="p-4 md:p-6 space-y-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/10 animate-pulse">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-muted/60 shrink-0" />
                        <div className="w-10 h-10 rounded-full bg-muted/60 shrink-0" />
                        <div className="space-y-2">
                          <div className="h-4 w-24 bg-muted/60 rounded" />
                          <div className="h-3 w-16 bg-muted/60 rounded" />
                        </div>
                      </div>
                      <div className="h-8 w-16 bg-muted/60 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Esqueleto Columna Derecha (Ballenas y Volumen) */}
            <div className="lg:w-1/3 flex flex-col gap-6">
              {[...Array(2)].map((_, index) => (
                <div key={index} className="bg-card/50 border border-border/50 shadow-sm rounded-2xl flex-1 flex flex-col h-[288px]">
                  <div className="p-5 border-b border-border/20 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted/60 animate-pulse shrink-0" />
                    <div className="h-5 w-24 bg-muted/60 animate-pulse rounded" />
                  </div>
                  <div className="p-3 space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg animate-pulse">
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 bg-muted/60 rounded" />
                          <div className="w-6 h-6 rounded-full bg-muted/60 shrink-0" />
                          <div className="h-3 w-20 bg-muted/60 rounded" />
                        </div>
                        <div className="h-3 w-16 bg-muted/60 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- RENDER NORMAL ---
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader 
        points={currentUser?.points ?? 0} 
        isDarkMode={isDarkMode} 
        onToggleDarkMode={toggleDarkMode} 
        onPointsUpdate={() => loadData(timeframe)} 
        userId={currentUser?.id ?? null} 
        userEmail={currentUser?.email ?? null} 
        onOpenAuthModal={() => setIsAuthModalOpen(true)} 
        onSignOut={async () => { await supabase.auth.signOut(); router.push("/"); }} 
        isAdmin={currentUser?.role === "admin"} 
        username={currentUser?.username} 
        avatarUrl={currentUser?.avatar_url ?? null}
      />

      <main className="container mx-auto px-4 py-8 flex-1 max-w-6xl">
        <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/"><ArrowLeft className="w-4 h-4 mr-2" /> Volver a Mercados</Link>
        </Button>

        <div className="mb-8 md:mb-10 text-center md:text-left flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-5xl font-black text-foreground flex items-center justify-center md:justify-start gap-3 tracking-tight">
              <Trophy className="w-8 h-8 md:w-10 md:h-10 text-primary" /> Leaderboard
            </h1>
            <p className="text-muted-foreground mt-2 text-sm md:text-base font-medium max-w-xl">
              El Salón de la Fama de ZÉILO. Los mejores traders clasificados por su porcentaje de rentabilidad (ROI).
            </p>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-border/50">
            <BarChart3 className="w-12 h-12 text-muted-foreground opacity-20 mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground">Aún no hay traders para mostrar.</p>
          </div>
        ) : (
          <div className={cn("flex flex-col lg:flex-row gap-6 lg:gap-8 transition-opacity duration-200", isFetching && "opacity-50 pointer-events-none")}>
            
            {/* EL PROTAGONISTA: RANKING PRINCIPAL DE RENDIMIENTO */}
            <div className="lg:w-2/3 flex flex-col">
              <Card className="bg-card border-border/50 shadow-lg rounded-2xl overflow-hidden flex-1 flex flex-col relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                
                <CardContent className="p-0 flex flex-col h-full">
                  <div className="p-6 md:p-8 border-b border-border/20 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <TrendingUp className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-foreground leading-none mb-1">Top Rendimiento</h2>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">% ROI de los usuarios</p>
                      </div>
                    </div>

                    <div className="flex bg-muted/50 p-1 rounded-xl border border-border/30 w-full sm:w-auto overflow-x-auto">
                      {(['1D', '1W', '1M', 'ALL'] as TimeframeType[]).map((tf) => (
                        <button 
                          key={tf} 
                          onClick={() => setTimeframe(tf)} 
                          className={cn(
                            "px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none", 
                            timeframe === tf ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2 max-h-[800px] scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    {topROI.map((user, i) => {
                      const isMe = currentUser?.id === user.user_id;
                      const isProfit = user.roi >= 0;

                      return (
                        <Link href={`/profile/${user.user_id}`} key={`roi-${user.user_id}`}>
                          <div className={cn(
                            "flex items-center justify-between p-2.5 sm:p-4 rounded-xl transition-all cursor-pointer border",
                            isMe 
                              ? "bg-primary/10 border-primary/30 hover:bg-primary/20 shadow-sm" 
                              : "bg-muted/10 border-transparent hover:bg-muted/40 hover:border-border/50"
                          )}>
                            <div className="flex items-center gap-2.5 md:gap-4 overflow-hidden">
                              {renderRankBadge(i)}
                              
                              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-background flex items-center justify-center overflow-hidden shrink-0 border-2 border-muted">
                                {user.avatar_url ? <img src={user.avatar_url} alt="av" className="w-full h-full object-cover" /> : <User className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />}
                              </div>
                              
                              <div className="flex flex-col min-w-0">
                                <span className={cn("font-bold text-sm md:text-base truncate flex items-center gap-2", isMe ? "text-primary" : "text-foreground")}>
                                  {user.username}
                                  {isMe && <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0 uppercase h-4">Vos</Badge>}
                                </span>
                                <span className="text-[10px] md:text-xs font-medium text-muted-foreground">
                                  {Math.floor(Number(user.points || 0) + Number(user.portfolio_value || 0)).toLocaleString('es-AR')} pts totales
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center shrink-0 pl-2 md:pl-4">
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-xs md:text-base px-2 py-0.5 md:px-3 md:py-1 font-black border-2", 
                                  isProfit ? "bg-green-500/10 text-green-600 dark:text-[#00FF00] border-green-500/30" : "bg-red-500/10 text-red-600 dark:text-[#FF0000] border-red-500/30"
                                )}
                              >
                                {isProfit ? '+' : ''}{user.roi.toFixed(2)}%
                              </Badge>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* COLUMNAS SECUNDARIAS (BALLENAS Y VOLUMEN) */}
            <div className="lg:w-1/3 flex flex-col gap-6">
              
              <Card className="bg-card/50 border-border/50 shadow-sm rounded-2xl flex-1 flex flex-col">
                <div className="p-5 border-b border-border/20 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-foreground">Top Ballenas</h3>
                </div>
                <div className="p-3 space-y-1 overflow-y-auto max-h-[350px] scrollbar-thin scrollbar-thumb-border">
                  {topPortfolio.map((user, i) => (
                    <Link href={`/profile/${user.user_id}`} key={`pts-${user.user_id}`}>
                      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <span className="text-xs font-bold text-muted-foreground w-4 text-center">{i + 1}</span>
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                            {user.avatar_url ? <img src={user.avatar_url} alt="av" className="w-full h-full object-cover" /> : <User className="w-3 h-3 opacity-50" />}
                          </div>
                          <span className="font-semibold text-sm text-foreground truncate">{user.username}</span>
                        </div>
                        <span className="font-bold text-xs text-amber-600 dark:text-amber-500">{Math.floor(Number(user.points || 0) + Number(user.portfolio_value || 0)).toLocaleString('es-AR')} pts</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>

              <Card className="bg-card/50 border-border/50 shadow-sm rounded-2xl flex-1 flex flex-col">
                <div className="p-5 border-b border-border/20 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-foreground">Top Inversiones</h3>
                </div>
                <div className="p-3 space-y-1 overflow-y-auto max-h-[350px] scrollbar-thin scrollbar-thumb-border">
                  {topVolume.map((user, i) => (
                    <Link href={`/profile/${user.user_id}`} key={`vol-${user.user_id}`}>
                      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <span className="text-xs font-bold text-muted-foreground w-4 text-center">{i + 1}</span>
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                            {user.avatar_url ? <img src={user.avatar_url} alt="av" className="w-full h-full object-cover" /> : <User className="w-3 h-3 opacity-50" />}
                          </div>
                          <span className="font-semibold text-sm text-foreground truncate">{user.username}</span>
                        </div>
                        <span className="font-bold text-xs text-blue-600 dark:text-blue-400">{Math.floor(Number(user.portfolio_value || 0)).toLocaleString('es-AR')} pts</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>

            </div>
          </div>
        )}
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={() => { setIsAuthModalOpen(false); loadData(timeframe); }} isDarkMode={isDarkMode} />
    </div>
  );
}