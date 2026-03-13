"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    switch (cat.toLowerCase()) {
      case "política":
        return "bg-primary/10 text-primary border-primary/20";
      case "deportes":
        return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
      case "finanzas":
        return "bg-secondary/20 text-secondary-foreground border-secondary/30";
      case "entretenimiento":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
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
    
    // Validación 1: Monto válido
    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast({ title: "Monto inválido", description: "Ingresá una cantidad válida mayor a 0", variant: "destructive" });
      return;
    }

    // Validación 2: El Patovica del Saldo (Frontend)
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

      // Si la base de datos rechaza la apuesta por algún motivo interno (o error de conexión)
      if (error) {
         toast({ title: "Error al apostar", description: error.message, variant: "destructive" });
         return;
      }

      // Si todo sale bien
      setBetSuccess(true);
      
      // Calculamos el nuevo balance localmente si el RPC no lo devuelve
      const newBalance = userPoints - numericAmount;
      onBetPlaced(newBalance);
      
      // Toast de éxito y cerramos el modal después de 1.5 segundos para que se vea la animación
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
      <Card className="group hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <Badge
              variant="outline"
              className={cn("text-xs font-medium", getCategoryColor(category))}
            >
              {category}
            </Badge>
            {trending && (
              <div
                className={cn(
                  "flex items-center gap-1 text-xs",
                  trending === "up"
                    ? "text-green-500"
                    : "text-red-500"
                )}
              >
                {trending === "up" ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span>{trending === "up" ? "+5%" : "-3%"}</span>
              </div>
            )}
          </div>

          <h3 className="font-semibold text-foreground leading-tight mb-4 line-clamp-2 group-hover:text-primary transition-colors">
            {question}
          </h3>

          {/* Probability Bar */}
          <div className="space-y-3 mb-4">
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

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Coins className="w-3 h-3" />
              <span className="font-medium text-secondary-foreground">{totalVolume} pts</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{endDate}</span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="px-5 py-3 border-t border-border/50 bg-muted/30">
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
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
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
                <p className="text-xs text-muted-foreground">
                  Balance disponible: <span className="font-medium text-foreground">{(userPoints || 0).toLocaleString()}</span> pts
                </p>
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