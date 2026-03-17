"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { NavHeader } from "@/components/nav-header";
import { CategoryFilter } from "@/components/category-filter";
import { MarketCard } from "@/components/market-card";
import { CreateMarketModal } from "@/components/create-market-modal";
import { AuthModal } from "@/components/auth-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Flame, Clock, TrendingUp, Loader2 } from "lucide-react";
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
  trending?: "up" | "down";
  image_url?: string | null;
  options?: MarketOption[]; // NUEVO: La lista de opciones (Alcaraz, Sinner, etc.)
}

type SortOption = "trending" | "newest" | "volume";

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

    // NUEVO: Pedimos a Supabase que traiga los mercados Y sus opciones juntas
    const { data, error } = await supabase
      .from("markets")
      .select(`
        id, 
        title, 
        category, 
        total_volume, 
        end_date, 
        image_url,
        market_options (id, option_name, color, total_votes)
      `)
      .eq("status", "active")
      .order("total_volume", { ascending: false });

    if (error) {
      console.log("[v0] Error fetching markets:", error.message);
    } else if (data) {
      const marketsWithOptions = data.map((market: any) => ({
        ...market,
        options: market.market_options || [], // Guardamos las opciones
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
        case "trending": return b.total_volume - a.total_volume;
        case "newest": return new Date(b.end_date).getTime() - new Date(a.end_date).getTime();
        case "volume": return b.total_volume - a.total_volume;
        default: return 0;
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

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2 text-balance">
              Mercado de <span className="text-primary">Predicciones</span>
            </h1>
            <p className="text-muted-foreground text-lg">Predecí el futuro y ganá puntos apostando a tus convicciones</p>
          </div>
          <Button onClick={() => user ? setIsCreateModalOpen(true) : setIsAuthModalOpen(true)} className="shrink-0"><Plus className="w-4 h-4 mr-2" /> Crear Mercado</Button>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input placeholder="Buscar mercados..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-card border-border/50" />
            </div>

            <div className="flex gap-2">
              <Button variant={sortBy === "trending" ? "default" : "outline"} size="sm" onClick={() => setSortBy("trending")} className={cn(sortBy !== "trending" && "border-border/50")}><Flame className="w-4 h-4 mr-1.5" /> Popular</Button>
              <Button variant={sortBy === "newest" ? "default" : "outline"} size="sm" onClick={() => setSortBy("newest")} className={cn(sortBy !== "newest" && "border-border/50")}><Clock className="w-4 h-4 mr-1.5" /> Recientes</Button>
              <Button variant={sortBy === "volume" ? "default" : "outline"} size="sm" onClick={() => setSortBy("volume")} className={cn(sortBy !== "volume" && "border-border/50")}><TrendingUp className="w-4 h-4 mr-1.5" /> Volumen</Button>
            </div>
          </div>

          <CategoryFilter selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
        </div>

        <div className="mb-6 text-sm text-muted-foreground">
          Mostrando <span className="font-medium text-foreground">{sortedMarkets.length}</span> mercados
          {selectedCategory !== "all" && <span> en <span className="font-medium text-primary capitalize">{selectedCategory}</span></span>}
        </div>

        {isLoadingMarkets ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {sortedMarkets.map((market) => (
                <MarketCard
                  key={market.id}
                  id={market.id}
                  question={market.title}
                  category={market.category}
                  totalVolume={Number(market.total_volume ?? 0).toLocaleString()}
                  endDate={formatDate(market.end_date)}
                  imageUrl={market.image_url}
                  options={market.options || []} // NUEVO: Pasamos las opciones a la tarjeta
                  userId={user?.id ?? null}
                  userPoints={userPoints}
                  onBetPlaced={handlePointsUpdate}
                  onOpenAuthModal={() => setIsAuthModalOpen(true)}
                />
              ))}
            </div>

            {sortedMarkets.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center"><Search className="w-8 h-8 text-muted-foreground" /></div>
                <h3 className="text-lg font-semibold mb-2">No se encontraron mercados</h3>
                <p className="text-muted-foreground mb-4">Probá con otros filtros o creá tu propio mercado</p>
                <Button onClick={() => setIsCreateModalOpen(true)}><Plus className="w-4 h-4 mr-2" /> Crear Mercado</Button>
              </div>
            )}
          </>
        )}
      </main>

      <Button onClick={() => user ? setIsCreateModalOpen(true) : setIsAuthModalOpen(true)} className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all hover:scale-105" size="icon"><Plus className="w-6 h-6" /></Button>

      <CreateMarketModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} userId={user?.id ?? null} onMarketCreated={fetchMarkets} />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={handleAuthSuccess} isDarkMode={isDarkMode} />
    </div>
  );
}