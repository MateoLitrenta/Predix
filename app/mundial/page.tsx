"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { NavHeader } from "@/components/nav-header";
import { MarketCard } from "@/components/market-card";
import { CreateMarketModal } from "@/components/create-market-modal";
import { AuthModal } from "@/components/auth-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Loader2, Trophy, Calendar, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useTheme } from "@/components/theme-provider";

interface MarketOption {
  id: string;
  option_name: string;
  color: string;
  total_votes: number;
  is_eliminated?: boolean;
}

interface Market {
  id: string;
  title: string;
  category: string;
  total_volume: number;
  end_date: string;
  status: string;
  winning_outcome?: string | null;
  created_at: string;
  updated_at: string;
  trending?: "up" | "down";
  image_url?: string | null;
  options?: MarketOption[];
}

type SortOption = "trending" | "newest" | "ending_soon" | "volume";
type StatusFilter = "all" | "active" | "resolved";

export default function MundialHubPage() {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("trending");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [userPoints, setUserPoints] = useState(10000);
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(true);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const supabase = createClient();

  const fetchUserProfile = useCallback(
    async (userId: string) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("points, username, role, avatar_url")
        .eq("id", userId)
        .single();

      if (profile) {
        setUserPoints(profile.points ?? 10000);
        setUsername(profile.username ?? null);
        setUserRole(profile.role ?? null);
        setAvatarUrl(profile.avatar_url ?? null);
      }
    },
    [supabase]
  );

  useEffect(() => {
    let isMounted = true;
    
    const fetchUser = async () => {
      setIsLoadingUser(true);
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (currentUser) {
        setUser(currentUser);
        await fetchUserProfile(currentUser.id);
      } else {
        setUser(null);
        setUserPoints(10000);
        setUsername(null);
        setUserRole(null);
        setAvatarUrl(null);
      }
      if (isMounted) setIsLoadingUser(false);
    };

    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
        await fetchUserProfile(session.user.id);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setUserPoints(10000);
        setUsername(null);
        setUserRole(null);
        setAvatarUrl(null);
      }
    });

    return () => { 
      isMounted = false;
      subscription.unsubscribe(); 
    };
  }, [supabase.auth, fetchUserProfile]);

  const fetchMarkets = useCallback(async () => {
    const { data, error } = await supabase
      .from("markets")
      .select(`
        id, 
        title, 
        category, 
        total_volume, 
        end_date, 
        status,
        winning_outcome,
        created_at,
        updated_at,
        image_url,
        market_options (id, option_name, color, total_votes, is_eliminated, pool_yes, pool_no),
        transactions (amount, created_at)
      `)
      .in("status", ["active", "resolved"])
      .eq("is_world_cup", true);

    if (error) {
      console.log("Error fetching Mundial markets:", error.message);
    } else if (data) {
      const marketsWithOptions = data.map((market: any) => {
        const txs = market.transactions || [];
        const dynamicTotalVolume = txs.reduce((acc: number, tx: any) => acc + Math.abs(Number(tx.amount || 0)), 0);
        const lastTxTime = txs.length > 0 ? Math.max(...txs.map((tx: any) => new Date(tx.created_at).getTime())) : 0;
        const lastActivityDate = lastTxTime > 0 ? new Date(lastTxTime).toISOString() : market.updated_at;

        return {
          ...market,
          total_volume: dynamicTotalVolume > 0 ? dynamicTotalVolume : market.total_volume,
          last_activity_at: lastActivityDate,
          options: market.market_options || [],
          trending: Math.random() > 0.6 ? ((Math.random() > 0.5 ? "up" : "down") as "up" | "down") : undefined,
        };
      });
      setMarkets(marketsWithOptions);
    }

    setIsLoadingMarkets(false);
  }, [supabase]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  useEffect(() => {
    const channel = supabase.channel('realtime-mundial-dashboard')
      .on("postgres_changes", { event: "*", schema: "public", table: "markets" }, () => {
        fetchMarkets();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_options" }, () => {
        fetchMarkets();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchMarkets]);

  const handlePointsUpdate = (newPoints: number) => { setUserPoints(newPoints); };
  const handleSignOut = async () => { await supabase.auth.signOut(); };
  const handleAuthSuccess = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) { setUser(currentUser); await fetchUserProfile(currentUser.id); }
  };

  const filteredMarkets = useMemo(() => {
    return markets.filter((market) => {
      const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      const matchesSearch = searchQuery === "" || normalize(market.title).includes(normalize(searchQuery));
      const matchesStatus = 
        statusFilter === "all" || 
        (statusFilter === "active" && market.status === "active") || 
        (statusFilter === "resolved" && market.status === "resolved");

      return matchesSearch && matchesStatus;
    });
  }, [markets, searchQuery, statusFilter]);

  const sortedMarkets = useMemo(() => {
    const now = new Date().getTime();

    return [...filteredMarkets].sort((a, b) => {
      const isAClosed = a.status === 'resolved' || new Date(a.end_date).getTime() <= now;
      const isBClosed = b.status === 'resolved' || new Date(b.end_date).getTime() <= now;

      if (isAClosed && !isBClosed) return 1;
      if (!isAClosed && isBClosed) return -1;

      switch (sortBy) {
        case "trending": {
          const dateA = a.last_activity_at ? new Date(a.last_activity_at).getTime() : new Date(a.created_at).getTime();
          const dateB = b.last_activity_at ? new Date(b.last_activity_at).getTime() : new Date(b.created_at).getTime();
          return dateB - dateA;
        }
        case "newest": {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          return dateB - dateA;
        }
        case "ending_soon": {
          const dateA = new Date(a.end_date).getTime();
          const dateB = new Date(b.end_date).getTime();
          return dateA - dateB;
        }
        case "volume": {
          return (b.total_volume || 0) - (a.total_volume || 0);
        }
        default:
          return 0;
      }
    });
  }, [filteredMarkets, sortBy]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader points={userPoints} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} onPointsUpdate={handlePointsUpdate} userId={user?.id ?? null} userEmail={user?.email ?? null} onOpenAuthModal={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} isAdmin={userRole === "admin"} username={username} avatarUrl={avatarUrl} />

      <main className="container mx-auto px-4 py-6 md:py-8 flex-1 max-w-[1400px]">
        {/* BANNER DE BIENVENIDA */}
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-r from-emerald-500/10 via-primary/5 to-amber-500/10 p-6 md:p-10 mb-8 shadow-sm">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
            <div className="text-center md:text-left">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary mb-3">
                <Sparkles className="w-3.5 h-3.5" /> Predicciones Especiales
              </span>
              <h1 className="text-3xl md:text-5xl font-black text-foreground tracking-tight flex items-center justify-center md:justify-start gap-2.5">
                Copa Mundial de la FIFA 2026 <Trophy className="w-8 h-8 md:w-10 md:h-10 text-amber-500 shrink-0" />
              </h1>
              <p className="text-muted-foreground mt-3 text-sm md:text-base font-medium max-w-2xl text-balance">
                El Hub oficial de ZÉILO para el Mundial de Estados Unidos, México y Canadá 2026. Hacé tus predicciones en cada partido de Argentina, las fases finales, goleadores y quién levantará la copa.
              </p>
              <div className="mt-6 md:mt-8 flex justify-center md:justify-start">
                <Button asChild size="lg" className="bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-black px-8 py-6 rounded-2xl shadow-[0_0_20px_rgba(234,179,8,0.3)] hover:shadow-[0_0_25px_rgba(234,179,8,0.5)] transition-all hover:-translate-y-1">
                  <Link href="/mundial/prode">
                    <Trophy className="w-5 h-5 mr-2" fill="currentColor" />
                    Jugar al Prode con Amigos (Gratis)
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* FILTROS Y BÚSQUEDA */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6 mb-6 pb-4 border-b border-border/40 lg:pb-0 lg:h-14 lg:border-none">
          <div className="relative w-full lg:w-72 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar partidos, equipos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted/20 border-transparent hover:border-border/50 focus-visible:border-primary/50 h-9 rounded-lg text-sm transition-all shadow-none"
            />
          </div>

          <div className="flex-1 flex items-center gap-4 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex bg-muted/50 p-0.5 rounded-lg border border-border/30 shrink-0">
              <Button
                variant={statusFilter === "all" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter("all")}
                className={cn("h-7 rounded-md px-3 text-xs font-bold", statusFilter === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Todos
              </Button>
              <Button
                variant={statusFilter === "active" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter("active")}
                className={cn("h-7 rounded-md px-3 text-xs font-bold", statusFilter === "active" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Activos
              </Button>
              <Button
                variant={statusFilter === "resolved" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter("resolved")}
                className={cn("h-7 rounded-md px-3 text-xs font-bold", statusFilter === "resolved" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Cerrados / Resueltos
              </Button>
            </div>

            <div className="flex gap-1 shrink-0 ml-auto border-l border-border/40 pl-4 items-center">
              <Button variant={sortBy === "trending" ? "secondary" : "ghost"} size="sm" onClick={() => setSortBy("trending")} className={cn("h-8 rounded-md px-2.5 text-xs font-semibold", sortBy === "trending" && "bg-muted/50 text-foreground")}>
                Popular
              </Button>
              <Button variant={sortBy === "newest" ? "secondary" : "ghost"} size="sm" onClick={() => setSortBy("newest")} className={cn("h-8 rounded-md px-2.5 text-xs font-semibold", sortBy === "newest" && "bg-muted/50 text-foreground")}>
                Nuevos
              </Button>
              <Button variant={sortBy === "ending_soon" ? "secondary" : "ghost"} size="sm" onClick={() => setSortBy("ending_soon")} className={cn("h-8 rounded-md px-2.5 text-xs font-semibold", sortBy === "ending_soon" && "bg-muted/50 text-foreground")}>
                Cierran
              </Button>
              <Button variant={sortBy === "volume" ? "secondary" : "ghost"} size="sm" onClick={() => setSortBy("volume")} className={cn("h-8 rounded-md px-2.5 text-xs font-semibold", sortBy === "volume" && "bg-muted/50 text-foreground")}>
                Volumen
              </Button>
            </div>
          </div>

          <Button size="sm" onClick={() => user ? setIsCreateModalOpen(true) : setIsAuthModalOpen(true)} className="hidden lg:flex shrink-0 h-9 px-4 rounded-xl font-bold shadow-sm transition-all">
            <Plus className="w-4 h-4 mr-1.5" /> Crear Mercado Mundial
          </Button>
        </div>

        <div className="mb-4 flex items-center justify-between text-[11px] font-medium text-muted-foreground px-1">
          <p><span className="text-foreground">{sortedMarkets.length}</span> mercados encontrados</p>
        </div>

        {/* LOADING STATE */}
        {isLoadingMarkets ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex flex-col rounded-2xl border border-border/40 bg-card p-4 sm:p-5 h-[260px] animate-pulse">
                <div className="flex gap-3 items-start">
                  <div className="w-10 h-10 rounded-lg bg-muted shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 bg-muted rounded w-1/3 mb-2" />
                    <div className="h-4 bg-muted rounded w-full" />
                    <div className="h-4 bg-muted rounded w-4/5" />
                  </div>
                </div>
                <div className="space-y-2 mt-auto">
                  <div className="h-8 bg-muted rounded w-full" />
                  <div className="h-8 bg-muted rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              {sortedMarkets.map((market) => (
                <MarketCard
                  key={market.id}
                  id={market.id}
                  question={market.title}
                  category={market.category}
                  totalVolume={Math.floor(market.total_volume).toLocaleString('es-AR')}
                  endDate={formatDate(market.end_date)}
                  rawEndDate={market.end_date}
                  imageUrl={market.image_url}
                  options={market.options || []}
                  userId={user?.id ?? null}
                  userPoints={0}
                  status={market.status}
                  winningOutcome={market.winning_outcome}
                  onCategoryClick={() => {}}
                />
              ))}
            </div>

            {sortedMarkets.length === 0 && (
              <div className="text-center py-20 px-4 bg-muted/10 rounded-3xl border border-dashed border-border/50 mt-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-background border border-border/50 flex items-center justify-center shadow-sm">
                  <Trophy className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold mb-2">No se encontraron mercados del Mundial</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">No hay predicciones activas para el Mundial 2026. ¡Sé el primero en abrir el juego!</p>
                <Button size="default" className="rounded-full font-bold shadow-md hover:-translate-y-1 transition-all" onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Crear Mercado Mundial
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      <CreateMarketModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} userId={user?.id ?? null} onMarketCreated={fetchMarkets} />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={handleAuthSuccess} isDarkMode={isDarkMode} />
    </div>
  );
}
