"use client";

import React, { useState, useEffect } from "react";
import { Match, Prediction } from "@/lib/types/prode";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, Lock, PlayCircle, Check, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { useProdeUser } from "@/components/prode/UserProvider";

interface MatchCardProps {
  match: Match;
  prediction?: Prediction;
  onPredictionChange?: (matchId: string, home: number | null, away: number | null) => void;
}

export function MatchCard({ match, prediction, onPredictionChange }: MatchCardProps) {
  const { userId } = useProdeUser();
  const { toast } = useToast();
  const router = useRouter();
  const [localHome, setLocalHome] = useState<string>(prediction?.pred_score_home?.toString() ?? "");
  const [localAway, setLocalAway] = useState<string>(prediction?.pred_score_away?.toString() ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(!prediction);

  useEffect(() => {
    if (prediction) {
      setLocalHome(prediction.pred_score_home?.toString() ?? "");
      setLocalAway(prediction.pred_score_away?.toString() ?? "");
    }
  }, [prediction]);

  const isPastKickoff = new Date() >= new Date(match.kickoff_at);
  const isLocked = isPastKickoff || match.status === "finished" || match.status === "in_progress";
  
  const handleHomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    setLocalHome(e.target.value);
    setIsSaved(false);
  };

  const handleAwayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    setLocalAway(e.target.value);
    setIsSaved(false);
  };

  const isComplete = localHome !== "" && localAway !== "";

  const savePrediction = async () => {
    console.log("Guardando para ID:", userId);
    console.log("Ejecutando guardado...", { userId, matchId: match.id, localHome, localAway });

    if (isLocked) {
      toast({ title: "Atención", description: "El partido ya está cerrado.", variant: "destructive" });
      return;
    }
    if (!isComplete) {
      toast({ title: "Atención", description: "Falta ingresar los goles.", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({ title: "Atención", description: "Debes iniciar sesión para guardar tus pronósticos.", variant: "destructive" });
      return;
    }

    const homeVal = parseInt(localHome, 10);
    const awayVal = parseInt(localAway, 10);

    if (isNaN(homeVal) || isNaN(awayVal)) {
      toast({ title: "Error", description: "Los valores ingresados no son números válidos.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('prode_predictions')
        .upsert({
          user_id: userId,
          match_id: match.id,
          pred_score_home: homeVal,
          pred_score_away: awayVal,
        }, { onConflict: 'user_id,match_id' }); 

      if (error) throw error;
      
      toast({ title: "Pronóstico guardado", description: "Tu predicción se actualizó con éxito." });
      setIsSaved(true);
      setIsEditing(false);
      setTimeout(() => setIsSaved(false), 3000);
      
      router.refresh();

      if (onPredictionChange) {
        onPredictionChange(match.id, homeVal, awayVal);
      }
    } catch (err: any) {
      console.error("Error saving prediction", err);
      toast({ title: "Error", description: err.message || "No se pudo guardar el pronóstico.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", " -");
  };

  return (
    <Card className={cn("bg-zinc-900/80 border-zinc-800/60 shadow-lg overflow-hidden transition-all hover:border-zinc-700/80")}>
      <CardHeader className="p-3 bg-zinc-950/50 border-b border-zinc-800/60 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center text-zinc-400 text-xs font-medium uppercase tracking-wider">
          <CalendarClock className="w-3.5 h-3.5 mr-1.5" />
          {formatDate(match.kickoff_at)}
        </div>
        {isLocked && !isPastKickoff && match.status === "finished" && (
          <Badge variant="destructive" className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20 text-[10px] font-bold px-2 py-0.5">
            <Lock className="w-3 h-3 mr-1" /> CERRADO
          </Badge>
        )}
        {isLocked && !isPastKickoff && match.status === "in_progress" && (
          <Badge className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border-yellow-500/20 text-[10px] font-bold px-2 py-0.5 animate-pulse">
            <PlayCircle className="w-3 h-3 mr-1" /> EN VIVO
          </Badge>
        )}
        {isPastKickoff && match.status === "scheduled" && (
          <Badge variant="destructive" className="bg-zinc-800/80 text-zinc-400 hover:bg-zinc-800 border-zinc-700/50 text-[10px] font-bold px-2 py-0.5">
            <Lock className="w-3 h-3 mr-1" /> PARTIDO INICIADO
          </Badge>
        )}
      </CardHeader>
      
      <CardContent className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          
          {/* Equipo Local */}
          <div className="flex flex-col items-center flex-1 gap-2">
            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-zinc-800 bg-zinc-950 shadow-inner">
              <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                {match.team_home}
              </div>
            </div>
            <span className="font-bold text-zinc-200 text-sm text-center">{match.team_home}</span>
          </div>

          {/* Centrales */}
          {isEditing && !isLocked ? (
            <div className="flex items-center gap-3 shrink-0">
              <Input
                type="number"
                min="0"
                max="20"
                value={localHome}
                onChange={handleHomeChange}
                disabled={isSaving}
                className={cn(
                  "w-14 h-16 text-center text-2xl font-black rounded-xl bg-zinc-950 border-zinc-800 shadow-inner text-zinc-100 transition-all",
                  "focus-visible:ring-1 focus-visible:ring-yellow-500 focus-visible:border-yellow-500",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-950/50"
                )}
                placeholder="-"
              />
              <span className="text-zinc-600 font-black text-lg">-</span>
              <Input
                type="number"
                min="0"
                max="20"
                value={localAway}
                onChange={handleAwayChange}
                disabled={isSaving}
                className={cn(
                  "w-14 h-16 text-center text-2xl font-black rounded-xl bg-zinc-950 border-zinc-800 shadow-inner text-zinc-100 transition-all",
                  "focus-visible:ring-1 focus-visible:ring-yellow-500 focus-visible:border-yellow-500",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-950/50"
                )}
                placeholder="-"
              />
            </div>
          ) : (
            <div className="flex items-center gap-4 shrink-0 px-6 py-2 bg-zinc-950/50 rounded-2xl border border-zinc-800 shadow-inner">
              <span className="text-4xl font-black text-white">{localHome || "-"}</span>
              <span className="text-zinc-600 font-black text-2xl">-</span>
              <span className="text-4xl font-black text-white">{localAway || "-"}</span>
            </div>
          )}

          {/* Equipo Visitante */}
          <div className="flex flex-col items-center flex-1 gap-2">
            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-zinc-800 bg-zinc-950 shadow-inner">
               <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                {match.team_away}
              </div>
            </div>
            <span className="font-bold text-zinc-200 text-sm text-center">{match.team_away}</span>
          </div>
        </div>

        {/* Action Button */}
        {!isLocked && (
          <div className="pt-2">
            {isEditing ? (
              <Button
                onClick={savePrediction}
                disabled={!isComplete || isSaving}
                className={cn(
                  "w-full font-bold shadow-sm transition-all rounded-xl",
                  isSaved 
                    ? "bg-green-500 hover:bg-green-600 text-white" 
                    : "bg-yellow-500 hover:bg-yellow-400 text-zinc-950"
                )}
              >
                {isSaving ? (
                  "Guardando..."
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Guardar Cambios
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
                className="w-full font-bold shadow-sm transition-all rounded-xl border-zinc-700 hover:bg-zinc-800 hover:text-white"
              >
                Modificar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
