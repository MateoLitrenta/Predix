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
import { Coins, User as UserIcon, ArrowLeft, Loader2, TrendingUp, History, Pencil, Landmark, Lock, LineChart, CheckCircle2, XCircle, Gift, Copy, Check, Users, Wallet, CalendarDays } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis, YAxis } from "recharts";

const ACTIVE_STATUSES = ["active", "pending"];
const FINISHED_STATUSES = ["resolved", "rejected"];
const INITIAL_BALANCE = 10000;

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

  const calculatePositionValue = useCallback((bet: any, market: any, opt: any) => {
    const shares = Number(bet.shares || 0);
    if (shares <= 0) return bet.amount;
    const direction = bet.direction || 'yes';
    const optionVotes = Number(opt.total_votes || 0);
    const totalVol = Number(market.total_volume || 0);
    const totalOptions = marketOptions.filter(o => o.market_id === market.id).length || 2;
    const currentPriceYes = (optionVotes + 100.0) / (totalVol + (totalOptions * 100.0));
    const currentPrice = direction === 'yes' ? currentPriceYes : (1 - currentPriceYes);
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
          totalCurrentValueActive += calculatePositionValue(bet, market, opt);
        }
      });

    const totalPortfolioValue = availableCapital + totalCurrentValueActive;
    return { availableCapital, totalPortfolioValue, lockedValueOffset: totalCurrentValueActive };
  }, [bets, profile?.points, calculatePositionValue, marketOptions]);

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

  // LÓGICA DE GRÁFICO FINAL Y ESTABLE: CÁLCULO HACIA ATRÁS
  const chartData = useMemo(() => {
    const chronologicalTxs = [...transactions].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // 1. ANCLAJE A LA REALIDAD: Calculamos el balance histórico hacia atrás 
    // partiendo de los puntos reales y actuales de la base de datos.
    let currentTempBalance = profile?.points ?? 0;
    const txsWithBalance = [...chronologicalTxs].reverse().map((tx) => {
      const balanceAfter = currentTempBalance;
      const balanceBefore = currentTempBalance - Number(tx.amount || 0);
      currentTempBalance = balanceBefore;
      return { ...tx, balanceAfter, balanceBefore };
    }).reverse();

    const trueStartingBalance = currentTempBalance; // El balance inicial real derivado

    const now = Date.now();
    let startTimeForAll = profile?.created_at ? new Date(profile.created_at).getTime() : (chronologicalTxs.length > 0 ? new Date(chronologicalTxs[0].created_at).getTime() : now - 30 * 86400 * 1000);

    let timestamps: number[] = [];

    if (timeframe === '1D') {
      for (let i = 24; i >= 0; i--) timestamps.push(now - i * 3600 * 1000);
    } else if (timeframe === '1W') {
      for (let i = 7; i >= 0; i--) timestamps.push(now - i * 86400 * 1000);
    } else if (timeframe === '1M') {
      for (let i = 30; i >= 0; i--) timestamps.push(now - i * 86400 * 1000);
    } else if (timeframe === '6M') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        timestamps.push(d.getTime());
      }
    } else if (timeframe === '1Y') {
      for (let i = 12; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        timestamps.push(d.getTime());
      }
    } else if (timeframe === 'ALL') {
      const diff = now - startTimeForAll;
      const steps = Math.max(1, Math.ceil(diff / (30 * 86400 * 1000)));
      for (let i = 0; i <= steps; i++) {
        timestamps.push(startTimeForAll + (diff / steps) * i);
      }
    }

    const startTime = timestamps[0];

    chronologicalTxs.forEach(tx => {
      const txTime = new Date(tx.created_at).getTime();
      if (txTime >= startTime && txTime <= now) timestamps.push(txTime);
    });

    timestamps = Array.from(new Set(timestamps)).sort((a, b) => a - b);

    const data = timestamps.map(ts => {
      // Balance líquido exacto en este milisegundo de la historia
      let liquidAtTs = trueStartingBalance;
      for (let i = 0; i < txsWithBalance.length; i++) {
        const txTime = new Date(txsWithBalance[i].created_at).getTime();
        if (txTime <= ts) {
          liquidAtTs = txsWithBalance[i].balanceAfter;
        } else {
          break;
        }
      }

      // Costo base de las inversiones que *actualmente* están activas
      let activeInvestmentAtTs = 0;
      bets.forEach(bet => {
        const betTime = new Date(bet.created_at || '').getTime();
        if (betTime <= ts) {
          const market = getMarket(bet);
          if (market && ACTIVE_STATUSES.includes(String(market.status).toLowerCase())) {
            activeInvestmentAtTs += Number(bet.amount || 0);
          }
        }
      });

      return { timestamp: ts, value: Math.max(0, liquidAtTs + activeInvestmentAtTs) };
    });

    return data;
  }, [transactions, timeframe, profile, bets]);

  const dynamicPnl = useMemo(() => {
    if (chartData.length < 2) return { value: 0, percentage: 0 };

    const startValue = chartData[0].value;
    const endValue = portfolioStats.totalPortfolioValue;

    const val = endValue - startValue;

    let divisor = startValue;
    if (divisor === 0) divisor = INITIAL_BALANCE;
    const pct = (val / Math.abs(divisor)) * 100;

    return { value: val, percentage: pct };
  }, [chartData, portfolioStats.totalPortfolioValue]);

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

  const axisTextColor = isDarkMode ? 'rgba(161, 161, 170, 0.4)' : 'rgba(100, 116, 139, 0.5)';
  const axisLineColor = isDarkMode ? 'rgba(51, 65, 85, 0.3)' : 'rgba(226, 232, 240, 0.5)';
  const tooltipBgColor = isDarkMode ? '#0f172a' : '#ffffff';
  const tooltipTextColor = isDarkMode ? '#f8fafc' : '#0f172a';

  if (isChecking) {
    return (
      <div className="min-h-screen bg-muted/10 flex flex-col">
        <NavHeader points={10000} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} onPointsUpdate={() => { }} userId={null} userEmail={null} onOpenAuthModal={() => { }} onSignOut={async () => { }} isAdmin={false} username={null} />

        <main className="container mx-auto px-4 py-8 flex-1 max-w-4xl">
          <div className="flex items-center justify-between mb-8">
            <div className="h-8 w-32 bg-muted/60 rounded animate-pulse" />
            <div className="h-6 w-24 bg-muted/60 rounded-full animate-pulse" />
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-10">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-muted/60 animate-pulse shrink-0 border-4 border-background" />
            <div className="flex-1 w-full space-y-4 mt-2">
              <div className="h-10 w-48 bg-muted/60 rounded animate-pulse mx-auto sm:mx-0" />
              <div className="h-4 w-64 bg-muted/60 rounded animate-pulse mx-auto sm:mx-0" />
            </div>
            <div className="hidden sm:flex gap-3">
              <div className="h-9 w-9 bg-muted/60 rounded-md animate-pulse" />
              <div className="h-9 w-24 bg-muted/60 rounded-md animate-pulse" />
            </div>
          </div>

          <div className="bg-card/30 border border-border/30 rounded-3xl p-6 md:p-10 mb-12 shadow-sm animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex flex-col">
                  <div className="h-6 w-6 bg-muted/60 rounded mb-4" />
                  <div className="h-3 w-40 bg-muted/60 rounded mb-2" />
                  <div className="h-10 w-32 bg-muted/60 rounded" />
                </div>
              ))}
            </div>
          </div>

          <div className="h-[450px] w-full bg-muted/30 rounded-2xl border border-border/50 animate-pulse mb-12" />

          <div className="h-8 w-40 bg-muted/60 rounded animate-pulse mb-6" />
          <div className="h-[300px] w-full bg-muted/30 rounded-2xl border border-border/50 animate-pulse p-6">
            <div className="h-12 w-full bg-muted/50 rounded-lg mb-8" />
            <div className="space-y-4">
              <div className="h-24 w-full bg-muted/60 rounded-xl" />
              <div className="h-24 w-full bg-muted/60 rounded-xl" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!profile) return null;

  const displayName = profile.username || profile.email?.split("@")[0] || "Usuario";

  return (
    <div className="min-h-screen bg-muted/10 flex flex-col">
      <NavHeader points={profile.points ?? 10000} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} onPointsUpdate={() => { }} userId={profile.id} userEmail={profile.email ?? null} onOpenAuthModal={() => router.push("/")} onSignOut={async () => { await createClient().auth.signOut(); router.replace("/"); }} isAdmin={profile.role === "admin"} username={profile.username ?? null} />

      <main className="container mx-auto px-4 py-8 flex-1 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
            <Link href="/"><ArrowLeft className="w-4 h-4 mr-2" /> Volver al Inicio</Link>
          </Button>
          <Badge className="bg-primary/10 text-primary border-primary/20 font-medium">Área Personal</Badge>
        </div>

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

        <div className="bg-card/40 backdrop-blur-xl border border-border/40 rounded-3xl p-8 md:p-12 mb-12 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="flex flex-col">
              <Wallet className="w-6 h-6 text-muted-foreground mb-4 opacity-70" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Portfolio Total</p>
              <p className="text-3xl font-black text-foreground">{portfolioStats.totalPortfolioValue.toLocaleString()} pts</p>
            </div>

            <div className="flex flex-col">
              <TrendingUp className="w-6 h-6 text-muted-foreground mb-4 opacity-70" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Posiciones Activas</p>
              <p className="text-3xl font-black text-foreground">{portfolioStats.lockedValueOffset.toLocaleString()} pts</p>
              <p className="text-xs font-semibold text-muted-foreground mt-1">{bets.filter(b => getMarket(b) && ACTIVE_STATUSES.includes(String(getMarket(b)!.status).toLowerCase())).length} Mercados</p>
            </div>

            <div className="flex flex-col">
              <Coins className="w-6 h-6 text-muted-foreground mb-4 opacity-70" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Balance Líquido</p>
              <p className="text-3xl font-black text-foreground">{(profile.points ?? 0).toLocaleString()} pts</p>
              <p className="text-xs font-semibold text-muted-foreground mt-1">Puntos disponibles para operar</p>
            </div>
          </div>
        </div>

        <Card className="bg-card border border-border/50 shadow-sm rounded-2xl overflow-hidden mb-12">
          <CardContent className="p-0">
            <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-border/20">
              <div>
                <div className="flex items-center gap-2 font-bold text-muted-foreground mb-2">
                  <TrendingUp className="w-4 h-4" /> Variación del Portfolio
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
                  Fluctuación en {timeframeLabels[timeframe]} • Total: {portfolioStats.totalPortfolioValue.toLocaleString()} pts
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
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={themeChartColor} stopOpacity={0.15} />
                      <stop offset="60%" stopColor={themeChartColor} stopOpacity={0.03} />
                      <stop offset="100%" stopColor={themeChartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={xAxisFormatter}
                    tick={{ fill: axisTextColor, fontSize: 11, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={{ stroke: axisLineColor, strokeWidth: 1 }}
                    minTickGap={80}
                    dy={15}
                  />

                  <YAxis
                    domain={['auto', 'auto']}
                    tickFormatter={yAxisFormatter}
                    tick={{ fill: axisTextColor, fontSize: 11, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={{ stroke: axisLineColor, strokeWidth: 1 }}
                    width={55}
                    orientation="left"
                    dx={-10}
                    tickCount={5}
                  />

                  <Tooltip
                    formatter={customTooltipFormatter}
                    labelFormatter={customTooltipLabelFormatter}
                    contentStyle={{
                      backgroundColor: tooltipBgColor,
                      borderRadius: '12px',
                      border: `1px solid ${axisLineColor}`,
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                      color: tooltipTextColor,
                      fontWeight: 'bold',
                      padding: '12px'
                    }}
                    itemStyle={{ color: themeChartColor, fontSize: '16px' }}
                    labelStyle={{ color: axisTextColor, marginBottom: '4px', fontSize: '12px' }}
                    cursor={{ stroke: axisTextColor, strokeWidth: 1, strokeDasharray: '4 4' }}
                  />

                  <Area
                    type="monotone"
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

              <TabsContent value="active" className="space-y-6">
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
                  <div className="flex flex-col gap-6">
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
                        cashoutValue = shares > 0 && opt ? calculatePositionValue(bet, market, opt) : bet.amount;
                        pnl = cashoutValue - bet.amount; pnlPercentage = (pnl / bet.amount) * 100;
                      }

                      return (
                        <div key={bet.id} className="rounded-2xl border border-border/50 bg-card hover:border-primary/50 transition-all p-6 md:p-8 shadow-sm relative overflow-hidden group">
                          <Link href={`/market/${bet.market_id}`} className="block">
                            <p className="font-bold text-lg md:text-xl text-foreground mb-6 leading-relaxed group-hover:text-primary transition-colors md:pr-12">{market?.title ?? "Mercado"}</p>
                          </Link>

                          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-muted/10 p-5 rounded-xl border border-border/50 items-center">
                            <div className="flex flex-col md:col-span-3">
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2">Inversión</p>
                              <p className="font-black text-foreground text-xl leading-none">{bet.amount.toLocaleString()} <span className="text-xs font-bold text-muted-foreground">pts</span></p>
                            </div>
                            <div className="flex flex-col md:col-span-3">
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2">Posición</p>
                              <Badge variant="outline" className={cn("text-xs font-bold border h-8 justify-center w-fit", isEffectivelyNo ? "bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/30 dark:border-[#FF0000]/30" : "bg-green-500/10 text-green-600 dark:text-[#00FF00] border-green-500/30 dark:border-[#00FF00]/30")}>{predictionText}</Badge>
                            </div>
                            <div className="flex flex-col md:col-span-3">
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2">Retorno</p>
                              <div className="flex items-center gap-2">
                                <span className={cn("font-black text-xl leading-none", pnl >= 0 ? "text-green-600 dark:text-[#00FF00]" : "text-red-600 dark:text-[#FF0000]")}>{pnl >= 0 ? "+" : ""}{pnlPercentage.toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="md:col-span-3 flex justify-end w-full">
                              <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBetToSell({ id: bet.id, title: market?.title ?? "Mercado", outcomeName: predictionText, direction: direction, cashoutValue: cashoutValue, pnl: pnl, pnlPercentage: pnlPercentage }); }} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black h-11 w-full md:w-auto px-6 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all rounded-full" >
                                <Coins className="w-4 h-4 mr-2" /> Vender por {cashoutValue.toLocaleString()} pts
                              </Button>
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

              <TabsContent value="bank" className="space-y-4 pt-2">
                {isLoadingTransactions ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : processedTransactions.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-border/50 rounded-xl bg-muted/10">
                    <Landmark className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <h3 className="font-semibold text-foreground mb-1 text-lg">No hay movimientos</h3>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
                    <div className="hidden md:grid grid-cols-12 gap-4 bg-muted/40 p-4 border-b border-border/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <div className="col-span-2">Fecha</div>
                      <div className="col-span-5">Descripción</div>
                      <div className="col-span-2 text-right">Monto</div>
                      <div className="col-span-3 text-right pr-2">Saldo Resultante</div>
                    </div>

                    <div className="divide-y divide-border/30 max-h-[600px] overflow-y-auto">
                      {processedTransactions.map((tx) => {
                        const isPositive = tx.amount > 0;
                        const formattedDate = new Date(tx.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
                        const formattedTime = new Date(tx.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

                        return (
                          <div key={tx.id} className="group flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-4 p-4 hover:bg-muted/10 transition-colors items-start md:items-center">

                            <div className="col-span-2 flex flex-row md:flex-col items-center md:items-start gap-2 md:gap-0 w-full md:w-auto">
                              <span className="text-xs font-bold text-foreground/80 w-[45px] text-center md:text-left bg-muted md:bg-transparent rounded px-1.5 md:px-0 py-0.5 md:py-0">{formattedDate}</span>
                              <span className="text-[10px] font-medium text-muted-foreground">{formattedTime}</span>
                            </div>

                            <div className="col-span-5 w-full">
                              <p className="text-sm font-semibold text-foreground line-clamp-2 md:line-clamp-1 group-hover:text-primary transition-colors cursor-default" title={tx.description}>
                                {tx.description}
                              </p>
                            </div>

                            <div className="col-span-2 flex items-center md:justify-end w-full md:w-auto mt-2 md:mt-0">
                              <span className="md:hidden text-[10px] font-bold text-muted-foreground uppercase mr-2">Monto:</span>
                              <span className={cn("font-black text-base md:text-lg tabular-nums", isPositive ? "text-green-600 dark:text-[#00FF00]" : "text-foreground")}>
                                {isPositive ? '+' : ''}{tx.amount.toLocaleString()} <span className="text-[10px] font-bold opacity-70 uppercase">pts</span>
                              </span>
                            </div>

                            <div className="col-span-3 flex items-center md:justify-end w-full md:w-auto md:pr-2">
                              <span className="md:hidden text-[10px] font-bold text-muted-foreground uppercase mr-2">Saldo:</span>
                              <span className="font-bold text-sm md:text-base text-muted-foreground tabular-nums">
                                {tx.balanceAfter.toLocaleString()} <span className="text-[10px] font-bold opacity-70 uppercase">pts</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

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