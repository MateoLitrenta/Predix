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
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { sellBet } from "@/lib/actions";
import { Loader2, ArrowLeft, Clock, Coins, X, User as UserIcon, MessageSquare, Reply, ChevronDown, ChevronUp, Trash2, ArrowDownRight, ArrowUpRight, TrendingUp, LineChart as LineChartIcon, Share2, Twitter, MessageCircle, Copy, Check, Lock, CheckCircle2, Trophy, Scale, AlertCircle, Wallet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface MarketDetailClientProps {
  marketId: string;
}

type ChartTimeframe = '1H' | '6H' | '1D' | '1W' | '1M' | '6M' | '1Y' | 'ALL';

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
  const [isDarkMode, setIsDarkMode] = useState(true);
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
  const [sellingBetId, setSellingBetId] = useState<string | null>(null);

  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);

  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('ALL');

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
    const { data } = await supabase.from('bets').select('*').eq('market_id', marketId).eq('user_id', user.id);
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
    const { data: oldHistoryData } = await supabase.from("market_history").select("*").eq("market_id", marketId).order("created_at", { ascending: true });

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
      formattedHistory = Array.from(historyMap.values()).sort((a, b) => a.timestamp - b.timestamp);
      
    } else if (oldHistoryData && oldHistoryData.length > 0 && optionsData && optionsData.length === 2) {
      const yesOpt = optionsData.find(o => o.option_name.toLowerCase().includes('s'));
      const noOpt = optionsData.find(o => o.option_name.toLowerCase().includes('n'));
      formattedHistory = oldHistoryData.map(h => {
        return {
          timestamp: new Date(h.created_at).getTime(),
          [yesOpt?.id || 'yes']: h.yes_percentage,
          [noOpt?.id || 'no']: 100 - h.yes_percentage,
        };
      }).sort((a, b) => a.timestamp - b.timestamp);
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

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDarkMode]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(marketUrl);
    setIsCopied(true);
    toast({ title: "¡Link copiado!", description: "El enlace se guardó en tu portapapeles." });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleTwitterShare = () => {
    const text = encodeURIComponent(`¡Mirá este mercado en PREDIX! ${market?.title} ¿Qué opinás?\n\n`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(marketUrl)}`, '_blank');
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`¡Mirá este mercado en PREDIX!\n*${market?.title}*\n\nEntrá y hacé tu predicción acá: ${marketUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const realTotalVotes = options.reduce((acc, opt) => acc + Number(opt.total_votes || 0), 0);

  const getOptionPrice = (optionVotes: number) => {
    const totalOpts = options.length || 2;
    let price = (Number(optionVotes) + 100.0) / (realTotalVotes + (totalOpts * 100.0));
    return Math.max(0.01, Math.min(0.99, price));
  };

  const calculateRealCashout = (bet: any, opt: any) => {
    const shares = Number(bet.shares || 0);
    if (shares <= 0) return Math.round(bet.amount * 0.95);
    
    const direction = bet.direction || 'yes';
    const optionVotes = Number(opt.total_votes || 0);
    const totalOptions = options.length || 2;

    const startPriceYes = (optionVotes + 100.0) / (realTotalVotes + (totalOptions * 100.0));
    const estPayout = shares * (direction === 'yes' ? startPriceYes : (1 - startPriceYes));

    let endPriceYes = 0;
    if (direction === 'yes') {
      endPriceYes = Math.max(0.01, (optionVotes - estPayout + 100.0) / (Math.max(1, realTotalVotes - estPayout) + (totalOptions * 100.0)));
    } else {
      endPriceYes = Math.max(0.01, (optionVotes + 100.0) / (Math.max(1, realTotalVotes - estPayout) + (totalOptions * 100.0)));
    }

    let avgPriceYes = (startPriceYes + endPriceYes) / 2.0;
    avgPriceYes = Math.max(0.01, Math.min(0.99, avgPriceYes));

    const currentPrice = direction === 'yes' ? avgPriceYes : (1 - avgPriceYes);
    return Math.round(shares * currentPrice);
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
    
    const { error } = await supabase.rpc("realizar_apuesta", { 
      p_amount: numericAmount, 
      p_market_id: marketId, 
      p_outcome: selectedOptionId,
      p_direction: selectedDirection
    });
    
    setIsPlacingBet(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const optionName = options.find(o => o.id === selectedOptionId)?.option_name || "la opción";
      const directionText = selectedDirection === 'yes' ? 'a favor de' : 'en contra de';
      toast({ title: "¡Orden ejecutada!", description: `Compraste acciones ${directionText} ${optionName}` });
      setBetAmount("");
      fetchUserAndProfile();
      fetchUserBets();
    }
  };

  const handleSellBet = async (betId: string) => {
    setSellingBetId(betId);
    const { ok, error, cashoutValue } = await sellBet(betId);
    
    if (!ok) {
      toast({ title: "Error al vender", description: error || "Hubo un problema", variant: "destructive" });
    } else {
      toast({ title: "¡Venta exitosa!", description: `Tus ganancias de ${cashoutValue?.toLocaleString()} pts ya están en tu cuenta.` });
      fetchUserAndProfile();
      fetchUserBets();
    }
    setSellingBetId(null);
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

  const filteredHistory = useMemo(() => {
    if (!history || history.length === 0) return [];

    const now = Date.now();
    let startTime = history[0].timestamp; 

    if (chartTimeframe !== 'ALL') {
      switch (chartTimeframe) {
        case '1H': startTime = now - 60 * 60 * 1000; break;
        case '6H': startTime = now - 6 * 60 * 60 * 1000; break;
        case '1D': startTime = now - 24 * 60 * 60 * 1000; break;
        case '1W': startTime = now - 7 * 24 * 60 * 60 * 1000; break;
        case '1M': startTime = now - 30 * 24 * 60 * 60 * 1000; break;
        case '6M': startTime = now - 180 * 24 * 60 * 60 * 1000; break;
        case '1Y': startTime = now - 365 * 24 * 60 * 60 * 1000; break;
      }
    }

    let baselineValue = history[0];
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].timestamp <= startTime) {
            baselineValue = history[i];
            break;
        }
    }

    const rawPoints = history.filter(h => h.timestamp > startTime);
    const dataInTimeframe = [{ ...baselineValue, timestamp: startTime }, ...rawPoints];

    if (market && market.status !== 'resolved' && dataInTimeframe.length > 0) {
        dataInTimeframe.push({ ...dataInTimeframe[dataInTimeframe.length - 1], timestamp: now });
    }

    return dataInTimeframe;
  }, [history, chartTimeframe, market]);

  const dynamicStrokeWidth = (chartTimeframe === 'ALL' || chartTimeframe === '1Y' || chartTimeframe === '6M') ? 1.2 : 2;

  const axisTextColor = isDarkMode ? '#a1a1aa' : '#64748b';
  const axisLineColor = isDarkMode ? '#334155' : '#e2e8f0';
  const tooltipBgColor = isDarkMode ? '#0f172a' : '#ffffff';
  const tooltipTextColor = isDarkMode ? '#f8fafc' : '#0f172a';

  const formatXAxis = (tick: number) => {
      const date = new Date(tick);
      if (chartTimeframe === '1H' || chartTimeframe === '6H' || chartTimeframe === '1D') {
          return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      }
      if (chartTimeframe === '1W' || chartTimeframe === '1M') {
          return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
      }
      return date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
  };

  const customTooltipLabelFormatter = (label: number) => {
      const date = new Date(label);
      return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const marketPositionSummary = useMemo(() => {
    if (!userBets || userBets.length === 0) return null;
    let totalInvested = 0;
    let totalCurrentValue = 0;
    
    userBets.forEach(bet => {
      const opt = options.find(o => o.id === bet.outcome);
      if (opt) {
        totalInvested += bet.amount;
        totalCurrentValue += calculateRealCashout(bet, opt);
      }
    });

    if (totalInvested === 0) return null;
    const pnl = totalCurrentValue - totalInvested;
    const pnlPct = (pnl / totalInvested) * 100;
    return { totalInvested, totalCurrentValue, pnl, pnlPct };
  }, [userBets, options, calculateRealCashout]);

  // CÁLCULO DE LAS BALLENAS (TOP HOLDERS)
  const topHolders = useMemo(() => {
    const holders: Record<string, { userId: string, username: string, avatarUrl: string | null, invested: number }> = {};
    
    activityFeed.forEach(item => {
      if (item.activityType === 'bet') {
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

    return Object.values(holders).sort((a, b) => b.invested - a.invested).slice(0, 5);
  }, [activityFeed]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavHeader points={profile?.points ?? 10000} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} onPointsUpdate={() => {}} userId={null} userEmail={null} onOpenAuthModal={() => {}} onSignOut={async () => {}} isAdmin={false} username={null} />
        
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
            El mercado se suspenderá automáticamente el día <span className="font-bold text-primary">{new Date(market.end_date).toLocaleDateString()}</span>. Las posiciones quedarán bloqueadas hasta que el administrador del mercado cargue el resultado oficial. Si el evento se pospone indefinidamente o resulta en un escenario imposible de dirimir, PREDIX se reserva el derecho de anular el mercado, devolviendo los puntos intactos a los inversores.
          </p>
        </div>
        <div className="flex items-start gap-3 text-xs font-medium text-amber-600 dark:text-amber-500 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 mt-2">
           <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
           <span className="leading-relaxed">Al comprar acciones en este mercado, aceptás someterte a estas reglas de resolución y a la decisión final e inapelable del comité de PREDIX.</span>
        </div>
      </div>
    </div>
  );

  const UltimasApuestasBlock = (
    <div className="pt-8 border-t border-border/50 lg:pt-0 lg:border-t-0">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" /> Actividad del Mercado</h3>
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        {activityFeed.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">Aún no hay actividad. ¡Sé el primero!</p>
        ) : (
          <div className="divide-y divide-border/50 max-h-[400px] overflow-y-auto">
            {activityFeed.map((item) => {
              if (item.activityType === 'bet') {
                const opt = options.find(o => o.id === item.outcome);
                let displayOutcome = opt?.option_name || 'Opción';
                let optColor = opt?.color || '#0ea5e9';

                if (isBinaryYesNo) {
                   displayOutcome = opt?.option_name;
                   optColor = opt?.option_name.toLowerCase() === 'no' ? '#ef4444' : '#22c55e';
                } else if (item.direction === 'no') {
                   displayOutcome = `No a ${opt?.option_name}`;
                   optColor = '#ef4444';
                }

                return (
                  <div key={`bet-${item.id}`} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${optColor}30`, color: optColor }}>
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-medium text-sm cursor-pointer hover:text-primary transition-colors" onClick={() => openUserProfile(item.user_id, item.profiles?.username || "Usuario")}>{item.profiles?.username || "Usuario"} invirtió</span>
                        <p className="text-xs text-muted-foreground block">{new Date(item.created_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-foreground">{item.amount.toLocaleString()} pts</p>
                      <p className="text-xs font-medium uppercase truncate w-24" style={{ color: optColor }}>{displayOutcome}</p>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div key={`cashout-${item.id}`} className="flex items-center justify-between p-4 bg-muted/10 hover:bg-muted/30 transition-colors border-l-4 border-l-green-500">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-green-500/20 text-green-500">
                        <ArrowDownRight className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-medium text-sm cursor-pointer hover:text-primary transition-colors" onClick={() => openUserProfile(item.user_id, item.profiles?.username || "Usuario")}>{item.profiles?.username || "Usuario"} retiró</span>
                        <p className="text-xs text-muted-foreground block">{new Date(item.created_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-500">+{item.amount.toLocaleString()} pts</p>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase">Cashout</p>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
    </div>
  );

  // BLOQUE DE BALLENAS (TOP HOLDERS)
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

  const DebateBlock = (
    <div className="pt-8 mt-8 border-t border-border/50">
      <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><MessageSquare className="w-6 h-6 text-primary" /> Debate del Mercado</h3>
      <div className="mb-8 p-4 rounded-xl border border-border/50 bg-card shadow-sm sticky top-20 z-10">
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
        {topLevelComments.length === 0 ? <p className="text-center py-8 text-muted-foreground bg-muted/10 rounded-xl border border-dashed border-border/50">Todavía no hay comentarios.</p> : topLevelComments.map(comment => renderComment(comment))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader points={profile?.points ?? 10000} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} onPointsUpdate={() => fetchUserAndProfile()} userId={user?.id ?? null} userEmail={user?.email ?? null} onOpenAuthModal={() => setIsAuthModalOpen(true)} onSignOut={async () => { await supabase.auth.signOut(); fetchUserAndProfile(); }} isAdmin={profile?.role === "admin"} username={profile?.username} />

      <main className="container mx-auto px-4 py-8 flex-1 max-w-6xl">
        <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/"><ArrowLeft className="w-4 h-4 mr-2" />Volver a Mercados</Link>
        </Button>

        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-8 items-start">
          
          <div className="lg:col-span-2 space-y-6 w-full order-1">
            <div className="flex gap-4 sm:gap-6 items-start">
              {market.image_url && <img src={market.image_url} alt="Mercado" className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shrink-0 shadow-md border border-border/50" />}
              <div>
                <div className="flex flex-wrap gap-2 mb-3 items-center">
                   <Badge variant="secondary" className="capitalize">{market.category}</Badge>
                   
                   {isMarketResolved ? (
                     <Badge variant="default" className="bg-primary/20 text-primary hover:bg-primary/30 border-primary/30 gap-1.5 font-bold">
                       <CheckCircle2 className="w-3 h-3" /> Resuelto
                     </Badge>
                   ) : isMarketClosed ? (
                     <Badge variant="destructive" className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/30 gap-1.5 font-bold">
                       <Lock className="w-3 h-3" /> Cerrado
                     </Badge>
                   ) : null}

                   <Button variant="outline" size="sm" className="h-6 px-3 text-[10px] uppercase font-bold rounded-full flex items-center gap-1.5 border-border/50 hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => setIsShareModalOpen(true)}>
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

            {market.description && <div className="p-5 rounded-xl bg-muted/30 border border-border/50 text-muted-foreground leading-relaxed">{market.description}</div>}

            <div className="p-6 rounded-xl border border-border/50 bg-card shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h3 className="font-semibold flex items-center gap-2">
                  <LineChartIcon className="w-5 h-5 text-primary" /> Tendencia del Mercado
                </h3>
                <div className="flex bg-muted/50 p-1 rounded-xl border border-border/30 w-full sm:w-auto overflow-x-auto">
                  {(['1H', '6H', '1D', '1W', '1M', '6M', '1Y', 'ALL'] as ChartTimeframe[]).map((tf) => (
                    <button 
                      key={tf} 
                      onClick={() => setChartTimeframe(tf)} 
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
                <div className="h-[300px] w-full mt-4 mb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filteredHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis 
                        dataKey="timestamp" 
                        type="number" 
                        domain={['dataMin', 'dataMax']} 
                        tickFormatter={formatXAxis}
                        stroke={axisTextColor} 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={false} 
                        minTickGap={60} 
                        dy={10}
                      />
                      <YAxis 
                        stroke={axisTextColor} 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={false} 
                        domain={[0, 100]} 
                        tickFormatter={(val) => `${val}%`} 
                        width={60} 
                        orientation="right"
                      />
                      <Tooltip 
                        labelFormatter={customTooltipLabelFormatter}
                        contentStyle={{ backgroundColor: tooltipBgColor, borderRadius: '12px', border: `1px solid ${axisLineColor}`, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', color: tooltipTextColor, fontWeight: 'bold', padding: '12px' }}
                        itemStyle={{ fontSize: '14px', fontWeight: 'bold' }}
                        labelStyle={{ color: axisTextColor, marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase' }}
                        cursor={{ stroke: axisTextColor, strokeWidth: 1, strokeDasharray: '4 4' }}
                      />
                      {options.map((opt) => (
                        <Line 
                          key={opt.id} 
                          type="stepAfter" 
                          connectNulls={true}
                          dataKey={opt.id} 
                          stroke={opt.color} 
                          strokeWidth={dynamicStrokeWidth} 
                          strokeOpacity={1} 
                          strokeLinecap="butt" 
                          strokeLinejoin="miter" 
                          dot={false} 
                          activeDot={{ r: 4, strokeWidth: 0, fill: opt.color }}
                          name={opt.option_name} 
                          isAnimationActive={false} 
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] w-full mt-4 mb-2 flex items-center justify-center border-2 border-dashed border-border/50 rounded-xl bg-muted/10">
                  <p className="text-sm font-medium text-muted-foreground">No hay actividad en este período.</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {isBinaryYesNo && yesOption && noOption ? (
                <div className="flex gap-4 mt-6">
                   <div
                     onClick={() => { if(!isMarketClosed) { setSelectedOptionId(yesOption.id); setSelectedDirection('yes'); setTradeTab("buy"); } }}
                     className={cn("flex-1 flex flex-col items-center justify-center p-6 sm:p-8 rounded-xl border-2 transition-all shadow-sm", 
                       isMarketClosed ? "opacity-60 cursor-not-allowed bg-muted" : "cursor-pointer",
                       selectedOptionId === yesOption.id ? "bg-green-500/10 border-green-500 text-green-600 dark:text-green-500" : "bg-card border-border/50 hover:border-green-500/50 hover:bg-green-500/5 text-foreground")}
                   >
                     <span className="text-3xl font-black mb-2">Sí</span>
                     <span className="text-xl font-bold opacity-80">{Math.round(getOptionPrice(yesOption.total_votes) * 100)}¢</span>
                   </div>
                   <div
                     onClick={() => { if(!isMarketClosed) { setSelectedOptionId(noOption.id); setSelectedDirection('yes'); setTradeTab("buy"); } }}
                     className={cn("flex-1 flex flex-col items-center justify-center p-6 sm:p-8 rounded-xl border-2 transition-all shadow-sm", 
                       isMarketClosed ? "opacity-60 cursor-not-allowed bg-muted" : "cursor-pointer",
                       selectedOptionId === noOption.id ? "bg-red-500/10 border-red-500 text-red-600 dark:text-red-500" : "bg-card border-border/50 hover:border-red-500/50 hover:bg-red-500/5 text-foreground")}
                   >
                     <span className="text-3xl font-black mb-2">No</span>
                     <span className="text-xl font-bold opacity-80">{Math.round(getOptionPrice(noOption.total_votes) * 100)}¢</span>
                   </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between px-2 text-xs font-bold text-muted-foreground uppercase mb-2 mt-4">
                    <span>Posibles Resultados</span>
                    <div className="flex items-center gap-8 sm:gap-24 pr-2 sm:pr-8">
                      <span className="hidden sm:block">Chance</span>
                      <span>Operar</span>
                    </div>
                  </div>
                  {options.map((opt) => {
                    const yesPrice = getOptionPrice(opt.total_votes);
                    const yesCents = Math.round(yesPrice * 100);
                    const noCents = 100 - yesCents;
                    
                    const isSelectedYes = selectedOptionId === opt.id && selectedDirection === 'yes';
                    const isSelectedNo = selectedOptionId === opt.id && selectedDirection === 'no';

                    const isWinner = isMarketResolved && market.winning_outcome === opt.id;

                    return (
                      <div key={opt.id} className={cn(
                        "flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-xl border transition-colors gap-4", 
                        isWinner ? "border-primary/50 bg-primary/5 shadow-[0_0_15px_rgba(var(--primary),0.1)]" : "border-border/50 bg-card",
                        (isMarketClosed && !isWinner) && "opacity-60"
                      )}>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-4 h-4 rounded-full shadow-inner shrink-0" style={{ backgroundColor: opt.color }} />
                          <span className={cn("font-bold text-base sm:text-lg truncate", isWinner ? "text-primary" : "text-foreground")}>
                            {opt.option_name}
                            {isWinner && <Badge className="ml-2 bg-primary text-primary-foreground text-[10px] uppercase">Ganador</Badge>}
                          </span>
                        </div>
                        
                        <div className="flex justify-start sm:justify-center w-16 sm:w-20 shrink-0 pl-7 sm:pl-0">
                          <span className={cn("font-black text-xl", isWinner ? "text-primary" : "text-foreground")}>{yesCents}%</span>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                          <Button
                            variant="outline"
                            disabled={isMarketClosed}
                            onClick={() => { setSelectedOptionId(opt.id); setSelectedDirection('yes'); setTradeTab("buy"); }}
                            className={cn("flex-1 sm:w-24 h-11 font-bold text-sm transition-all border-2", isSelectedYes ? "bg-green-500/20 text-green-600 dark:text-green-500 border-green-500 shadow-sm" : "bg-card text-green-600 dark:text-green-500 border-border hover:border-green-500/50 hover:bg-green-500/10")}
                          >
                            Sí {yesCents}¢
                          </Button>
                          <Button
                            variant="outline"
                            disabled={isMarketClosed}
                            onClick={() => { setSelectedOptionId(opt.id); setSelectedDirection('no'); setTradeTab("buy"); }}
                            className={cn("flex-1 sm:w-24 h-11 font-bold text-sm transition-all border-2", isSelectedNo ? "bg-red-500/20 text-red-600 dark:text-red-500 border-red-500 shadow-sm" : "bg-card text-red-600 dark:text-red-500 border-border hover:border-red-500/50 hover:bg-red-500/10")}
                          >
                            No {noCents}¢
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
            
            <div className="hidden lg:block">{ReglasBlock}</div>
            <div className="hidden lg:block">{DebateBlock}</div>
            
          </div>

          <div className="lg:col-span-1 lg:sticky lg:top-24 w-full order-2">
            <div className="rounded-2xl border border-border/50 bg-card shadow-xl overflow-hidden p-2 sm:p-3">
              
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
                                  ? Math.round(getOptionPrice(options.find(o => o.id === selectedOptionId)?.total_votes) * 100) 
                                  : 100 - Math.round(getOptionPrice(options.find(o => o.id === selectedOptionId)?.total_votes) * 100)}¢
                              </span>
                            </div>
                            {!isBinaryYesNo && <p className="text-sm font-medium mt-1 truncate text-foreground/80">{selectedOptName}</p>}
                          </div>

                          <div>
                            <Label className="text-muted-foreground mb-1.5 block">Monto a invertir</Label>
                            <div className="relative">
                              <Input type="number" placeholder="0" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} disabled={isMarketClosed} className="pl-4 h-14 text-xl font-bold bg-muted/20 border-border/50 focus-visible:ring-1 focus-visible:ring-primary/50 disabled:opacity-50" />
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">pts</span>
                            </div>
                          </div>

                          {betAmount && !isNaN(Number(betAmount)) && Number(betAmount) > 0 && (
                            <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Precio por acción</span>
                                <span className="font-bold">
                                  {selectedDirection === 'yes' 
                                    ? Math.round(getOptionPrice(options.find(o => o.id === selectedOptionId)?.total_votes) * 100) 
                                    : 100 - Math.round(getOptionPrice(options.find(o => o.id === selectedOptionId)?.total_votes) * 100)}¢
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Acciones estimadas</span>
                                <span className={cn("font-bold", !isRedTheme ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500')}>
                                  ~{Math.floor(Number(betAmount) / (selectedDirection === 'yes' ? getOptionPrice(options.find(o => o.id === selectedOptionId)?.total_votes) : (1 - getOptionPrice(options.find(o => o.id === selectedOptionId)?.total_votes)))).toLocaleString()}
                                </span>
                              </div>
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
                            className={cn("w-full h-14 text-lg font-bold text-white shadow-lg mt-2 transition-all", isMarketClosed ? "bg-muted text-muted-foreground shadow-none" : (!isRedTheme ? 'bg-green-600 hover:bg-green-700 shadow-green-500/20 hover:scale-[1.02] active:scale-[0.98]' : 'bg-red-600 hover:bg-red-700 shadow-red-500/20 hover:scale-[1.02] active:scale-[0.98]'))} 
                            disabled={!betAmount || isPlacingBet || isMarketClosed} 
                            onClick={handlePlaceBet}
                          >
                            {isMarketClosed ? <><Lock className="w-5 h-5 mr-2" /> Mercado Cerrado</> : isPlacingBet ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Procesando...</> : !user ? "Ingresar para Operar" : `Confirmar Orden`}
                          </Button>

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
                      <div className="text-center py-8">
                        <p className="text-muted-foreground text-sm mb-4">Iniciá sesión para ver tu portfolio.</p>
                        <Button onClick={() => setIsAuthModalOpen(true)}>Ingresar</Button>
                      </div>
                    ) : userBets.length === 0 ? (
                      <div className="p-6 text-center border-2 border-dashed border-border/50 rounded-xl bg-muted/10">
                        <Coins className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                        <p className="text-sm font-medium text-muted-foreground">No tenés posiciones activas en este mercado.</p>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                        {userBets.map(bet => {
                          const opt = options.find(o => o.id === bet.outcome);
                          
                          const cashoutVal = opt ? calculateRealCashout(bet, opt) : Math.round(bet.amount * 0.95);
                          const pnl = cashoutVal - bet.amount;
                          const pnlPct = (pnl / bet.amount) * 100;

                          return (
                            <div key={bet.id} className={cn("p-4 rounded-xl border border-border/50 bg-muted/10 space-y-3", isMarketClosed && "opacity-75")}>
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Tu posición</p>
                                  <p className="font-bold text-foreground">
                                    {isBinaryYesNo ? (
                                      <span className={cn("mr-1", opt?.option_name.toLowerCase() === 'no' ? "text-red-600 dark:text-red-500" : "text-green-600 dark:text-green-500")}>
                                        {opt?.option_name}
                                      </span>
                                    ) : (
                                      <>
                                        <span className={cn("mr-1", bet.direction === 'no' ? "text-red-600 dark:text-red-500" : "text-green-600 dark:text-green-500")}>
                                          {bet.direction === 'no' ? 'No' : 'Sí'}
                                        </span>
                                        a {opt?.option_name || "Opción"}
                                      </>
                                    )}
                                  </p>
                                </div>
                                <Badge variant="outline" className={cn("font-bold border", pnl >= 0 ? "bg-green-500/10 text-green-600 dark:text-green-500 border-green-500/30" : "bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/30")}>
                                  {pnl >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                                </Badge>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2 text-sm bg-background p-2 rounded-lg border border-border/50">
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Inversión</p>
                                  <p className="font-semibold">{bet.amount} pts</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] text-muted-foreground">Valor Actual</p>
                                  <p className="font-bold text-primary">{cashoutVal} pts</p>
                                </div>
                              </div>

                              <Button 
                                size="sm" 
                                className="w-full h-10 font-bold bg-secondary hover:bg-secondary/80 text-secondary-foreground" 
                                onClick={() => handleSellBet(bet.id)} 
                                disabled={sellingBetId === bet.id || isMarketClosed}
                              >
                                {isMarketClosed ? <><Lock className="w-4 h-4 mr-2" /> Bloqueado</> : sellingBetId === bet.id ? <Loader2 className="w-4 h-4 animate-spin" /> : `Liquidar por ${cashoutVal} pts`}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </div>

            {/* LAS BALLENAS VAN ABAJO DEL PANEL DE TRADING EN DESKTOP */}
            <div className="hidden lg:block mt-6">
              {TopHoldersBlock}
            </div>

          </div>

          <div className="block lg:hidden w-full order-3 mt-2">{ReglasBlock}</div>
          <div className="block lg:hidden w-full order-4 mt-2">{TopHoldersBlock}</div>
          <div className="block lg:hidden w-full order-5 mt-2">{DebateBlock}</div>
          <div className="block lg:hidden w-full order-6 mt-2">{UltimasApuestasBlock}</div>
        </div>

        <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Share2 className="w-5 h-5 text-primary" /> Compartir Mercado
              </DialogTitle>
              <DialogDescription>
                Invitá a tus amigos a predecir y debatir en este mercado.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <Button variant="outline" className="w-full h-12 flex items-center justify-start gap-3 text-base border-border/50 hover:bg-muted/30 transition-colors" onClick={handleWhatsAppShare}>
                <MessageCircle className="w-5 h-5 text-green-500" /> Compartir en WhatsApp
              </Button>
              <Button variant="outline" className="w-full h-12 flex items-center justify-start gap-3 text-base border-border/50 hover:bg-muted/30 transition-colors" onClick={handleTwitterShare}>
                <Twitter className="w-5 h-5 text-blue-400" /> Compartir en X (Twitter)
              </Button>
              <div className="relative mt-2">
                <Input readOnly value={marketUrl} className="pr-12 bg-muted/20 border-border/50 h-10 text-xs sm:text-sm text-muted-foreground" />
                <Button size="icon" variant="ghost" className="absolute right-0 top-0 h-full w-12 hover:bg-transparent" onClick={handleCopyLink}>
                  {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={() => { setIsAuthModalOpen(false); fetchUserAndProfile(); }} isDarkMode={isDarkMode} />
    </div>
  );
}