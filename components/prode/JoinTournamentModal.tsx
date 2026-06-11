"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface JoinTournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  onSuccess?: () => void;
}

export function JoinTournamentModal({ isOpen, onClose, userId, onSuccess }: JoinTournamentModalProps) {
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleJoin = async () => {
    if (!code.trim()) {
      toast({ title: "Código requerido", description: "Ingresá el código de invitación", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({ title: "Error", description: "Debes iniciar sesión para unirte a un torneo", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const cleanCode = code.trim().toUpperCase();

    try {
      // 1. Buscar la liga
      const { data: league, error: leagueError } = await supabase
        .from("prode_leagues")
        .select("id, name")
        .eq("invite_code", cleanCode)
        .single();

      if (leagueError || !league) {
        toast({ title: "No encontrado", description: "El código no pertenece a ningún torneo activo", variant: "destructive" });
        return;
      }

      // 2. Verificar si ya es miembro
      const { data: existingMember } = await supabase
        .from("prode_league_members")
        .select("id")
        .eq("league_id", league.id)
        .eq("user_id", userId)
        .single();

      if (existingMember) {
        toast({ title: "Ya eres miembro", description: "Ya estás participando en este torneo", variant: "destructive" });
        return;
      }

      // 3. Unirse a la liga
      const { error: memberError } = await supabase
        .from("prode_league_members")
        .insert({
          league_id: league.id,
          user_id: userId,
          status: "approved", // Temporal: aprobado por defecto
        });

      if (memberError) throw memberError;

      toast({ title: "¡Te has unido!", description: `Ahora participas en ${league.name}.` });
      
      if (onSuccess) onSuccess();
      handleClose();
    } catch (error: any) {
      console.error("Error joining tournament:", error);
      toast({ title: "Error", description: "Hubo un problema al unirse al torneo", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
      setTimeout(() => setCode(""), 300);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-white">Unirse a Torneo</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Ingresá el código de 6 caracteres que te compartieron tus amigos.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                id="code"
                placeholder="Ej: A1B2C3"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-yellow-500 uppercase font-mono tracking-widest text-center text-lg h-12"
                maxLength={6}
                autoFocus
              />
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" className="text-zinc-400 hover:text-white hover:bg-zinc-900" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button className="bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-bold" onClick={handleJoin} disabled={isSubmitting || code.trim().length === 0}>
            {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Unirse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
