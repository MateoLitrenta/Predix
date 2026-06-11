"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RankingView, RankingUser } from "@/components/prode/RankingView";
import { ArrowLeft, Loader2, Trophy, Copy, Check } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";

export default function LeaguePage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.id as string;
  
  const [leagueName, setLeagueName] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const [leaderboard, setLeaderboard] = useState<RankingUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeagueData = async () => {
      const supabase = createClient();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }

      // Fetch league name
      const { data: league, error: leagueErr } = await supabase
        .from("prode_leagues")
        .select("name, invite_code")
        .eq("id", leagueId)
        .single();
        
      if (leagueErr || !league) {
        setError("Liga no encontrada");
        setIsLoading(false);
        return;
      }
      
      setLeagueName(league.name);
      setInviteCode(league.invite_code);

      // Fetch league members and their profiles
      const { data: members, error: membersErr } = await supabase
        .from("prode_league_members")
        .select(`
          user_id,
          league_points,
          league_exact_hits,
          profiles:user_id ( username, avatar_url )
        `)
        .eq("league_id", leagueId)
        .eq("status", "approved")
        .order("league_points", { ascending: false })
        .order("league_exact_hits", { ascending: false });

      if (!membersErr && members) {
        const rankingData: RankingUser[] = members.map((m: any) => ({
          id: m.user_id,
          username: m.profiles?.username || "Usuario",
          avatar_url: m.profiles?.avatar_url || "",
          points: m.league_points || 0,
          exact_hits: m.league_exact_hits || 0,
        }));
        setLeaderboard(rankingData);
      }

      setIsLoading(false);
    };

    if (leagueId) {
      fetchLeagueData();
    }
  }, [leagueId]);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <p className="text-zinc-400 mb-4 font-bold text-xl">{error}</p>
        <Link href="/mundial/prode">
          <span className="text-yellow-500 font-bold hover:underline">Volver al Prode</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <main className="flex-1 container mx-auto px-4 py-6 md:py-8 max-w-[800px]">
        {/* Header Liga */}
        <div className="mb-8 flex flex-col">
          <div className="flex items-center mb-6">
            <Link href="/mundial/prode" className="inline-flex items-center text-sm font-bold text-zinc-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al Prode
            </Link>
          </div>

          {isLoading ? (
            <div className="h-10 bg-zinc-900 rounded animate-pulse w-2/3 mb-2" />
          ) : (
            <>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-2 flex items-center gap-3">
                <Trophy className="w-8 h-8 text-yellow-500" />
                {leagueName}
              </h1>
              
              {inviteCode && (
                <div className="flex items-center gap-3 mt-2 mb-4 bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 w-fit">
                  <div className="flex flex-col px-2">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Código de Invitación</span>
                    <span className="text-lg font-mono font-black text-yellow-500 tracking-[0.1em]">{inviteCode}</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-zinc-700 hover:bg-zinc-800 hover:text-white h-full"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteCode);
                      setCopied(true);
                      toast({ title: "Código copiado", description: "El código se ha copiado al portapapeles." });
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              )}
            </>
          )}
          <p className="text-zinc-400 text-sm md:text-base font-medium">
            Ranking exclusivo de esta liga privada.
          </p>
        </div>

        {/* Ranking */}
        <div className="animate-in fade-in duration-300">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-yellow-500">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p className="font-bold text-zinc-400">Cargando posiciones...</p>
            </div>
          ) : (
            <div className="bg-zinc-900/30 p-2 rounded-3xl border border-zinc-800">
              <RankingView 
                currentUserId={currentUserId} 
                leaderboardData={leaderboard} 
                hideTabs={true}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
