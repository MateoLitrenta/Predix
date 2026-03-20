"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NavHeader } from "@/components/nav-header";
import { AuthModal } from "@/components/auth-modal";
import { getProfile } from "@/lib/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, User, Loader2, ArrowLeft, History, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export default function RankingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [leaders, setLeaders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDarkMode]);

  const loadData = async () => {
    const userProfile = await getProfile();
    setCurrentUser(userProfile);

    // Traemos el ranking con la función SQL rápida (Capital + Inversión)
    const { data, error } = await supabase.rpc('get_leaderboard_stats');
    
    if (data) setLeaders(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader points={currentUser?.points ?? 0} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} onPointsUpdate={() => loadData()} userId={currentUser?.id ?? null} userEmail={currentUser?.email ?? null} onOpenAuthModal={() => setIsAuthModalOpen(true)} onSignOut={async () => { await supabase.auth.signOut(); router.push("/"); }} isAdmin={currentUser?.role === "admin"} username={currentUser?.username} />

      <main className="container mx-auto px-4 py-8 md:py-12 flex-1 max-w-4xl">
        <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/"><ArrowLeft className="w-4 h-4 mr-2" /> Volver a Mercados</Link>
        </Button>

        <div className="text-center mb-12">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 font-bold uppercase tracking-widest text-[10px] px-3 py-1">Salón de la Fama</Badge>
          <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight mb-4 flex items-center justify-center gap-3">
            <Trophy className="w-10 h-10 md:w-12 md:h-12 text-[#FFB900]" /> Top Traders
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto text-sm md:text-base">
            Los inversores con mayor capital bruto de PREDIX. Este ranking mide el <strong>Poder de Fuego</strong> de cada usuario (Liquidez + Inversiones iniciales, sin incluir PnL flotante).
          </p>
        </div>

        {leaders.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-border/50">
            <History className="w-12 h-12 text-muted-foreground opacity-20 mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground">Aún no hay traders para mostrar.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {leaders.map((leader, index) => {
              const isTop3 = index < 3;
              const isMe = currentUser?.id === leader.id;
              const netWorth = Number(leader.portfolio_value) || 0;

              // Estilos para el Top 3
              let medalColor = "";
              let cardStyle = "bg-card hover:bg-muted/30";
              let rankBadge = "bg-muted text-muted-foreground";
              let netWorthColor = "text-foreground";

              if (index === 0) {
                medalColor = "text-[#FFD700]"; // Oro
                cardStyle = "bg-gradient-to-r from-[#FFD700]/10 to-transparent border-[#FFD700]/30 shadow-[#FFD700]/5 hover:from-[#FFD700]/20";
                rankBadge = "bg-[#FFD700] text-black shadow-lg shadow-[#FFD700]/20";
                netWorthColor = "text-[#FFD700]";
              } else if (index === 1) {
                medalColor = "text-[#C0C0C0]"; // Plata
                cardStyle = "bg-gradient-to-r from-[#C0C0C0]/10 to-transparent border-[#C0C0C0]/30 hover:from-[#C0C0C0]/20";
                rankBadge = "bg-[#C0C0C0] text-black shadow-lg";
              } else if (index === 2) {
                medalColor = "text-[#CD7F32]"; // Bronce
                cardStyle = "bg-gradient-to-r from-[#CD7F32]/10 to-transparent border-[#CD7F32]/30 hover:from-[#CD7F32]/20";
                rankBadge = "bg-[#CD7F32] text-white shadow-lg";
              }

              if (isMe && !isTop3) {
                cardStyle = "bg-primary/5 border-primary/30";
                rankBadge = "bg-primary text-primary-foreground";
              }

              return (
                <Link href={`/profile/${leader.id}`} key={leader.id} className="block transition-transform hover:-translate-y-0.5">
                  <Card className={cn("border border-border/50 rounded-2xl overflow-hidden transition-all duration-300", cardStyle)}>
                    <CardContent className="p-4 md:p-5 flex items-center gap-4 md:gap-6">
                      
                      {/* Posición */}
                      <div className="flex flex-col items-center justify-center w-10 md:w-14 shrink-0">
                        {isTop3 ? (
                          <Medal className={cn("w-8 h-8 md:w-10 md:h-10 drop-shadow-md", medalColor)} />
                        ) : (
                          <div className={cn("w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-black text-sm md:text-base", rankBadge)}>
                            {index + 1}
                          </div>
                        )}
                      </div>

                      {/* Avatar y Nombre */}
                      <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                        <div className={cn("w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center overflow-hidden shrink-0 border-2 shadow-sm", isTop3 ? `border-[${medalColor}]/50` : "border-background bg-primary/10")}>
                          {leader.avatar_url ? (
                            <img src={leader.avatar_url} alt={leader.username} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-6 h-6 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-lg md:text-xl text-foreground truncate flex items-center gap-2">
                            {leader.username || "Usuario"}
                            {isMe && <Badge className="text-[9px] h-4 px-1 bg-primary text-primary-foreground">VOS</Badge>}
                          </p>
                          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mt-0.5">
                            <History className="w-3.5 h-3.5" /> {leader.total_bets} operaciones
                          </p>
                        </div>
                      </div>

                      {/* Poder de Fuego */}
                      <div className="text-right shrink-0">
                        <p className="text-[10px] md:text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1 flex items-center justify-end gap-1"><Wallet className="w-3 h-3" /> Poder de Fuego</p>
                        <div className={cn("flex items-baseline justify-end gap-1 font-black text-2xl md:text-3xl leading-none", netWorthColor)}>
                          {netWorth.toLocaleString()}
                          <span className="text-xs font-bold text-muted-foreground">pts</span>
                        </div>
                      </div>

                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={() => { setIsAuthModalOpen(false); loadData(); }} isDarkMode={isDarkMode} />
    </div>
  );
}