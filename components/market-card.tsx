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
import {
  TrendingUp,
  TrendingDown,
  Clock,
  ChevronRight,
  Loader2,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";

interface MarketCardProps {
  id: string;
  question: string;
  category: string;
  yesPercentage: number;
  totalVolume: string;
  endDate: string;
  trending?: "up" | "down";
  imageUrl?: string | null;
  userId: string | null;
  userPoints: number;
  onBetPlaced: (newBalance: number) => void;
  onOpenAuthModal: () => void;
}

export function MarketCard({
  id,
  question,
  category,
  yesPercentage,
  totalVolume,
  endDate,
  trending,
  imageUrl,
  userId,
  userPoints,
  onBetPlaced,
  onOpenAuthModal,
}: MarketCardProps) {
  const router = useRouter();
  const [selectedOption, setSelectedOption] = useState<"yes" | "no" | null>(null);
  const [isBetModalOpen, setIsBetModalOpen] = useState(false);
  const [betAmount, setBetAmount] = useState("");
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [betSuccess, setBetSuccess] = useState(false);
  
  const noPercentage = 100 - yesPercentage;

  const getCategoryColor = (cat: string) => {
    // Normalizamos para evitar problemas si se guarda con o sin tilde
    const normalizedCat = cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    switch (normalizedCat) {
      case "politica":
        return "bg-primary/10 text-primary border-primary/20";
      case "deportes":
        return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
      case "finanzas":
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
      case "cripto":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
      case "tecnologia":
        return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20";
      case "ciencia":
        return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
      case "clima":
        return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";
      case "entretenimiento":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
      case "musica":
        return "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const handlePredictClick = () => {
    if (!selectedOption) return;
    if (!userId) {
      onOpenAuthModal();
      return;
    }
    setIsBetModalOpen(true);
    setBetAmount("");
    setBetSuccess(false);
  };

  const handlePlaceBet = async () => {
    if (!userId || !selectedOption || !betAmount) return;

    const numericAmount = parseInt(betAmount, 10);
    
    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast({ title: "Monto inválido", description: "Ingresá una cantidad válida mayor a 0", variant: "destructive" });
      return;
    }

    if (numericAmount > userPoints) {
      toast({ 
        title: "Saldo Insuficiente", 
        description: `No podés apostar ${numericAmount} pts. Solo tenés ${userPoints} pts disponibles.`, 
        variant: "destructive" 
      });
      return;
    }

    setIsPlacingBet(true);

    try {
      const supabase = createClient();
      const outcome = selectedOption === "yes" ? "yes" : "no";

      const { data, error } = await supabase.rpc("realizar_apuesta", {
        p_amount: numericAmount,
        p_market_id: id,
        p_outcome: outcome,
      });

      if (error) {
         toast({ title: "Error al apostar", description: error.message, variant: "destructive" });
         return;
      }

      setBetSuccess(true);
      
      const newBalance = userPoints - numericAmount;
      onBetPlaced(newBalance);
      
      toast({ title: "¡Apuesta realizada con éxito!", description: `Invertiste ${numericAmount} pts en tu predicción.` });
      
      setTimeout(() => {
        setIsBetModalOpen(false);
        setSelectedOption(null);
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

  return (
    <>
      <Card className="group hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 border-border/50 bg-card/80 backdrop-blur-sm flex flex-col h-full">
        <CardContent className="pt-4 px-4 pb-2 flex-1 flex flex-col">
          
          {/* FOTO Y TÍTULO CLICKABLES PARA IR AL DETALLE */}
          <Link href={`/market/${id}`} className="flex gap-3 items-start mb-2 group/link cursor-pointer">
            {imageUrl && (
              <img 
                src={imageUrl} 
                alt="Mercado" 
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover shrink-0 shadow-sm border border-border/50 mt-0.5 group-hover/link:opacity-80 transition-opacity"
              />
            )}
            <h3 className="font-semibold text-foreground leading-snug line-clamp-3 group-hover/link:text-primary transition-colors text-base sm:text-lg">
              {question}
            </h3>
          </Link>

          <div className="flex-1" />

          {/* BARRAS DE PROBABILIDAD */}
          <div className="space-y-3 mb-4 mt-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedOption("yes")}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                  selectedOption === "yes"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                Sí {yesPercentage}%
              </button>
              <button
                onClick={() => setSelectedOption("no")}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                  selectedOption === "no"
                    ? "bg-red-500 text-white shadow-md"
                    : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                )}
              >
                No {noPercentage}%
              </button>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
                style={{ width: `${yesPercentage}%` }}
              />
            </div>
          </div>

          {/* STATS (Volumen y fecha) */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <div className="flex items-center gap-1">
              <Coins className="w-3 h-3" />
              <span className="font-medium text-foreground">{totalVolume} pts</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{endDate}</span>
            </div>
          </div>

          {/* CATEGORÍA Y TRENDING */}
          <div className="flex items-center justify-between gap-3">
            <Badge
              variant="outline"
              className={cn("text-xs font-medium", getCategoryColor(category))}
            >
              {category}
            </Badge>
            {trending && (
              <div
                className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  trending === "up"
                    ? "text-green-500"
                    : "text-red-500"
                )}
              >
                {trending === "up" ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                <span>{trending === "up" ? "+5%" : "-3%"}</span>
              </div>
            )}
          </div>

        </CardContent>

        <CardFooter className="px-4 pb-4 pt-3 shrink-0 border-none">
          <Button
            className="w-full group/btn"
            size="sm"
            disabled={!selectedOption}
            onClick={handlePredictClick}
          >
            {selectedOption ? "Predecir" : "Seleccioná una opción"}
            <ChevronRight className="w-4 h-4 ml-1 group-hover/btn:translate-x-1 transition-transform" />
          </Button>
        </CardFooter>
      </Card>

      {/* Bet Modal */}
      <Dialog open={isBetModalOpen} onOpenChange={setIsBetModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" />
              Realizar Predicción
            </DialogTitle>
            <DialogDescription>
              Estás apostando a <span className="font-semibold text-foreground">{selectedOption === "yes" ? "Sí" : "No"}</span> en esta predicción
            </DialogDescription>
          </DialogHeader>

          {betSuccess ? (
            <div className="py-8 text-center animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <Coins className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-green-600 dark:text-green-400">
                ¡Apuesta Realizada!
              </h3>
              <p className="text-muted-foreground text-sm">
                Tu predicción fue registrada exitosamente
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              
              <div className="p-3 rounded-lg bg-muted/50 text-sm flex gap-3 items-center">
                {imageUrl && (
                  <img src={imageUrl} alt="Mercado" className="w-10 h-10 rounded-md object-cover shrink-0 border border-border/50" />
                )}
                <p className="font-medium text-foreground line-clamp-2">{question}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="betAmount">Cantidad de puntos</Label>
                <Input
                  id="betAmount"
                  type="number"
                  placeholder="Ej: 500"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  min={1}
                  max={userPoints}
                />
                
                {userId && (
                  <p className="text-xs text-muted-foreground">
                    Balance disponible: <span className="font-medium text-foreground">{(userPoints || 0).toLocaleString()}</span> pts
                  </p>
                )}
              </div>

              {/* Quick Amounts */}
              <div className="flex gap-2">
                {quickAmounts.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBetAmount(amount.toString())}
                    disabled={amount > userPoints}
                    className="flex-1"
                  >
                    {amount}
                  </Button>
                ))}
              </div>

              <Button
                className="w-full"
                onClick={handlePlaceBet}
                disabled={isPlacingBet || !betAmount || !userId}
              >
                {isPlacingBet ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Coins className="w-4 h-4 mr-2" />
                    Confirmar Apuesta
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}