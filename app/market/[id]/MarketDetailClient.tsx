"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NavHeader } from "@/components/nav-header";
import { AuthModal } from "@/components/auth-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ArrowLeft, Clock, Coins, X, User as UserIcon, MessageSquare, Reply, ChevronDown, ChevronUp, Trash2, TrendingUp, LineChart as LineChartIcon, Share2, Twitter, MessageCircle, Copy, Check, Lock, CheckCircle2, Trophy, Scale, AlertCircle, Wallet, Layers } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { MarketRechart } from "@/components/market-rechart";
import { useTheme } from "@/components/theme-provider";
import { Slider } from "@/components/ui/slider";

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 24.95H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

interface MarketDetailClientProps {
  marketId: string;
}

type ChartTimeframe = '1D' | '1W' | '1M' | 'ALL';

export default function MarketDetailClient({ marketId }: MarketDetailClientProps) {
  const router = useRouter();
  const supabase = createClient();

  const [market, setMarket] = useState<any>(null);
  const [options, setOptions] = useState<any[]>([]);
  const [activityFeed, setActivityFeed] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const { isDarkMode, toggleDarkMode } = useTheme();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [marketUrl, setMarketUrl] = useState("");

  const [tradeTab, setTradeTab] = useState("buy");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<'yes' | 'no'>('yes');
  const [betAmount, setBetAmount] = useState("");
  const [isPlacingBet, setIsPlacingBet] = useState(false);

  const [userShares, setUserShares] = useState<any[]>([]);
  const [isSelling, setIsSelling] = useState(false);

  const [selectedSellPosition, setSelectedSellPosition] = useState<string | null>(null);
  const [sellSharesInput, setSellSharesInput] = useState<string>("");

  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);

  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('ALL');

  const handleTimeframeChange = (tf: ChartTimeframe) => {
    if (tf === chartTimeframe) return;
    setChartTimeframe(tf);
  };

  useEffect(() => {
    setMarketUrl(window.location.href);

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const preselectId = params.get('preselect');
      const typeParam = params.get('type');

      if (preselectId) {
        setSelectedOptionId(preselectId);
        setSelectedDirection(typeParam === 'no' ? 'no' : 'yes');
        setTradeTab('buy');
      }
    }
  }, []);

  const fetchUserAndProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      setUser(currentUser);
      const { data: pData } = await supabase.from("profiles").select("*").eq("id", currentUser.id).single();
      setProfile(pData);
    } else {
      setUser(null);
      setProfile(null);
    }
  }, [supabase]);

  // NUEVO: Fetch desde user_shares en lugar de bets
  const fetchUserShares = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('user_shares')
      .select('*, market_options!inner(market_id)')
      .eq('user_id', user.id)
      .eq('market_options.market_id', marketId);

    setUserShares(data || []);
  }, [user, marketId, supabase]);

  const fetchData = useCallback(async () => {
    const { data: mData, error: mError } = await supabase.from("markets").select("*").eq("id", marketId).single();
    if (mError) {
      toast({ title: "Error", description: "Mercado no encontrado", variant: "destructive" });
      router.push("/");
      return;
    }
    setMarket(mData);

    const { data: optionsData } = await supabase.from("market_options").select("*").eq("market_id", marketId).order("created_at", { ascending: true });
    setOptions(optionsData || []);

    const { data: newHistoryData } = await supabase.from("market_option_history").select("*").eq("market_id", marketId).order("created_at", { ascending: true });

    let formattedHistory: any[] = [];
    if (newHistoryData && newHistoryData.length > 0) {
      const historyMap = new Map();
      newHistoryData.forEach(h => {
        const ts = new Date(h.created_at).getTime();
        if (!historyMap.has(ts)) {
          historyMap.set(ts, { timestamp: ts });
        }
        historyMap.get(ts)[h.option_id] = Number(h.percentage);
      });
      formattedHistory = Array.from(historyMap.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
    setHistory(formattedHistory);

    // Mantenemos la carga de transacciones para el Activity Feed
    const { data: transactionsData } = await supabase.from("transactions").select("*").eq("market_id", marketId).order("created_at", { ascending: false });

    const rawFeed = transactionsData || [];
    const userIds = [...new Set(rawFeed.map(t => t.user_id))];

    const profileMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase.from("profiles").select("id, username, avatar_url, is_market_maker").in("id", userIds);
      if (profilesData) profilesData.forEach(p => { profileMap[p.id] = p; });
    }

    const mappedFeed = rawFeed
      .map(item => ({ ...item, profiles: { username: profileMap[item.user_id]?.username || "Usuario Anónimo", avatar_url: profileMap[item.user_id]?.avatar_url, is_market_maker: profileMap[item.user_id]?.is_market_maker } }))
      .filter(item => !item.profiles.is_market_maker)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setActivityFeed(mappedFeed);

    const { data: commentsData } = await supabase.from("comments").select("*, profiles(username, avatar_url)").eq("market_id", marketId).order("created_at", { ascending: true });
    setComments(commentsData || []);

    setIsLoading(false);
  }, [marketId, router, supabase]);

  useEffect(() => {
    fetchUserAndProfile();
    fetchData();
  }, [fetchUserAndProfile, fetchData]);

  useEffect(() => {
    if (user) fetchUserShares();
  }, [user, fetchData, fetchUserShares]);

  useEffect(() => {
    const channel = supabase.channel(`market-${marketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_shares" }, () => { fetchUserShares(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_options", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [marketId, supabase, fetchData, fetchUserShares]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(marketUrl);
    setIsCopied(true);
    toast({ title: "¡Link copiado!", description: "El enlace se guardó en tu portapapeles." });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleTwitterShare = () => {
    const text = encodeURIComponent(`¡Mirá este mercado en ZÉILO! ${market?.title} ¿Qué opinás?\n\n`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(marketUrl)}`, '_blank');
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`¡Mirá este mercado en ZÉILO!\n*${market?.title}*\n\nEntrá y hacé tu predicción acá: ${marketUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const activeOptions = options.filter(o => !o.is_eliminated);
  const totalMarketCollateral = options.reduce((acc, opt) => acc + Number(opt.total_collateral || 0), 0);
  const totalVolume = activityFeed.reduce((acc, tx) => acc + Math.abs(Number(tx.amount || 0)), 0);

  const formattedLiquidez = Math.floor(totalMarketCollateral).toLocaleString('es-AR');
  const formattedVolumen = Math.floor(totalVolume).toLocaleString('es-AR');

  // NUEVO: Cálculo de Precio AMM con Normalización Visual para sumar 100%
  const rawProbabilities = useMemo(() => {
    return activeOptions.reduce((acc, opt) => {
      const py = Number(opt.pool_yes || 0);
      const pn = Number(opt.pool_no || 0);
      const totalPool = py + pn;
      if (totalPool === 0) {
        acc[opt.id] = 1 / (activeOptions.length || 1);
      } else {
        acc[opt.id] = Math.max(0.01, Math.min(0.99, pn / totalPool));
      }
      return acc;
    }, {} as Record<string, number>);
  }, [activeOptions]);

  const totalImpliedProb = useMemo(() => {
    return Object.values(rawProbabilities).reduce((sum, prob) => sum + prob, 0);
  }, [rawProbabilities]);

  const getOptionPrice = useCallback((opt: any) => {
    if (!opt) return 0.5;
    if (opt.is_eliminated) return 0;

    const py = Number(opt.pool_yes != null ? opt.pool_yes : 50000);
    const pn = Number(opt.pool_no != null ? opt.pool_no : 50000);
    const totalPool = py + pn;
    if (totalPool <= 0) return 0.5;

    return pn / totalPool;
  }, []);



  // NUEVO: Motor de Compra RPC
  const handlePlaceBet = async () => {
    if (!user) { setIsAuthModalOpen(true); return; }
    if (!selectedOptionId || !betAmount) return;

    const numericAmount = parseFloat(betAmount.replace(',', '.'));
    const userPoints = profile?.points || 0;

    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast({ title: "Monto inválido", description: "Ingresá una cantidad mayor a 0", variant: "destructive" });
      return;
    }
    if (numericAmount > userPoints) {
      toast({ title: "Saldo Insuficiente", description: `Solo tenés ${userPoints} pts disponibles.`, variant: "destructive" });
      return;
    }

    setIsPlacingBet(true);

    const { error } = await supabase.rpc("buy_shares_amm", {
      p_user_id: user.id,
      p_market_option_id: selectedOptionId,
      p_investment_amount: numericAmount,
      p_buy_yes: selectedDirection === 'yes'
    });

    setIsPlacingBet(false);

    if (error) {
      toast({ title: "Error al operar", description: error.message, variant: "destructive" });
    } else {
      const optionName = options.find(o => o.id === selectedOptionId)?.option_name || "la opción";
      const directionText = selectedDirection === 'yes' ? 'a favor de' : 'en contra de';

      // La creación de la transacción ahora se delega completamente al RPC backend

      // 2. Tomar la foto del nuevo precio para el Gráfico
      const { data: updatedOptions } = await supabase.from("market_options").select("*").eq("market_id", marketId);
      if (updatedOptions && updatedOptions.length > 0) {
        const activeOpts = updatedOptions.filter((o: any) => !o.is_eliminated);
        const historyInserts = updatedOptions.map((opt: any) => {
          let percentage = 0;
          if (!opt.is_eliminated) {
            const py = Number(opt.pool_yes != null ? opt.pool_yes : 50000);
            const pn = Number(opt.pool_no != null ? opt.pool_no : 50000);
            const totalPool = py + pn;
            percentage = totalPool > 0 ? (pn / totalPool) * 100 : 50;
          }
          return { market_id: marketId, option_id: opt.id, percentage };
        });
        await supabase.from("market_option_history").insert(historyInserts);
      }

      toast({ title: "¡Orden ejecutada!", description: `Compraste acciones ${directionText} ${optionName}` });

      setBetAmount("");
      setSelectedOptionId(null);
      setSelectedSellPosition(null);

      fetchUserAndProfile();
      fetchUserShares();
      fetchData();
    }
  };

  // NUEVO: Motor de Venta RPC
  const executeSellShares = async () => {
    if (!selectedSellPosition) return;

    const [optId, dir] = selectedSellPosition.split('|');
    const pos = consolidatedPositions.find(p => p.outcome === optId && p.direction === dir);

    if (!pos || pos.totalShares <= 0) {
      toast({ title: "Error", description: "No se encontraron acciones activas", variant: "destructive" });
      return;
    }

    const maxShares = pos.totalShares;
    
    let sharesToSellStr = sellSharesInput;
    if (!sharesToSellStr) {
      sharesToSellStr = maxShares.toString();
    }
    const sanitizedInput = sharesToSellStr.replace(',', '.');
    const sharesToSell = parseFloat(sanitizedInput);

    if (isNaN(sharesToSell) || sharesToSell <= 0 || sharesToSell > maxShares) {
      toast({ title: "Error", description: "Cantidad inválida", variant: "destructive" });
      return;
    }

    setIsSelling(true);
    
    const payload = {
      p_user_id: user.id,
      p_market_option_id: optId,
      p_shares_to_sell: sharesToSell,
      p_sell_yes: dir === 'yes'
    };
    
    const { data, error } = await supabase.rpc("sell_shares_amm", payload);
    setIsSelling(false);

    if (error) {
      toast({ title: "Error al vender", description: error.message, variant: "destructive" });
    } else if (data && data.success === false) {
      toast({ title: "Error al vender", description: data.error || "Operación rechazada", variant: "destructive" });
    } else {
      const payout = data.payout || 0;
      // La creación de la transacción ahora se delega completamente al RPC backend

      // 2. Tomar la foto del precio tras la venta para el Gráfico
      const { data: updatedOptions } = await supabase.from("market_options").select("*").eq("market_id", marketId);
      if (updatedOptions && updatedOptions.length > 0) {
        const activeOpts = updatedOptions.filter((o: any) => !o.is_eliminated);
        const historyInserts = updatedOptions.map((opt: any) => {
          let percentage = 0;
          if (!opt.is_eliminated) {
            const py = Number(opt.pool_yes != null ? opt.pool_yes : 50000);
            const pn = Number(opt.pool_no != null ? opt.pool_no : 50000);
            const totalPool = py + pn;
            percentage = totalPool > 0 ? (pn / totalPool) * 100 : 50;
          }
          return { market_id: marketId, option_id: opt.id, percentage };
        });
        await supabase.from("market_option_history").insert(historyInserts);
      }

      toast({ title: "¡Venta exitosa!", description: `Recibiste +${payout.toLocaleString()} pts.` });

      setSellSharesInput("");
      setSelectedSellPosition(null);
      setSelectedOptionId(null);

      fetchUserAndProfile();
      fetchUserShares();
      fetchData();
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setIsAuthModalOpen(true); return; }
    if (!newComment.trim()) return;
    setIsSubmittingComment(true);
    try {
      const { error } = await supabase.from("comments").insert({ market_id: marketId, user_id: user.id, content: newComment.trim(), parent_id: replyingTo ? replyingTo.id : null });
      if (error) throw error;
      setNewComment(""); setReplyingTo(null); fetchData();
    } catch (err: any) { toast({ title: "Error al comentar", description: err.message, variant: "destructive" }); } finally { setIsSubmittingComment(false); }
  };

  const executeDeleteComment = async () => {
    if (!commentToDelete) return;
    setIsDeletingComment(true);
    try {
      const { error } = await supabase.from("comments").delete().eq("id", commentToDelete);
      if (error) throw error;
      setCommentToDelete(null); fetchData();
    } catch (err: any) { toast({ title: "Error al borrar", description: err.message, variant: "destructive" }); } finally { setIsDeletingComment(false); }
  };

  const openUserProfile = (userId: string, username: string) => {
    router.push(`/profile/${userId}`);
  };

  const toggleThread = (commentId: string) => { setExpandedThreads(prev => ({ ...prev, [commentId]: !prev[commentId] })); };

  const getNormalizedPrice = useCallback((optId: string, direction: string) => {
    const opt = options.find(o => o.id === optId);
    if (!opt || opt.is_eliminated) return 0;
    
    const py = Number(opt.pool_yes || 50000);
    const pn = Number(opt.pool_no || 50000);
    const totalPool = py + pn;
    
    if (totalPool <= 0) return 0.5;
    
    const probYes = pn / totalPool;
    return direction === 'yes' ? probYes : (1 - probYes);
  }, [options]);

  const consolidatedPositions = useMemo(() => {
    const positions: Record<string, { outcome: string; direction: string; totalShares: number; totalInvested: number }> = {};

    userShares.forEach(share => {
      const py = Number(share.shares_yes_owned || 0);
      const pn = Number(share.shares_no_owned || 0);

      const calcInvested = (dir: string, currentShares: number) => {
         const buyTxs = activityFeed.filter(tx => tx.user_id === user?.id && (tx.type || "").toLowerCase() === 'buy' && (String(tx.outcome) === String(share.market_option_id) || tx.market_id === share.market_id) && tx.direction === dir);
         buyTxs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
         
         let activeShares = 0;
         let activeAmount = 0;
         for (const tx of buyTxs) {
            const txShares = Number(tx.shares || 0);
            const txAmount = Number(tx.amount || 0);
            if (txShares <= 0) continue;
            
            const remainingNeeded = currentShares - activeShares;
            if (remainingNeeded <= 0) break;
            
            if (txShares <= remainingNeeded) {
               activeShares += txShares;
               activeAmount += txAmount;
            } else {
               const fraction = remainingNeeded / txShares;
               activeShares += remainingNeeded;
               activeAmount += txAmount * fraction;
            }
         }
         return activeShares > 0 ? activeAmount : currentShares * 0.5;
      };

      if (py > 0.0001) {
        const key = `${share.market_option_id}|yes`;
        positions[key] = {
          outcome: share.market_option_id,
          direction: 'yes',
          totalShares: py,
          totalInvested: calcInvested('yes', py),
        };
      }
      if (pn > 0.0001) {
        const key = `${share.market_option_id}|no`;
        positions[key] = {
          outcome: share.market_option_id,
          direction: 'no',
          totalShares: pn,
          totalInvested: calcInvested('no', pn),
        };
      }
    });

    return Object.values(positions);
  }, [userShares, activityFeed, user]);

  const [sellSimulation, setSellSimulation] = useState<any>(null);

  useEffect(() => {
    let isSubscribed = true;

    async function fetchSellSimulation() {
      console.log("fetchSellSimulation triggered", { selectedSellPosition, sellSharesInput, consolidatedPositions });
      if (!selectedSellPosition) {
        if (isSubscribed) setSellSimulation(null);
        return;
      }
      
      const [optId, dir] = selectedSellPosition.split('|');
      
      let sharesToSellStr = sellSharesInput;
      if (!sharesToSellStr) {
        const pos = consolidatedPositions.find((p: any) => p.outcome === optId && p.direction === dir);
        if (pos) {
          sharesToSellStr = pos.totalShares.toString();
        } else {
          console.log("fetchSellSimulation: no pos found for default");
          if (isSubscribed) setSellSimulation(null);
          return;
        }
      }

      console.log("Input:", sellSharesInput, "Sanitizing:", sharesToSellStr);
      const sanitizedInput = sharesToSellStr.replace(',', '.');
      const sharesToSell = parseFloat(sanitizedInput);
      console.log("sharesToSell parsed:", sharesToSell);

      if (isNaN(sharesToSell) || sharesToSell <= 0) {
        console.log("fetchSellSimulation aborted: invalid sharesToSell");
        if (isSubscribed) setSellSimulation(null);
        return;
      }

      const { data, error } = await supabase.rpc('simulate_sell_shares_amm', {
        p_market_option_id: optId,
        p_shares_to_sell: sharesToSell,
        p_sell_yes: dir === 'yes'
      });

      console.log("Respuesta RPC:", data, "Error:", error);

      if (!isSubscribed) return;

      if (!error && data && data.success) {
        setSellSimulation(data.payout);
      } else {
        setSellSimulation(null);
      }
    }

    const timer = setTimeout(() => {
      fetchSellSimulation();
    }, 300);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [sellSharesInput, selectedSellPosition, consolidatedPositions]);

  const timeframes: ChartTimeframe[] = ['1D', '1W', '1M', 'ALL'];

  const filteredHistory = useMemo(() => {
    if (!market || options.length === 0) return [];

    const now = Date.now();
    const marketCreatedAt = new Date(market.created_at).getTime();

    // 1. PUNTO GÉNESIS (Basado en precio con normalización visual si no hay historia)
    const genesisPoint: any = { timestamp: marketCreatedAt };
    const initialProb = options.length > 0 ? 100 / options.length : 50;
    
    options.forEach(opt => {
      genesisPoint[opt.id] = initialProb;
    });

    // 2. GROUP AND FORWARD FILL (Requerido para Recharts Tooltip)
    const rawHistory = (history || [])
      .filter(h => h.timestamp > marketCreatedAt + 2000)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Agrupar eventos que ocurren casi al mismo tiempo (micro-snapshots del bucle SQL)
    const groupedHistory: any[] = [];
    rawHistory.forEach(h => {
      const lastGroup = groupedHistory[groupedHistory.length - 1];
      if (lastGroup && Math.abs(lastGroup.timestamp - h.timestamp) < 2000) {
        Object.keys(h).forEach(k => {
          if (k !== 'timestamp') lastGroup[k] = h[k];
        });
      } else {
        groupedHistory.push({ ...h });
      }
    });

    const timeline: any[] = [genesisPoint];
    let lastKnownState = { ...genesisPoint };

    groupedHistory.forEach(point => {
      const newState: any = { timestamp: point.timestamp };
      options.forEach(opt => {
        newState[opt.id] = point[opt.id] !== undefined ? Number(point[opt.id]) : lastKnownState[opt.id];
      });
      timeline.push(newState);
      lastKnownState = { ...newState };
    });

    let finalTimestamp = now;
    if (market.status === 'resolved' || market.status === 'closed') {
      const m = market as any;
      if (m.resolved_at) {
        finalTimestamp = new Date(m.resolved_at).getTime();
      } else if (m.closed_at) {
        finalTimestamp = new Date(m.closed_at).getTime();
      } else if (market.end_date && new Date(market.end_date).getTime() < now) {
        finalTimestamp = new Date(market.end_date).getTime();
      } else if (rawHistory.length > 0) {
        finalTimestamp = rawHistory[rawHistory.length - 1].timestamp;
      }
    }

    const currentSpotState: any = { timestamp: finalTimestamp };
    options.forEach(opt => {
      const py = Number(opt.pool_yes != null ? opt.pool_yes : 50000);
      const pn = Number(opt.pool_no != null ? opt.pool_no : 50000);
      const totalPool = py + pn;
      currentSpotState[opt.id] = totalPool > 0 ? (pn / totalPool) * 100 : 50;
    });
    timeline.push(currentSpotState);

    return timeline;
  }, [market, options, history]);

  const marketPositionSummary = useMemo(() => {
    if (consolidatedPositions.length === 0) return null;
    let totalInvested = 0;
    let totalCurrentValue = 0;

    consolidatedPositions.forEach(pos => {
      totalInvested += pos.totalInvested;
      totalCurrentValue += pos.totalShares * getNormalizedPrice(pos.outcome, pos.direction);
    });

    if (totalInvested === 0) return null;
    const pnl = totalCurrentValue - totalInvested;
    const pnlPct = (pnl / totalInvested) * 100;
    return { totalInvested, totalCurrentValue, pnl, pnlPct };
  }, [consolidatedPositions, getNormalizedPrice]);

  const topHolders = useMemo(() => {
    const holders: Record<string, { userId: string, username: string, avatarUrl: string | null, invested: number }> = {};

    activityFeed.forEach(item => {
      if (item.type === 'buy') {
        if (!holders[item.user_id]) {
          holders[item.user_id] = {
            userId: item.user_id,
            username: item.profiles?.username || 'Usuario Anónimo',
            avatarUrl: item.profiles?.avatar_url || null,
            invested: 0
          };
        }
        holders[item.user_id].invested += Math.abs(Number(item.amount));
      }
    });

    return Object.values(holders)
      .sort((a, b) => b.invested - a.invested)
      .slice(0, 5);
  }, [activityFeed]);

  const [orderSummary, setOrderSummary] = useState<any>(null);

  useEffect(() => {
    let isSubscribed = true;

    async function fetchSimulation() {
      if (!selectedOptionId || !betAmount) {
        if (isSubscribed) setOrderSummary(null);
        return;
      }

      const amountToInvest = parseFloat(betAmount.replace(',', '.'));

      if (isNaN(amountToInvest) || amountToInvest <= 0) {
        if (isSubscribed) setOrderSummary(null);
        return;
      }

      const amount = amountToInvest;
      const isBuyingYes = selectedDirection === 'yes';

      const { data, error } = await supabase.rpc('simulate_buy_lmsr', {
        p_market_option_id: selectedOptionId,
        p_investment_amount: amount,
        p_buy_yes: isBuyingYes
      });

      if (!isSubscribed) return;

      if (error || !data || !data.success) {
        setOrderSummary({ error: error?.message || data?.error || "Error de conexión" });
        return;
      }

      const shares = data.shares;
      if (shares <= 0) {
        setOrderSummary({ error: "Cantidad muy pequeña" });
        return;
      }

      const avgPrice = amount / shares;
      const startPrice = data.spot_price;
      const slippage = startPrice > 0 ? ((avgPrice - startPrice) / startPrice) * 100 : 0;

      const potentialPayout = shares;
      const potentialProfit = potentialPayout - amount;
      const roi = (potentialProfit / amount) * 100;

      setOrderSummary({
        avgPriceCents: Math.round(avgPrice * 100),
        shares: Number(shares.toFixed(3)),
        potentialPayout: Number(potentialPayout.toFixed(3)),
        potentialProfit: Number(potentialProfit.toFixed(3)),
        roi,
        slippage
      });
    }

    const timer = setTimeout(() => {
      fetchSimulation();
    }, 300);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [betAmount, selectedOptionId, selectedDirection]);



  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavHeader points={profile?.points ?? 10000} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} onPointsUpdate={() => { }} userId={null} userEmail={null} onOpenAuthModal={() => { }} onSignOut={async () => { }} isAdmin={false} username={null} />

        <main className="container mx-auto px-4 py-8 flex-1 max-w-6xl">
          <div className="h-8 w-32 bg-muted/60 rounded animate-pulse mb-6" />

          <div className="flex flex-col lg:grid lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-2 space-y-6 w-full order-1">
              <div className="flex gap-4 sm:gap-6 items-start">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-muted/60 animate-pulse shrink-0" />
                <div className="w-full space-y-3">
                  <div className="flex gap-2">
                    <div className="h-6 w-20 bg-muted/60 rounded-full animate-pulse" />
                    <div className="h-6 w-24 bg-muted/60 rounded-full animate-pulse" />
                  </div>
                  <div className="h-8 w-3/4 bg-muted/60 rounded animate-pulse" />
                  <div className="h-8 w-1/2 bg-muted/60 rounded animate-pulse" />
                  <div className="flex gap-4 mt-2">
                    <div className="h-4 w-24 bg-muted/60 rounded animate-pulse" />
                    <div className="h-4 w-32 bg-muted/60 rounded animate-pulse" />
                  </div>
                </div>
              </div>

              <div className="h-[400px] w-full bg-muted/30 rounded-xl border border-border/50 animate-pulse" />

              <div className="space-y-3">
                <div className="h-14 w-full bg-muted/30 rounded-xl border border-border/50 animate-pulse" />
                <div className="h-14 w-full bg-muted/30 rounded-xl border border-border/50 animate-pulse" />
                <div className="h-14 w-full bg-muted/30 rounded-xl border border-border/50 animate-pulse" />
              </div>
            </div>

            <div className="lg:col-span-1 lg:sticky lg:top-24 w-full order-2">
              <div className="h-[350px] w-full bg-muted/30 rounded-2xl border border-border/50 animate-pulse" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!market) return null;

  const isMarketResolved = market.status === 'resolved';
  const isMarketClosed = isMarketResolved || (market.end_date && new Date(market.end_date) <= new Date());

  const winningOptionId = market?.resolved_option_id || market?.winning_outcome;
  const winningOption = isMarketResolved ? options.find(o => o.id === winningOptionId) : null;

  const topLevelComments = comments.filter(c => !c.parent_id).reverse();

  const isBinaryYesNo = options.length === 2 &&
    options.some(o => ['sí', 'si', 'yes'].includes(o.option_name.toLowerCase())) &&
    options.some(o => o.option_name.toLowerCase() === 'no');

  // DEBUG LOG REQUESTED BY USER
  if (isMarketResolved) {
    // console.log remived for security
  }

  const yesOption = isBinaryYesNo ? options.find(o => ['sí', 'si', 'yes'].includes(o.option_name.toLowerCase())) : null;
  const noOption = isBinaryYesNo ? options.find(o => o.option_name.toLowerCase() === 'no') : null;

  const selectedOptName = options.find(o => o.id === selectedOptionId)?.option_name || '';
  const isRedTheme = selectedDirection === 'no' || (isBinaryYesNo && selectedOptName.toLowerCase() === 'no');

  const renderComment = (comment: any, isReply = false) => {
    const replies = comments.filter(c => c.parent_id === comment.id);
    const isExpanded = !!expandedThreads[comment.id];
    const isMyComment = user?.id === comment.user_id;

    return (
      <div key={comment.id} className={cn("flex flex-col gap-3", isReply ? "mt-3" : "mt-4")}>
        <div className={cn("flex gap-3 sm:gap-4 p-4 rounded-xl transition-colors relative group", isReply ? "bg-muted/10 border border-border/30" : "bg-card border border-border/50")}>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden cursor-pointer" onClick={() => openUserProfile(comment.user_id, comment.profiles?.username || "Usuario")}>
            {comment.profiles?.avatar_url ? <img src={comment.profiles.avatar_url} alt="Avatar" className="w-full h-full object-cover" /> : <UserIcon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />}
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-bold text-sm cursor-pointer hover:text-primary transition-colors" onClick={() => openUserProfile(comment.user_id, comment.profiles?.username || "Usuario")}>{comment.profiles?.username || "Usuario Anónimo"}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{new Date(comment.created_at).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed break-words">{comment.content}</p>
            <div className="mt-2 flex items-center gap-4">
              <button onClick={() => { setReplyingTo(comment); document.getElementById("comment-input")?.focus(); }} className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"><Reply className="w-3 h-3" /> Responder</button>
              {replies.length > 0 && (
                <button onClick={() => toggleThread(comment.id)} className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                  {isExpanded ? <><ChevronUp className="w-4 h-4" /> Ocultar respuestas</> : <><ChevronDown className="w-4 h-4" /> Ver {replies.length} respuestas</>}
                </button>
              )}
            </div>
          </div>
          {isMyComment && (
            <button onClick={() => { setCommentToDelete(comment.id); executeDeleteComment(); }} className="absolute top-4 right-4 text-muted-foreground opacity-50 hover:opacity-100 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
          )}
        </div>
        {replies.length > 0 && isExpanded && <div className="ml-8 sm:ml-12 pl-4 border-l-2 border-border/50 flex flex-col gap-2">{replies.map(reply => renderComment(reply, true))}</div>}
      </div>
    );
  };

  const ReglasBlock = (
    <div className="pt-8 mt-8 border-t border-border/50">
      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Scale className="w-6 h-6 text-primary" /> Reglas de Resolución
      </h3>
      <div className="bg-muted/10 border border-border/50 rounded-xl p-5 space-y-5 shadow-sm">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Fuente Oficial de Resolución</p>
          <p className="text-sm font-medium text-foreground leading-relaxed">
            El mercado se resolverá utilizando la información oficial emitida por la entidad organizadora del evento, comunicados gubernamentales o consenso de los tres principales medios de comunicación (en caso de eventos públicos generales).
          </p>
        </div>
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Criterio de Cierre</p>
          <p className="text-sm font-medium text-foreground leading-relaxed text-pretty">
            El mercado se suspenderá automáticamente el día <span className="font-bold text-primary">{new Date(market.end_date).toLocaleDateString()}</span>. Las posiciones quedarán bloqueadas hasta que el administrador del mercado cargue el resultado oficial. Si el evento se pospone indefinidamente o resulta en un escenario imposible de dirimir, ZÉILO se reserva el derecho de anular el mercado, devolviendo los puntos intactos a los inversores.
          </p>
        </div>
        <div className="flex items-start gap-3 text-xs font-medium text-amber-600 dark:text-amber-500 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 mt-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="leading-relaxed">Al comprar acciones en este mercado, aceptás someterte a estas reglas de resolución y a la decisión final e inapelable del comité de ZÉILO.</span>
        </div>
      </div>
    </div>
  );

  const TopHoldersBlock = (
    <div className="mt-6 rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <div className="p-4 border-b border-border/20 bg-muted/10 flex items-center gap-2">
        <Trophy className="w-4 h-4 text-amber-500" />
        <h3 className="font-bold text-sm text-foreground">Top Inversores</h3>
      </div>
      <div className="p-2 space-y-1 max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-thumb-border">
        {topHolders.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-6">Aún no hay inversores en este mercado.</p>
        ) : (
          topHolders.map((holder, i) => (
            <div key={holder.userId} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => openUserProfile(holder.userId, holder.username)}>
              <div className="flex items-center gap-3 overflow-hidden">
                <span className="text-xs font-bold text-muted-foreground w-4 text-center">{i + 1}</span>
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border/50">
                  {holder.avatarUrl ? <img src={holder.avatarUrl} alt="av" className="w-full h-full object-cover" /> : <UserIcon className="w-3 h-3 text-muted-foreground opacity-50" />}
                </div>
                <span className="font-semibold text-sm text-foreground truncate">{holder.username}</span>
              </div>
              <span className="font-bold text-xs text-amber-600 dark:text-amber-500">{holder.invested.toLocaleString()} pts</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader points={profile?.points ?? 10000} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} onPointsUpdate={() => fetchUserAndProfile()} userId={user?.id ?? null} userEmail={user?.email ?? null} onOpenAuthModal={() => setIsAuthModalOpen(true)} onSignOut={async () => { await supabase.auth.signOut(); fetchUserAndProfile(); }} isAdmin={profile?.role === "admin"} username={profile?.username} avatarUrl={profile?.avatar_url ?? null} />

      <main className="w-full max-w-[1440px] mx-auto px-4 md:px-8 pt-8 pb-28 md:pb-8 flex-1">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-6 -ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />Volver a Mercados
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative items-start">
          <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6 min-w-0 order-1">
            <div className="flex gap-4 sm:gap-6 items-start">
              {market.image_url && <img src={market.image_url} alt="Mercado" className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shrink-0 shadow-md border border-border/50" />}
              <div>
                <div className="flex flex-wrap gap-2 mb-3 items-center">
                  <Badge variant="secondary" className="uppercase text-[10px] font-bold tracking-wider rounded-lg px-2.5 py-1 bg-muted/50 text-muted-foreground border-border/40">
                    {market.category}
                  </Badge>

                  {isMarketResolved ? (
                    <Badge variant="default" className="bg-primary/20 text-primary hover:bg-primary/30 border-primary/30 gap-1.5 font-bold rounded-lg">
                      <CheckCircle2 className="w-3 h-3" /> Resuelto
                    </Badge>
                  ) : isMarketClosed ? (
                    <Badge variant="destructive" className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/30 gap-1.5 font-bold rounded-lg">
                      <Lock className="w-3 h-3" /> Cerrado
                    </Badge>
                  ) : null}

                  <Button variant="outline" size="sm" className="h-6 px-3 text-[10px] uppercase font-bold rounded-lg flex items-center gap-1.5 border-border/60 bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all shadow-sm" onClick={() => setIsShareModalOpen(true)}>
                    <Share2 className="w-3 h-3" /> Compartir
                  </Button>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-2">{market.title}</h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-3 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-md border border-border/30">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-foreground">{formattedVolumen} pts</span> Volumen
                  </div>
                  <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-md border border-border/30">
                    <Coins className="w-4 h-4 text-amber-500" />
                    <span className="font-semibold text-foreground">{formattedLiquidez} pts</span> Liquidez
                  </div>
                  <div className={cn("flex items-center gap-1.5 ml-1", isMarketResolved ? "text-primary font-medium" : isMarketClosed ? "text-red-500 font-medium" : "")}>
                    <Clock className="w-4 h-4" />
                    {isMarketResolved 
                      ? ((market as any).resolved_at 
                          ? `Resuelto el ${new Date((market as any).resolved_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} a las ${new Date((market as any).resolved_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` 
                          : "Mercado resuelto")
                      : isMarketClosed ? `Cerró el ${new Date(market.end_date).toLocaleDateString()}` : `Cierra: ${new Date(market.end_date).toLocaleDateString()}`}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative min-w-0 w-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h3 className="font-semibold flex items-center gap-2">
                  <LineChartIcon className="w-5 h-5 text-primary" /> Tendencia del Mercado
                </h3>
                {!isMarketResolved && (
                  <div className="flex bg-muted/50 p-1 rounded-xl border border-border/30 w-full sm:w-auto overflow-x-auto">
                    {timeframes.map((tf) => (
                      <button
                        key={tf}
                        onClick={() => handleTimeframeChange(tf)}
                        className={cn(
                          "px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none",
                          chartTimeframe === tf ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {filteredHistory.length > 0 ? (
                <div className="w-full h-[350px] relative min-w-0 overflow-hidden pr-2 lg:pr-8 mt-4 mb-2">
                  <MarketRechart data={filteredHistory} options={options} marketCreatedAt={new Date(market.created_at).getTime()} chartTimeframe={isMarketResolved ? 'ALL' : chartTimeframe} />
                </div>
              ) : (
                <div className="w-full h-[350px] relative min-w-0 overflow-hidden pr-2 lg:pr-8 mt-4 mb-2 flex items-center justify-center border-2 border-dashed border-border/50 rounded-xl bg-muted/10">
                  <p className="text-sm font-medium text-muted-foreground">No hay actividad en este período.</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {isBinaryYesNo && yesOption && noOption ? (
                <div className="grid grid-cols-2 gap-2.5 mt-6">
                  <div
                    onClick={() => { if (!isMarketClosed) { setSelectedOptionId(yesOption.id); setSelectedDirection('yes'); setTradeTab("buy"); } }}
                    className={cn("rounded-lg border transition-all cursor-pointer",
                      isMarketClosed ? "opacity-60 cursor-not-allowed bg-muted" : "hover:bg-muted/30",
                      selectedOptionId === yesOption.id && selectedDirection === 'yes' ? "bg-green-500/10 border-green-500" : "bg-muted/10 border-border/50 hover:border-green-500/50")}
                  >
                    <div className="flex w-full items-center justify-between px-3 py-2">
                      <span className="text-xs font-semibold text-foreground">SÍ</span>
                      <span className="text-sm font-black text-green-600 dark:text-green-400">{Math.round(getOptionPrice(yesOption) * 100)}¢</span>
                    </div>
                  </div>
                  <div
                    onClick={() => { if (!isMarketClosed) { setSelectedOptionId(yesOption.id); setSelectedDirection('no'); setTradeTab("buy"); } }}
                    className={cn("rounded-lg border transition-all cursor-pointer",
                      isMarketClosed ? "opacity-60 cursor-not-allowed bg-muted" : "hover:bg-muted/30",
                      selectedOptionId === yesOption.id && selectedDirection === 'no' ? "bg-red-500/10 border-red-500" : "bg-muted/10 border-border/50 hover:border-red-500/50")}
                  >
                    <div className="flex w-full items-center justify-between px-3 py-2">
                      <span className="text-xs font-semibold text-foreground">NO</span>
                      <span className="text-sm font-black text-red-600 dark:text-red-400">{Math.round((1 - getOptionPrice(yesOption)) * 100)}¢</span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between px-2 sm:px-4 text-xs font-bold text-muted-foreground uppercase mb-2 mt-4">
                    <span>Posibles Resultados</span>
                    <div className="hidden sm:flex items-center gap-4">
                      <span className="w-24 text-center mr-16">Chance</span>
                      <span className="w-[180px] text-center">Operar</span>
                    </div>
                  </div>
                  {[...options].sort((a, b) => {
                    if (a.is_eliminated && !b.is_eliminated) return 1;
                    if (!a.is_eliminated && b.is_eliminated) return -1;
                    return getOptionPrice(b) - getOptionPrice(a);
                  }).map((opt) => {
                    const yesPrice = getOptionPrice(opt);
                    const yesCents = Math.round(yesPrice * 100);
                    const noCents = 100 - yesCents;

                    const isSelectedYes = selectedOptionId === opt.id && selectedDirection === 'yes';
                    const isSelectedNo = selectedOptionId === opt.id && selectedDirection === 'no';

                    const isWinner = isMarketResolved && market.winning_outcome === opt.id;
                    const isEliminated = opt.is_eliminated === true;

                    return (
                      <div key={opt.id} className={cn(
                        "flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-xl border transition-colors gap-3 sm:gap-4",
                        isWinner ? "border-primary/50 bg-primary/5 shadow-[0_0_15px_rgba(var(--primary),0.1)]" : "border-border/50 bg-card",
                        (isMarketClosed && !isWinner) && "opacity-60",
                        isEliminated && "opacity-50 grayscale"
                      )}>
                        <div className="flex items-center justify-between w-full sm:w-auto sm:flex-1 gap-3 min-w-0">
                          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full shadow-inner shrink-0" style={{ backgroundColor: isEliminated ? '#dc2626' : opt.color }} />
                            <span className={cn("font-bold text-base sm:text-lg truncate", isWinner ? "text-primary" : "text-foreground", isEliminated && "line-through")}>
                              {opt.option_name}
                              {isWinner && <Badge className="ml-2 bg-primary text-primary-foreground text-[10px] uppercase">Ganador</Badge>}
                            </span>
                          </div>

                          <div className="flex justify-end sm:justify-center w-16 sm:w-24 shrink-0 sm:mr-16">
                            <span className={cn("font-black text-lg sm:text-xl", isWinner ? "text-primary" : isEliminated ? "text-red-500 font-bold" : "text-foreground")}>
                              {isEliminated ? "No" : `${yesCents}%`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-end w-full sm:w-[180px] shrink-0 mt-1 sm:mt-0">
                          {isEliminated ? (
                            <Badge variant="outline" className="w-full justify-center h-10 border-red-500/30 text-red-500 bg-red-500/10 font-bold text-sm uppercase">Eliminado</Badge>
                          ) : (
                            <div className="grid grid-cols-2 gap-2.5 w-full">
                              <button
                                disabled={isMarketClosed || isEliminated}
                                onClick={() => { setSelectedOptionId(opt.id); setSelectedDirection('yes'); setTradeTab("buy"); }}
                                className={cn("rounded-lg border transition-all cursor-pointer outline-none",
                                  (isMarketClosed || isEliminated) ? "cursor-not-allowed opacity-50" : "hover:bg-muted/30",
                                  isSelectedYes ? "bg-green-500/10 border-green-500" : "bg-muted/10 border-border/50 hover:border-green-500/50")}
                              >
                                <div className="flex w-full items-center justify-between px-3 py-2">
                                  <span className="text-xs font-semibold text-foreground">SÍ</span>
                                  <span className="text-sm font-black text-green-600 dark:text-green-400">{yesCents}¢</span>
                                </div>
                              </button>
                              <button
                                disabled={isMarketClosed || isEliminated}
                                onClick={() => { setSelectedOptionId(opt.id); setSelectedDirection('no'); setTradeTab("buy"); }}
                                className={cn("rounded-lg border transition-all cursor-pointer outline-none",
                                  (isMarketClosed || isEliminated) ? "cursor-not-allowed opacity-50" : "hover:bg-muted/30",
                                  isSelectedNo ? "bg-red-500/10 border-red-500" : "bg-muted/10 border-border/50 hover:border-red-500/50")}
                              >
                                <div className="flex w-full items-center justify-between px-3 py-2">
                                  <span className="text-xs font-semibold text-foreground">NO</span>
                                  <span className="text-sm font-black text-red-600 dark:text-red-400">{noCents}¢</span>
                                </div>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
          
          <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6 min-w-0 order-3 lg:order-2">
            <div className="w-full mt-2">
              <Tabs defaultValue="activity" className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-14 p-1.5 bg-muted/50 rounded-xl mb-8 border border-border/50 shadow-sm">
                  <TabsTrigger
                    value="activity"
                    className="rounded-lg text-sm sm:text-base font-bold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md transition-all text-muted-foreground flex items-center justify-center gap-2"
                  >
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="truncate">Actividad</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="debate"
                    className="rounded-lg text-sm sm:text-base font-bold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md transition-all text-muted-foreground flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="truncate">Debate ({comments.length})</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="m-0 focus-visible:outline-none">
                  {(() => {
                    const visibleActivity = activityFeed.filter((t) => t.type === 'buy' || t.type === 'sell');
                    return (
                      <div className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
                        {visibleActivity.length === 0 ? (
                          <div className="text-center py-12 border-2 border-dashed border-border/50 rounded-xl bg-muted/10 mx-4 my-4">
                            <TrendingUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                            <p className="text-sm font-medium text-muted-foreground">Aún no hay actividad en este mercado. ¡Sé el primero!</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-border/30 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-border">
                            {visibleActivity.map((item) => (
                              <div key={item.id} className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors group">
                                <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-border/50 bg-background overflow-hidden cursor-pointer" onClick={() => openUserProfile(item.user_id, item.profiles?.username || "Usuario")}>
                                {item.profiles?.avatar_url ? <img src={item.profiles.avatar_url} alt="av" className="w-full h-full object-cover" /> : <UserIcon className="w-4 h-4 text-muted-foreground opacity-50" />}
                              </div>
                              <div className="flex flex-col">
                                {(() => {
                                  const hasShares = item.shares && Number(item.shares) > 0;
                                  const unitPrice = hasShares ? Math.abs(Number(item.amount)) / Number(item.shares) : null;
                                  
                                  // Propiedades nativas como fallback secundario por si la descripción no tiene la data
                                  const dbDirection = item.direction || item.metadata?.direction;
                                  const dbOutcome = item.outcome || item.metadata?.outcome || item.metadata?.option_name;

                                  let optionName = 'Opción';
                                  let txDirection = null;
                                  let desc = (item.description || "").toLowerCase();
                                  
                                  // Regex robusto para extraer el nombre de la opción si está entre comillas
                                  const extractName = (str: string) => {
                                    const match = str.match(/en ["']([^"']+)["']/i);
                                    if (match) return match[1];
                                    const match2 = str.match(/(?:a favor de|en contra de) ["']?([^"']+)["']?/i);
                                    if (match2) return match2[1];
                                    return null;
                                  };

                                  const ext = extractName(item.description || "");
                                  if (ext) {
                                    optionName = ext;
                                  } else if (dbOutcome) {
                                    const matchingOption = options.find((opt: any) => opt.id === dbOutcome);
                                    optionName = matchingOption ? matchingOption.option_name : dbOutcome;
                                  } else {
                                    if (desc.includes('en contra de')) {
                                      optionName = item.description.substring(desc.indexOf('en contra de') + 13).trim();
                                    } else if (desc.includes('a favor de')) {
                                      optionName = item.description.substring(desc.indexOf('a favor de') + 11).trim();
                                    }
                                    optionName = optionName.replace(/"/g, '');
                                  }

                                  // Lógica ESTRICTA y certera para determinar la dirección del trade (SÍ o NO)
                                  if (dbDirection === 'no' || dbDirection === 'NO' || dbDirection === 'No') {
                                    txDirection = 'no';
                                  } else if (dbDirection === 'yes' || dbDirection === 'YES' || dbDirection === 'Yes') {
                                    txDirection = 'yes';
                                  } else if (desc.includes('acciones de no en') || desc.includes('acciones de no -') || desc.includes('en contra')) {
                                    txDirection = 'no';
                                  } else if (desc.includes('acciones de sí en') || desc.includes('acciones de si en') || desc.includes('acciones de sí -') || desc.includes('acciones de si -') || desc.includes('a favor')) {
                                    txDirection = 'yes';
                                  } else if (optionName.toLowerCase() === 'no') {
                                    txDirection = 'no';
                                  } else if (optionName.toLowerCase() === 'sí' || optionName.toLowerCase() === 'si') {
                                    txDirection = 'yes';
                                  } else if (item.type === 'sell') {
                                    // Búsqueda en compras pasadas para ventas antiguas donde la descripción no especifique SÍ/NO
                                    const marketId = item.market_id || item.markets?.id || item.market?.id;
                                    const outcome = optionName;
                                    const pastBuys = activityFeed.filter(t => {
                                      const pType = (t.type || "").toLowerCase();
                                      const pMarketId = t.market_id || t.markets?.id || t.market?.id;
                                      return pType === 'buy' && pMarketId === marketId && new Date(t.created_at) < new Date(item.created_at);
                                    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                                    for (const pastTx of pastBuys) {
                                      const pDesc = (pastTx.description || "").toLowerCase();
                                      const pDir = pastTx.direction || pastTx.metadata?.direction;
                                      let pOutcome = extractName(pastTx.description || "") || '';
                                      if (!pOutcome) {
                                        if (pDesc.includes('en contra de')) {
                                          pOutcome = pastTx.description.substring(pastTx.description.indexOf('en contra de') + 13).trim();
                                        } else if (pDesc.includes('a favor de')) {
                                          pOutcome = pastTx.description.substring(pastTx.description.indexOf('a favor de') + 11).trim();
                                        } else {
                                          pOutcome = 'unknown';
                                        }
                                      }
                                      pOutcome = pOutcome.replace(/"/g, '').toLowerCase();

                                      if (pOutcome === outcome.toLowerCase()) {
                                        if (pDir === 'no' || pDesc.includes("acciones de no") || pDesc.includes("en contra") || pOutcome === 'no') {
                                          txDirection = "no";
                                          break;
                                        } else if (pDir === 'yes' || pDesc.includes("acciones de sí") || pDesc.includes("acciones de si") || pDesc.includes("a favor") || pOutcome === 'sí' || pOutcome === 'si') {
                                          txDirection = "yes";
                                          break;
                                        }
                                      }
                                    }
                                  }

                                  const actionWord = item.type === 'buy' ? 'compró' : 'vendió';
                                  
                                  const isYes = txDirection !== 'no';
                                  const directionElement = isYes  
                                    ? <span className="font-bold text-green-500 dark:text-green-400">SÍ</span> 
                                    : <span className="font-bold text-red-500 dark:text-red-400">NO</span>;

                                  const formattedShares = hasShares ? Number(item.shares).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : "";
                                  const executionPrice = hasShares ? Math.abs(Number(item.amount)) / Number(item.shares) : null;
                                  const formattedPrice = executionPrice !== null ? `$${executionPrice.toFixed(2)}` : "";

                                  const isOptionNameRedundant = optionName.toLowerCase() === 'sí' || optionName.toLowerCase() === 'si' || optionName.toLowerCase() === 'no';

                                  return hasShares ? (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors text-foreground" onClick={() => openUserProfile(item.user_id, item.profiles?.username || "Usuario")}>{item.profiles?.username || "Usuario"}</span>
                                      <span className="text-sm text-muted-foreground">
                                        {actionWord} <span className="font-medium text-foreground">{formattedShares}</span> acciones {isOptionNameRedundant ? <>de {directionElement}</> : <>de {directionElement} - <span className="font-medium text-foreground">{optionName}</span></>} a <span className="font-medium text-foreground">{formattedPrice}</span>
                                      </span>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors text-foreground" onClick={() => openUserProfile(item.user_id, item.profiles?.username || "Usuario")}>{item.profiles?.username || "Usuario"}</span>
                                        <span className="text-sm font-medium text-muted-foreground">{actionWord}</span>
                                      </div>
                                      <span className="text-xs font-medium text-muted-foreground mt-0.5">
                                        {item.description}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                            <div className="text-right flex flex-col items-end shrink-0 pl-2">
                              <p className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                                {new Date(item.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} • {new Date(item.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="debate" className="m-0 focus-visible:outline-none">
                  <div className="bg-card rounded-xl border border-border/50 p-4 sm:p-6 shadow-sm">
                    <div className="mb-6">
                      {replyingTo && (
                        <div className="flex items-center justify-between bg-primary/10 text-primary px-3 py-2 rounded-lg mb-3 text-sm">
                          <span className="flex items-center gap-2"><Reply className="w-4 h-4" /> Respondiendo a <b>{replyingTo.profiles?.username || 'Usuario'}</b></span>
                          <button onClick={() => setReplyingTo(null)} className="hover:bg-primary/20 p-1 rounded-full"><X className="w-4 h-4" /></button>
                        </div>
                      )}
                      <form onSubmit={handleAddComment} className="flex gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 hidden sm:flex items-center justify-center shrink-0 border border-primary/20 overflow-hidden cursor-pointer" onClick={() => user && openUserProfile(user.id, profile?.username)}>
                          {profile?.avatar_url ? <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 text-primary" />}
                        </div>
                        <div className="flex-1 flex gap-2">
                          <Input id="comment-input" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder={user ? "Opiná sobre este mercado..." : "Iniciá sesión para comentar..."} disabled={isSubmittingComment || !user} className="bg-muted/20" />
                          <Button type="submit" disabled={!newComment.trim() || isSubmittingComment || !user}>{isSubmittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar"}</Button>
                        </div>
                      </form>
                    </div>
                    <div className="space-y-2">
                      {topLevelComments.length === 0 ? <p className="text-center py-8 text-muted-foreground bg-muted/10 rounded-xl border border-dashed border-border/50">Todavía no hay comentarios. Rompé el hielo.</p> : topLevelComments.map(comment => renderComment(comment))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="block lg:hidden w-full mt-4">
              {TopHoldersBlock}
            </div>

            {market.description && (
              <div className="p-5 sm:p-6 rounded-2xl bg-muted/10 border border-border/50 text-foreground leading-relaxed shadow-sm">
                <h3 className="text-base font-bold mb-2 text-foreground">Acerca de este mercado</h3>
                <p className="text-sm font-medium text-muted-foreground">{market.description}</p>
              </div>
            )}

            <div className="mb-8">
              {ReglasBlock}
            </div>
          </div>

          <div className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-24 self-start flex flex-col gap-6 lg:z-40 order-2 lg:order-3 lg:col-start-9 xl:col-start-10 lg:row-start-1 lg:row-span-2">

            {(selectedOptionId || selectedSellPosition) && (
              <div
                className="fixed inset-0 bg-black/60 z-[90] lg:hidden animate-in fade-in duration-300"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedOptionId(null);
                  setSelectedSellPosition(null);
                }}
              />
            )}

            <div className={cn(
              "border border-border/50 bg-card shadow-2xl lg:shadow-xl relative z-[100]",
              (selectedOptionId || selectedSellPosition || isMarketResolved)
                ? "fixed bottom-0 left-0 right-0 animate-in slide-in-from-bottom duration-300 rounded-t-3xl rounded-b-none lg:static lg:rounded-2xl"
                : "rounded-2xl overflow-hidden"
            )}>

              <div className={cn(
                "p-3 sm:p-4 bg-card relative z-50",
                (selectedOptionId || selectedSellPosition || isMarketResolved)
                  ? "rounded-t-3xl rounded-b-none lg:rounded-2xl max-h-[85dvh] overflow-y-auto pb-32 lg:pb-3"
                  : "rounded-2xl overflow-hidden"
              )}>

                {(selectedOptionId || selectedSellPosition) && (
                  <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-4 lg:hidden" />
                )}

                {isMarketResolved ? (
                  <div className="mb-2 p-6 text-center bg-primary/10 border border-primary/20 rounded-xl">
                    <Trophy className="w-12 h-12 text-primary mx-auto mb-3 drop-shadow-md" />
                    <h3 className="text-xl font-black text-primary mb-1">MERCADO RESUELTO</h3>
                    <p className="text-sm font-medium text-muted-foreground mb-4">La opción ganadora fue:</p>
                    <Badge className="text-lg px-4 py-1.5 font-black bg-background text-foreground border-2 border-primary/50 shadow-sm">
                      {winningOption?.option_name || winningOptionId || 'Desconocido'}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-4">Los puntos ya fueron distribuidos a las carteras de los ganadores.</p>
                  </div>
                ) : (
                  <Tabs value={tradeTab} onValueChange={setTradeTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-muted/50 rounded-xl mb-4">
                      <TabsTrigger value="buy" className="rounded-lg text-sm sm:text-base font-bold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all text-muted-foreground">
                        Comprar
                      </TabsTrigger>
                      <TabsTrigger value="sell" className="rounded-lg text-sm sm:text-base font-bold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all text-muted-foreground">
                        Vender
                      </TabsTrigger>
                    </TabsList>

                    {isMarketClosed && !isMarketResolved && (
                      <div className="mb-4 mx-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-red-500">
                        <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                        <p className="text-xs font-medium leading-relaxed">
                          Este mercado ya cerró y las operaciones están bloqueadas. Los puntos de las apuestas ganadoras se repartirán cuando el administrador confirme el resultado final.
                        </p>
                      </div>
                    )}

                    <TabsContent value="buy" className="p-2 sm:p-3 mt-0">
                      <div className="flex flex-col gap-4">
                        {!selectedOptionId ? (
                          <div className="p-6 text-center border-2 border-dashed border-border/50 rounded-xl bg-muted/10">
                            <TrendingUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                            <p className="text-sm font-medium text-muted-foreground">Seleccioná tu predicción para operar.</p>
                          </div>
                        ) : (
                          <>
                            <div className={cn("p-4 rounded-xl border", !isRedTheme ? 'border-green-500/40 bg-green-500/10' : 'border-red-500/40 bg-red-500/10')}>
                              <p className={cn("text-xs font-bold uppercase mb-1 opacity-90", !isRedTheme ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')}>Estás comprando</p>
                              <div className="flex justify-between items-center">
                                <span className={cn("font-black text-lg sm:text-xl", !isRedTheme ? 'text-green-700 dark:text-green-500' : 'text-red-700 dark:text-red-500')}>
                                  {isBinaryYesNo ? `Comprar ${selectedDirection === 'no' ? noOption?.option_name : yesOption?.option_name}` : `Comprar ${selectedDirection === 'yes' ? 'Sí' : 'No'}`}
                                </span>
                                <span className={cn("font-bold text-xl", !isRedTheme ? 'text-green-700 dark:text-green-500' : 'text-red-700 dark:text-red-500')}>
                                  {selectedDirection === 'yes'
                                    ? Math.round(getOptionPrice(options.find(o => o.id === selectedOptionId)) * 100)
                                    : 100 - Math.round(getOptionPrice(options.find(o => o.id === selectedOptionId)) * 100)}¢
                                </span>
                              </div>
                              {!isBinaryYesNo && <p className="text-sm font-medium mt-1 truncate text-foreground">{selectedOptName}</p>}
                            </div>

                            {options.find(o => o.id === selectedOptionId)?.is_eliminated ? (
                              <div className="p-6 text-center border border-red-500/30 rounded-xl bg-red-500/5">
                                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-500 opacity-80" />
                                <p className="text-sm font-bold text-red-500">Opción Eliminada</p>
                                <p className="text-xs text-muted-foreground mt-1">Ya no se pueden comprar acciones de este resultado.</p>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <div className="flex justify-between items-center mb-1.5">
                                    <Label className="text-muted-foreground">Monto a invertir</Label>
                                    {user && (
                                      <button
                                        onClick={() => setBetAmount(profile?.points?.toString() || "0")}
                                        className="text-[10px] font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors bg-primary/10 px-2 py-0.5 rounded-full"
                                      >
                                        MAX
                                      </button>
                                    )}
                                  </div>
                                  <div className="relative">
                                    <Input type="number" placeholder="0" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} disabled={isMarketClosed} className="pl-4 pr-12 h-14 text-xl font-bold bg-muted/20 border-border/50 focus-visible:ring-1 focus-visible:ring-primary/50 disabled:opacity-50" />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">pts</span>
                                  </div>
                                </div>

                                  <div className="p-4 rounded-xl bg-muted/20 border border-border/50 space-y-3">
                                    {orderSummary?.error ? (
                                      <div className="text-center py-2">
                                        <p className="text-sm font-bold text-red-500 flex items-center justify-center gap-2">
                                          <AlertCircle className="w-4 h-4" /> {orderSummary.error}
                                        </p>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex justify-between items-center w-full mb-3 text-sm">
                                          <span className="text-muted-foreground whitespace-nowrap mr-2">Precio promedio</span>
                                          <div className="flex items-center gap-2 text-right whitespace-nowrap">
                                            <span className="font-bold">{orderSummary ? orderSummary.avgPriceCents : 0}¢</span>
                                          </div>
                                        </div>
                                        <div className="flex justify-between items-center w-full mb-3 text-sm">
                                          <span className="text-muted-foreground whitespace-nowrap mr-2">Acciones estimadas</span>
                                          <div className="flex items-center gap-2 text-right whitespace-nowrap">
                                            <span className="font-bold">{orderSummary ? orderSummary.shares.toLocaleString() : '0'}</span>
                                          </div>
                                        </div>

                                        <div className="h-px w-full bg-border/50 my-2" />

                                        <div className="flex justify-between items-start w-full mb-3 text-sm">
                                          <span className="text-muted-foreground whitespace-nowrap mr-2 mt-0.5">Ganancia Potencial</span>
                                          <div className="flex flex-col items-end gap-1 text-right">
                                            <span className={cn("font-bold whitespace-nowrap", !isRedTheme ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>+{orderSummary ? orderSummary.potentialProfit.toLocaleString() : '0'} pts</span>
                                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md whitespace-nowrap", !isRedTheme ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>+{orderSummary ? orderSummary.roi.toFixed(1) : '0.0'}%</span>
                                          </div>
                                        </div>
                                        <div className="flex justify-between items-center w-full mb-3 text-base">
                                          <span className="font-bold text-foreground whitespace-nowrap mr-2">Retorno Total</span>
                                          <div className="flex items-center gap-2 text-right whitespace-nowrap">
                                            <span className={cn("font-black", !isRedTheme ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>{orderSummary ? orderSummary.potentialPayout.toLocaleString() : '0'} pts</span>
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>

                                  {orderSummary && !orderSummary.error && orderSummary.slippage > 3 && (
                                    <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-2 text-yellow-600 dark:text-yellow-500 animate-in fade-in">
                                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                      <p className="text-[11px] font-medium leading-tight">
                                        ⚠️ Deslizamiento alto ({orderSummary.slippage.toFixed(1)}%). Tu orden mueve la liquidez y el precio promedio será superior al inicial.
                                      </p>
                                    </div>
                                  )}

                                {user && (
                                  <div className="flex justify-between items-center text-xs text-muted-foreground px-1">
                                    <span>Balance disponible:</span>
                                    <span className="font-bold text-foreground">{(profile?.points || 0).toLocaleString()} pts</span>
                                  </div>
                                )}

                                <Button
                                  size="lg"
                                  disabled={!betAmount || isPlacingBet || isMarketClosed}
                                  onClick={handlePlaceBet}
                                  className={cn(
                                    "w-full text-sm font-bold h-12 transition-colors mt-2",
                                    isMarketClosed ? "bg-muted text-muted-foreground" :
                                      (!isRedTheme ? "bg-green-600 hover:bg-green-700 text-white dark:bg-green-500 dark:hover:bg-green-600 dark:text-black" : "bg-red-600 hover:bg-red-700 text-white dark:bg-red-500 dark:hover:bg-red-600 dark:text-black")
                                  )}
                                >
                                  <span className="truncate w-full text-center">
                                    {isMarketClosed ? <><Lock className="w-4 h-4 mr-2 inline-block" /> Mercado Cerrado</> :
                                      isPlacingBet ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline-block" /> Procesando...</> :
                                        !user ? "Ingresar para Operar" :
                                          `Comprar ${isBinaryYesNo ? (selectedDirection === 'no' ? noOption?.option_name : yesOption?.option_name) : (selectedDirection === 'yes' ? 'Sí' : 'No')} por ${betAmount || 0} pts`}
                                  </span>
                                </Button>
                              </>
                            )}

                            {marketPositionSummary && (
                              <div className="mt-4 p-4 bg-background border border-border/50 rounded-xl space-y-2 animate-in fade-in">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5"><Wallet className="w-3 h-3" /> Resumen de tus posiciones</p>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-foreground">Total Invertido (Base)</span>
                                  <span className="text-sm font-bold text-foreground">{marketPositionSummary.totalInvested.toLocaleString()} pts</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-foreground">Valor Actual</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-primary">{marketPositionSummary.totalCurrentValue.toLocaleString()} pts</span>
                                    <Badge variant="outline" className={cn("text-[10px] font-bold px-1.5 py-0 h-5 border", marketPositionSummary.pnl >= 0 ? "bg-green-500/10 text-green-600 border-green-500/30" : "bg-red-500/10 text-red-600 border-red-500/30")}>
                                      {marketPositionSummary.pnl >= 0 ? '+' : ''}{marketPositionSummary.pnlPct.toFixed(1)}%
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            )}

                          </>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="sell" className="p-2 sm:p-3 mt-0">
                      {!user ? (
                        <div className="text-center py-8"><p className="text-muted-foreground text-sm mb-4">Iniciá sesión para ver tu portfolio.</p><Button onClick={() => setIsAuthModalOpen(true)}>Ingresar</Button></div>
                      ) : consolidatedPositions.length === 0 ? (
                        <div className="p-6 text-center border-2 border-dashed border-border/50 rounded-xl bg-muted/10"><Layers className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" /><p className="text-sm font-medium text-muted-foreground">No tenés posiciones activas en este mercado.</p></div>
                      ) : (
                        <div className="space-y-4">
                          {!selectedSellPosition ? (
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5"><Layers className="w-3 h-3" /> Selecciona qué liquidar</p>
                              {consolidatedPositions.map(pos => {
                                const opt = options.find(o => o.id === pos.outcome);
                                const cashoutVal = pos.totalShares * getNormalizedPrice(pos.outcome, pos.direction);
                                const pnl = cashoutVal - pos.totalInvested;
                                const pnlPct = pos.totalInvested > 0 ? (pnl / pos.totalInvested) * 100 : 0;
                                const isRed = pos.direction === 'no' || (isBinaryYesNo && opt?.option_name.toLowerCase() === 'no');

                                return (
                                  <div key={`${pos.outcome}-${pos.direction}`} className={cn("p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/30 cursor-pointer transition-colors", isMarketClosed && "opacity-75")} onClick={() => { if (!isMarketClosed) setSelectedSellPosition(`${pos.outcome}|${pos.direction}`) }}>
                                    <div className="flex justify-between items-start mb-3">
                                      <div>
                                        <p className="font-bold text-foreground">
                                          {isBinaryYesNo ? (
                                            <span className={cn("mr-1", isRed ? "text-red-600 dark:text-red-500" : "text-green-600 dark:text-green-500")}>{(opt?.id === yesOption?.id && pos.direction === 'no') || (opt?.id === noOption?.id && pos.direction === 'yes') ? noOption?.option_name : yesOption?.option_name}</span>
                                          ) : (
                                            <><span className={cn("mr-1", isRed ? "text-red-600 dark:text-red-500" : "text-green-600 dark:text-green-500")}>{pos.direction === 'no' ? 'No' : 'Sí'}</span> a {opt?.option_name || "Opción"}</>
                                          )}
                                        </p>
                                        <p className="text-xs text-muted-foreground font-medium mt-0.5">{Math.round(pos.totalShares).toLocaleString()} acciones</p>
                                      </div>
                                      <Badge variant="outline" className={cn("font-bold border", pnl >= 0 ? "bg-green-500/10 text-green-600 dark:text-green-500 border-green-500/30" : "bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/30")}>{pnl >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%</Badge>
                                    </div>
                                    <div className="flex justify-between items-center text-sm pt-2 border-t border-border/50">
                                      <span className="text-muted-foreground">Valor Actual:</span>
                                      <span className="font-bold text-primary">{cashoutVal.toLocaleString()} pts</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="space-y-4 animate-in slide-in-from-right-4">
                              {(() => {
                                const [optId, dir] = selectedSellPosition.split('|');
                                const opt = options.find(o => o.id === optId);
                                const pos = consolidatedPositions.find(p => p.outcome === optId && p.direction === dir);
                                if (!pos) return null;

                                const maxShares = pos.totalShares;
                                const sharesToSell = parseFloat(sellSharesInput) || maxShares;
                                const expectedReturn = sellSimulation || 0;                                const isRed = dir === 'no' || (isBinaryYesNo && opt?.option_name.toLowerCase() === 'no');

                                return (
                                  <>
                                    <div className="flex items-center gap-2 mb-2">
                                      <button onClick={() => { setSelectedSellPosition(null); setSellSharesInput(""); }} className="p-1 hover:bg-muted rounded text-muted-foreground"><ArrowLeft className="w-4 h-4" /></button>
                                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Confirmar Venta</p>
                                    </div>

                                    <div className={cn("p-4 rounded-xl border", !isRed ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5')}>
                                      <p className="text-sm font-black text-foreground">{isBinaryYesNo ? ((opt?.id === yesOption?.id && dir === 'no') || (opt?.id === noOption?.id && dir === 'yes') ? noOption?.option_name : yesOption?.option_name) : `${dir === 'yes' ? 'Sí' : 'No'} a ${opt?.option_name}`}</p>
                                      <p className="text-xs font-medium text-muted-foreground mt-1">Posición total: <span className="font-bold text-foreground">{maxShares.toLocaleString()} acciones</span></p>
                                    </div>

                                    <div className="mt-4 mb-2 border border-border/50 rounded-xl p-4 bg-muted/10">
                                      <div className="flex justify-between items-center mb-2">
                                        <Label className="text-muted-foreground text-xs font-bold">Cantidad a vender</Label>
                                        <button
                                          onClick={() => {
                                            const safeMax = Math.floor(maxShares * 10000) / 10000;
                                            setSellSharesInput(safeMax.toString());
                                          }}
                                          className="text-[10px] font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors bg-primary/10 px-2 py-0.5 rounded-full"
                                        >
                                          MAX
                                        </button>
                                      </div>
                                      <div className="relative mb-5">
                                        <Input type="number" step="any" placeholder="0" min="0" max={maxShares} value={sellSharesInput === "" ? maxShares.toString() : sellSharesInput} onChange={(e) => {
                                          const val = parseFloat(e.target.value);
                                          if (!isNaN(val) && val >= 0 && val <= maxShares) {
                                            setSellSharesInput(e.target.value);
                                          } else if (e.target.value === "") {
                                            setSellSharesInput("");
                                          }
                                        }} disabled={isMarketClosed} className="pl-4 pr-20 h-14 text-xl font-bold bg-background border-border/50 focus-visible:ring-1 focus-visible:ring-primary/50 disabled:opacity-50" />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">acciones</span>
                                      </div>
                                      <Slider
                                        value={[sellSharesInput === "" ? maxShares : parseFloat(sellSharesInput) || 0]}
                                        min={0}
                                        max={maxShares}
                                        step={0.001}
                                        onValueChange={(vals) => setSellSharesInput(vals[0].toString())}
                                        disabled={isMarketClosed}
                                        className="py-1"
                                      />
                                    </div>

                                    <div className="p-4 rounded-xl bg-background border border-border/50">
                                      <div className="flex justify-between items-center w-full text-base">
                                        <span className="font-bold text-foreground whitespace-nowrap mr-2">Retorno Estimado</span>
                                        <span className="font-black text-primary">{expectedReturn.toLocaleString()} pts</span>
                                      </div>
                                    </div>

                                    <Button size="lg" className="w-full h-12 font-bold bg-secondary hover:bg-secondary/80 text-secondary-foreground mt-2" onClick={executeSellShares} disabled={isSelling || isMarketClosed}>
                                      {isMarketClosed ? <><Lock className="w-4 h-4 mr-2" /> Bloqueado</> : isSelling ? <Loader2 className="w-4 h-4 animate-spin" /> : `Liquidar por ${expectedReturn} pts`}
                                    </Button>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                )}
              </div>
            </div>

            <div className="hidden lg:block w-full">
              {TopHoldersBlock}
            </div>

          </div>
        </div>

      </main>

      <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
        <DialogContent className="w-[95vw] max-w-md rounded-[24px] border-border/50 bg-background/95 backdrop-blur-xl p-6 shadow-2xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center gap-2.5 text-2xl font-black">
              <Share2 className="w-6 h-6 text-primary" /> Compartir Mercado
            </DialogTitle>
            <DialogDescription className="text-base text-muted-foreground font-medium mt-1">
              Invitá a tus amigos a predecir y debatir en este mercado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Button variant="outline" className="w-full h-14 flex items-center justify-start gap-3.5 text-base font-bold border-border/50 hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/30 transition-all rounded-xl" onClick={handleWhatsAppShare}>
              <MessageCircle className="w-6 h-6 text-green-500" /> Compartir en WhatsApp
            </Button>
            <Button variant="outline" className="w-full h-14 flex items-center justify-start gap-3.5 text-base font-bold border-border/50 hover:bg-foreground/5 hover:text-foreground hover:border-foreground/30 transition-all rounded-xl" onClick={handleTwitterShare}>
              <XIcon className="w-5 h-5" /> Compartir en X
            </Button>
            <div className="mt-2 flex flex-col gap-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Enlace del mercado</Label>
              <div className="relative group">
                <Input readOnly value={marketUrl} className="pr-24 bg-muted/30 border-border/50 h-14 text-sm text-foreground font-medium rounded-xl truncate focus-visible:ring-primary/30 transition-all" />
                <Button size="sm" variant={isCopied ? "default" : "secondary"} className={cn("absolute right-1.5 top-1.5 bottom-1.5 h-11 px-4 font-bold rounded-lg transition-all", isCopied ? "bg-green-500 hover:bg-green-600 text-white" : "hover:bg-muted-foreground/10")} onClick={handleCopyLink}>
                  {isCopied ? <><Check className="w-4 h-4 mr-1.5" /> Copiado</> : <><Copy className="w-4 h-4 mr-1.5" /> Copiar</>}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-2 sm:justify-center">
            <Button variant="ghost" className="w-full h-12 font-bold text-base rounded-xl text-muted-foreground hover:text-foreground" onClick={() => setIsShareModalOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={() => { setIsAuthModalOpen(false); fetchUserAndProfile(); }} isDarkMode={isDarkMode} />
    </div>
  );
}