"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Coins, Clock, ChevronRight, TrendingUp, Activity, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
  options: MarketOption[];
  userId: string | null;
  userPoints: number;
  onBetPlaced?: (newPoints: number) => void;
  onOpenAuthModal?: () => void;
  onCategoryClick?: (category: string) => void;
}

export function MarketCard({
  id,
  question,
  category,
  totalVolume,
  endDate,
  imageUrl,
  options = [],
  onCategoryClick,
}: MarketCardProps) {
  const router = useRouter();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  const [selectedAction, setSelectedAction] = useState<{ optionId: string; type: 'yes' | 'no' } | null>(null);

  const truncateTitle = (str: string, maxLength: number) => {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + "...";
  };

  const handleNavigateToMarket = () => {
    router.push(`/market/${id}`);
  };

  // ACÁ ESTÁ EL ARREGLO DEL BUG DEL 99%
  // Sumamos los votos reales de forma matemática y precisa, ignorando el texto formateado
  const realTotalVotes = options.reduce((acc, opt) => acc + Number(opt.total_votes || 0), 0);
  const totalOptsCount = options.length || 2;

  const getProbability = (votes: number) => {
    let ammPrice = (Number(votes) + 100.0) / (realTotalVotes + (totalOptsCount * 100.0));
    ammPrice = Math.max(0.01, Math.min(0.99, ammPrice));
    return ammPrice * 100;
  };

  const sortedOptions = [...options].sort((a, b) => Number(b.total_votes) - Number(a.total_votes));

  const isBinaryYesNo = options.length === 2 && 
    options.some(o => ['sí', 'si', 'yes'].includes(o.option_name.toLowerCase())) && 
    options.some(o => o.option_name.toLowerCase() === 'no');

  return (
    <>
      <Card 
        onClick={() => {
          setSelectedAction(null); 
          setIsPreviewOpen(true);
        }}
        className="group bg-card hover:bg-muted/10 transition-all duration-300 border-border/50 hover:border-primary/50 shadow-sm hover:shadow-md cursor-pointer relative overflow-hidden flex flex-col h-full"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        <CardContent className="p-4 sm:p-5 flex flex-col flex-1">
          <div className="flex gap-3 sm:gap-4 mb-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 overflow-hidden shadow-sm">
              {imageUrl ? (
                <img src={imageUrl} alt="Market" className="w-full h-full object-cover" />
              ) : (
                <Coins className="w-5 h-5 sm:w-6 sm:h-6 text-primary opacity-50" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base sm:text-lg leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-3">
                {truncateTitle(question, 80)}
              </h3>
            </div>
          </div>

          <div className="space-y-3 mb-4 flex-1">
            {sortedOptions.length > 0 ? (
              <>
                <div className="h-1.5 sm:h-2 w-full rounded-full bg-muted overflow-hidden flex shadow-inner">
                  {sortedOptions.map((opt) => (
                    <div 
                      key={opt.id} 
                      className="h-full transition-all duration-500 ease-out" 
                      style={{ width: `${getProbability(opt.total_votes)}%`, backgroundColor: opt.color }} 
                    />
                  ))}
                </div>
                
                <div className="flex flex-wrap gap-2 text-[10px] sm:text-xs">
                  {sortedOptions.slice(0, 3).map((opt) => (
                    <div key={opt.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/50 bg-background/50 text-foreground">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: opt.color }} />
                      <span className="font-semibold truncate max-w-[80px] sm:max-w-[100px]">{opt.option_name}</span>
                      <span className="font-black opacity-80">{Math.round(getProbability(opt.total_votes))}%</span>
                    </div>
                  ))}
                  {sortedOptions.length > 3 && (
                    <div className="flex items-center px-2 py-1 rounded-md border border-border/50 bg-background/50 text-muted-foreground text-[10px] sm:text-xs font-medium">
                      +{sortedOptions.length - 3}
                    </div>
                  )}
                </div>
              </>
            ) : (
               <div className="h-2 w-full rounded-full bg-muted" />
            )}
          </div>

          <div className="flex items-end justify-between mt-auto pt-4 border-t border-border/50 gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 flex-1 min-w-0">
              <Badge 
                variant="secondary" 
                onClick={(e) => {
                  e.stopPropagation();
                  if (onCategoryClick) {
                    onCategoryClick(category);
                  }
                }}
                className="shrink-0 text-[10px] sm:text-[11px] border-border/50 font-bold bg-muted/50 hover:bg-primary/20 hover:text-primary text-foreground px-2 py-0.5 uppercase tracking-wide cursor-pointer transition-colors relative z-10"
              >
                {category}
              </Badge>
              
              <div className="flex items-center gap-2.5 text-muted-foreground text-[10px] sm:text-xs font-medium min-w-0">
                <span className="flex items-center gap-1 shrink-0"><Coins className="w-3 h-3" />{totalVolume}</span>
                <span className="flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" />{endDate}</span>
              </div>
            </div>
            
            <Button 
              variant="default" 
              size="sm" 
              className="shrink-0 h-8 px-3 sm:px-4 text-xs font-bold rounded-lg shadow-md hover:shadow-lg transition-all group-hover:bg-primary/90 text-primary-foreground"
              onClick={(e) => { 
                e.stopPropagation(); 
                handleNavigateToMarket(); 
              }}
            >
              Predecir <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
            
          </div>
        </CardContent>
      </Card>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden bg-background border-border/50">
          
          <div className="p-6 pb-2">
            <DialogHeader>
              <div className="flex items-start gap-4 mb-2">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 overflow-hidden shadow-sm">
                  {imageUrl ? (
                    <img src={imageUrl} alt="Market" className="w-full h-full object-cover" />
                  ) : (
                    <Coins className="w-6 h-6 text-primary opacity-50" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <Badge variant="outline" className="mb-2 uppercase text-[10px] font-bold tracking-wider">{category}</Badge>
                  <DialogTitle className="text-xl leading-tight font-bold text-foreground">
                    {question}
                  </DialogTitle>
                </div>
              </div>
              <DialogDescription className="flex items-center gap-4 text-xs font-medium mt-2">
                <span className="flex items-center gap-1"><Activity className="w-4 h-4" /> Vol: {totalVolume} pts</span>
                <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Cierra: {endDate}</span>
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-4 sm:px-6 py-4 bg-muted/10 border-y border-border/50 max-h-[400px] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Valor de las acciones</h4>
              {!isBinaryYesNo && <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider hidden sm:block">Operar</span>}
            </div>
            
            <div className="space-y-3">
              {sortedOptions.map((opt) => {
                const yesPrice = Math.round(getProbability(opt.total_votes));
                const noPrice = 100 - yesPrice;
                
                const isYesSelected = selectedAction?.optionId === opt.id && selectedAction?.type === 'yes';
                const isNoSelected = selectedAction?.optionId === opt.id && selectedAction?.type === 'no';

                if (isBinaryYesNo) {
                  return (
                    <div 
                      key={opt.id} 
                      onClick={() => setSelectedAction({ optionId: opt.id, type: 'yes' })}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-xl bg-card border shadow-sm cursor-pointer transition-all",
                        isYesSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border/50 hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full shadow-inner relative flex items-center justify-center" style={{ backgroundColor: opt.color }}>
                           {isYesSelected && <Check className="w-3 h-3 text-white absolute" />}
                        </div>
                        <span className={cn("font-bold text-lg", isYesSelected && "text-primary")}>{opt.option_name}</span>
                      </div>
                      <span className={cn("text-2xl font-black", isYesSelected ? "text-primary" : "text-foreground")}>{yesPrice}¢</span>
                    </div>
                  )
                }

                return (
                  <div 
                    key={opt.id} 
                    className={cn(
                      "flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-card border shadow-sm gap-3 transition-colors hover:bg-muted/30",
                      (isYesSelected || isNoSelected) ? "border-border" : "border-border/50"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-3 h-3 rounded-full shrink-0 shadow-inner" style={{ backgroundColor: opt.color }} />
                      <span className="font-bold text-sm truncate">{opt.option_name}</span>
                      <span className="text-sm font-black ml-auto sm:ml-2 text-foreground/70">{yesPrice}%</span>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <Button 
                        variant={isYesSelected ? "default" : "outline"}
                        className={cn(
                          "flex-1 sm:w-20 h-9 font-bold text-sm border-border/50 transition-all",
                          isYesSelected 
                            ? "bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-md shadow-green-500/20" 
                            : "text-green-600 dark:text-green-500 hover:bg-green-500/10 hover:border-green-500/50"
                        )}
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setSelectedAction({ optionId: opt.id, type: 'yes' });
                        }}
                      >
                        Sí {yesPrice}¢
                      </Button>
                      <Button 
                        variant={isNoSelected ? "default" : "outline"}
                        className={cn(
                          "flex-1 sm:w-20 h-9 font-bold text-sm border-border/50 transition-all",
                          isNoSelected 
                            ? "bg-red-600 hover:bg-red-700 text-white border-red-600 shadow-md shadow-red-500/20" 
                            : "text-red-600 dark:text-red-500 hover:bg-red-500/10 hover:border-red-500/50"
                        )}
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setSelectedAction({ optionId: opt.id, type: 'no' });
                        }}
                      >
                        No {noPrice}¢
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-6 pt-4 bg-background">
            <Button 
              size="lg" 
              className="w-full font-bold text-base h-12 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all bg-primary text-primary-foreground"
              onClick={() => {
                setIsPreviewOpen(false); 
                handleNavigateToMarket(); 
              }}
            >
              Ir a Operar <TrendingUp className="w-5 h-5 ml-2" />
            </Button>
          </div>

        </DialogContent>
      </Dialog>
    </>
  );
}