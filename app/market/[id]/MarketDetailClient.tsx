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
import { sellBet } from "@/lib/actions";
import { Loader2, ArrowLeft, Clock, Coins, X, User as UserIcon, MessageSquare, Reply, ChevronDown, ChevronUp, Trash2, TrendingUp, LineChart as LineChartIcon, Share2, Twitter, MessageCircle, Copy, Check, Lock, CheckCircle2, Trophy, Scale, AlertCircle, Wallet, Layers } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LightweightChart } from "@/components/lightweight-chart";
import { useTheme } from "@/components/theme-provider";

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

  const [userBets, setUserBets] = useState<any[]>([]);
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

  const fetchUserBets = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('bets')
      .select('*')
      .eq('market_id', marketId)
      .eq('user_id', user.id)
      .eq('status', 'active');

    setUserBets(data || []);
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

    const { data: betsData } = await supabase.from("bets").select("*").eq("market_id", marketId).order("created_at", { ascending: false });
    const { data: cashoutsData } = await supabase.from("transactions").select("*").eq("market_id", marketId).eq("type", "cashout").order("created_at", { ascending: false });

    const rawBets = betsData || [];
    const rawCashouts = cashoutsData || [];

    const userIds = [...new Set([...rawBets.map(b => b.user_id), ...rawCashouts.map(c => c.user_id)])];
    const profileMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase.from("profiles").select("id, username, avatar_url").in("id", userIds);
      if (profilesData) profilesData.forEach(p => { profileMap[p.id] = p; });
    }

    const mappedBets = rawBets.map(bet => ({ ...bet, activityType: 'bet', profiles: { username: profileMap[bet.user_id]?.username || "Usuario Anónimo", avatar_url: profileMap[bet.user_id]?.avatar_url } }));
    const mappedCashouts = rawCashouts.map(c => ({ ...c, activityType: 'cashout', profiles: { username: profileMap[c.user_id]?.username || "Usuario Anónimo", avatar_url: profileMap[c.user_id]?.avatar_url } }));

    const combinedFeed = [...mappedBets, ...mappedCashouts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setActivityFeed(combinedFeed);

    const { data: commentsData } = await supabase.from("comments").select("*, profiles(username, avatar_url)").eq("market_id", marketId).order("created_at", { ascending: true });
    setComments(commentsData || []);

    setIsLoading(false);
  }, [marketId, router, supabase]);

  useEffect(() => {
    fetchUserAndProfile();
    fetchData();
  }, [fetchUserAndProfile, fetchData]);

  useEffect(() => {
    if (user) fetchUserBets();
  }, [user, fetchData, fetchUserBets]);

  useEffect(() => {
    const channel = supabase.channel(`market-${marketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bets", filter: `market_id=eq.${marketId}` }, () => { fetchData(); fetchUserBets(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_options", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [marketId, supabase, fetchData, fetchUserBets]);

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
  const activeTotalVotes = activeOptions.reduce((acc, opt) => acc + Number(opt.total_votes || 0), 0);
  const realTotalVotes = options.reduce((acc, opt) => acc + Number(opt.total_votes || 0), 0);

  const getOptionPrice = useCallback((optionVotes: number, isEliminated: boolean = false) => {
    if (isEliminated) return 0;
    const totalActiveOpts = activeOptions.length || 2;
    let price = (Number(optionVotes) + 100.0) / (activeTotalVotes + (totalActiveOpts * 100.0));
    return Math.max(0.01, Math.min(0.99, price));
  }, [activeOptions.length, activeTotalVotes]);

  const calculatePartialCashout = (optId: string, direction: string, sharesToSell: number) => {
    const opt = options.find(o => o.id === optId);
    if (!opt || sharesToSell <= 0) return 0;

    const optionVotes = Number(opt.total_votes || 0);
    const totalOptions = options.length || 2;

    const startPriceYes = (optionVotes + 100.0) / (realTotalVotes + (totalOptions * 100.0));
    const estPayout = sharesToSell * (direction === 'yes' ? startPriceYes : (1 - startPriceYes));

    let endPriceYes = 0;
    if (direction === 'yes') {
      endPriceYes = Math.max(0.01, (optionVotes - estPayout + 100.0) / (Math.max(1, realTotalVotes - estPayout) + (totalOptions * 100.0)));
    } else {
      endPriceYes = Math.max(0.01, (optionVotes + 100.0) / (Math.max(1, realTotalVotes - estPayout) + (totalOptions * 100.0)));
    }

    let avgPriceYes = (startPriceYes + endPriceYes) / 2.0;
    avgPriceYes = Math.max(0.01, Math.min(0.99, avgPriceYes));

    const currentPrice = direction === 'yes' ? avgPriceYes : (1 - avgPriceYes);
    return Math.round(sharesToSell * currentPrice);
  };

  const handlePlaceBet = async () => {
    if (!user) { setIsAuthModalOpen(true); return; }
    if (!selectedOptionId || !betAmount) return;

    const numericAmount = parseInt(betAmount, 10);
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

    const sharesToBuy = orderSummary?.shares || 0;

    const { error } = await supabase.rpc("realizar_apuesta", {
      p_amount: numericAmount,
      p_market_id: marketId,
      p_outcome: selectedOptionId,
      p_direction: selectedDirection,
      p_shares: sharesToBuy
    });

    setIsPlacingBet(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const optionName = options.find(o => o.id === selectedOptionId)?.option_name || "la opción";
      const directionText = selectedDirection === 'yes' ? 'a favor de' : 'en contra de';

      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Apuesta confirmada",
        message: `Invertiste ${numericAmount} pts en la opción ${optionName}`,
        type: "trade",
        read: false,
        market_id: marketId,
      });

      const { data: updatedOptions } = await supabase.from("market_options").select("*").eq("market_id", marketId);
      if (updatedOptions && updatedOptions.length > 0) {
        const activeOpts = updatedOptions.filter(o => !o.is_eliminated);
        const newTotalActiveVotes = activeOpts.reduce((acc, opt) => acc + Number(opt.total_votes || 0), 0);
        const totalOptsCount = activeOpts.length || 2;

        const historyInserts = updatedOptions.map(opt => {
          let percentage = 0;
          if (!opt.is_eliminated) {
            let price = (Number(opt.total_votes || 0) + 100.0) / (newTotalActiveVotes + (totalOptsCount * 100.0));
            percentage = Math.max(0.01, Math.min(0.99, price)) * 100;
          }
          return {
            market_id: marketId,
            option_id: opt.id,
            percentage: percentage
          };
        });

        await supabase.from("market_option_history").insert(historyInserts);
      }

      toast({ title: "¡Orden ejecutada!", description: `Compraste acciones ${directionText} ${optionName}` });

      setBetAmount("");
      setSelectedOptionId(null);
      setSelectedSellPosition(null);

      fetchUserAndProfile();
      fetchUserBets();
      fetchData();
    }
  };

  const executeSellShares = async () => {
    if (!selectedSellPosition) return;

    const [optId, dir] = selectedSellPosition.split('|');
    
    // Buscamos el ticket activo en userBets para esta posición
    const activeBet = userBets.find(b => b.outcome === optId && b.direction === dir && b.amount > 0 && b.shares > 0);
    
    if (!activeBet) {
      toast({ title: "No se encontró el ticket", variant: "destructive" });
      return;
    }

    setIsSelling(true);
    const { ok, error, cashoutValue } = await sellBet(activeBet.id);
    setIsSelling(false);

    if (!ok) {
      toast({ title: "Error al vender", description: error || "Hubo un problema", variant: "destructive" });
    } else {
      toast({ title: "¡Venta exitosa!", description: `Recibiste +${cashoutValue?.toLocaleString()} pts.` });

      setSellSharesInput("");
      setSelectedSellPosition(null);
      setSelectedOptionId(null);

      fetchUserAndProfile();
      fetchUserBets();
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

  const consolidatedPositions = useMemo(() => {
    const activeBets = userBets.filter(b => b.amount > 0 && b.shares > 0);
    if (activeBets.length === 0) return [];

    const positions: Record<string, { outcome: string; direction: string; totalShares: number; totalInvested: number }> = {};

    activeBets.forEach(bet => {
      const key = `${bet.outcome}|${bet.direction}`;
      if (!positions[key]) {
        positions[key] = { outcome: bet.outcome, direction: bet.direction || 'yes', totalShares: 0, totalInvested: 0 };
      }
      positions[key].totalShares += Number(bet.shares);
      positions[key].totalInvested += Number(bet.amount);
    });

    return Object.values(positions);
  }, [userBets]);

  const timeframes: ChartTimeframe[] = ['1D', '1W', '1M', 'ALL'];

  // --- ARREGLO 2 y 3: Génesis y Proyección inamovibles ---
  const filteredHistory = useMemo(() => {
    if (!market || options.length === 0) return [];

    const now = Date.now();
    const marketCreatedAt = new Date(market.created_at).getTime();

    // 1. PUNTO GÉNESIS
    const genesisPoint: any = { timestamp: marketCreatedAt };
    const totalOptsCount = options.length || 2;
    options.forEach(opt => {
      genesisPoint[opt.id] = (1 / totalOptsCount) * 100;
    });

    // 2. FORWARD FILL Y EVENTOS DE ELIMINACIÓN
    const rawHistory = (history || [])
      .filter(h => h.timestamp > marketCreatedAt + 2000)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const eliminations = options
      .filter(o => o.is_eliminated && o.eliminated_at)
      .map(o => ({ optId: o.id, elimTime: new Date(o.eliminated_at).getTime() }));

    const events: { type: 'history' | 'elimination', timestamp: number, data?: any, optId?: string }[] = [];
    rawHistory.forEach(h => events.push({ type: 'history', timestamp: h.timestamp, data: h }));
    eliminations.forEach(e => events.push({ type: 'elimination', timestamp: e.elimTime, optId: e.optId }));

    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const timeline: any[] = [genesisPoint];
    let lastKnownState = { ...genesisPoint };

    const normalizeState = (timestamp: number, baseValues: Record<string, number>) => {
      let activePool = 0;
      options.forEach(opt => {
        if (opt.is_eliminated && opt.eliminated_at && timestamp >= new Date(opt.eliminated_at).getTime()) {
          baseValues[opt.id] = 0;
        } else {
          activePool += baseValues[opt.id];
        }
      });
      
      const newState: any = { timestamp };
      options.forEach(opt => {
        if (baseValues[opt.id] === 0 || activePool === 0) {
          newState[opt.id] = 0;
        } else {
          newState[opt.id] = (baseValues[opt.id] / activePool) * 100;
        }
      });
      return newState;
    };

    events.forEach(event => {
      if (event.type === 'history') {
        const point = event.data;
        const baseValues: Record<string, number> = {};
        options.forEach(opt => {
          let val = lastKnownState[opt.id];
          if (point[opt.id] !== undefined && !Number.isNaN(Number(point[opt.id]))) {
            val = Number(point[opt.id]);
          }
          baseValues[opt.id] = val;
        });
        
        const newState = normalizeState(point.timestamp, baseValues);
        timeline.push(newState);
        lastKnownState = { ...newState };
      } else if (event.type === 'elimination') {
        if (timeline[timeline.length - 1].timestamp < event.timestamp - 1) {
          timeline.push({ ...lastKnownState, timestamp: event.timestamp - 1 });
        }
        
        const baseValues: Record<string, number> = {};
        options.forEach(opt => { baseValues[opt.id] = lastKnownState[opt.id]; });
        baseValues[event.optId!] = 0;
        
        const newState = normalizeState(event.timestamp, baseValues);
        timeline.push(newState);
        lastKnownState = { ...newState };
      }
    });

    // 3. ESTADO DE RESOLUCIÓN O EN VIVO
    if (market.status === 'resolved') {
      const resolvedAt = market.resolved_at 
        ? new Date(market.resolved_at).getTime() 
        : (timeline[timeline.length - 1].timestamp) + 1000;
      
      const resolutionPoint: any = { timestamp: resolvedAt };
      options.forEach(opt => {
        resolutionPoint[opt.id] = opt.id === market.winning_outcome ? 100 : 0;
      });
      timeline.push(resolutionPoint);
      timeline.push({ ...resolutionPoint, timestamp: now }); 
    } else {
      timeline.push({ ...lastKnownState, timestamp: now });
    }

    // 4. USAR TIMELINE COMPLETO SIEMPRE
    let result = timeline;

    // 5. DENSIFY TIMELINE PARA TOOLTIP CONTINUO
    const denseResult = [];
    if (result.length > 0) {
      const minT = result[0].timestamp;
      const maxT = result[result.length - 1].timestamp;
      // Generamos puntos intermedios para que el mouse no salte en vacíos grandes
      const step = Math.max(1000, (maxT - minT) / 150);

      let currentIndex = 0;
      for (let t = minT; t <= maxT; t += step) {
        while (currentIndex < result.length - 1 && result[currentIndex + 1].timestamp <= t) {
          denseResult.push(result[currentIndex]);
          currentIndex++;
        }
        if (denseResult.length === 0 || denseResult[denseResult.length - 1].timestamp !== t) {
          denseResult.push({ ...result[currentIndex], timestamp: t });
        }
      }
      if (denseResult[denseResult.length - 1].timestamp !== maxT) {
        denseResult.push(result[result.length - 1]);
      }
      return denseResult.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    return result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [market, options, history, getOptionPrice]);

  const dynamicStrokeWidth = (chartTimeframe === 'ALL' || chartTimeframe === '1Y' || chartTimeframe === '6M') ? 2 : 3;

  const axisTextColor = isDarkMode ? '#a1a1aa' : '#64748b';
  const axisLineColor = isDarkMode ? '#334155' : '#e2e8f0';

  const formatXAxis = (tick: number) => {
    const date = new Date(tick);
    if (chartTimeframe === '1H' || chartTimeframe === '6H' || chartTimeframe === '1D') {
      return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    }
    if (chartTimeframe === '1W' || chartTimeframe === '1M') {
      return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    }
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  const marketPositionSummary = useMemo(() => {
    if (consolidatedPositions.length === 0) return null;
    let totalInvested = 0;
    let totalCurrentValue = 0;

    consolidatedPositions.forEach(pos => {
      totalInvested += pos.totalInvested;
      totalCurrentValue += calculatePartialCashout(pos.outcome, pos.direction, pos.totalShares);
    });

    if (totalInvested === 0) return null;
    const pnl = totalCurrentValue - totalInvested;
    const pnlPct = (pnl / totalInvested) * 100;
    return { totalInvested, totalCurrentValue, pnl, pnlPct };
  }, [consolidatedPositions, options, realTotalVotes]);

  const topHolders = useMemo(() => {
    const holders: Record<string, { userId: string, username: string, avatarUrl: string | null, invested: number }> = {};

    activityFeed.forEach(item => {
      if (item.activityType === 'bet' && item.status !== 'sold') {
        const opt = options.find(o => o.id === item.outcome);
        if (opt && opt.is_eliminated) return;

        if (!holders[item.user_id]) {
          holders[item.user_id] = {
            userId: item.user_id,
            username: item.profiles?.username || 'Usuario Anónimo',
            avatarUrl: item.profiles?.avatar_url || null,
            invested: 0
          };
        }
        holders[item.user_id].invested += Number(item.amount);
      }
    });

    return Object.values(holders)
      .filter(h => h.invested > 0)
      .sort((a, b) => b.invested - a.invested)
      .slice(0, 5);
  }, [activityFeed, options]);

  const orderSummary = useMemo(() => {
    if (!selectedOptionId || !betAmount || isNaN(Number(betAmount)) || Number(betAmount) <= 0) return null;
    const amount = Number(betAmount);
    const opt = options.find(o => o.id === selectedOptionId);
    if (!opt) return null;

    const optionVotes = Number(opt.total_votes || 0);
    const totalOptions = activeOptions.length || 2;

    const startPriceYes = (optionVotes + 100.0) / (activeTotalVotes + (totalOptions * 100.0));
    let endPriceYes = startPriceYes;
    if (selectedDirection === 'yes') {
      endPriceYes = (optionVotes + amount + 100.0) / (activeTotalVotes + amount + (totalOptions * 100.0));
    } else {
      endPriceYes = (optionVotes + 100.0) / (activeTotalVotes + amount + (totalOptions * 100.0));
    }

    let avgPriceYes = (startPriceYes + endPriceYes) / 2.0;
    avgPriceYes = Math.max(0.01, Math.min(0.99, avgPriceYes));

    const avgPrice = selectedDirection === 'yes' ? avgPriceYes : (1 - avgPriceYes);
    const startPrice = selectedDirection === 'yes' ? startPriceYes : (1 - startPriceYes);

    const shares = amount / avgPrice;
    const potentialPayout = shares;
    const potentialProfit = potentialPayout - amount;
    const roi = (potentialProfit / amount) * 100;
    const slippage = ((avgPrice - startPrice) / startPrice) * 100;

    return {
      avgPriceCents: Math.round(avgPrice * 100),
      shares: Math.floor(shares),
      potentialPayout: Math.floor(potentialPayout),
      potentialProfit: Math.floor(potentialProfit),
      roi,
      slippage
    };
  }, [betAmount, selectedOptionId, selectedDirection, options, activeTotalVotes, activeOptions]);

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

  const winningOption = isMarketResolved ? options.find(o => o.id === market.winning_outcome) : null;

  const topLevelComments = comments.filter(c => !c.parent_id).reverse();

  const isBinaryYesNo = options.length === 2 &&
    options.some(o => ['sí', 'si', 'yes'].includes(o.option_name.toLowerCase())) &&
    options.some(o => o.option_name.toLowerCase() === 'no');

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

      <main className="w-full max-w-[1440px] mx-auto px-4 md:px-8 py-8 flex-1">
        <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/"><ArrowLeft className="w-4 h-4 mr-2" />Volver a Mercados</Link>
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative items-start">
          {/* COLUMNA IZQUIERDA: 70% del ancho (Protagonista) */}
          <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6 min-w-0">
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
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-3">
                  <div className="flex items-center gap-1.5"><Coins className="w-4 h-4" />{realTotalVotes.toLocaleString()} pts Vol.</div>
                  <div className={cn("flex items-center gap-1.5", isMarketResolved ? "text-primary font-medium" : isMarketClosed ? "text-red-500 font-medium" : "")}>
                    <Clock className="w-4 h-4" />
                    {isMarketResolved ? "Mercado finalizado" : isMarketClosed ? `Cerró el ${new Date(market.end_date).toLocaleDateString()}` : `Cierra: ${new Date(market.end_date).toLocaleDateString()}`}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative min-w-0 w-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h3 className="font-semibold flex items-center gap-2">
                  <LineChartIcon className="w-5 h-5 text-primary" /> Tendencia del Mercado
                </h3>
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
              </div>

              {filteredHistory.length > 0 ? (
                <div className="w-full h-[350px] relative min-w-0 overflow-hidden pr-2 lg:pr-8 mt-4 mb-2">
                    <LightweightChart data={filteredHistory} options={options} marketCreatedAt={new Date(market.created_at).getTime()} chartTimeframe={chartTimeframe} />
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
                      selectedOptionId === yesOption.id ? "bg-green-500/10 border-green-500" : "bg-muted/10 border-border/50 hover:border-green-500/50")}
                  >
                    <div className="flex w-full items-center justify-between px-3 py-2">
                      <span className="text-xs font-semibold text-foreground">SÍ</span>
                      <span className="text-sm font-black text-green-600 dark:text-green-400">{Math.round(getOptionPrice(yesOption.total_votes) * 100)}¢</span>
                    </div>
                  </div>
                  <div
                    onClick={() => { if (!isMarketClosed) { setSelectedOptionId(noOption.id); setSelectedDirection('yes'); setTradeTab("buy"); } }}
                    className={cn("rounded-lg border transition-all cursor-pointer",
                      isMarketClosed ? "opacity-60 cursor-not-allowed bg-muted" : "hover:bg-muted/30",
                      selectedOptionId === noOption.id ? "bg-red-500/10 border-red-500" : "bg-muted/10 border-border/50 hover:border-red-500/50")}
                  >
                    <div className="flex w-full items-center justify-between px-3 py-2">
                      <span className="text-xs font-semibold text-foreground">NO</span>
                      <span className="text-sm font-black text-red-600 dark:text-red-400">{Math.round(getOptionPrice(noOption.total_votes) * 100)}¢</span>
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
                    const priceA = getOptionPrice(a.total_votes, a.is_eliminated);
                    const priceB = getOptionPrice(b.total_votes, b.is_eliminated);
                    return priceB - priceA;
                  }).map((opt) => {
                    const yesPrice = getOptionPrice(opt.total_votes, opt.is_eliminated);
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

            {/* TABS (Actividad / Debate) */}
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
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
                {activityFeed.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-border/50 rounded-xl bg-muted/10 mx-4 my-4">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                    <p className="text-sm font-medium text-muted-foreground">Aún no hay actividad en este mercado. ¡Sé el primero!</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-border">
                    {activityFeed.map((item) => {
                      if (item.activityType === 'bet') {
                        const opt = options.find(o => o.id === item.outcome);
                        let displayOutcome = opt?.option_name || '';
                        let optColor = opt?.color || '#0ea5e9';

                        if (!opt && (item.outcome === 'yes' || item.outcome === 'no')) {
                          displayOutcome = item.outcome === 'yes' ? 'SÍ' : 'NO';
                          optColor = item.outcome === 'yes' ? '#22c55e' : '#ef4444';
                        } else if (isBinaryYesNo) {
                          optColor = displayOutcome.toLowerCase() === 'no' ? '#ef4444' : '#22c55e';
                        } else if (item.direction === 'no') {
                          displayOutcome = `No a ${opt?.option_name}`;
                          optColor = '#ef4444';
                        }

                        const hasShares = item.shares && item.shares > 0;
                        const impliedPrice = hasShares ? (item.amount / item.shares) * 100 : null;

                        return (
                          <div key={`bet-${item.id}`} className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors group">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-border/50 bg-background overflow-hidden cursor-pointer" onClick={() => openUserProfile(item.user_id, item.profiles?.username || "Usuario")}>
                                {item.profiles?.avatar_url ? <img src={item.profiles.avatar_url} alt="av" className="w-full h-full object-cover" /> : <UserIcon className="w-4 h-4 text-muted-foreground opacity-50" />}
                              </div>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors text-foreground" onClick={() => openUserProfile(item.user_id, item.profiles?.username || "Usuario")}>{item.profiles?.username || "Usuario"}</span>
                                  <span className="text-sm font-medium text-muted-foreground">compró</span>
                                  <span className="text-sm font-bold uppercase" style={{ color: optColor }}>{displayOutcome || 'Opción'}</span>
                                </div>
                                {hasShares ? (
                                  <span className="text-xs font-medium text-muted-foreground mt-0.5">
                                    {Math.round(item.shares).toLocaleString()} acciones ({Math.round(impliedPrice || 0)}¢)
                                  </span>
                                ) : (
                                  <span className="text-xs font-medium text-muted-foreground mt-0.5">
                                    {item.amount.toLocaleString()} pts invertidos
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex flex-col items-end shrink-0 pl-2">
                              <p className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                                {new Date(item.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} • {new Date(item.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        );
                      } else {
                        let sharesSold = null;
                        let priceSold = null;
                        let soldOptionName = null;
                        let soldDirection = null;

                        if (item.description) {
                          const matchShares = item.description.match(/Venta de ([\d.,]+) acciones/i);
                          const matchPrice = item.description.match(/a ([\d.,]+)¢/i);
                          const matchOption = item.description.match(/\((.*?)\)/);

                          if (matchShares) sharesSold = parseFloat(matchShares[1].replace(/,/g, ''));
                          if (matchPrice) priceSold = parseFloat(matchPrice[1].replace(/,/g, ''));
                          if (matchOption) {
                            const optText = matchOption[1];
                            if (optText.toLowerCase().startsWith('no a ')) {
                              soldDirection = 'no';
                              soldOptionName = optText.substring(5);
                            } else if (optText.toLowerCase().startsWith('si a ') || optText.toLowerCase().startsWith('sí a ')) {
                              soldDirection = 'yes';
                              soldOptionName = optText.substring(5);
                            } else {
                              soldOptionName = optText;
                            }
                          }
                        }

                        if (!sharesSold && item.shares && item.shares > 0) {
                          sharesSold = item.shares;
                          priceSold = (Math.abs(item.amount) / item.shares) * 100;
                        }

                        return (
                          <div key={`cashout-${item.id}`} className="flex items-center justify-between p-4 bg-muted/5 hover:bg-muted/10 transition-colors border-l-2 border-l-muted group">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-border/50 bg-background overflow-hidden cursor-pointer" onClick={() => openUserProfile(item.user_id, item.profiles?.username || "Usuario")}>
                                {item.profiles?.avatar_url ? <img src={item.profiles.avatar_url} alt="av" className="w-full h-full object-cover" /> : <UserIcon className="w-4 h-4 text-muted-foreground opacity-50" />}
                              </div>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors text-foreground" onClick={() => openUserProfile(item.user_id, item.profiles?.username || "Usuario")}>{item.profiles?.username || "Usuario"}</span>
                                  <span className="text-sm font-medium text-muted-foreground">vendió</span>
                                  {soldOptionName ? (
                                    <span className="text-sm font-bold uppercase" style={{ color: soldDirection === 'no' ? '#ef4444' : '#22c55e' }}>
                                      {soldDirection === 'no' ? `No a ${soldOptionName}` : soldOptionName}
                                    </span>
                                  ) : (
                                    <span className="text-sm font-bold text-muted-foreground">su posición</span>
                                  )}
                                </div>
                                <span className="text-xs font-medium text-muted-foreground mt-0.5">
                                  {sharesSold && priceSold
                                    ? `${Math.round(sharesSold).toLocaleString()} acciones (${Math.round(priceSold)}¢)`
                                    : (item.description && item.description !== 'Cashout de predicción' ? item.description : `Liquidación por ${Math.abs(item.amount).toLocaleString()} pts`)}
                                </span>
                              </div>
                            </div>
                            <div className="text-right flex flex-col items-end shrink-0 pl-2">
                              <p className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                                {new Date(item.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} • {new Date(item.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        );
                      }
                    })}
                  </div>
                )}
              </div>
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

          {/* COLUMNA DERECHA: 30% del ancho (Panel de Trading Sticky) */}
          <div className="lg:col-span-4 xl:col-span-3 sticky top-24 self-start flex flex-col gap-6 z-40">
            
            {/* BACKDROP FUERA DEL CONTENEDOR TRANSFORMADO PARA QUE CUBRA TODA LA PANTALLA */}
            {(selectedOptionId || selectedSellPosition) && (
              <div
                className="fixed inset-0 bg-black/60 z-[45] lg:hidden animate-in fade-in duration-300"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedOptionId(null);
                  setSelectedSellPosition(null);
                }}
              />
            )}

            <div className={cn(
              "border border-border/50 bg-card shadow-2xl lg:shadow-xl relative z-50",
              (selectedOptionId || selectedSellPosition || isMarketResolved)
                ? "fixed bottom-0 left-0 right-0 animate-in slide-in-from-bottom duration-300 rounded-t-3xl rounded-b-none lg:static lg:rounded-2xl"
                : "rounded-2xl overflow-hidden"
            )}>

              <div className={cn(
                "p-3 sm:p-4 bg-card relative z-50",
                (selectedOptionId || selectedSellPosition || isMarketResolved)
                  ? "rounded-t-3xl rounded-b-none lg:rounded-2xl max-h-[85dvh] overflow-y-auto pb-8 lg:pb-3"
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
                      {winningOption?.option_name || 'Desconocido'}
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
                                  {isBinaryYesNo ? `Comprar ${selectedOptName}` : `Comprar ${selectedDirection === 'yes' ? 'Sí' : 'No'}`}
                                </span>
                                <span className={cn("font-bold text-xl", !isRedTheme ? 'text-green-700 dark:text-green-500' : 'text-red-700 dark:text-red-500')}>
                                  {selectedDirection === 'yes'
                                    ? Math.round(getOptionPrice(options.find(o => o.id === selectedOptionId)?.total_votes, options.find(o => o.id === selectedOptionId)?.is_eliminated) * 100)
                                    : 100 - Math.round(getOptionPrice(options.find(o => o.id === selectedOptionId)?.total_votes, options.find(o => o.id === selectedOptionId)?.is_eliminated) * 100)}¢
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

                                {orderSummary && (
                                  <div className="p-4 rounded-xl bg-muted/20 border border-border/50 space-y-3">
                                    <div className="flex justify-between items-center w-full mb-3 text-sm">
                                      <span className="text-muted-foreground whitespace-nowrap mr-2">Precio promedio</span>
                                      <div className="flex items-center gap-2 text-right whitespace-nowrap">
                                        <span className="font-bold">{orderSummary.avgPriceCents}¢</span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center w-full mb-3 text-sm">
                                      <span className="text-muted-foreground whitespace-nowrap mr-2">Acciones estimadas</span>
                                      <div className="flex items-center gap-2 text-right whitespace-nowrap">
                                        <span className="font-bold">{orderSummary.shares.toLocaleString()}</span>
                                      </div>
                                    </div>

                                    <div className="h-px w-full bg-border/50 my-2" />

                                    <div className="flex justify-between items-center w-full mb-3 text-sm">
                                      <span className="text-muted-foreground whitespace-nowrap mr-2">Ganancia Potencial</span>
                                      <div className="flex items-center gap-2 text-right whitespace-nowrap">
                                        <span className={cn("font-bold", !isRedTheme ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>+{orderSummary.potentialProfit.toLocaleString()} pts</span>
                                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md", !isRedTheme ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>+{orderSummary.roi.toFixed(1)}%</span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center w-full mb-3 text-base">
                                      <span className="font-bold text-foreground whitespace-nowrap mr-2">Retorno Total</span>
                                      <div className="flex items-center gap-2 text-right whitespace-nowrap">
                                        <span className={cn("font-black", !isRedTheme ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>{orderSummary.potentialPayout.toLocaleString()} pts</span>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {orderSummary && orderSummary.slippage > 3 && (
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
                                          `Comprar ${isBinaryYesNo ? (selectedDirection === 'yes' ? 'Sí' : 'No') : selectedOptName} por ${betAmount || 0} pts`}
                                  </span>
                                </Button>
                              </>
                            )}

                            {marketPositionSummary && (
                              <div className="mt-4 p-4 bg-background border border-border/50 rounded-xl space-y-2 animate-in fade-in">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5"><Wallet className="w-3 h-3" /> Resumen de tus posiciones</p>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-foreground">Total Invertido</span>
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
                                const cashoutVal = calculatePartialCashout(pos.outcome, pos.direction, pos.totalShares);
                                const pnl = cashoutVal - pos.totalInvested;
                                const pnlPct = (pnl / pos.totalInvested) * 100;
                                const isRed = pos.direction === 'no' || (isBinaryYesNo && opt?.option_name.toLowerCase() === 'no');

                                return (
                                  <div key={`${pos.outcome}-${pos.direction}`} className={cn("p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/30 cursor-pointer transition-colors", isMarketClosed && "opacity-75")} onClick={() => { if (!isMarketClosed) setSelectedSellPosition(`${pos.outcome}|${pos.direction}`) }}>
                                    <div className="flex justify-between items-start mb-3">
                                      <div>
                                        <p className="font-bold text-foreground">
                                          {isBinaryYesNo ? (
                                            <span className={cn("mr-1", isRed ? "text-red-600 dark:text-red-500" : "text-green-600 dark:text-green-500")}>{opt?.option_name}</span>
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

                                const sharesToSell = pos.totalShares;
                                const expectedReturn = calculatePartialCashout(optId, dir, sharesToSell);
                                const isRed = dir === 'no' || (isBinaryYesNo && opt?.option_name.toLowerCase() === 'no');

                                return (
                                  <>
                                    <div className="flex items-center gap-2 mb-2">
                                      <button onClick={() => { setSelectedSellPosition(null); setSellSharesInput(""); }} className="p-1 hover:bg-muted rounded text-muted-foreground"><ArrowLeft className="w-4 h-4" /></button>
                                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Confirmar Venta</p>
                                    </div>

                                    <div className={cn("p-4 rounded-xl border", !isRed ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5')}>
                                      <p className="text-sm font-black text-foreground">{isBinaryYesNo ? opt?.option_name : `${dir === 'yes' ? 'Sí' : 'No'} a ${opt?.option_name}`}</p>
                                      <p className="text-xs font-medium text-muted-foreground mt-1">Se liquidará el 100% de la posición: <span className="font-bold text-foreground">{Math.round(pos.totalShares).toLocaleString()} acciones</span></p>
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