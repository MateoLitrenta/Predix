"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getProfile, getLeaderboard } from "@/lib/actions";
import { NavHeader } from "@/components/nav-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trophy, Loader2, ArrowLeft, Medal, User as UserIcon, ChevronRight } from "lucide-react";

interface RankedUser {
  id: string;
  username: string | null;
  points: number;
  avatar_url?: string | null; // <-- Le enseñamos que puede venir una foto
}

export default function RankingPage() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<RankedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const p = await getProfile();
      setProfile(p);

      const { data, error } = await getLeaderboard(50);

      if (error) {
        console.error("Error al cargar el ranking:", error);
      } else if (data) {
        setLeaderboard(data as RankedUser[]);
      }
      setIsLoading(false);
    };

    loadData();
  }, []);

  const getDisplayName = (user: RankedUser) => {
    if (user.username) return user.username;
    if (profile?.id === user.id && profile?.email) {
      return profile.email.split("@")[0];
    }
    return "Usuario Anónimo";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader
        points={profile?.points ?? 0}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onPointsUpdate={() => {}}
        userId={profile?.id ?? null}
        userEmail={profile?.email ?? null}
        onOpenAuthModal={() => router.push("/")}
        onSignOut={async () => {
          await createClient().auth.signOut();
          router.replace("/");
        }}
        isAdmin={profile?.role === "admin"}
        username={profile?.username ?? null}
      />

      <div className="container mx-auto px-4 py-8 flex-1">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground -ml-2">
            <Link href="/" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Volver al Mercado
            </Link>
          </Button>
        </div>

        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4 shadow-inner">
              <Trophy className="w-8 h-8 text-amber-500" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              Ranking de <span className="text-primary">PredicAR</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              Los mejores visionarios de la plataforma. ¿Estás entre los Top 50?
            </p>
          </div>

          <Card className="bg-card border-border/50 shadow-xl overflow-hidden rounded-2xl">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Medal className="w-5 h-5 text-primary" /> Top Global
                </CardTitle>
                <CardDescription>Ordenado por puntos totales</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  Aún no hay usuarios en el ranking.
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {leaderboard.map((user, index) => {
                    const isCurrentUser = profile?.id === user.id;
                    const position = index + 1;

                    return (
                      <Link
                        href={`/profile/${user.id}`}
                        key={user.id}
                        className={`group flex items-center justify-between p-4 sm:px-6 transition-all duration-200 hover:bg-muted/40 cursor-pointer ${
                          isCurrentUser ? "bg-primary/5 border-l-4 border-l-primary" : "border-l-4 border-l-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-4 sm:gap-6">
                          <div className="w-8 flex justify-center font-bold text-lg shrink-0">
                            {position === 1 ? (
                              <Medal className="w-7 h-7 text-amber-400 drop-shadow-md" />
                            ) : position === 2 ? (
                              <Medal className="w-7 h-7 text-slate-300 drop-shadow-md" />
                            ) : position === 3 ? (
                              <Medal className="w-7 h-7 text-amber-700 drop-shadow-md" />
                            ) : (
                              <span className="text-muted-foreground/70">#{position}</span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 sm:gap-4">
                            {/* ACÁ ESTÁ LA MAGIA DE LA FOTO */}
                            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 border overflow-hidden ${
                              position === 1 ? "bg-amber-400/10 text-amber-500 border-amber-400/30" :
                              position === 2 ? "bg-slate-300/10 text-slate-400 border-slate-300/30" :
                              position === 3 ? "bg-amber-700/10 text-amber-600 border-amber-700/30" :
                              "bg-primary/5 text-primary border-primary/20"
                            }`}>
                              {user.avatar_url ? (
                                <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                              ) : (
                                <UserIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                              )}
                            </div>
                            
                            <div>
                              <p className={`font-semibold text-base sm:text-lg flex items-center flex-wrap gap-2 ${isCurrentUser ? "text-primary" : "text-foreground group-hover:text-primary transition-colors"}`}>
                                {getDisplayName(user)}
                                {isCurrentUser && <span className="text-[10px] uppercase tracking-wider font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full">Vos</span>}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold text-lg sm:text-xl text-foreground">
                              {user.points.toLocaleString()}
                            </p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-medium">
                              Puntos
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 -ml-2 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0 hidden sm:block" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}