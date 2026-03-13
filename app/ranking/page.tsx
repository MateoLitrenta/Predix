"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/actions";
import { NavHeader } from "@/components/nav-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trophy, Loader2, ArrowLeft, Medal, User as UserIcon } from "lucide-react";

// Sacamos 'email' de la interfaz porque no existe en la tabla pública
interface RankedUser {
  id: string;
  username: string | null;
  points: number;
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

      const supabase = createClient();
      
      // Acá estaba el error: le estábamos pidiendo el 'email' y rompía la consulta
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, points")
        .order("points", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error al cargar el ranking:", error.message);
      } else if (data) {
        setLeaderboard(data as RankedUser[]);
      }
      setIsLoading(false);
    };

    loadData();
  }, []);

  const getDisplayName = (user: RankedUser) => {
    // Si tiene username oficial, lo usamos
    if (user.username) return user.username;
    
    // Si no tiene, pero sos VOS mirando el ranking, sacamos el nombre de tu sesión actual
    if (profile?.id === user.id && profile?.email) {
      return profile.email.split("@")[0];
    }
    
    return "Usuario Anónimo";
  };

  return (
    <div className="min-h-screen bg-background">
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

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Volver al Mercado
            </Link>
          </Button>
        </div>

        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/20 mb-4">
              <Trophy className="w-8 h-8 text-amber-500" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              Ranking de <span className="text-primary">PredicAR</span>
            </h1>
            <p className="text-muted-foreground">
              Los mejores visionarios de la plataforma. ¿Estás entre los Top 50?
            </p>
          </div>

          <Card className="bg-card border-border/50 shadow-xl">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Top Global</CardTitle>
                <CardDescription>Ordenado por puntos totales</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Aún no hay usuarios en el ranking.
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {leaderboard.map((user, index) => {
                    const isCurrentUser = profile?.id === user.id;
                    const position = index + 1;

                    return (
                      <div
                        key={user.id}
                        className={`flex items-center justify-between p-4 transition-colors hover:bg-muted/30 ${
                          isCurrentUser ? "bg-primary/5 border-l-4 border-l-primary" : ""
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-8 flex justify-center font-bold text-lg">
                            {position === 1 ? (
                              <Medal className="w-6 h-6 text-amber-400 drop-shadow-md" />
                            ) : position === 2 ? (
                              <Medal className="w-6 h-6 text-slate-300 drop-shadow-md" />
                            ) : position === 3 ? (
                              <Medal className="w-6 h-6 text-amber-700 drop-shadow-md" />
                            ) : (
                              <span className="text-muted-foreground">#{position}</span>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              position === 1 ? "bg-amber-400/20 text-amber-500" :
                              position === 2 ? "bg-slate-300/20 text-slate-400" :
                              position === 3 ? "bg-amber-700/20 text-amber-600" :
                              "bg-primary/10 text-primary"
                            }`}>
                              <UserIcon className="w-5 h-5" />
                            </div>
                            <div>
                              <p className={`font-semibold ${isCurrentUser ? "text-primary" : "text-foreground"}`}>
                                {getDisplayName(user)}
                                {isCurrentUser && <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Vos</span>}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="font-bold text-lg text-foreground">
                            {user.points.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">
                            Puntos
                          </p>
                        </div>
                      </div>
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