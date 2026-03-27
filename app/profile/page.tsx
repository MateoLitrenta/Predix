"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getProfile, getMyBets, getMyTransactions, updateUserPassword, updateProfileSettings, sellBet, type BetWithMarket } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { NavHeader } from "@/components/nav-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Coins, User as UserIcon, ArrowLeft, Loader2, TrendingUp, TrendingDown, History, Pencil, Landmark, Lock, Camera, LineChart, CheckCircle2, Clock, XCircle, ArrowUpRight, ArrowDownRight, Gift, Copy, Check, Users, ChevronDown, ChevronUp, Wallet, Trophy, CalendarDays } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis, YAxis } from "recharts";

const ACTIVE_STATUSES = ["active", "pending"];
const FINISHED_STATUSES = ["resolved", "rejected"];

type TimeframeType = '1D' | '1W' | '1M' | '6M' | '1Y' | 'ALL';

const timeframeLabels: Record<TimeframeType, string> = {
  '1D': 'últimas 24hs',
  '1W': 'última semana',
  '1M': 'último mes',
  '6M': 'últimos 6 meses',
  '1Y': 'último año',
  'ALL': 'Histórico'
};

function getMarket(bet: BetWithMarket) {
  return bet.markets ?? bet.market ?? null;
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [bets, setBets] = useState<BetWithMarket[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [marketOptions, setMarketOptions] = useState<any[]>([]);
  
  const [isChecking, setIsChecking] = useState(true);
  const [isLoadingBets, setIsLoadingBets] = useState(true);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const [sellingBetId, setSellingBetId] = useState<string | null>(null);
  const [betToSell, setBetToSell] = useState<{ id: string, title: string, outcomeName: string, direction: string, cashoutValue: number, pnl: number, pnlPercentage: number } | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [timeframe, setTimeframe] = useState<TimeframeType>('ALL');
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const [referralLink, setReferralLink] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [referredUsers, setReferredUsers] = useState<any[]>([]);

  const fetchUserData = useCallback(async () => {
    setIsLoadingBets(true);
    setIsLoadingTransactions(true);
    
    let refUsers: any[] = [];
    if (profile?.id) {
       const { data, error } = await supabase.from("profiles").select("username").eq("referred_by", profile.id);
       if (!error && data) refUsers = data;
    }

    const [betsRes, txRes, optionsRes] = await Promise.all([
      getMyBets(),
      getMyTransactions(),
      supabase.from("market_options").select("*")
    ]);
    
    if (!betsRes.error && betsRes.data) setBets(betsRes.data);
    if (!txRes.error && txRes.data) setTransactions(txRes.data);
    if (optionsRes.data) setMarketOptions(optionsRes.data);
    setReferredUsers(refUsers);
    
    setIsLoadingBets(false);
    setIsLoadingTransactions(false);
  }, [profile?.id, supabase]);

  const fetchAuth = useCallback(async () => {
    const p = await getProfile();
    if (p) setProfile(p);
  }, []);

  useEffect(() => {
    const load = async () => {
      const p = await getProfile();
      if (!p) { router.replace("/"); return; }
      setProfile(p);
      setNewUsername(p.username || "");
      setPreviewUrl((p as any).avatar_url || null);
      if (typeof window !== "undefined" && p.username) { setReferralLink(`${window.location.origin}/?ref=${p.username}`); }
      setIsChecking(false);
    };
    load();
  }, [router]);

  useEffect(() => { if (profile?.id) fetchUserData(); }, [profile?.id, fetchUserData]);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDarkMode]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setIsCopied(true);
    toast({ title: "¡Link copiado!", description: "Mandáselo a tus amigos para ganar puntos." });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const calculateRealCashout = useCallback((bet: any, market: any, opt: any) => {
    const shares = Number(bet.shares || 0);
    if (shares <= 0) return Math.round(bet.amount * 0.95); 
    const direction = bet.direction || 'yes';
    const optionVotes = Number(opt.total_votes || 0);
    const totalVol = Number(market.total_volume || 0);
    const totalOptions = marketOptions.filter(o => o.market_id === market.id).length || 2;
    const startPriceYes = (optionVotes + 100.0) / (totalVol + (totalOptions * 100.0));
    const estPayout = shares * (direction === 'yes' ? startPriceYes : (1 - startPriceYes));
    let endPriceYes = 0;
    if (direction === 'yes') { endPriceYes = Math.max(0.01, (optionVotes - estPayout + 100.0) / (Math.max(1, totalVol - estPayout) + (totalOptions * 100.0))); } 
    else { endPriceYes = Math.max(0.01, (optionVotes + 100.0) / (Math.max(1, totalVol - estPayout) + (totalOptions * 100.0))); }
    let avgPriceYes = (startPriceYes + endPriceYes) / 2.0;
    avgPriceYes = Math.max(0.01, Math.min(0.99, avgPriceYes));
    const currentPrice = direction === 'yes' ? avgPriceYes : (1 - avgPriceYes);
    return Math.round(shares * currentPrice);
  }, [marketOptions]);

  const portfolioStats = useMemo(() => {
    const availableCapital = profile?.points ?? 0;
    let totalCurrentValueActive = 0;

    bets
      .filter((b) => getMarket(b) && ACTIVE_STATUSES.includes(String(getMarket(b)!.status).toLowerCase()))
      .forEach((bet) => {
        const market = getMarket(bet); 
        const opt = bet.option_details;
        if (market && opt) {
          totalCurrentValueActive += calculateRealCashout(bet, market, opt);
        }
      });

    const totalPortfolioValue = availableCapital + totalCurrentValueActive;
    return { availableCapital, totalPortfolioValue, lockedValueOffset: totalCurrentValueActive };
  }, [bets, profile?.points, calculateRealCashout, marketOptions]);

  const processedTransactions = useMemo(() => {
    if (!transactions.length) return [];
    let currentTempBalance = profile?.points ?? 0;
    return transactions.map((tx) => {
      const balanceAfter = currentTempBalance;
      const balanceBefore = currentTempBalance - tx.amount;
      currentTempBalance = balanceBefore; 
      return { ...tx, balanceAfter, balanceBefore };
    });
  }, [transactions, profile?.points]);

  // LA MAGIA DEL GRÁFICO (Idéntica al perfil público)
  const chartData = useMemo(() => {
    const chronological = [...processedTransactions].reverse(); 
    const offset = portfolioStats.lockedValueOffset; 
    const now = Date.now();
    
    let startTimeForAll = now;
    if (profile?.created_at) {
        startTimeForAll = new Date(profile.created_at).getTime();
    } else if (chronological.length > 0) {
        startTimeForAll = new Date(chronological[0].created_at).getTime();
    } else {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        startTimeForAll = d.getTime();
    }
    
    let timestamps: number[] = [];

    if (timeframe === '1D') {
        for(let i=24; i>=0; i--) timestamps.push(now - i * 3600 * 1000); 
    } else if (timeframe === '1W') {
        for(let i=7; i>=0; i--) timestamps.push(now - i * 86400 * 1000); 
    } else if (timeframe === '1M') {
        for(let i=30; i>=0; i--) timestamps.push(now - i * 86400 * 1000); 
    } else if (timeframe === '6M') {
        for(let i=6; i>=0; i--) { 
            const d = new Date(now);
            d.setMonth(d.getMonth() - i);
            timestamps.push(d.getTime());
        }
    } else if (timeframe === '1Y') {
        for(let i=12; i>=0; i--) { 
            const d = new Date(now);
            d.setMonth(d.getMonth() - i);
            timestamps.push(d.getTime());
        }
    } else if (timeframe === 'ALL') {
        const diff = now - startTimeForAll;
        const steps = Math.max(1, Math.ceil(diff / (30 * 86400 * 1000))); 
        for(let i=0; i<=steps; i++) {
            timestamps.push(startTimeForAll + (diff / steps) * i);
        }
    }

    const startTime = timestamps[0];

    chronological.forEach(tx => {
        const txTime = new Date(tx.created_at).getTime();
        if (txTime >= startTime && txTime <= now) timestamps.push(txTime);
    });

    timestamps = Array.from(new Set(timestamps)).sort((a, b) => a - b);

    const data = timestamps.map(ts => {
        const pastTxs = chronological.filter(tx => new Date(tx.created_at).getTime() <= ts);
        let baseBalance = 0;
        
        if (pastTxs.length > 0) {
            baseBalance = pastTxs[pastTxs.length - 1].balanceAfter;
        } else if (chronological.length > 0) {
            baseBalance = chronological[0].balanceBefore;
        } else {
            baseBalance = profile?.points || 0;
        }
        
        return { timestamp: ts, value: baseBalance + offset };
    });

    if (data.length === 0 || data[data.length - 1].timestamp !== now) {
        data.push({ timestamp: now, value: portfolioStats.totalPortfolioValue });
    }

    return data;
  }, [processedTransactions, timeframe, portfolioStats, profile]);

  // MOTOR PNL ABSOLUTO (CORREGIDO PARA MOSTRAR GANANCIAS CORRECTAS DESDE CERO)
  const dynamicPnl = useMemo(() => {
    if (chartData.length < 2) return { value: 0, percentage: 0 };
    
    const startValue = chartData[0].value; 
    const endValue = chartData[chartData.length - 1].value;
    
    const val = endValue - startValue;
    
    let divisor = startValue;
    if (divisor === 0) divisor = 10000;
    const pct = (val / Math.abs(divisor)) * 100;
    
    return { value: val, percentage: pct };
  }, [chartData]);

  const confirmSell = async () => { 
    if (!betToSell) return;
    setSellingBetId(betToSell.id);
    const { ok, error, cashoutValue } = await sellBet(betToSell.id);
    if (!ok) { toast({ title: "Error al vender", description: error || "Hubo un problema", variant: "destructive" }); } 
    else { toast({ title: "¡Venta exitosa!", description: `Ganancias: ${cashoutValue?.toLocaleString()} pts.` }); await fetchAuth(); await fetchUserData(); }
    setSellingBetId(null); setBetToSell(null); 
  };

  const handleSaveProfile = async (e: React.FormEvent) => { 
    e.preventDefault(); if (!newUsername.trim()) return; setIsSaving(true);
    let finalAvatarUrl = profile.avatar_url;
    if (selectedImage) {
      const fileExt = selectedImage.name.split('.').pop(); const filePath = `${profile.id}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, selectedImage, { upsert: true });
      if (uploadError) { toast({ title: "Error", variant: "destructive" }); setIsSaving(false); return; }
      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath); finalAvatarUrl = data.publicUrl;
    }
    const { ok, error } = await updateProfileSettings(newUsername.trim(), finalAvatarUrl);
    setIsSaving(false);
    if (error) { toast({ title: "Error", description: error, variant: "destructive" }); } 
    else { toast({ title: "Perfil actualizado" }); setProfile({ ...profile, username: newUsername.trim(), avatar_url: finalAvatarUrl }); setIsEditModalOpen(false); setSelectedImage(null); router.refresh(); }
  };

  const handleChangePassword = async (e: React.FormEvent) => { 
    e.preventDefault();
    if (newPassword !== confirmPassword || newPassword.length < 6) return;
    setIsChangingPassword(true);
    const { ok, error } = await updateUserPassword(newPassword);
    setIsChangingPassword(false);
    if (!error) { toast({ title: "¡Contraseña actualizada!" }); setIsPasswordModalOpen(false); setNewPassword(""); setConfirmPassword(""); }
  };

  const customTooltipFormatter = (value: number) => [`${value.toLocaleString()} pts`];
  
  const customTooltipLabelFormatter = (label: number) => {
    const date = new Date(label);
    if (timeframe === '1D') return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const xAxisFormatter = (tick: number) => {
    const date = new Date(tick);
    if (timeframe === '1D') return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    if (timeframe === '1W' || timeframe === '1M') return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    return date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
  };

  const yAxisFormatter = (tick: number) => {
    if (tick >= 1000) return `${(tick / 1000).toFixed(0)}k`;
    return tick.toString();
  };

  const isProfit = dynamicPnl.value >= 0;
  const themeChartColor = isProfit ? (isDarkMode ? "#00FF00" : "#16a34a") : (isDarkMode ? "#FF0000" : "#dc2626");

  if (isChecking) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!profile) return null;

  const displayName = profile.username || profile.email?.split("@")[0] || "Usuario";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader points={profile.points ?? 10000} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} onPointsUpdate={() => {}} userId={profile.id} userEmail={profile.email ?? null} onOpenAuthModal={() => router.push("/")} onSignOut={async () => { await createClient().auth.signOut(); router.replace("/"); }} isAdmin={profile.role === "admin"} username={profile.username ?? null} />

      <main className="container mx-auto px-4 py-8 flex-1 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
            <Link href="/"><ArrowLeft className="w-4 h-4 mr-2" /> Volver al Inicio</Link>
          </Button>
          <Badge className="bg-primary/10 text-primary border-primary/20 font-medium">Área Personal</Badge>
        </div>

        {/* CABECERA UNIFICADA DE MI PERFIL */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-10">
            <Avatar className="w-24 h-24 sm:w-28 sm:h-28 border-4 border-background bg-primary/10 shadow-lg shrink-0">
                {profile.avatar_url ? <AvatarImage src={profile.avatar_url} className="object-cover" /> : <AvatarFallback><UserIcon className="w-12 h-12 text-primary opacity-50" /></AvatarFallback>}
            </Avatar>
            <div className="flex-1 w-full text-center sm:text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-1">
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-black text-foreground truncate tracking-tighter mb-1 flex items-center justify-center sm:justify-start gap-3">
                            {displayName}
                            <Badge className="bg-primary text-primary-foreground text-xs uppercase tracking-wider">VOS</Badge>
                        </h1>
                        <p className="text-sm text-muted-foreground font-medium flex items-center justify-center sm:justify-start gap-1.5 opacity-80">
                            <CalendarDays className="w-3.5 h-3.5" /> Miembro desde: {new Date(profile.created_at || new Date()).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                    <div className="flex items-center justify-center sm:justify-end gap-3 mt-2 sm:mt-0">
                      <Button variant="outline" size="icon" onClick={() => setIsPasswordModalOpen(true)}><Lock className="w-4 h-4" /></Button>
                      <Button variant="outline" size="sm" onClick={() => { setNewUsername(profile.username || ""); setPreviewUrl(profile.avatar_url || null); setSelectedImage(null); setIsEditModalOpen(true); }}><Pencil className="w-4 h-4 mr-2" /> Editar</Button>
                    </div>
                </div>
            </div>
        </div>

        {/* NUEVA SECCIÓN DE ESTADÍSTICAS OPTIMIZADA CON TARJETAS GIGANTES */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-5 mb-12">
            {/* PORTFOLIO TOTAL */}
            <Card className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex flex-col items-center text-center shadow-sm">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4"><Wallet className="w-5 h-5" /></div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Portfolio Total</p>
                <p className="text-3xl font-black text-primary leading-none">{portfolioStats.totalPortfolioValue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground font-bold">pts</p>
            </Card>

            {/* PUNTOS LÍQUIDOS */}
            <Card className="bg-card border border-border/50 rounded-2xl p-6 flex flex-col items-center text-center shadow-sm">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-600 dark:text-[#00FF00] mb-4"><Coins className="w-5 h-5" /></div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Puntos Líquidos</p>
                <p className="text-3xl font-bold text-foreground leading-none">{profile.points?.toLocaleString() ?? 0}</p>
                <p className="text-xs text-muted-foreground font-bold">pts</p>
            </Card>

            {/* INVERSIONES */}
            <Card className="bg-card border border-border/50 rounded-2xl p-6 flex flex-col items-center text-center shadow-sm">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 mb-4"><LineChart className="w-5 h-5" /></div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Inversiones</p>
                <p className="text-3xl font-bold text-foreground leading-none">{bets.length}</p>
                <p className="text-xs text-muted-foreground font-bold">operaciones</p>
            </Card>

            {/* REFERIDOS */}
            <Card className="bg-card border border-border/50 rounded-2xl p-6 flex flex-col items-center text-center shadow-sm">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 mb-4"><Users className="w-5 h-5" /></div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Referidos</p>
                <p className="text-3xl font-bold text-foreground leading-none">{referredUsers.length}</p>
                <p className="text-xs text-muted-foreground font-bold">usuarios</p>
            </Card>

            {/* MEMBRESÍA */}
            <Card className={cn("border rounded-2xl p-6 flex flex-col items-center text-center shadow-sm", profile.role === 'admin' ? "bg-green-500/10 border-green-500/30" : "bg-card border-border/50")}>
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center mb-4", profile.role === 'admin' ? "bg-green-500/20 text-green-600 dark:text-[#00FF00]" : "bg-muted/30 text-muted-foreground")}><Trophy className="w-5 h-5" /></div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Membresía</p>
                <p className={cn("text-3xl font-bold leading-none", profile.role === 'admin' ? "text-green-600 dark:text-[#00FF00]" : "text-foreground")}>{profile.role === 'admin' ? 'Fundador' : 'Usuario'}</p>
                <p className="text-xs text-muted-foreground font-bold">rol Predix</p>
            </Card>
        </div>

        {/* EL GRÁFICO FULL-WIDTH POLYMARKET STYLE */}
        <Card className="bg-card border border-border/50 shadow-sm rounded-2xl overflow-hidden mb-12">
          <CardContent className="p-0">
            <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-border/20">
              <div>
                <div className="flex items-center gap-2 font-bold text-muted-foreground mb-2">
                  <TrendingUp className="w-4 h-4" /> Profit / Loss
                </div>
                
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className={cn("text-4xl md:text-5xl font-black tracking-tight", isProfit ? "text-green-600 dark:text-[#00FF00]" : "text-red-600 dark:text-[#FF0000]")}>
                    {isProfit ? '+' : ''}{dynamicPnl.value.toLocaleString()} <span className="text-2xl opacity-80">pts</span>
                  </span>
                  
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-sm md:text-base px-2 py-0.5 font-bold border-2", 
                      isProfit ? "bg-green-500/10 text-green-600 dark:text-[#00FF00] border-green-500/30 dark:border-[#00FF00]/30" : "bg-red-500/10 text-red-600 dark:text-[#FF0000] border-red-500/30 dark:border-[#FF0000]/30"
                    )}
                  >
                    {isProfit ? '+' : ''}{dynamicPnl.percentage.toFixed(2)}%
                  </Badge>
                </div>

                <p className="text-sm font-medium text-muted-foreground mt-2">
                  {dynamicPnl.value >= 0 ? 'Ganancia' : 'Pérdida'} en {timeframeLabels[timeframe]} • Total: {portfolioStats.totalPortfolioValue.toLocaleString()} pts
                </p>
              </div>

              <div className="flex bg-muted/50 p-1 rounded-xl backdrop-blur-md border border-border/30 w-full md:w-auto overflow-x-auto">
                {(['1D', '1W', '1M', '6M', '1Y', 'ALL'] as TimeframeType[]).map((tf) => (
                  <button 
                    key={tf} 
                    onClick={() => setTimeframe(tf)} 
                    className={cn(
                      "px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex-1 md:flex-none", 
                      timeframe === tf ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-[350px] md:h-[450px] p-4 md:p-6 pt-8">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={themeChartColor} stopOpacity={0.2}/>
                      <stop offset="95%" stopColor={themeChartColor} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  
                  <XAxis 
                    dataKey="timestamp" 
                    type="number" 
                    domain={['dataMin', 'dataMax']} 
                    tickFormatter={xAxisFormatter}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 500 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={60}
                    dy={10}
                  />
                  
                  <YAxis 
                    domain={['auto', 'auto']} 
                    tickFormatter={yAxisFormatter}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 500 }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                    orientation="right"
                  />

                  <Tooltip 
                    formatter={customTooltipFormatter}
                    labelFormatter={customTooltipLabelFormatter}
                    contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        borderRadius: '12px', 
                        border: '1px solid hsl(var(--border))', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        color: 'hsl(var(--foreground))',
                        fontWeight: 'bold',
                        padding: '12px'
                    }}
                    itemStyle={{ color: themeChartColor, fontSize: '16px' }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px', fontSize: '12px' }}
                    cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  
                  <Area 
                    type="stepAfter" 
                    dataKey="value" 
                    stroke={themeChartColor} 
                    strokeWidth={2.5} 
                    fillOpacity={1} 
                    fill="url(#colorValue)" 
                    dot={false} 
                    activeDot={{ r: 5, fill: themeChartColor, stroke: 'hsl(var(--background))', strokeWidth: 2 }} 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* HISTORIAL TABS: ACTIVAS / FINALIZADAS / MOVIMIENTOS */}
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <History className="w-6 h-6 text-primary" /> Tu Historial
        </h2>
        <Card className="bg-card border-border/50 shadow-md rounded-2xl overflow-hidden mb-8">
          <CardContent className="p-4 sm:p-6 md:p-8">
            <Tabs defaultValue="active" className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-12 mb-8 bg-muted/50 rounded-lg p-1 border border-border/50">
                <TabsTrigger value="active" className="flex items-center gap-2 text-xs sm:text-sm font-bold rounded-md"><LineChart className="w-4 h-4" /><span className="hidden sm:inline">Inversiones Activas</span><Badge variant="secondary" className="font-black h-5 px-1 ml-1 text-xs">{bets.filter(b => getMarket(b) && ACTIVE_STATUSES.includes(String(getMarket(b)!.status).toLowerCase())).length}</Badge></TabsTrigger>
                <TabsTrigger value="finished" className="flex items-center gap-2 text-xs sm:text-sm font-bold rounded-md"><History className="w-4 h-4" /><span className="hidden sm:inline">Finalizadas</span></TabsTrigger>
                <TabsTrigger value="bank" className="flex items-center gap-2 text-xs sm:text-sm font-bold rounded-md"><Landmark className="w-4 h-4" /><span className="hidden sm:inline">Movimientos</span></TabsTrigger>
              </TabsList>

              <TabsContent value="active" className="space-y-4">
                {isLoadingBets ? (
                   <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary opacity-60" /></div>
                ) : bets.filter((b) => getMarket(b) && ACTIVE_STATUSES.includes(String(getMarket(b)!.status).toLowerCase())).length === 0 ? (
                  <div className="p-16 text-center text-muted-foreground bg-muted/10 border-2 border-dashed border-border/50 rounded-2xl">
                    <LineChart className="w-16 h-16 mx-auto mb-5 opacity-20" />
                    <p className="text-xl font-bold mb-2 text-foreground">Tu portfolio activo está vacío</p>
                    <Button size="lg" asChild className="mt-6 font-bold rounded-full">
                      <Link href="/">Explorar Mercados</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bets.filter((b) => getMarket(b) && ACTIVE_STATUSES.includes(String(getMarket(b)!.status).toLowerCase())).map((bet) => {
                        const market = getMarket(bet); const opt = bet.option_details;
                        const isOldBinary = bet.outcome === "yes" || bet.outcome === "no";
                        const displayOutcome = opt ? opt.option_name : (isOldBinary ? (bet.outcome === "yes" ? "SÍ" : "NO") : "Opción");
                        const direction = (bet as any).direction || 'yes';
                        const isOptBinary = ['sí', 'si', 'yes', 'no'].includes(displayOutcome.toLowerCase());
                        let predictionText = isOptBinary ? (direction === 'no' ? (displayOutcome.toLowerCase().includes('s') ? 'No' : 'Sí') : displayOutcome) : `${direction === 'no' ? 'No' : 'Sí'} a ${displayOutcome}`;
                        const isEffectivelyNo = direction === 'no' || (isOptBinary && displayOutcome.toLowerCase() === 'no' && direction === 'yes');
                        
                        let cashoutValue = 0, pnl = 0, pnlPercentage = 0;
                        if (market) {
                          const shares = Number((bet as any).shares || 0);
                          cashoutValue = shares > 0 && opt ? calculateRealCashout(bet, market, opt) : Math.round(bet.amount * 0.95);
                          pnl = cashoutValue - bet.amount; pnlPercentage = (pnl / bet.amount) * 100;
                        }

                        return (
                          <div key={bet.id} className="rounded-2xl border border-border/50 bg-card hover:border-primary/50 transition-all p-5 md:p-7 shadow-sm relative overflow-hidden group">
                            <Link href={`/market/${bet.market_id}`} className="block"><p className="font-bold text-lg md:text-xl text-foreground line-clamp-2 mb-5 leading-tight group-hover:text-primary transition-colors pr-12">{market?.title ?? "Mercado"}</p></Link>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 md:gap-8 bg-muted/10 md:bg-transparent p-5 md:p-0 rounded-xl border md:border-none border-border/50">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 md:gap-10">
                                 <div className="flex flex-col"><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5">Inversión</p><p className="font-black text-foreground text-xl md:text-2xl leading-none">{bet.amount.toLocaleString()} <span className="text-xs font-bold text-muted-foreground">pts</span></p></div>
                                 <div className="flex flex-col"><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5">Posición</p><Badge variant="outline" className={cn("text-xs md:text-sm font-bold border h-8 justify-center w-fit", isEffectivelyNo ? "bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/30 dark:border-[#FF0000]/30" : "bg-green-500/10 text-green-600 dark:text-[#00FF00] border-green-500/30 dark:border-[#00FF00]/30")}>{predictionText}</Badge></div>
                                 <div className="flex flex-col min-w-[90px] col-span-2 sm:col-span-1"><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5 hidden md:block">Retorno</p>
                                   <div className="flex items-center gap-2"><span className={cn("font-black text-xl md:text-2xl leading-none", pnl >= 0 ? "text-green-600 dark:text-[#00FF00]" : "text-red-600 dark:text-[#FF0000]")}>{pnl >= 0 ? "+" : ""}{pnlPercentage.toFixed(1)}%</span></div>
                                 </div>
                              </div>
                              
                              {/* BOTÓN DE VENDER - MAGIA PURA */}
                              <div className="w-full md:w-auto mt-2 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-border/50">
                                <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBetToSell({ id: bet.id, title: market?.title ?? "Mercado", outcomeName: predictionText, direction: direction, cashoutValue: cashoutValue, pnl: pnl, pnlPercentage: pnlPercentage }); }} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black h-11 px-7 w-full md:w-auto shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all rounded-full" ><Coins className="w-4 h-4 mr-2" /> Vender por {cashoutValue.toLocaleString()} pts</Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="finished" className="space-y-4">
                 {bets.filter((b) => getMarket(b) && FINISHED_STATUSES.includes(String(getMarket(b)!.status).toLowerCase())).length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground"><History className="w-12 h-12 mx-auto mb-4 opacity-20" /><p>Aún no hay resultados de tus apuestas.</p></div>
                ) : (
                  <div className="space-y-4">
                    {bets.filter((b) => getMarket(b) && FINISHED_STATUSES.includes(String(getMarket(b)!.status).toLowerCase())).map((bet) => {
                        const market = getMarket(bet); const opt = bet.option_details; const direction = (bet as any).direction || 'yes';
                        const displayOutcome = opt ? opt.option_name : 'Opción';
                        const isOptBinary = ['sí', 'si', 'yes', 'no'].includes(displayOutcome.toLowerCase());
                        let predictionText = isOptBinary ? (direction === 'no' ? (displayOutcome.toLowerCase().includes('s') ? 'No' : 'Sí') : displayOutcome) : `${direction === 'no' ? 'No' : 'Sí'} a ${displayOutcome}`;
                        const isEffectivelyNo = direction === 'no' || (isOptBinary && displayOutcome.toLowerCase() === 'no' && direction === 'yes');
                        const won = (direction === 'yes' && market?.winning_outcome === bet.outcome) || (direction === 'no' && market?.winning_outcome !== bet.outcome && market?.winning_outcome !== null);

                        return (
                          <div key={bet.id} className="rounded-xl border border-border/50 bg-muted/10 p-4 md:p-6 opacity-90">
                            <p className="font-bold text-foreground line-clamp-2 mb-4">{market?.title ?? "Mercado"}</p>
                            <div className="flex flex-col md:flex-row md:items-center justify-between bg-background p-4 rounded-lg border border-border/50 gap-4">
                               <div className="flex items-center gap-6 md:gap-10">
                                 <div className="flex flex-col"><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Inversión</p><p className="font-bold text-foreground text-base md:text-lg">{bet.amount.toLocaleString()} pts</p></div>
                                 <div className="flex flex-col"><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Predicción</p><Badge variant="outline" className={cn("text-xs font-bold border h-7", isEffectivelyNo ? "bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/30" : "bg-green-500/10 text-green-600 dark:text-green-500 border-green-500/30")}>{predictionText}</Badge></div>
                               </div>
                               <div className="pt-2 md:pt-0 border-t md:border-t-0 border-border/50 w-full md:w-auto text-right">
                                 {won ? <span className="font-black text-lg text-green-600 dark:text-[#00FF00] flex items-center justify-end gap-1.5"><CheckCircle2 className="w-5 h-5" /> Acertó</span> : <span className="font-black text-lg text-red-600 dark:text-[#FF0000] flex items-center justify-end gap-1.5 opacity-90"><XCircle className="w-5 h-5" /> Perdió</span>}
                               </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="bank" className="space-y-3">
                {isLoadingTransactions ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : processedTransactions.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-border/50 rounded-xl bg-muted/10"><Landmark className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" /><h3 className="font-semibold text-foreground mb-1 text-lg">No hay movimientos</h3></div>
                ) : (
                  <div className="space-y-3">
                    {processedTransactions.map((tx) => {
                      const isPositive = tx.amount > 0;
                      const isExpanded = expandedTx === tx.id;
                      return (
                        <div key={tx.id} onClick={() => setExpandedTx(isExpanded ? null : tx.id)} className="flex flex-col p-4 rounded-xl border border-border/50 bg-muted/10 hover:bg-muted/20 transition-all cursor-pointer group">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isPositive ? 'bg-green-500/20 text-green-600 dark:text-[#00FF00]' : 'bg-red-500/20 text-red-600 dark:text-[#FF0000]'}`}>
                                {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                              </div>
                              <div>
                                <p className="text-base font-semibold text-foreground">{tx.description}</p>
                                <p className="text-xs text-muted-foreground uppercase font-medium mt-0.5 flex items-center gap-1">{new Date(tx.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className={`text-xl font-black ${isPositive ? 'text-green-600 dark:text-[#00FF00]' : 'text-red-600 dark:text-[#FF0000]'}`}>{isPositive ? '+' : ''}{tx.amount.toLocaleString()} pts</div>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />}
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-3 gap-2 text-center animate-in fade-in slide-in-from-top-2">
                              <div className="bg-background/50 p-2 rounded-lg"><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Saldo Anterior</p><p className="font-semibold text-foreground">{tx.balanceBefore.toLocaleString()} pts</p></div>
                              <div className="bg-background/50 p-2 rounded-lg"><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Monto</p><p className={`font-black ${isPositive ? 'text-green-600 dark:text-[#00FF00]' : 'text-red-600 dark:text-[#FF0000]'}`}>{isPositive ? '+' : ''}{tx.amount.toLocaleString()} pts</p></div>
                              <div className="bg-primary/10 border border-primary/20 p-2 rounded-lg"><p className="text-[10px] text-primary font-bold uppercase tracking-wider mb-1">Saldo Actualizado</p><p className="font-black text-primary">{tx.balanceAfter.toLocaleString()} pts</p></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* LA TRAMPA DE OSOS: BLOQUE DE REFERIDOS */}
        <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/20 shadow-md rounded-2xl mb-8 overflow-hidden">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center shrink-0"><Gift className="w-8 h-8 text-primary" /></div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-2xl font-bold text-foreground mb-2">¡Invitá amigos y ganá puntos!</h3>
                <p className="text-muted-foreground text-sm max-w-xl">Ganá <strong className="text-primary">2.000 pts</strong> por cada amigo que se registre con tu link. Además, ganás <strong className="text-primary">500 pts extras</strong> cada vez que ellos inviten a alguien más. Tu amigo recibe 1.000 pts de bienvenida.</p>
              </div>
              <div className="w-full md:w-auto mt-4 md:mt-0 flex flex-col gap-2">
                <div className="relative">
                  <Input readOnly value={referralLink} className="pr-12 bg-background border-border/50 font-medium text-muted-foreground w-full md:w-80" />
                  <Button size="icon" variant="ghost" className="absolute right-0 top-0 h-full w-12 hover:bg-transparent" onClick={handleCopyLink}>{isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}</Button>
                </div>
              </div>
            </div>
            {referredUsers.length > 0 && (
              <div className="mt-8 pt-6 border-t border-border/50 w-full">
                <h4 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Tus Referidos ({referredUsers.length})</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {referredUsers.map((user, i) => (
                    <div key={i} className="flex items-center gap-3 bg-background/50 border border-border/50 rounded-lg p-3 hover:border-primary/30 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">{user.username.charAt(0).toUpperCase()}</div>
                      <div className="min-w-0"><p className="font-bold text-sm text-foreground truncate">{user.username}</p><p className="text-[10px] text-muted-foreground uppercase">Usuario Activo</p></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </main>

      {/* MODALES DE ACCIÓN */}
      <Dialog open={!!betToSell} onOpenChange={(open) => !open && setBetToSell(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl text-foreground"><LineChart className="w-5 h-5 text-primary" /> Confirmar Venta</DialogTitle></DialogHeader>
          <div className="py-2 space-y-4">
            <div className="p-4 bg-muted/30 rounded-xl border border-border/50"><p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">Mercado:</p><p className="font-bold text-base text-foreground line-clamp-2">{betToSell?.title}</p></div>
            <div className="flex justify-between items-center p-4 bg-muted/30 rounded-xl border border-border/50"><span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Tu posición:</span><Badge variant="outline" className={cn("font-bold border text-sm h-8", betToSell?.direction === 'no' ? "bg-red-500/10 text-red-600 border-red-500/30" : "bg-green-500/10 text-green-600 border-green-500/30")}>{betToSell?.outcomeName}</Badge></div>
            <div className={`flex justify-between items-center p-5 border rounded-xl ${(betToSell?.pnl ?? 0) >= 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}><span className="font-bold text-foreground uppercase tracking-wider text-xs">Rentabilidad (PnL):</span><span className={`text-3xl font-black ${(betToSell?.pnl ?? 0) >= 0 ? 'text-green-600 dark:text-[#00FF00]' : 'text-red-600 dark:text-[#FF0000]'}`}>{(betToSell?.pnl ?? 0) >= 0 ? '+' : ''}{betToSell?.pnlPercentage.toFixed(1)}%</span></div>
            <div className="flex justify-between items-center px-2 pt-2"><span className="font-bold text-foreground uppercase tracking-wider text-sm">Retiro Total:</span><span className="text-2xl font-black text-primary">{betToSell?.cashoutValue.toLocaleString()} pts</span></div>
          </div>
          <DialogFooter className="mt-4"><Button variant="outline" onClick={() => setBetToSell(null)} className="font-bold rounded-lg">Cancelar</Button><Button onClick={confirmSell} disabled={sellingBetId === betToSell?.id} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg px-6 shadow-md">{sellingBetId === betToSell?.id ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Coins className="w-5 h-5 mr-2" />} Vender Ahora</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Editar Perfil</DialogTitle></DialogHeader><form onSubmit={handleSaveProfile} className="space-y-4 pt-4"><div className="flex flex-col items-center gap-4 mb-6"><div className="relative w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center border-2 border-border overflow-hidden">{previewUrl ? <img src={previewUrl} alt="Avatar" className="w-full h-full object-cover" /> : <AvatarFallback><UserIcon className="w-10 h-10 text-primary opacity-50" /></AvatarFallback>}</div><input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => { if (e.target.files && e.target.files[0]) { setSelectedImage(e.target.files[0]); setPreviewUrl(URL.createObjectURL(e.target.files[0])); } }} /><Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>Cambiar foto</Button></div><div className="space-y-2"><Label htmlFor="username">Nombre de usuario</Label><Input id="username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required /></div><Button type="submit" className="w-full mt-4" disabled={isSaving}>{isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Guardar Cambios</Button></form></DialogContent>
      </Dialog>

      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Cambiar Contraseña</DialogTitle></DialogHeader><form onSubmit={handleChangePassword} className="space-y-4 pt-4"><div className="space-y-2"><Label htmlFor="new-password">Nueva Contraseña</Label><Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} /></div><div className="space-y-2"><Label htmlFor="confirm-password">Confirmar Contraseña</Label><Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} /></div><Button type="submit" className="w-full mt-4" disabled={isChangingPassword}>{isChangingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Actualizar Contraseña</Button></form></DialogContent>
      </Dialog>

    </div>
  );
}