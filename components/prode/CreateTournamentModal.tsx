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
import { Loader2, Copy, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

interface CreateTournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  onSuccess?: () => void;
}

export function CreateTournamentModal({ isOpen, onClose, userId, onSuccess }: CreateTournamentModalProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: "Nombre requerido", description: "Ingresá un nombre para tu torneo", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({ title: "Error", description: "Debes iniciar sesión para crear un torneo", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
      // 1. Crear el torneo
      const { data: league, error: leagueError } = await supabase
        .from("prode_leagues")
        .insert({
          name: name.trim(),
          admin_id: userId,
          invite_code: code,
        })
        .select()
        .single();

      if (leagueError) throw leagueError;

      // 2. Unir al creador al torneo
      const { error: memberError } = await supabase
        .from("prode_league_members")
        .insert({
          league_id: league.id,
          user_id: userId,
          status: "approved", // El admin entra aprobado directo
        });

      if (memberError) throw memberError;

      setInviteCode(code);
      toast({ title: "¡Torneo creado!", description: "Tu torneo privado está listo." });
      
      router.refresh();
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error("Error creating tournament:", error);
      toast({ title: "Error", description: "Hubo un problema al crear el torneo", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyCode = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Código copiado", description: "Pegalo y compartilo con tus amigos" });
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
      // Pequeño delay para limpiar el estado luego de la animación
      setTimeout(() => {
        setName("");
        setInviteCode(null);
        setCopied(false);
      }, 300);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-white">
            {inviteCode ? "¡Torneo Creado!" : "Crear Torneo de Amigos"}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {inviteCode 
              ? "Compartí este código para que tus amigos se unan a competir." 
              : "Elegí un nombre épico para tu liga privada."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {!inviteCode ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Input
                  id="name"
                  placeholder="Ej: Los Pibes del Barrio"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-yellow-500"
                  maxLength={50}
                  autoFocus
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 bg-zinc-900/50 rounded-xl border border-zinc-800 space-y-4">
              <span className="text-sm font-bold text-zinc-400">CÓDIGO DE INVITACIÓN</span>
              <div className="text-4xl font-black tracking-[0.2em] text-yellow-500 font-mono">
                {inviteCode}
              </div>
              <Button 
                variant="outline" 
                className="w-full border-zinc-700 hover:bg-zinc-800 hover:text-white"
                onClick={copyCode}
              >
                {copied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? "Copiado!" : "Copiar Código"}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" className="text-zinc-400 hover:text-white hover:bg-zinc-900" onClick={handleClose} disabled={isSubmitting}>
            {inviteCode ? "Cerrar" : "Cancelar"}
          </Button>
          {!inviteCode && (
            <Button className="bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-bold" onClick={handleCreate} disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Crear Torneo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
