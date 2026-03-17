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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ArrowLeft, Clock, Coins, History, CheckCheck, X, User as UserIcon, MessageSquare, Reply, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
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
  const [options, setOptions] = useState<any[]>([]); // NUEVO: Estado para las opciones infinitas
  const [bets, setBets] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // NUEVO: Ahora seleccionamos el ID de la opción, no un texto fijo
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
  const [isLoadingProfileStats, setIsLoadingProfileStats] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState<any>(null);

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

    // NUEVO: Traemos las opciones reales de la base de datos
    const { data: optionsData } = await supabase
      .from("market_options")
      .select("*")
      .eq("market_id", marketId)
      .order("created_at", { ascending: true });
    setOptions(optionsData || []);

    const { data: historyData } = await supabase.from("market_history").select("*").eq("market_id", marketId).order("created_at", { ascending: true });
    let formattedHistory = historyData?.map(h => ({
      time: new Date(h.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      yes: h.yes_percentage,
      no: 100 - h.yes_percentage,
    })) || [];

    if (formattedHistory.length === 1) {
      formattedHistory.push({ ...formattedHistory[0], time: "Ahora" });
    }
    setHistory(formattedHistory);

    const { data: betsData } = await supabase.from("bets").select("*").eq("market_id", marketId).order("created_at", { ascending: false });
    if (betsData && betsData.length > 0) {
      const userIds = [...new Set(betsData.map(b => b.user_id))];
      const { data: profilesData } = await supabase.from("profiles").select("id, username").in("id", userIds);
      const profileMap: Record<string, string> = {};
      if (profilesData) profilesData.forEach(p => { profileMap[p.id] = p.username || "Usuario Anónimo"; });
      setBets(betsData.map(bet => ({ ...bet, profiles: { username: profileMap[bet.user_id] || "Usuario Anónimo" } })));
    } else {
      setBets([]);
    }

    const { data: commentsData } = await supabase.from("comments").select("*, profiles(username, avatar_url)").eq("market_id", marketId).order("created_at", { ascending: true }); 
    setComments(commentsData || []);
    
    setIsLoading(false);
  }, [marketId, router, supabase]);

  useEffect(() => {
    fetchUserAndProfile();
    fetchData();

    const channel = supabase.channel(`market-${marketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bets", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `market_id=eq.${marketId}` }, () => { fetchData(); })
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
    // Enviamos la apuesta con el ID de la opción
    const { error } = await supabase.rpc("realizar_apuesta", { 
      p_amount: numericAmount, 
      p_market_id: marketId, 
      p_outcome: selectedOptionId 
    });
    setIsPlacingBet(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const optionName = options.find(o => o.id === selectedOptionId)?.option_name || "la opción";
      toast({ title: "¡Apuesta confirmada!", description: `Invertiste ${numericAmount} pts a ${optionName}` });
      setBetAmount("");
      fetchUserAndProfile();
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    // ... código de comentarios sin cambios ...
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

  const openUserProfile = async (userId: string, username: string) => { /* Sin cambios */ setIsProfileModalOpen(true); };
  const toggleThread = (commentId: string) => { setExpandedThreads(prev => ({ ...prev, [commentId]: !prev[commentId] })); };

  if (isLoading) return <div className="min-h-screen bg-background flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!market) return null;

  // Calculamos el total de puntos basado en las nuevas opciones
  const totalVotesMulti = options.reduce((sum, opt) => sum + Number(opt.total_votes), 0);
  const isBinary = options.length === 2 && options.some(o => o.option_name === 'Sí'); // Detecta si es un mercado viejo de Sí/No

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

              {isBinary && (
                <div className="h-[250px] w-full mt-4 mb-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <XAxis dataKey="time" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                      <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(val) => `${val}%`} width={40} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                      <Line type="linear" dataKey="yes" stroke="#0ea5e9" strokeWidth={3} dot={false} name="Sí" />
                      <Line type="linear" dataKey="no" stroke="#ef4444" strokeWidth={3} dot={false} name="No" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* BARRA MULTICOLOR DINÁMICA */}
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
          </div>

          {/* PANEL DE OPERACIONES DINÁMICO */}
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
        </div>
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={() => { setIsAuthModalOpen(false); fetchUserAndProfile(); }} isDarkMode={isDarkMode} />
    </div>
  );
}