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
import { Coins, User as UserIcon, ArrowLeft, Loader2, TrendingUp, History, Pencil, Landmark, Lock, LineChart, CheckCircle2, XCircle, Gift, Copy, Check, Users, Wallet, CalendarDays, ChevronRight, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

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
  const { isDarkMode, toggleDarkMode } = useTheme();

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

  const isBetActive = useCallback((b: BetWithMarket) => {
    const market = getMarket(b);
    if (!market) return false;
    const opt = (b as any).option_details;
    if (opt?.is_eliminated) return false;
    return ACTIVE_STATUSES.includes(String(market.status).toLowerCase()) &&
      ACTIVE_STATUSES.includes(String((b as any).status).toLowerCase());
  }, []);

  const isBetFinished = useCallback((b: BetWithMarket) => {
    const market = getMarket(b);
    if (!market) return false;
    const opt = (b as any).option_details;
    if (opt?.is_eliminated) return true;
    return FINISHED_STATUSES.includes(String(market.status).toLowerCase()) ||
      String((b as any).status).toLowerCase() === 'lost' ||
      String((b as any).status).toLowerCase() === 'sold';
  }, []);

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

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setIsCopied(true);
    toast({ title: "¡Link copiado!", description: "Mandáselo a tus amigos para ganar puntos." });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const calculatePositionValue = useCallback((bet: any, market: any, opt: any) => {
    if (opt?.is_eliminated) return 0;

    const shares = Number(bet.shares || 0);
    if (shares <= 0) return bet.amount;
    const direction = bet.direction || 'yes';

    const optionVotes = Number(opt.total_votes || 0);
    const marketOpts = marketOptions.filter(o => o.market_id === market.id);
    const totalOptions = marketOpts.length || 2;
    const realTotalVotes = marketOpts.reduce((acc, o) => acc + Number(o.total_votes || 0), 0);

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
  }, [marketOptions]);

  const portfolioStats = useMemo(() => {
    const availableCapital = profile?.points ?? 0;
    let totalCurrentValueActive = 0;

    bets
      .filter(isBetActive)
      .forEach((bet) => {
        const market = getMarket(bet);
        const opt = bet.option_details;
        if (market && opt) {
          totalCurrentValueActive += calculatePositionValue(bet, market, opt);
        }
      });

    const totalPortfolioValue = availableCapital + totalCurrentValueActive;
    return { availableCapital, totalPortfolioValue, lockedValueOffset: totalCurrentValueActive };
  }, [bets, profile?.points, calculatePositionValue, isBetActive]);

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

  const chartData = useMemo(() => {
    const chronologicalTxs = [...transactions].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let currentTempBalance = profile?.points ?? 0;
    const txsWithBalance = [...chronologicalTxs].reverse().map((tx) => {
      const balanceAfter = currentTempBalance;
      const balanceBefore = currentTempBalance - Number(tx.amount || 0);
      currentTempBalance = balanceBefore;
      return { ...tx, balanceAfter, balanceBefore };
    }).reverse();

    const trueStartingBalance = currentTempBalance;

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

    bets.forEach(bet => {
      const betTime = new Date(bet.created_at || '').getTime();
      if (betTime >= startTime && betTime <= now) timestamps.push(betTime);
    });

    timestamps = Array.from(new Set(timestamps)).sort((a, b) => a - b);

    const data = timestamps.map(ts => {
      let liquidAtTs = trueStartingBalance;
      for (let i = 0; i < txsWithBalance.length; i++) {
        const txTime = new Date(txsWithBalance[i].created_at).getTime();
        if (txTime <= ts + 1000) {
          liquidAtTs = txsWithBalance[i].balanceAfter;
        } else {
          break;
        }
      }

      let activeInvestmentAtTs = 0;
      bets.forEach(bet => {
        const betTime = new Date(bet.created_at || '').getTime();
        if (betTime <= ts) {
          const market = getMarket(bet);
          const opt = (bet as any).option_details;
          
          let isActiveTimeline = false;
          const betStatus = String((bet as any).status).toLowerCase();
          const marketStatus = String(market?.status).toLowerCase();
          
          if (opt?.is_eliminated) {
            if (opt.eliminated_at) {
              const elimTime = new Date(opt.eliminated_at).getTime();
              if (ts < elimTime) {
                isActiveTimeline = true;
              }
            } else {
              isActiveTimeline = false;
            }
          } else if (ACTIVE_STATUSES.includes(betStatus) && ACTIVE_STATUSES.includes(marketStatus)) {
            isActiveTimeline = true;
          } else {
            // Sincronización Estricta: Buscar la transacción correspondiente en la billetera
            const approxClosedTime = new Date((bet as any).updated_at || (market as any).updated_at || (bet as any).created_at).getTime();
            
            // Buscar una transacción cercana en tiempo (cashout o resolución)
            const correspondingTx = chronologicalTxs.find(tx => Math.abs(new Date(tx.created_at).getTime() - approxClosedTime) < 5000);
            
            // Si hay una transacción, usamos EXACTAMENTE su timestamp
            // Si no hay transacción (ej. perdió la apuesta), el fin lo dicta el approxClosedTime
            const finalClosedAtTime = correspondingTx ? new Date(correspondingTx.created_at).getTime() : approxClosedTime;
            
            if (ts < finalClosedAtTime) {
              isActiveTimeline = true;
            }
          }

          if (isActiveTimeline) {
            const betStatus = String((bet as any).status).toLowerCase();
            const marketStatus = String(market?.status).toLowerCase();
            
            // Usamos investment (o points_invested como fallback si la db tiene ese nombre) 
            const originalInvestment = Number((bet as any).investment || (bet as any).points_invested || bet.amount || 0);

            if (!ACTIVE_STATUSES.includes(betStatus) || !ACTIVE_STATUSES.includes(marketStatus)) {
              // Tasación Histórica: Apuesta cerrada. Usamos estrictamente el costo original en puntos.
              activeInvestmentAtTs += originalInvestment;
            } else {
              // Apuesta activa hoy: Usamos valor de mercado actual (Unrealized PnL)
              if (market && opt) {
                const mockOpt = { ...opt, is_eliminated: false };
                activeInvestmentAtTs += calculatePositionValue(bet, market, mockOpt);
              } else {
                activeInvestmentAtTs += originalInvestment;
              }
            }
          }
        }
      });

      return { timestamp: ts, value: Math.max(0, liquidAtTs + activeInvestmentAtTs) };
    });

    return data;
  }, [transactions, timeframe, profile, bets, isBetActive, calculatePositionValue]);

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
        <NavHeader points={10000} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} onPointsUpdate={() => { }} userId={null} userEmail={null} onOpenAuthModal={() => { }} onSignOut={async () => { }} isAdmin={false} username={null} />

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
          </div>

          <div className="h-[250px] sm:h-[450px] w-full bg-muted/30 rounded-2xl border border-border/50 animate-pulse mb-12" />
        </main>
      </div>
    );
  }

  if (!profile) return null;

  const displayName = profile.username || profile.email?.split("@")[0] || "Usuario";

  return (
    <div className="min-h-screen bg-muted/10 flex flex-col pb-20 lg:pb-0">
      <NavHeader points={profile.points ?? 10000} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} onPointsUpdate={() => { }} userId={profile.id} userEmail={profile.email ?? null} onOpenAuthModal={() => router.push("/")} onSignOut={async () => { await createClient().auth.signOut(); router.replace("/"); }} isAdmin={profile.role === "admin"} username={profile.username ?? null} />

      <main className="container mx-auto px-4 sm:px-6 py-6 lg:py-8 flex-1 max-w-4xl">

        {/* ENCABEZADO COMPACTO */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16 sm:w-20 sm:h-20 border-2 sm:border-4 border-background bg-primary/10 shadow-md shrink-0">
              {profile.avatar_url ? <AvatarImage src={profile.avatar_url} className="object-cover" /> : <AvatarFallback><UserIcon className="w-8 h-8 text-primary opacity-50" /></AvatarFallback>}
            </Avatar>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground truncate tracking-tighter mb-0.5 sm:mb-1">{displayName}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium flex items-center gap-1.5 opacity-80">
                <CalendarDays className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Miembro desde {new Date(profile.created_at || new Date()).getFullYear()}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 h-10 w-10 sm:hidden border border-border/50 bg-background shadow-sm rounded-full" onClick={() => { setNewUsername(profile.username || ""); setPreviewUrl(profile.avatar_url || null); setSelectedImage(null); setIsEditModalOpen(true); }}>
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </Button>
          <div className="hidden sm:flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setIsPasswordModalOpen(true)}><Lock className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => { setNewUsername(profile.username || ""); setPreviewUrl(profile.avatar_url || null); setSelectedImage(null); setIsEditModalOpen(true); }}><Pencil className="w-4 h-4 mr-2" /> Editar</Button>
          </div>
        </div>

        {/* MÉTRICAS FINANCIERAS (GRILLA MÓVIL) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-6 mb-8">
          <div className="col-span-2 sm:col-span-1 bg-card border border-border/50 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest">Portfolio Total</p>
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-primary opacity-80" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-foreground">{portfolioStats.totalPortfolioValue.toLocaleString()} pts</p>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest leading-tight">Activo</p>
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 opacity-80" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-black text-foreground">{portfolioStats.lockedValueOffset.toLocaleString()}</p>
              <p className="text-[10px] font-semibold text-muted-foreground">{bets.filter(isBetActive).length} mercados</p>
            </div>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest leading-tight">Líquido</p>
              <Coins className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 opacity-80" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-black text-foreground">{(profile.points ?? 0).toLocaleString()}</p>
              <p className="text-[10px] font-semibold text-muted-foreground">Disponibles</p>
            </div>
          </div>
        </div>

        {/* GRÁFICO DE RENDIMIENTO (OPTIMIZADO) */}
        <Card className="bg-card border border-border/50 shadow-sm rounded-2xl overflow-hidden mb-8">
          <CardContent className="p-0">
            <div className="p-4 sm:p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/20">
              <div>
                <div className="flex items-center gap-2 font-bold text-muted-foreground mb-1 text-sm sm:text-base">
                  <TrendingUp className="w-4 h-4" /> Variación
                </div>
                <div className="flex items-baseline gap-2 sm:gap-3 flex-wrap mt-1">
                  <span className={cn("text-3xl sm:text-4xl md:text-5xl font-black tracking-tight", isProfit ? "text-green-600 dark:text-[#00FF00]" : "text-red-600 dark:text-[#FF0000]")}>
                    {isProfit ? '+' : ''}{dynamicPnl.value.toLocaleString()} <span className="text-lg sm:text-2xl opacity-80">pts</span>
                  </span>
                  <Badge variant="outline" className={cn("text-xs sm:text-sm md:text-base px-2 py-0.5 font-bold border-2", isProfit ? "bg-green-500/10 text-green-600 dark:text-[#00FF00] border-green-500/30" : "bg-red-500/10 text-red-600 dark:text-[#FF0000] border-red-500/30")}>
                    {isProfit ? '+' : ''}{dynamicPnl.percentage.toFixed(2)}%
                  </Badge>
                </div>
              </div>

              <div className="flex bg-muted/50 p-1 rounded-xl backdrop-blur-md border border-border/30 w-full md:w-auto overflow-x-auto scrollbar-none">
                {(['1D', '1W', '1M', '6M', '1Y', 'ALL'] as TimeframeType[]).map((tf) => (
                  <button key={tf} onClick={() => setTimeframe(tf)} className={cn("px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold rounded-lg transition-all whitespace-nowrap flex-1 md:flex-none", timeframe === tf ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* ALTO LIMITADO EN MOBILE (h-[250px]) */}
            <div className="w-full h-[250px] md:h-[400px] p-2 sm:p-4 md:p-6 pt-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={themeChartColor} stopOpacity={0.15} />
                      <stop offset="60%" stopColor={themeChartColor} stopOpacity={0.03} />
                      <stop offset="100%" stopColor={themeChartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']} tickFormatter={xAxisFormatter} tick={{ fill: axisTextColor, fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: axisLineColor, strokeWidth: 1 }} minTickGap={60} dy={10} />
                  <YAxis domain={['auto', 'auto']} tickFormatter={yAxisFormatter} tick={{ fill: axisTextColor, fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: axisLineColor, strokeWidth: 1 }} width={45} orientation="left" dx={-5} tickCount={4} />
                  <Tooltip formatter={customTooltipFormatter} labelFormatter={customTooltipLabelFormatter} contentStyle={{ backgroundColor: tooltipBgColor, borderRadius: '12px', border: `1px solid ${axisLineColor}`, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', color: tooltipTextColor, fontWeight: 'bold', padding: '10px' }} itemStyle={{ color: themeChartColor, fontSize: '14px' }} labelStyle={{ color: axisTextColor, marginBottom: '4px', fontSize: '11px' }} cursor={{ stroke: axisTextColor, strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="value" stroke={themeChartColor} strokeWidth={2.5} fillOpacity={1} fill="url(#colorValue)" dot={false} activeDot={{ r: 4, fill: themeChartColor, stroke: 'hsl(var(--background))', strokeWidth: 2 }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* TABS DE HISTORIAL */}
        <h2 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2 px-1">
          <History className="w-5 h-5 text-primary" /> Tu Historial
        </h2>

        <Tabs defaultValue="active" className="w-full mb-8">
          <TabsList className="grid w-full grid-cols-3 h-12 mb-6 bg-muted/30 rounded-xl p-1 border border-border/50">
            <TabsTrigger value="active" className="flex items-center gap-1.5 text-[11px] sm:text-sm font-bold rounded-lg"><LineChart className="w-3.5 h-3.5 hidden sm:block" />Activas <Badge variant="secondary" className="font-black h-4 px-1 ml-0.5 text-[9px]">{bets.filter(isBetActive).length}</Badge></TabsTrigger>
            <TabsTrigger value="finished" className="flex items-center gap-1.5 text-[11px] sm:text-sm font-bold rounded-lg"><History className="w-3.5 h-3.5 hidden sm:block" />Cerradas</TabsTrigger>
            <TabsTrigger value="bank" className="flex items-center gap-1.5 text-[11px] sm:text-sm font-bold rounded-lg"><Landmark className="w-3.5 h-3.5 hidden sm:block" />Billetera</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="m-0">
            {isLoadingBets ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary opacity-60" /></div>
            ) : bets.filter(isBetActive).length === 0 ? (
              <div className="p-10 sm:p-16 text-center text-muted-foreground bg-muted/10 border-2 border-dashed border-border/50 rounded-2xl">
                <LineChart className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg sm:text-xl font-bold mb-2 text-foreground">Tu portfolio activo está vacío</p>
                <Button size="sm" asChild className="mt-4 font-bold rounded-full"><Link href="/">Explorar Mercados</Link></Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bets.filter(isBetActive).map((bet) => {
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

                  // DISEÑO DE TARJETA MOBILE FIRST
                  return (
                    <div key={bet.id} className="rounded-2xl border border-border/50 bg-card hover:border-primary/50 transition-all p-4 shadow-sm flex flex-col h-full">
                      <Link href={`/market/${bet.market_id}`} className="block mb-4 flex-1">
                        <p className="font-bold text-base sm:text-lg text-foreground leading-snug line-clamp-2 hover:text-primary transition-colors pr-2">
                          {market?.title ?? "Mercado"}
                        </p>
                      </Link>

                      <div className="grid grid-cols-2 gap-3 mb-4 bg-muted/10 p-3 rounded-xl border border-border/30">
                        <div>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Inversión</p>
                          <p className="font-black text-foreground text-sm sm:text-base">{bet.amount.toLocaleString()} <span className="text-[10px] font-bold text-muted-foreground">pts</span></p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Retorno</p>
                          <span className={cn("font-black text-sm sm:text-base leading-none", pnl >= 0 ? "text-green-600 dark:text-[#00FF00]" : "text-red-600 dark:text-[#FF0000]")}>{pnl >= 0 ? "+" : ""}{pnlPercentage.toFixed(1)}%</span>
                        </div>
                        <div className="col-span-2 mt-1">
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5">Posición</p>
                          <Badge variant="outline" className={cn("text-xs font-bold border h-7 justify-center w-full", isEffectivelyNo ? "bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/30" : "bg-green-500/10 text-green-600 dark:text-[#00FF00] border-green-500/30")}>
                            {predictionText}
                          </Badge>
                        </div>
                      </div>

                      <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBetToSell({ id: bet.id, title: market?.title ?? "Mercado", outcomeName: predictionText, direction: direction, cashoutValue: cashoutValue, pnl: pnl, pnlPercentage: pnlPercentage }); }} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black h-11 w-full shadow-sm rounded-xl">
                        <Coins className="w-4 h-4 mr-2" /> Vender • {cashoutValue.toLocaleString()} pts
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="finished" className="m-0 space-y-3">
            {bets.filter(isBetFinished).length === 0 ? (
              <div className="p-12 text-center text-muted-foreground bg-muted/10 rounded-2xl"><History className="w-10 h-10 mx-auto mb-3 opacity-20" /><p className="text-sm font-medium">Aún no hay resultados.</p></div>
            ) : (
              bets.filter(isBetFinished).map((bet) => {
                const market = getMarket(bet); const opt = bet.option_details; const direction = (bet as any).direction || 'yes';
                const displayOutcome = opt ? opt.option_name : 'Opción';
                const isOptBinary = ['sí', 'si', 'yes', 'no'].includes(displayOutcome.toLowerCase());
                let predictionText = isOptBinary ? (direction === 'no' ? (displayOutcome.toLowerCase().includes('s') ? 'No' : 'Sí') : displayOutcome) : `${direction === 'no' ? 'No' : 'Sí'} a ${displayOutcome}`;
                const isEffectivelyNo = direction === 'no' || (isOptBinary && displayOutcome.toLowerCase() === 'no' && direction === 'yes');

                const isBetLost = String((bet as any).status).toLowerCase() === 'lost' || (opt as any)?.is_eliminated;
                const isResolvedAndWon = market?.winning_outcome !== null && ((direction === 'yes' && market?.winning_outcome === bet.outcome) || (direction === 'no' && market?.winning_outcome !== bet.outcome));
                const won = !isBetLost && isResolvedAndWon;

                return (
                  <div key={bet.id} className="rounded-xl border border-border/50 bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-foreground line-clamp-1 mb-2">{market?.title ?? "Mercado"}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-muted-foreground">{bet.amount.toLocaleString()} pts</span>
                        <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 font-bold border", isEffectivelyNo ? "bg-red-500/10 text-red-600 border-red-500/30" : "bg-green-500/10 text-green-600 border-green-500/30")}>{predictionText}</Badge>
                      </div>
                    </div>
                    <div className="pt-3 sm:pt-0 border-t sm:border-t-0 border-border/30 w-full sm:w-auto text-right sm:text-left">
                      {won ? <span className="font-black text-sm text-green-600 dark:text-[#00FF00] flex items-center justify-end sm:justify-start gap-1"><CheckCircle2 className="w-4 h-4" /> Acertó</span> : <span className="font-black text-sm text-red-600 dark:text-[#FF0000] flex items-center justify-end sm:justify-start gap-1 opacity-90"><XCircle className="w-4 h-4" /> Perdió</span>}
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="bank" className="m-0 pt-2">
            {isLoadingTransactions ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" /></div>
            ) : processedTransactions.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-border/50 rounded-xl bg-muted/10">
                <Landmark className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-30" />
                <h3 className="font-semibold text-foreground text-sm">No hay movimientos</h3>
              </div>
            ) : (
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
                <div className="divide-y divide-border/30 max-h-[500px] overflow-y-auto scrollbar-none">
                  {processedTransactions.map((tx) => {
                    const isPositive = tx.amount > 0;
                    const formattedDate = new Date(tx.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });

                    return (
                      <div key={tx.id} className="flex items-center justify-between p-3 sm:p-4 hover:bg-muted/10 transition-colors gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                          {isPositive ? <ArrowDownRight className="w-5 h-5 text-green-500" /> : <ArrowUpRight className="w-5 h-5 text-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{tx.description}</p>
                          <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{formattedDate} • Saldo: {tx.balanceAfter.toLocaleString()}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={cn("font-black text-sm sm:text-base", isPositive ? "text-green-600 dark:text-[#00FF00]" : "text-foreground")}>
                            {isPositive ? '+' : ''}{tx.amount.toLocaleString()}
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

        {/* TARJETA DE REFERIDOS */}
        <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/20 shadow-sm rounded-2xl overflow-hidden mb-6">
          <CardContent className="p-5 sm:p-8">
            <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/20 flex items-center justify-center shrink-0"><Gift className="w-7 h-7 sm:w-8 sm:h-8 text-primary" /></div>
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-lg sm:text-xl font-bold text-foreground mb-1.5">¡Invitá y ganá!</h3>
                <p className="text-muted-foreground text-xs sm:text-sm max-w-xl">Ganá <strong className="text-primary">2.000 pts</strong> por cada registro, y <strong className="text-primary">500 pts extras</strong> si ellos invitan a otros.</p>
              </div>
            </div>
            <div className="mt-5 w-full">
              <div className="relative">
                <Input readOnly value={referralLink} className="pr-12 bg-background/50 border-border/50 font-medium text-xs sm:text-sm h-12" />
                <Button size="icon" variant="ghost" className="absolute right-0 top-0 h-full w-12 hover:bg-transparent" onClick={handleCopyLink}>{isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}</Button>
              </div>
            </div>
          </CardContent>
        </Card>

      </main>

      {/* MODAL DE VENTA */}
      <Dialog open={!!betToSell} onOpenChange={(open) => !open && setBetToSell(null)}>
        <DialogContent className="w-[95vw] max-w-md rounded-[24px] border-border/50 bg-background/95 backdrop-blur-xl p-6 shadow-2xl z-50">
          <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mt-4 mb-2 lg:hidden" />
          <DialogHeader className="px-6 pt-2 pb-0 lg:p-0"><DialogTitle className="flex items-center gap-2 text-xl text-foreground"><LineChart className="w-5 h-5 text-primary" /> Confirmar Venta</DialogTitle></DialogHeader>
          <div className="px-6 py-4 space-y-4 pb-safe lg:px-0">
            <div className="p-4 bg-muted/30 rounded-xl border border-border/50"><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Mercado:</p><p className="font-bold text-sm sm:text-base text-foreground line-clamp-2">{betToSell?.title}</p></div>
            <div className="flex justify-between items-center p-4 bg-muted/30 rounded-xl border border-border/50"><span className="text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-wider">Tu posición:</span><Badge variant="outline" className={cn("font-bold border text-xs h-7", betToSell?.direction === 'no' ? "bg-red-500/10 text-red-600 border-red-500/30" : "bg-green-500/10 text-green-600 border-green-500/30")}>{betToSell?.outcomeName}</Badge></div>
            <div className={`flex justify-between items-center p-4 sm:p-5 border rounded-xl ${(betToSell?.pnl ?? 0) >= 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}><span className="font-bold text-foreground uppercase tracking-wider text-[10px] sm:text-xs">Rentabilidad (PnL):</span><span className={`text-2xl sm:text-3xl font-black ${(betToSell?.pnl ?? 0) >= 0 ? 'text-green-600 dark:text-[#00FF00]' : 'text-red-600 dark:text-[#FF0000]'}`}>{(betToSell?.pnl ?? 0) >= 0 ? '+' : ''}{betToSell?.pnlPercentage.toFixed(1)}%</span></div>
            <div className="flex justify-between items-center px-2 pt-2"><span className="font-bold text-foreground uppercase tracking-wider text-xs sm:text-sm">Retiro Total:</span><span className="text-xl sm:text-2xl font-black text-primary">{betToSell?.cashoutValue.toLocaleString()} pts</span></div>
            <DialogFooter className="mt-6 flex-col gap-3 sm:flex-row">
              <Button onClick={confirmSell} disabled={sellingBetId === betToSell?.id} className="w-full sm:w-auto flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl h-12 shadow-sm">{sellingBetId === betToSell?.id ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Coins className="w-5 h-5 mr-2" />} Vender Ahora</Button>
              <Button variant="outline" onClick={() => setBetToSell(null)} className="w-full sm:w-auto font-bold rounded-xl h-12">Cancelar</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md w-[90vw] rounded-2xl">
          <DialogHeader><DialogTitle>Editar Perfil</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveProfile} className="space-y-4 pt-4">
            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-primary/10 flex items-center justify-center border-2 border-border overflow-hidden">
                {previewUrl ? <img src={previewUrl} alt="Avatar" className="w-full h-full object-cover" /> : <AvatarFallback><UserIcon className="w-10 h-10 text-primary opacity-50" /></AvatarFallback>}
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => { if (e.target.files && e.target.files[0]) { setSelectedImage(e.target.files[0]); setPreviewUrl(URL.createObjectURL(e.target.files[0])); } }} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="rounded-full text-xs">Cambiar foto</Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Nombre de usuario</Label>
              <Input id="username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required className="rounded-xl h-12" />
            </div>
            <Button type="submit" className="w-full mt-4 h-12 rounded-xl font-bold" disabled={isSaving}>{isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Guardar Cambios</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent className="sm:max-w-md w-[90vw] rounded-2xl">
          <DialogHeader><DialogTitle>Cambiar Contraseña</DialogTitle></DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nueva Contraseña</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} className="rounded-xl h-12" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className="rounded-xl h-12" />
            </div>
            <Button type="submit" className="w-full mt-4 h-12 rounded-xl font-bold" disabled={isChangingPassword}>{isChangingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Actualizar Contraseña</Button>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}