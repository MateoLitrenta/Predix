"use client";

import React, { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export interface RankingUser {
  id: string;
  username: string;
  avatar_url: string;
  points: number;
  exact_hits: number;
}

interface RankingViewProps {
  currentUserId?: string;
  leaderboardData?: RankingUser[];
  hideTabs?: boolean;
}

export function RankingView({ currentUserId, leaderboardData, hideTabs = false }: RankingViewProps) {
  const [leaderboard, setLeaderboard] = useState<RankingUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (leaderboardData) {
      setLeaderboard(leaderboardData);
      setIsLoading(false);
      return;
    }

    const fetchLeaderboard = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, prode_global_points, prode_global_exact_hits')
        .order('prode_global_points', { ascending: false })
        .order('prode_global_exact_hits', { ascending: false })
        .limit(100);

      if (data && !error) {
        setLeaderboard(
          data.map((u: any) => ({
            id: u.id,
            username: u.username,
            avatar_url: u.avatar_url,
            points: u.prode_global_points || 0,
            exact_hits: u.prode_global_exact_hits || 0,
          }))
        );
      }
      setIsLoading(false);
    };

    fetchLeaderboard();
  }, [leaderboardData]);

  const getPositionStyles = (index: number) => {
    switch (index) {
      case 0:
        return "border-yellow-500 bg-yellow-500/10 shadow-[0_0_15px_rgba(234,179,8,0.15)]"; // Oro
      case 1:
        return "border-zinc-300 bg-zinc-300/10 shadow-[0_0_15px_rgba(212,212,216,0.1)]"; // Plata
      case 2:
        return "border-amber-700 bg-amber-700/10 shadow-[0_0_15px_rgba(180,83,9,0.1)]"; // Bronce
      default:
        return "border-zinc-800 bg-zinc-900/50";
    }
  };

  const getPositionIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="w-5 h-5 text-yellow-500" />;
      case 1:
        return <Trophy className="w-5 h-5 text-zinc-300" />;
      case 2:
        return <Trophy className="w-5 h-5 text-amber-700" />;
      default:
        return <span className="text-zinc-500 font-bold w-5 text-center">{index + 1}</span>;
    }
  };

  const renderContent = () => (
    <div className="space-y-3 pb-24 md:pb-4">
      <div className="flex px-4 py-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
        <div className="w-10 text-center">Pos</div>
        <div className="flex-1 px-2">Jugador</div>
        <div className="w-16 text-right">Plenos</div>
        <div className="w-20 text-right text-yellow-500/80">Puntos</div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 font-medium">
          Aún no hay puntuaciones registradas.
        </div>
      ) : (
        leaderboard.map((user, index) => {
          const isCurrentUser = user.id === currentUserId;

          return (
            <div
              key={user.id}
              className={cn(
                "flex items-center px-4 py-3 rounded-2xl border transition-all",
                getPositionStyles(index),
                isCurrentUser && index > 2 ? "border-yellow-500/50 bg-yellow-500/5" : ""
              )}
            >
              {/* Posición */}
              <div className="w-10 flex justify-center shrink-0">
                {getPositionIcon(index)}
              </div>

              {/* Avatar y Nombre */}
              <div className="flex-1 flex items-center gap-3 px-2 min-w-0">
                <Avatar className={cn("w-10 h-10 border-2", index === 0 ? "border-yellow-500" : index === 1 ? "border-zinc-300" : index === 2 ? "border-amber-700" : "border-zinc-800")}>
                  <AvatarImage src={user.avatar_url || ""} />
                  <AvatarFallback className="bg-zinc-800 text-zinc-400 font-bold">
                    {user.username ? user.username.substring(0, 2).toUpperCase() : "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-sm text-zinc-100 truncate flex items-center gap-2">
                    {user.username || "Usuario"}
                    {isCurrentUser && (
                      <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded uppercase font-black tracking-wider">Tú</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Plenos */}
              <div className="w-16 text-right shrink-0">
                <span className="text-sm font-semibold text-zinc-400">{user.exact_hits || 0}</span>
              </div>

              {/* Puntos */}
              <div className="w-20 text-right shrink-0">
                <span className="text-base font-black text-yellow-500">{user.points || 0}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  if (hideTabs) {
    return <div className="w-full flex flex-col mt-4">{renderContent()}</div>;
  }

  return (
    <div className="w-full h-full flex flex-col">
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-zinc-950 border border-zinc-800 rounded-xl p-1 mb-6">
          <TabsTrigger
            value="general"
            className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-yellow-500 font-bold text-zinc-400 transition-all"
          >
            General
          </TabsTrigger>
          <TabsTrigger
            value="jornadas"
            className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-yellow-500 font-bold text-zinc-400 transition-all"
          >
            Por Jornada
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          {renderContent()}
        </TabsContent>

        <TabsContent value="jornadas" className="mt-0">
          <div className="text-center py-10 text-zinc-500 font-medium">
            El ranking por jornadas estará disponible pronto.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
