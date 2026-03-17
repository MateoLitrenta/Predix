"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, ChevronRight, Loader2, Coins, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";

interface MarketOption {
  id: string;
  option_name: string;
  color: string;
  total_votes: number;
}

interface MarketCardProps {
  id: string;
  question: string;
  category: string;
  totalVolume: string;
  endDate: string;
  imageUrl?: string | null;
  options: MarketOption[]; // NUEVO: Recibe la lista de opciones
  userId: string | null;
  userPoints: number;
  onBetPlaced: (newBalance: number) => void;
  onOpenAuthModal: () => void;
}

export function MarketCard({
  id,
  question,
  category,
  totalVolume,
  endDate,
  imageUrl,
  options,
  userId,
  userPoints,
  onBetPlaced,
  onOpenAuthModal,
}: MarketCardProps) {
  const router = useRouter();
  
  // NUEVO: Ahora seleccionamos por ID
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  
  const [isBetModalOpen, setIsBetModalOpen] = useState(false);
  const [betAmount, setBetAmount] = useState("");
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [betSuccess, setBetSuccess] = useState(false);

  const getCategoryColor = (cat: string) => {
    const normalizedCat = cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    switch (normalizedCat) {
      case "politica": return "bg-primary/10 text-primary border-primary/20";
      case "deportes": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
      case "finanzas": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
      case "cripto": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
      case "tecnologia": return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20";
      case "ciencia": return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
      case "clima": return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";
      case "entretenimiento": return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
      case "musica": return "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const handlePredictClick = () => {
    if (!selectedOptionId) return;
    if (!userId) { onOpenAuthModal(); return; }
    setIsBetModalOpen(true);
    setBetAmount("");
    setBetSuccess(false);
  };

  const handlePlaceBet = async () => {
    if (!userId || !selectedOptionId || !betAmount) return;

    const numericAmount = parseInt(betAmount, 10);
    
    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast({ title: "Monto inválido", description: "Ingresá una cantidad válida mayor a 0", variant: "destructive" });
      return;
    }

    if (numericAmount > userPoints) {
      toast({ title: "Saldo Insuficiente", description: `No podés apostar ${numericAmount} pts. Solo tenés ${userPoints} pts disponibles.`, variant: "destructive" });
      return;
    }

    setIsPlacingBet(true);

    try {
      const supabase = createClient();
      
      // Enviamos la apuesta con el ID de la opción
      const { error } = await supabase.rpc("realizar_apuesta", {
        p_amount: numericAmount,
        p_market_id: id,
        p_outcome: selectedOptionId,
      });

      if (error) {
         toast({ title: "Error al apostar", description: error.message, variant: "destructive" });
         return;
      }

      setBetSuccess(true);
      
      const newBalance = userPoints - numericAmount;
      onBetPlaced(newBalance);
      
      // Buscamos el nombre para mostrarlo en la notificación
      const optionName = options.find(o => o.id === selectedOptionId)?.option_name || "la opción";
      toast({ title: "¡Apuesta realizada con éxito!", description: `Invertiste ${numericAmount} pts a ${optionName}.` });
      
      setTimeout(() => {
        setIsBetModalOpen(false);
        setSelectedOptionId(null);
        setBetSuccess(false);
        router.refresh();
      }, 1500);

    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de conexión";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsPlacingBet(false);
    }
  };
  const quickAmounts = [100, 500, 1000];

  // Cálculos de porcentajes basados en las opciones reales
  const totalVotesMulti = options.reduce((sum, opt) => sum + Number(opt.total_votes), 0);
  const displayOptions = options.slice(0, 2); // Solo mostramos las primeras 2 opciones en la tarjeta pequeña

  // Encontramos el nombre de la opción seleccionada para el modal
  const selectedOptionName = options.find(o => o.id === selectedOptionId)?.option_name || "una opción";

  return (
    <>
      <Card className="group hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 border-border/50 bg-card/80 backdrop-blur-sm flex flex-col h-full">
        <CardContent className="pt-4 px-4 pb-2 flex-1 flex flex-col">
          <Link href={`/market/${id}`} className="flex gap-3 items-start mb-2 group/link cursor-pointer">
            {imageUrl && <img src={imageUrl} alt="Mercado" className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover shrink-0 shadow-sm border border-border/50 mt-0.5 group-hover/link:opacity-80 transition-opacity" />}
            <h3 className="font-semibold text-foreground leading-snug line-clamp-3 group-hover/link:text-primary transition-colors text-base sm:text-lg">
              {question}
            </h3>
          </Link>

          <div className="flex-1" />

          {/* DIBUJAMOS LAS OPCIONES REALES */}
          <div className="space-y-3 mb-4 mt-4">
            <div className="flex items-center gap-2">
              {displayOptions.map((opt) => {
                const pct = totalVotesMulti === 0 ? (100 / options.length) : ((Number(opt.total_votes) / totalVotesMulti) * 100);
                const isSelected = selectedOptionId === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedOptionId(opt.id)}
                    className={cn("flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all text-center truncate")}
                    style={{
                      backgroundColor: isSelected ? opt.color : `${opt.color}15`,
                      color: isSelected ? '#ffffff' : opt.color, // Texto blanco si está seleccionado
                      boxShadow: isSelected ? '0 4px 6px -1px rgb(0 0 0 / 0.1)' : 'none',
                    }}
                  >
                    {opt.option_name} {Math.round(pct)}%
                  </button>
                );
              })}
            </div>

            {/* BARRITA DE PROGRESO DE LAS PRIMERAS 2 OPCIONES */}
            {displayOptions.length === 2 && (
              <div className="h-2 w-full rounded-full overflow-hidden flex">
                <div className="h-full transition-all duration-1000" style={{ width: `${totalVotesMulti === 0 ? 50 : (Number(displayOptions[0].total_votes) / totalVotesMulti) * 100}%`, backgroundColor: displayOptions[0].color }} />
                <div className="h-full transition-all duration-1000" style={{ width: `${totalVotesMulti === 0 ? 50 : (Number(displayOptions[1].total_votes) / totalVotesMulti) * 100}%`, backgroundColor: displayOptions[1].color }} />
              </div>
            )}
            
            {/* AVISO SI HAY MÁS OPCIONES */}
            {options.length > 2 && (
              <div className="text-center pt-1">
                <Link href={`/market/${id}`} className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors">
                  Ver {options.length - 2} opciones más <ChevronRight className="w-3 h-3 inline" />
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <div className="flex items-center gap-1"><Coins className="w-3 h-3" /><span className="font-medium text-foreground">{totalVolume} pts</span></div>
            <div className="flex items-center gap-1"><Clock className="w-3 h-3" /><span>{endDate}</span></div>
          </div>

          <div className="flex items-center">
            <Badge variant="outline" className={cn("text-xs font-medium", getCategoryColor(category))}>{category}</Badge>
          </div>
        </CardContent>

        <CardFooter className="px-4 pb-4 pt-3 shrink-0 border-none">
          <Button className="w-full group/btn" size="sm" disabled={!selectedOptionId} onClick={handlePredictClick}>
            {selectedOptionId ? "Predecir" : "Seleccioná una opción"}
            <ChevronRight className="w-4 h-4 ml-1 group-hover/btn:translate-x-1 transition-transform" />
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={isBetModalOpen} onOpenChange={setIsBetModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Coins className="w-5 h-5 text-primary" /> Realizar Predicción</DialogTitle>
            <DialogDescription>Estás apostando a <span className="font-semibold text-foreground">{selectedOptionName}</span> en esta predicción</DialogDescription>
          </DialogHeader>
          {betSuccess ? (
            <div className="py-8 text-center animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center"><Coins className="w-8 h-8 text-green-500" /></div>
              <h3 className="text-lg font-semibold mb-2 text-green-600 dark:text-green-400">¡Apuesta Realizada!</h3>
              <p className="text-muted-foreground text-sm">Tu predicción fue registrada exitosamente</p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-muted/50 text-sm flex gap-3 items-center">
                {imageUrl && <img src={imageUrl} alt="Mercado" className="w-10 h-10 rounded-md object-cover shrink-0 border border-border/50" />}
                <p className="font-medium text-foreground line-clamp-2">{question}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="betAmount">Cantidad de puntos</Label>
                <Input id="betAmount" type="number" placeholder="Ej: 500" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} min={1} max={userPoints} />
                {userId && <p className="text-xs text-muted-foreground">Balance disponible: <span className="font-medium text-foreground">{(userPoints || 0).toLocaleString()}</span> pts</p>}
              </div>
              <div className="flex gap-2">
                {quickAmounts.map((amount) => (
                  <Button key={amount} type="button" variant="outline" size="sm" onClick={() => setBetAmount(amount.toString())} disabled={amount > userPoints} className="flex-1">{amount}</Button>
                ))}
              </div>
              <Button className="w-full" onClick={handlePlaceBet} disabled={isPlacingBet || !betAmount || !userId}>
                {isPlacingBet ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando...</> : <><Coins className="w-4 h-4 mr-2" /> Confirmar Apuesta</>}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}