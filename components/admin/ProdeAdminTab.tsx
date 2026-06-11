"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveProdeMatch } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Trophy, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ProdeMatch {
  id: string;
  matchday: string;
  team_home: string;
  team_away: string;
  kickoff_at: string;
  status: string;
  actual_score_home: number | null;
  actual_score_away: number | null;
}

export function ProdeAdminTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const [matches, setMatches] = useState<ProdeMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Estado local para los inputs de puntaje de cada partido
  const [scores, setScores] = useState<Record<string, { home: string, away: string }>>({});
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());

  const fetchMatches = async () => {
    const { data, error } = await supabase
      .from("prode_matches")
      .select("*")
      .order("kickoff_at", { ascending: true });

    if (error) {
      toast({ title: "Error", description: "No se pudieron cargar los partidos.", variant: "destructive" });
    } else if (data) {
      setMatches(data);
      // Inicializar scores con los resultados existentes
      const newScores: Record<string, { home: string, away: string }> = {};
      data.forEach((m) => {
        if (m.actual_score_home !== null && m.actual_score_away !== null) {
          newScores[m.id] = { 
            home: m.actual_score_home.toString(), 
            away: m.actual_score_away.toString() 
          };
        } else {
          newScores[m.id] = { home: "", away: "" };
        }
      });
      setScores(newScores);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const handleScoreChange = (matchId: string, side: "home" | "away", value: string) => {
    setScores(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [side]: value
      }
    }));
  };

  const handleResolve = async (match: ProdeMatch) => {
    const homeStr = scores[match.id]?.home;
    const awayStr = scores[match.id]?.away;

    if (!homeStr || !awayStr) {
      toast({ title: "Atención", description: "Debes ingresar ambos goles.", variant: "destructive" });
      return;
    }

    const homeVal = parseInt(homeStr, 10);
    const awayVal = parseInt(awayStr, 10);

    if (isNaN(homeVal) || isNaN(awayVal)) {
      toast({ title: "Error", description: "Valores no válidos.", variant: "destructive" });
      return;
    }

    setResolvingIds(prev => new Set(prev).add(match.id));

    try {
      const res = await resolveProdeMatch(match.id, homeVal, awayVal);
      if (!res.ok) throw new Error(res.error);
      
      toast({ title: "Partido Resuelto", description: res.message || "Se actualizaron los puntos." });
      
      // Actualizar estado local para reflejar el status finished
      setMatches(prev => prev.map(m => m.id === match.id ? { ...m, status: 'finished', actual_score_home: homeVal, actual_score_away: awayVal } : m));
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error al resolver", description: err.message || "Ocurrió un error inesperado.", variant: "destructive" });
    } finally {
      setResolvingIds(prev => { const n = new Set(prev); n.delete(match.id); return n; });
    }
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-yellow-500" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Trophy className="w-6 h-6 text-yellow-500" />
          Prode Mundialista
        </h2>
        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 font-bold uppercase tracking-widest text-[10px] px-3 py-1">
          {matches.length} Partidos
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {matches.map((match) => {
          const isFinished = match.status === 'finished';
          const isResolving = resolvingIds.has(match.id);
          const score = scores[match.id] || { home: "", away: "" };
          const isComplete = score.home !== "" && score.away !== "";

          return (
            <div key={match.id} className={cn(
              "p-5 rounded-2xl border transition-all flex flex-col gap-4",
              isFinished ? "bg-muted/30 border-border/50" : "bg-card shadow-sm border-border"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{match.matchday}</span>
                {isFinished ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" /> Resuelto</Badge>
                ) : (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px]">{formatDate(match.kickoff_at)}</Badge>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 flex flex-col items-center gap-2">
                  <div className="font-black text-foreground">{match.team_home}</div>
                  <Input 
                    type="number" 
                    min="0"
                    value={score.home} 
                    onChange={(e) => handleScoreChange(match.id, "home", e.target.value)}
                    disabled={isFinished || isResolving}
                    className="w-16 h-12 text-center font-black text-xl bg-background"
                    placeholder="-"
                  />
                </div>
                <div className="font-black text-muted-foreground pt-6">-</div>
                <div className="flex-1 flex flex-col items-center gap-2">
                  <div className="font-black text-foreground">{match.team_away}</div>
                  <Input 
                    type="number" 
                    min="0"
                    value={score.away} 
                    onChange={(e) => handleScoreChange(match.id, "away", e.target.value)}
                    disabled={isFinished || isResolving}
                    className="w-16 h-12 text-center font-black text-xl bg-background"
                    placeholder="-"
                  />
                </div>
              </div>

              <div className="pt-2">
                {isFinished ? (
                  <Button 
                    variant="outline" 
                    disabled 
                    className="w-full font-bold h-10 border-green-500/20 text-green-500 bg-green-500/5"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Puntos Repartidos
                  </Button>
                ) : (
                  <Button 
                    onClick={() => handleResolve(match)}
                    disabled={!isComplete || isResolving}
                    className="w-full font-bold h-10 bg-yellow-500 hover:bg-yellow-400 text-zinc-950"
                  >
                    {isResolving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Cargar Resultado</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
