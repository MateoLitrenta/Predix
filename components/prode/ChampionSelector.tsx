"use client";

import React, { useState, useEffect } from "react";
import { Trophy, Save, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { useProdeUser } from "@/components/prode/UserProvider";
import { cn } from "@/lib/utils";

const TEAMS = [
  "Alemania", "Argelia", "Argentina", "Australia", "Austria", "Bosnia y Herzegovina", 
  "Brasil", "Bélgica", "Cabo Verde", "Canadá", "Colombia", "Corea del Sur", 
  "Costa de Marfil", "Croacia", "Curazao", "Ecuador", "Egipto", "Escocia", 
  "España", "Estados Unidos", "Francia", "Ghana", "Haití", "Inglaterra", 
  "Irak", "Irán", "Japón", "Jordania", "Marruecos", "México", "Noruega", 
  "Nueva Zelanda", "Panamá", "Paraguay", "Países Bajos", "Portugal", "Qatar", 
  "RD Congo", "Senegal", "Sudáfrica", "Suecia", "Suiza", "Turquía", "Túnez", 
  "Uruguay", "Uzbekistán"
].sort();

export function ChampionSelector() {
  const { userId } = useProdeUser();
  const { toast } = useToast();
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [savedTeam, setSavedTeam] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchChampion = async () => {
      if (!userId) {
        setIsLoading(false);
        return;
      }
      
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user_champion_predictions')
        .select('team_code')
        .eq('user_id', userId)
        .single();
        
      if (data) {
        setSavedTeam(data.team_code);
        setSelectedTeam(data.team_code);
      }
      setIsLoading(false);
    };
    
    fetchChampion();
  }, [userId]);

  const handleSave = async () => {
    if (!selectedTeam) {
      toast({ title: "Atención", description: "Selecciona un equipo primero.", variant: "destructive" });
      return;
    }
    
    if (!userId) {
      toast({ title: "Atención", description: "Debes iniciar sesión para guardar tu candidato.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('user_champion_predictions')
        .upsert({ user_id: userId, team_code: selectedTeam }, { onConflict: 'user_id' });
        
      if (error) throw error;
      
      setSavedTeam(selectedTeam);
      toast({ title: "¡Candidato guardado!", description: "Tu predicción de campeón ha sido registrada." });
    } catch (err: any) {
      console.warn("Advertencia al guardar campeón:", err);
      
      let errorMessage = "Ocurrió un error inesperado.";
      if (err?.code === '42P01') {
        errorMessage = "La tabla 'user_champion_predictions' no existe en la base de datos.";
      } else if (err?.code === '42501') {
        errorMessage = "Faltan políticas de seguridad (RLS) en la tabla.";
      } else if (err?.message) {
        errorMessage = err.message;
      }

      toast({ 
        title: "Error al guardar", 
        description: errorMessage, 
        variant: "destructive" 
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-24 bg-zinc-900/50 rounded-2xl animate-pulse flex items-center justify-center mb-6">
        <Loader2 className="w-6 h-6 text-yellow-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn(
      "w-full rounded-2xl p-4 md:p-6 flex flex-col sm:flex-row items-center gap-4 justify-between border shadow-lg mb-6 transition-all",
      savedTeam ? "bg-yellow-500/10 border-yellow-500/30" : "bg-zinc-900/80 border-zinc-800"
    )}>
      <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-3 flex-1 w-full">
        <div className={cn(
          "p-3 rounded-full flex shrink-0",
          savedTeam ? "bg-yellow-500/20 text-yellow-500" : "bg-zinc-800 text-zinc-400"
        )}>
          <Trophy className="w-8 h-8" />
        </div>
        <div className="flex flex-col gap-1 w-full">
          <h3 className="font-black text-xl text-zinc-100 leading-tight">
            Mi Candidato al Título
          </h3>
          <p className="text-sm font-medium text-zinc-400">
            {savedTeam 
              ? "Has bloqueado tu predicción." 
              : "🏆 Elige a tu candidato a Campeón: +6 puntos si aciertas."}
          </p>
          
          {!savedTeam && (
            <div className="mt-3 w-full max-w-sm mx-auto sm:mx-0">
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none font-medium appearance-none cursor-pointer"
                disabled={isSaving}
              >
                <option value="" disabled>Selecciona una selección...</option>
                {TEAMS.map(team => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex shrink-0 w-full sm:w-auto mt-2 sm:mt-0 justify-center">
        {savedTeam ? (
          <div className="flex items-center gap-3 bg-zinc-950/50 px-6 py-3 rounded-xl border border-yellow-500/20 w-full sm:w-auto justify-center">
            <Check className="w-5 h-5 text-yellow-500" />
            <div className="flex flex-col items-start">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Candidato guardado</span>
              <span className="text-lg font-black text-yellow-500">{savedTeam}</span>
            </div>
          </div>
        ) : (
          <Button
            onClick={handleSave}
            disabled={!selectedTeam || isSaving}
            className="w-full sm:w-auto h-12 px-8 font-black bg-yellow-500 hover:bg-yellow-400 text-zinc-950 rounded-xl"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Save className="w-5 h-5 mr-2" />
            )}
            {isSaving ? "Guardando..." : "Confirmar Candidato"}
          </Button>
        )}
      </div>
    </div>
  );
}
