"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { NavHeader } from "@/components/nav-header";
import { CategoryFilter } from "@/components/category-filter";
import { MarketCard } from "@/components/market-card";
import { CreateMarketModal } from "@/components/create-market-modal";
import { AuthModal } from "@/components/auth-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Flame, Clock, TrendingUp, Loader2, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface MarketOption {
  id: string;
  option_name: string;
  color: string;
  total_votes: number;
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

export default function PredictionMarketDashboard() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("trending");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [userPoints, setUserPoints] = useState(10000);
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(true);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const supabase = createClient();

  const fetchUserProfile = useCallback(
    async (userId: string) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("points, username, role")
        .eq("id", userId)
        .single();

      if (profile) {
        setUserPoints(profile.points ?? 10000);
        setUsername(profile.username ?? null);
        setUserRole(profile.role ?? null);
      }
    },
    [supabase]
  );

  useEffect(() => {
    const fetchUser = async () => {
      setIsLoadingUser(true);
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (currentUser) {
        setUser(currentUser);
        await fetchUserProfile(currentUser.id);
      } else {
        setUser(null);
        setUserPoints(10000);
        setUsername(null);
        setUserRole(null);
      }
      setIsLoadingUser(false);
    };

    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
        await fetchUserProfile(session.user.id);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setUserPoints(10000);
        setUsername(null);
        setUserRole(null);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [supabase.auth, fetchUserProfile]);

  const fetchMarkets = useCallback(async () => {
    setIsLoadingMarkets(true);

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
        market_options (id, option_name, color, total_votes)
      `)
      .in("status", ["active", "resolved"]); 

    if (error) {
      console.log("[v0] Error fetching markets:", error.message);
    } else if (data) {
      const marketsWithOptions = data.map((market: any) => ({
        ...market,
        options: market.market_options || [],
        trending: Math.random() > 0.6 ? ((Math.random() > 0.5 ? "up" : "down") as "up" | "down") : undefined,
      }));
      setMarkets(marketsWithOptions);
    }

    setIsLoadingMarkets(false);
  }, [supabase]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  useEffect(() => {
    const channel = supabase.channel('realtime-markets')
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "markets" }, () => {
         fetchMarkets(); 
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchMarkets]);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDarkMode]);

  const handlePointsUpdate = (newPoints: number) => { setUserPoints(newPoints); };
  const handleSignOut = async () => { await supabase.auth.signOut(); };
  const handleAuthSuccess = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) { setUser(currentUser); await fetchUserProfile(currentUser.id); }
  };

  const filteredMarkets = useMemo(() => {
    return markets.filter((market) => {
      const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const matchesCategory = selectedCategory === "all" || normalize(market.category) === normalize(selectedCategory);
      const matchesSearch = searchQuery === "" || normalize(market.title).includes(normalize(searchQuery));
      return matchesCategory && matchesSearch;
    });
  }, [markets, selectedCategory, searchQuery]);

  const sortedMarkets = useMemo(() => {
    return [...filteredMarkets].sort((a, b) => {
      switch (sortBy) {
        case "trending": 
          return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
        case "newest": 
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "ending_soon":
          return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
        case "volume": 
          return b.total_volume - a.total_volume;
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
    <div className="min-h-screen bg-background">
      <NavHeader points={userPoints} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} onPointsUpdate={handlePointsUpdate} userId={user?.id ?? null} userEmail={user?.email ?? null} onOpenAuthModal={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} isAdmin={userRole === "admin"} username={username} />

      <main className="container mx-auto px-4 py-8 md:py-10 max-w-[1400px]">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold mb-2 tracking-tight text-balance">
              Mercado de <span className="text-primary">Predicciones</span>
            </h1>
            <p className="text-muted-foreground text-sm md:text-base font-medium">Predecí el futuro y ganá puntos apostando a tus convicciones</p>
          </div>
          <Button onClick={() => user ? setIsCreateModalOpen(true) : setIsAuthModalOpen(true)} className="hidden md:flex shrink-0 h-11 px-6 rounded-full font-bold shadow-lg hover:shadow-primary/25 transition-all hover:-translate-y-1">
            <Plus className="w-4 h-4 mr-2" /> Crear Mercado
          </Button>
        </div>

        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4 sm:p-5 mb-8 shadow-sm">
          <div className="flex flex-col xl:flex-row gap-4 xl:items-center">
            
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar mercados, eventos, debates..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="pl-11 bg-background border-border/60 h-11 rounded-full text-sm focus-visible:ring-primary/30 transition-all shadow-inner" 
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 xl:pb-0 -mx-4 px-4 xl:mx-0 xl:px-0 xl:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <Button variant={sortBy === "trending" ? "default" : "secondary"} onClick={() => setSortBy("trending")} className={cn("whitespace-nowrap shrink-0 h-9 rounded-full text-sm font-semibold transition-all", sortBy !== "trending" && "hover:bg-muted bg-background border border-border/50")}>
                <Flame className={cn("w-3.5 h-3.5 mr-2", sortBy === "trending" ? "text-primary-foreground" : "text-orange-500")} /> Popular
              </Button>
              <Button variant={sortBy === "newest" ? "default" : "secondary"} onClick={() => setSortBy("newest")} className={cn("whitespace-nowrap shrink-0 h-9 rounded-full text-sm font-semibold transition-all", sortBy !== "newest" && "hover:bg-muted bg-background border border-border/50")}>
                <Clock className={cn("w-3.5 h-3.5 mr-2", sortBy === "newest" ? "text-primary-foreground" : "text-blue-400")} /> Recientes
              </Button>
              <Button variant={sortBy === "ending_soon" ? "default" : "secondary"} onClick={() => setSortBy("ending_soon")} className={cn("whitespace-nowrap shrink-0 h-9 rounded-full text-sm font-semibold transition-all", sortBy !== "ending_soon" && "hover:bg-muted bg-background border border-border/50")}>
                <Timer className={cn("w-3.5 h-3.5 mr-2", sortBy === "ending_soon" ? "text-primary-foreground" : "text-red-400")} /> Próx. a terminar
              </Button>
              <Button variant={sortBy === "volume" ? "default" : "secondary"} onClick={() => setSortBy("volume")} className={cn("whitespace-nowrap shrink-0 h-9 rounded-full text-sm font-semibold transition-all", sortBy !== "volume" && "hover:bg-muted bg-background border border-border/50")}>
                <TrendingUp className={cn("w-3.5 h-3.5 mr-2", sortBy === "volume" ? "text-primary-foreground" : "text-green-400")} /> Volumen
              </Button>
            </div>
          </div>

          <div className="h-px w-full bg-border/50 my-4" />

          <div className="overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <CategoryFilter selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between text-xs font-medium text-muted-foreground px-1">
          <p>Explorando <span className="font-bold text-foreground">{sortedMarkets.length}</span> mercados {selectedCategory !== "all" && <span>en <span className="text-primary capitalize">{selectedCategory}</span></span>}</p>
        </div>

        {/* ACÁ ESTÁ LA MAGIA DEL SKELETON LOADER */}
        {isLoadingMarkets ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex flex-col rounded-2xl border border-border/40 bg-card p-4 sm:p-5 h-[260px] animate-in fade-in duration-500" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex gap-3 items-start">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-muted/60 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 bg-muted/60 animate-pulse rounded w-1/3 mb-2" />
                    <div className="h-4 bg-muted/60 animate-pulse rounded w-full" />
                    <div className="h-4 bg-muted/60 animate-pulse rounded w-4/5" />
                  </div>
                </div>
                <div className="space-y-2 mt-auto">
                  <div className="h-8 bg-muted/60 animate-pulse rounded w-full" />
                  <div className="h-8 bg-muted/60 animate-pulse rounded w-full" />
                </div>
                <div className="flex justify-between pt-4 mt-4 border-t border-border/40">
                  <div className="h-3 bg-muted/60 animate-pulse rounded w-1/4" />
                  <div className="h-3 bg-muted/60 animate-pulse rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
              {sortedMarkets.map((market) => (
                <MarketCard
                  key={market.id}
                  id={market.id}
                  question={market.title}
                  category={market.category}
                  totalVolume={market.total_volume.toLocaleString()}
                  endDate={formatDate(market.end_date)} 
                  rawEndDate={market.end_date}          
                  imageUrl={market.image_url}
                  options={market.options || []}
                  userId={user?.id ?? null}
                  userPoints={0}
                  status={market.status}                
                  winningOutcome={market.winning_outcome} 
                  onCategoryClick={setSelectedCategory}
                />
              ))}
            </div>

            {sortedMarkets.length === 0 && (
              <div className="text-center py-20 px-4 bg-muted/10 rounded-3xl border border-dashed border-border/50 mt-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-background border border-border/50 flex items-center justify-center shadow-sm">
                  <Search className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold mb-2">No se encontraron mercados</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">No hay predicciones activas con estos filtros. Podés ser el primero en abrir el debate.</p>
                <Button size="default" className="rounded-full font-bold shadow-md hover:-translate-y-1 transition-all" onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Crear Nuevo Mercado
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      <Button onClick={() => user ? setIsCreateModalOpen(true) : setIsAuthModalOpen(true)} className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all hover:scale-105 md:hidden z-40" size="icon">
        <Plus className="w-6 h-6" />
      </Button>

      <CreateMarketModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} userId={user?.id ?? null} onMarketCreated={fetchMarkets} />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={handleAuthSuccess} isDarkMode={isDarkMode} />
    </div>
  );
}