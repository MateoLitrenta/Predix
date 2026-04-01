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

interface LeaderboardUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  points: number;
  portfolio_value: number;
  total_volume: number;
  total_predictions: number;
  roi: number; // Ahora Supabase nos manda el ROI servido en bandeja
}

type TimeframeType = '1W' | '1M' | '1Y' | 'ALL';

export default function RankingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeType>('ALL');

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDarkMode]);

  // Ahora le pasamos a Supabase qué botón tocamos
  const loadData = async (selectedTimeframe: TimeframeType) => {
    setIsLoading(true);
    const userProfile = await getProfile();
    setCurrentUser(userProfile);

    // Llamamos al nuevo RPC y le pasamos el timeframe por parámetro
    const { data, error } = await supabase.rpc('get_leaderboard_by_timeframe', { p_timeframe: selectedTimeframe });
    
    if (!error && data) {
      setUsers(data as LeaderboardUser[]);
    } else {
      console.error("Error cargando ranking:", error?.message || error);
    }
    setIsLoading(false);
  };

  // Cada vez que el usuario toque un botón distinto, recargamos los datos exactos de esa fecha
  useEffect(() => {
    loadData(timeframe);
  }, [timeframe]); 

  // ORDENAMIENTOS
  const topROI = useMemo(() => [...users].sort((a, b) => b.roi - a.roi).slice(0, 100), [users]);
  const topPortfolio = useMemo(() => [...users].sort((a, b) => b.portfolio_value - a.portfolio_value).slice(0, 10), [users]);
  const topVolume = useMemo(() => [...users].sort((a, b) => b.total_volume - a.total_volume).slice(0, 10), [users]);

  const renderRankBadge = (index: number) => {
    if (index === 0) return <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-sm shrink-0 shadow-[0_0_10px_rgba(245,158,11,0.2)]"><Medal className="w-4 h-4" /></div>;
    if (index === 1) return <div className="w-8 h-8 rounded-full bg-slate-400/20 text-slate-400 flex items-center justify-center font-bold text-sm shrink-0 shadow-[0_0_10px_rgba(148,163,184,0.2)]"><Medal className="w-4 h-4" /></div>;
    if (index === 2) return <div className="w-8 h-8 rounded-full bg-orange-600/20 text-orange-500 flex items-center justify-center font-bold text-sm shrink-0 shadow-[0_0_10px_rgba(234,88,12,0.2)]"><Medal className="w-4 h-4" /></div>;
    return <div className="w-8 h-8 rounded-full bg-muted/50 text-muted-foreground flex items-center justify-center font-bold text-xs shrink-0">{index + 1}</div>;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader 
        points={currentUser?.points ?? 0} 
        isDarkMode={isDarkMode} 
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} 
        onPointsUpdate={() => loadData(timeframe)} 
        userId={currentUser?.id ?? null} 
        userEmail={currentUser?.email ?? null} 
        onOpenAuthModal={() => setIsAuthModalOpen(true)} 
        onSignOut={async () => { await supabase.auth.signOut(); router.push("/"); }} 
        isAdmin={currentUser?.role === "admin"} 
        username={currentUser?.username} 
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
              El Salón de la Fama de PREDIX. Los mejores traders clasificados por su porcentaje de rentabilidad (ROI).
            </p>
          </div>
        </div>

        {isLoading ? (
            <div className="flex items-center justify-center py-32"><Loader2 className="w-10 h-10 animate-spin text-primary opacity-50" /></div>
        ) : users.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-border/50">
            <BarChart3 className="w-12 h-12 text-muted-foreground opacity-20 mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground">Aún no hay traders para mostrar.</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
            
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

                    <div className="flex bg-muted/50 p-1 rounded-xl border border-border/30 w-full md:w-auto overflow-x-auto">
                      {(['1W', '1M', '1Y', 'ALL'] as TimeframeType[]).map((tf) => (
                        <button 
                          key={tf} 
                          onClick={() => setTimeframe(tf)} 
                          className={cn(
                            "px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex-1 md:flex-none", 
                            timeframe === tf ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {tf === '1W' ? 'Semana' : tf === '1M' ? 'Mes' : tf === '1Y' ? 'Año' : 'Histórico'}
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
                            "flex items-center justify-between p-3 sm:p-4 rounded-xl transition-all cursor-pointer border",
                            isMe 
                              ? "bg-primary/10 border-primary/30 hover:bg-primary/20 shadow-sm" 
                              : "bg-muted/10 border-transparent hover:bg-muted/40 hover:border-border/50"
                          )}>
                            <div className="flex items-center gap-4 overflow-hidden">
                              {renderRankBadge(i)}
                              
                              <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center overflow-hidden shrink-0 border-2 border-muted">
                                {user.avatar_url ? <img src={user.avatar_url} alt="av" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-muted-foreground" />}
                              </div>
                              
                              <div className="flex flex-col min-w-0">
                                <span className={cn("font-bold text-base truncate flex items-center gap-2", isMe ? "text-primary" : "text-foreground")}>
                                  {user.username}
                                  {isMe && <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0 uppercase h-4">Vos</Badge>}
                                </span>
                                <span className="text-xs font-medium text-muted-foreground">
                                  {user.portfolio_value.toLocaleString()} pts totales
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center shrink-0 pl-4">
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-sm md:text-base px-3 py-1 font-black border-2", 
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
                        <span className="font-bold text-xs text-amber-600 dark:text-amber-500">{user.portfolio_value.toLocaleString()} pts</span>
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
                  <h3 className="font-bold text-foreground">Top Volumen</h3>
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
                        <span className="font-bold text-xs text-blue-600 dark:text-blue-400">{user.total_volume.toLocaleString()} pts</span>
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