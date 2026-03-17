"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NavHeader } from "@/components/nav-header";
import { AuthModal } from "@/components/auth-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ArrowLeft, Clock, Coins, History, CheckCheck, X, User as UserIcon, MessageSquare, Reply, ChevronDown, ChevronUp, Trash2, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface MarketDetailClientProps {
  marketId: string;
}

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

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [isPlacingBet, setIsPlacingBet] = useState(false);

  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});

  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

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

    // RECUPERAMOS EL HISTORIAL (El nuevo múltiple y el viejo binario)
    const { data: newHistoryData } = await supabase.from("market_option_history").select("*").eq("market_id", marketId).order("created_at", { ascending: true });
    const { data: oldHistoryData } = await supabase.from("market_history").select("*").eq("market_id", marketId).order("created_at", { ascending: true });

    let formattedHistory: any[] = [];

    // Si tiene historial múltiple (El nuevo)
    if (newHistoryData && newHistoryData.length > 0) {
      const historyMap = new Map();
      newHistoryData.forEach(h => {
        const time = new Date(h.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        if (!historyMap.has(time)) historyMap.set(time, { time });
        historyMap.get(time)[h.option_id] = Number(h.percentage);
      });
      formattedHistory = Array.from(historyMap.values());
    } 
    // Si tiene historial viejo y es Sí/No (Retro-compatibilidad)
    else if (oldHistoryData && oldHistoryData.length > 0 && optionsData && optionsData.length === 2) {
      const yesOpt = optionsData.find(o => o.option_name.toLowerCase().includes('s'));
      const noOpt = optionsData.find(o => o.option_name.toLowerCase().includes('n'));
      formattedHistory = oldHistoryData.map(h => ({
        time: new Date(h.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        [yesOpt?.id || 'yes']: h.yes_percentage,
        [noOpt?.id || 'no']: 100 - h.yes_percentage,
      }));
    }

    // Un puntito extra para que el gráfico no se vea vacío si hay 1 solo movimiento
    if (formattedHistory.length === 1) formattedHistory.push({ ...formattedHistory[0], time: "Ahora" });
    setHistory(formattedHistory);

    // RECUPERAMOS APUESTAS Y CASHOUTS
    const { data: betsData } = await supabase.from("bets").select("*").eq("market_id", marketId).order("created_at", { ascending: false });
    const { data: cashoutsData } = await supabase.from("transactions").select("*").eq("market_id", marketId).eq("type", "cashout").order("created_at", { ascending: false });

    const rawBets = betsData || [];
    const rawCashouts = cashoutsData || [];
    
    const userIds = [...new Set([...rawBets.map(b => b.user_id), ...rawCashouts.map(c => c.user_id)])];
    const profileMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase.from("profiles").select("id, username").in("id", userIds);
      if (profilesData) profilesData.forEach(p => { profileMap[p.id] = p.username || "Usuario Anónimo"; });
    }

    const mappedBets = rawBets.map(bet => ({ ...bet, activityType: 'bet', profiles: { username: profileMap[bet.user_id] || "Usuario Anónimo" } }));
    const mappedCashouts = rawCashouts.map(c => ({ ...c, activityType: 'cashout', profiles: { username: profileMap[c.user_id] || "Usuario Anónimo" } }));

    const combinedFeed = [...mappedBets, ...mappedCashouts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setActivityFeed(combinedFeed);

    const { data: commentsData } = await supabase.from("comments").select("*, profiles(username, avatar_url)").eq("market_id", marketId).order("created_at", { ascending: true }); 
    setComments(commentsData || []);
    
    setIsLoading(false);
  }, [marketId, router, supabase]);

  useEffect(() => {
    fetchUserAndProfile();
    fetchData();

    const channel = supabase.channel(`market-${marketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bets", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_option_history", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_history", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_options", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchUserAndProfile, fetchData, marketId, supabase]);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDarkMode]);

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
    const { error } = await supabase.rpc("realizar_apuesta", { p_amount: numericAmount, p_market_id: marketId, p_outcome: selectedOptionId });
    setIsPlacingBet(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const optionName = options.find(o => o.id === selectedOptionId)?.option_name || "la opción";
      toast({ title: "¡Predicción confirmada!", description: `Invertiste ${numericAmount} pts a ${optionName}` });
      setBetAmount("");
      fetchUserAndProfile();
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
      if (replyingTo && replyingTo.user_id !== user.id) {
        await supabase.from("notifications").insert({ user_id: replyingTo.user_id, sender_id: user.id, market_id: marketId, type: 'reply', message: 'Alguien respondió a tu comentario' });
        setExpandedThreads(prev => ({ ...prev, [replyingTo.id]: true }));
      }
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

  const openUserProfile = async (userId: string, username: string) => { setIsProfileModalOpen(true); };
  const toggleThread = (commentId: string) => { setExpandedThreads(prev => ({ ...prev, [commentId]: !prev[commentId] })); };

  if (isLoading) return <div className="min-h-screen bg-background flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!market) return null;

  const totalVotesMulti = options.reduce((sum, opt) => sum + Number(opt.total_votes), 0);

  const topLevelComments = comments.filter(c => !c.parent_id).reverse();

  const renderComment = (comment: any, isReply = false) => {
    const replies = comments.filter(c => c.parent_id === comment.id);
    const isExpanded = !!expandedThreads[comment.id];
    const isMyComment = user?.id === comment.user_id;

    return (
      <div key={comment.id} className={cn("flex flex-col gap-3", isReply ? "mt-3" : "mt-4")}>
        <div className={cn("flex gap-3 sm:gap-4 p-4 rounded-xl transition-colors relative group", isReply ? "bg-muted/10 border border-border/30" : "bg-card border border-border/50")}>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden" onClick={() => openUserProfile(comment.user_id, comment.profiles?.username || "Usuario")}>
            {comment.profiles?.avatar_url ? <img src={comment.profiles.avatar_url} alt="Avatar" className="w-full h-full object-cover" /> : <UserIcon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />}
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-bold text-sm">{comment.profiles?.username || "Usuario Anónimo"}</span>
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
             <button onClick={() => setCommentToDelete(comment.id)} className="absolute top-4 right-4 text-muted-foreground opacity-50 hover:opacity-100 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
          )}
        </div>
        {replies.length > 0 && isExpanded && <div className="ml-8 sm:ml-12 pl-4 border-l-2 border-border/50 flex flex-col gap-2">{replies.map(reply => renderComment(reply, true))}</div>}
      </div>
    );
  };

  const UltimasApuestasBlock = (
    <div className="pt-8 border-t border-border/50 lg:pt-0 lg:border-t-0">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><ActivityIcon /> Actividad del Mercado</h3>
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        {activityFeed.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">Aún no hay actividad. ¡Sé el primero!</p>
        ) : (
          <div className="divide-y divide-border/50 max-h-[400px] overflow-y-auto">
            {activityFeed.map((item) => {
              if (item.activityType === 'bet') {
                const opt = options.find(o => o.id === item.outcome);
                const isOldBinary = item.outcome === 'yes' || item.outcome === 'no';
                const displayOutcome = opt ? opt.option_name : (isOldBinary ? item.outcome : 'Opción');
                const optColor = opt ? opt.color : (item.outcome === 'yes' ? '#0ea5e9' : '#ef4444');

                return (
                  <div key={`bet-${item.id}`} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${optColor}30`, color: optColor }}>
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-medium text-sm">{item.profiles?.username || "Usuario"} invirtió</span>
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
                        <span className="font-medium text-sm">{item.profiles?.username || "Usuario"} retiró ganancias</span>
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

  const DebateBlock = (
    <div className="pt-8 border-t border-border/50">
      <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><MessageSquare className="w-6 h-6 text-primary" /> Debate del Mercado</h3>
      <div className="mb-8 p-4 rounded-xl border border-border/50 bg-card shadow-sm sticky top-20 z-10">
        {replyingTo && (
          <div className="flex items-center justify-between bg-primary/10 text-primary px-3 py-2 rounded-lg mb-3 text-sm">
            <span className="flex items-center gap-2"><Reply className="w-4 h-4" /> Respondiendo a <b>{replyingTo.profiles?.username || 'Usuario'}</b></span>
            <button onClick={() => setReplyingTo(null)} className="hover:bg-primary/20 p-1 rounded-full"><X className="w-4 h-4" /></button>
          </div>
        )}
        <form onSubmit={handleAddComment} className="flex gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 hidden sm:flex items-center justify-center shrink-0 border border-primary/20">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover rounded-full" /> : <UserIcon className="w-5 h-5 text-primary" />}
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
          <div className="lg:col-span-2 space-y-8 w-full order-1">
            <div className="flex gap-4 sm:gap-6 items-start">
              {market.image_url && <img src={market.image_url} alt="Mercado" className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shrink-0 shadow-md border border-border/50" />}
              <div>
                <Badge variant="secondary" className="mb-3 capitalize">{market.category}</Badge>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-2">{market.title}</h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-3">
                  <div className="flex items-center gap-1.5"><Coins className="w-4 h-4" />{totalVotesMulti.toLocaleString()} pts Vol.</div>
                  <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Cierra: {new Date(market.end_date).toLocaleDateString()}</div>
                </div>
              </div>
            </div>

            {market.description && <div className="p-5 rounded-xl bg-muted/30 border border-border/50 text-muted-foreground leading-relaxed">{market.description}</div>}

            <div className="p-6 rounded-xl border border-border/50 bg-card">
              <h3 className="font-semibold mb-2 flex justify-between">
                <span>Distribución del Mercado</span>
                <span className="text-muted-foreground font-normal">{totalVotesMulti.toLocaleString()} pts en juego</span>
              </h3>

              {/* EL SÚPER GRÁFICO DINÁMICO */}
              {history.length > 0 && (
                <div className="h-[250px] w-full mt-4 mb-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <XAxis dataKey="time" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                      <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(val) => `${val}%`} width={40} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                      
                      {options.map((opt) => (
                        <Line 
                          key={opt.id} 
                          type="monotone" 
                          dataKey={opt.id} 
                          stroke={opt.color} 
                          strokeWidth={3} 
                          dot={false} 
                          name={opt.option_name} 
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="mt-6 mb-4 space-y-3">
                {options.map((opt) => {
                  const pct = totalVotesMulti === 0 ? (100 / options.length) : ((Number(opt.total_votes) / totalVotesMulti) * 100);
                  return (
                    <div key={opt.id} className="flex items-center gap-3">
                      <div className="w-32 truncate text-sm font-medium">{opt.option_name}</div>
                      <div className="flex-1 h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: opt.color }} />
                      </div>
                      <div className="w-12 text-right text-sm font-bold" style={{ color: opt.color }}>{Math.round(pct)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="hidden lg:block mt-8">{DebateBlock}</div>
            <div className="hidden lg:block mt-8 pt-8 border-t border-border/50">{UltimasApuestasBlock}</div>
          </div>

          <div className="lg:col-span-1 lg:sticky lg:top-24 w-full order-2">
            <div className="rounded-2xl border border-border/50 bg-card shadow-xl p-5 sm:p-6">
              <h2 className="text-xl font-bold mb-5 flex items-center gap-2"><Coins className="w-5 h-5 text-amber-500" /> Operar Mercado</h2>
              
              <div className="flex flex-col gap-2 mb-6">
                <Label className="text-muted-foreground mb-1">Seleccioná tu predicción</Label>
                {options.map((opt) => (
                  <button 
                    key={opt.id}
                    onClick={() => setSelectedOptionId(opt.id)} 
                    className={cn("text-left p-3 rounded-xl font-bold transition-all border-2 flex justify-between items-center")}
                    style={{ 
                      borderColor: selectedOptionId === opt.id ? opt.color : 'hsl(var(--border))', 
                      backgroundColor: selectedOptionId === opt.id ? `${opt.color}15` : 'transparent',
                      color: selectedOptionId === opt.id ? opt.color : 'hsl(var(--foreground))'
                    }}
                  >
                    <span>{opt.option_name}</span>
                    {selectedOptionId === opt.id && <CheckCheck className="w-5 h-5" />}
                  </button>
                ))}
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <Label className="text-muted-foreground mb-1.5 block">Monto a invertir</Label>
                  <div className="relative">
                    <Input type="number" placeholder="Ej: 1000" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="pl-4 h-12 text-lg font-medium" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">pts</span>
                  </div>
                </div>
                {user && (
                  <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-muted/40 border border-border/50">
                    <span className="text-muted-foreground">Tu balance:</span>
                    <span className="font-bold text-foreground">{(profile?.points || 0).toLocaleString()} pts</span>
                  </div>
                )}
              </div>
              
              <Button size="lg" className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground" disabled={!selectedOptionId || !betAmount || isPlacingBet} onClick={handlePlaceBet}>
                {isPlacingBet ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Procesando...</> : !user ? "Ingresar para Operar" : !selectedOptionId ? "Elegí una opción" : `Confirmar Inversión`}
              </Button>
            </div>
          </div>

          <div className="block lg:hidden w-full order-3 mt-2">{DebateBlock}</div>
          <div className="block lg:hidden w-full order-4 mt-2">{UltimasApuestasBlock}</div>
        </div>
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={() => { setIsAuthModalOpen(false); fetchUserAndProfile(); }} isDarkMode={isDarkMode} />
    </div>
  );
}

function ActivityIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  );
}