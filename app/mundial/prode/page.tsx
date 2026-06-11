"use client";

import React, { useState, useEffect, useCallback } from "react";
import { BottomNav } from "@/components/prode/BottomNav";
import { FixtureView } from "@/components/prode/FixtureView";
import { RankingView } from "@/components/prode/RankingView";
import { Match, Prediction } from "@/lib/types/prode";
import { Trophy, CalendarDays, ArrowLeft, Plus, Users, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { CreateTournamentModal } from "@/components/prode/CreateTournamentModal";
import { JoinTournamentModal } from "@/components/prode/JoinTournamentModal";
import { ChampionSelector } from "@/components/prode/ChampionSelector";
import { UserProvider } from "@/components/prode/UserProvider";

type TabType = "torneos" | "posiciones" | "pronosticos" | "fixture";

export default function ProdePage() {
  const [currentTab, setCurrentTab] = useState<TabType>("pronosticos");
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [leagues, setLeagues] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("Usuario");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const router = useRouter();

  const fetchLeagues = useCallback(async (currentUserId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("prode_league_members")
      .select(`
        league_points,
        prode_leagues(id, name)
      `)
      .eq("user_id", currentUserId)
      .eq("status", "approved");

    if (data && !error) {
      setLeagues(data);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    const supabase = createClient();
    
    // 1. Get Session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      router.push("/");
      return;
    }

    const user = session.user;
    setUserId(user.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", user.id)
      .single();
      if (profile) {
        setUsername(profile.username || "Usuario");
        setAvatarUrl(profile.avatar_url);
      }

      // Fetch predictions for this user
      const { data: predsData } = await supabase
        .from("prode_predictions")
        .select("match_id, pred_score_home, pred_score_away")
        .eq("user_id", user.id);
        
      if (predsData) {
        const predsMap: Record<string, Prediction> = {};
        predsData.forEach((p) => {
          predsMap[p.match_id] = p as Prediction;
        });
        setPredictions(predsMap);
      }

      // Fetch leagues for this user
      await fetchLeagues(user.id);

    // 2. Fetch Matches
    const { data: matchesData } = await supabase
      .from("prode_matches")
      .select("id, matchday, team_home, team_away, kickoff_at, status")
      .order("kickoff_at", { ascending: true });

    if (matchesData) {
      setMatches(matchesData as Match[]);
    }

    setIsLoading(false);
  }, [fetchLeagues]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handlePredictionChange = (matchId: string, home: number | null, away: number | null) => {
    setPredictions((prev) => ({
      ...prev,
      [matchId]: { match_id: matchId, pred_score_home: home, pred_score_away: away },
    }));
  };

  const handleTournamentSuccess = () => {
    if (userId) {
      fetchLeagues(userId);
    }
  };

  return (
    <UserProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
        <main className="flex-1 container mx-auto px-4 py-6 md:py-8 max-w-[800px]">
        <div className="mb-8 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <Link href="/mundial" className="inline-flex items-center text-sm font-bold text-zinc-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al Hub
            </Link>
            
            <div className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 rounded-full px-1.5 py-1.5 pr-4 shadow-sm">
              <Avatar className="w-8 h-8 border border-zinc-700">
                <AvatarImage src={avatarUrl || ""} />
                <AvatarFallback className="bg-zinc-800 text-xs font-bold text-yellow-500">
                  {username.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-bold text-zinc-200">{username}</span>
            </div>
          </div>

          <div className="inline-flex items-center self-start gap-2 px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 text-xs font-black uppercase tracking-widest mb-4 border border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.1)]">
            <Trophy className="w-3.5 h-3.5" />
            Prode Oficial
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-2">
            Mundial 2026
          </h1>
          <p className="text-zinc-400 text-sm md:text-base font-medium">
            Pronosticá los resultados, suma puntos y competí por el premio mayor en Zéilo.
          </p>
        </div>

        <div className="hidden md:flex gap-2 mb-8 border-b border-zinc-800 pb-px">
          {[
            { id: "pronosticos", label: "Tus Pronósticos" },
            { id: "fixture", label: "Fixture Completo" },
            { id: "posiciones", label: "Ranking" },
            { id: "torneos", label: "Torneos Privados" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id as TabType)}
              className={cn(
                "px-5 py-3 text-sm font-bold transition-all relative",
                currentTab === tab.id
                  ? "text-yellow-500"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {tab.label}
              {currentTab === tab.id && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.8)] rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        <div className="animate-in fade-in duration-300">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-yellow-500">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p className="font-bold text-zinc-400">Cargando datos del Prode...</p>
            </div>
          ) : (
            <>
              {currentTab === "pronosticos" && (
                <>
                  <ChampionSelector />
                  <FixtureView
                    matches={matches}
                    predictions={predictions}
                    onPredictionChange={handlePredictionChange}
                  />
                </>
              )}

              {currentTab === "posiciones" && (
                <RankingView currentUserId={userId || undefined} />
              )}

              {currentTab === "fixture" && (
                <div className="text-center py-20 bg-zinc-900/50 rounded-3xl border border-dashed border-zinc-800">
                  <CalendarDays className="w-12 h-12 text-zinc-600 mx-auto mb-4 opacity-50" />
                  <h2 className="text-xl font-bold text-zinc-300 mb-2">Fixture Completo</h2>
                  <p className="text-zinc-500 text-sm">Próximamente disponible para ver todos los grupos.</p>
                </div>
              )}

              {currentTab === "torneos" && (
                <div className="flex flex-col gap-6">
                  <div className="text-center py-10 bg-zinc-900/50 rounded-3xl border border-dashed border-zinc-800 flex flex-col items-center">
                    <Trophy className="w-12 h-12 text-zinc-600 mx-auto mb-4 opacity-50" />
                    <h2 className="text-xl font-bold text-zinc-300 mb-2">Torneos de Amigos</h2>
                    <p className="text-zinc-500 text-sm mb-8 max-w-md">
                      Competí de forma privada con tus amigos o compañeros de trabajo.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md px-4">
                      <Button 
                        size="lg" 
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-black rounded-xl"
                      >
                        <Plus className="w-5 h-5 mr-2" />
                        Crear Torneo Nuevo
                      </Button>
                      <Button 
                        size="lg" 
                        variant="outline" 
                        onClick={() => setIsJoinModalOpen(true)}
                        className="flex-1 border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-200 font-bold rounded-xl"
                      >
                        <Users className="w-5 h-5 mr-2" />
                        Unirse con Código
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-lg font-bold text-zinc-200 mb-4 px-1">Mis Torneos Activos</h3>
                    {leagues.length === 0 ? (
                      <div className="text-center py-8 text-zinc-600 text-sm font-medium bg-zinc-900/30 rounded-2xl border border-zinc-800/50">
                        Aún no participas en ningún torneo privado.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {leagues.map((league) => (
                          <Link 
                            href={`/mundial/prode/liga/${league.prode_leagues?.id}`} 
                            key={league.prode_leagues?.id}
                            className="block"
                          >
                            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between hover:border-zinc-700 hover:bg-zinc-800/50 transition-all cursor-pointer">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-yellow-500 border border-zinc-700">
                                  <Trophy className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-bold text-zinc-100 text-sm">
                                    {league.prode_leagues?.name}
                                  </span>
                                  <span className="text-xs font-medium text-zinc-500">
                                    Liga Privada
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-xl font-black text-yellow-500">
                                  {league.league_points || 0}
                                </span>
                                <span className="text-[10px] font-bold text-zinc-500 uppercase">
                                  Pts
                                </span>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <BottomNav currentTab={currentTab} onTabChange={setCurrentTab} />

      <CreateTournamentModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        userId={userId} 
        onSuccess={handleTournamentSuccess}
      />

      <JoinTournamentModal 
        isOpen={isJoinModalOpen} 
        onClose={() => setIsJoinModalOpen(false)} 
        userId={userId} 
        onSuccess={handleTournamentSuccess}
      />
    </div>
    </UserProvider>
  );
}
