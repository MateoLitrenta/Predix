"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NavHeader } from "@/components/nav-header";
import { AuthModal } from "@/components/auth-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, ArrowLeft, User as UserIcon, History, CheckCircle2,
  Clock, XCircle, TrendingUp, CalendarDays, Wallet, Coins, LineChart as LineChartIcon, Users, Trophy, Scale, Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

import { ResponsiveContainer, AreaChart, Area, YAxis, XAxis, Tooltip } from "recharts";

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

interface ProfileClientProps {
  profileId: string;
}

export default function ProfileClient({ profileId }: ProfileClientProps) {
  const router = useRouter();
  const supabase = createClient();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const [viewedProfile, setViewedProfile] = useState<any>(null);
  const [userBets, setUserBets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [marketOptions, setMarketOptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [timeframe, setTimeframe] = useState<TimeframeType>('ALL');

  const fetchAuth = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user);
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setMyProfile(data);
    }
  }, [supabase]);

  const fetchViewedProfileData = useCallback(async () => {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .single();

    if (profileError) {
      toast({ title: "Error", description: "No se pudo cargar el perfil del usuario.", variant: "destructive" });
      router.push("/ranking");
      return;
    }
    setViewedProfile(profileData);

    const { data: betsData } = await supabase
      .from("bets")
      .select("*, markets(*)")
      .eq("user_id", profileId)
      .order("created_at", { ascending: false });

    const { data: txData } = await supabase.rpc('get_public_transactions', { p_user_id: profileId });

    const { data: optionsData } = await supabase.from("market_options").select("*");

    setUserBets(betsData || []);
    setTransactions(txData || []);
    setMarketOptions(optionsData || []);
    setIsLoading(false);
  }, [profileId, router, supabase]);

  useEffect(() => {
    fetchAuth();
    fetchViewedProfileData();
  }, [fetchAuth, fetchViewedProfileData]);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDarkMode]);

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
    const availableCapital = viewedProfile?.points ?? 0;
    let totalCurrentValueActive = 0;

    userBets
      .filter((b) => b.markets && ACTIVE_STATUSES.includes(String(b.markets.status).toLowerCase()))
      .forEach((bet) => {
        const market = bet.markets;
        const opt = marketOptions.find(o => o.id === bet.outcome);
        if (market && opt) {
          totalCurrentValueActive += calculateRealCashout(bet, market, opt);
        }
      });

    const totalPortfolioValue = availableCapital + totalCurrentValueActive;
    return { availableCapital, totalPortfolioValue, lockedValueOffset: totalCurrentValueActive };
  }, [userBets, viewedProfile?.points, calculateRealCashout, marketOptions]);

  const totalVolumeCalculated = useMemo(() => {
    // Calculamos el volumen total iterando sobre las transacciones de tipo 'bet'
    let total = 0;
    transactions.forEach(tx => {
      if (tx.amount < 0 && tx.description && !tx.description.toLowerCase().includes('bonus')) {
        total += Math.abs(tx.amount);
      }
    });
    return total;
  }, [transactions]);


  // LÓGICA DE GRÁFICO FINAL Y ESTABLE: CÁLCULO HACIA ATRÁS
  const chartData = useMemo(() => {
    const chronologicalTxs = [...transactions].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // 1. ANCLAJE A LA REALIDAD: Calculamos el balance histórico hacia atrás 
    // partiendo de los puntos reales y actuales de la base de datos.
    let currentTempBalance = viewedProfile?.points ?? 0;
    const txsWithBalance = [...chronologicalTxs].reverse().map((tx) => {
      const balanceAfter = currentTempBalance;
      const balanceBefore = currentTempBalance - Number(tx.amount || 0);
      currentTempBalance = balanceBefore;
      return { ...tx, balanceAfter, balanceBefore };
    }).reverse();

    const trueStartingBalance = currentTempBalance;

    const now = Date.now();
    let startTimeForAll = viewedProfile?.created_at ? new Date(viewedProfile.created_at).getTime() : (chronologicalTxs.length > 0 ? new Date(chronologicalTxs[0].created_at).getTime() : now - 30 * 86400 * 1000);

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
      userBets.forEach(bet => {
        const betTime = new Date(bet.created_at || '').getTime();
        if (betTime <= ts) {
          const market = bet.markets;
          if (market && ACTIVE_STATUSES.includes(String(market.status).toLowerCase())) {
            activeInvestmentAtTs += Number(bet.amount || 0);
          }
        }
      });

      return { timestamp: ts, value: Math.max(0, liquidAtTs + activeInvestmentAtTs) };
    });

    if (data.length > 0) {
      const currentLiquid = viewedProfile?.points ?? 0;
      let currentActiveInvestment = 0;
      userBets.forEach(bet => {
        const market = bet.markets;
        if (market && ACTIVE_STATUSES.includes(String(market.status).toLowerCase())) {
          currentActiveInvestment += Number(bet.amount || 0);
        }
      });
      data.push({ timestamp: now, value: Math.max(0, currentLiquid + currentActiveInvestment) });
    }

    return data;
  }, [transactions, timeframe, viewedProfile, userBets]);

  const countActivePositions = useMemo(() => {
    return userBets.filter(b => b.markets && ACTIVE_STATUSES.includes(String(b.markets.status).toLowerCase()) && Number(b.shares) > 0).length;
  }, [userBets]);

  const dynamicPnl = useMemo(() => {
    if (chartData.length < 2) return { value: 0, percentage: 0 };

    let startValue = chartData[0].value;
    const endValue = portfolioStats.totalPortfolioValue;

    if (timeframe === 'ALL' || startValue === 0) {
      startValue = 10000;
    }

    const val = endValue - startValue;
    const pct = (val / Math.abs(startValue)) * 100;

    return { value: val, percentage: pct };
  }, [chartData, timeframe, portfolioStats.totalPortfolioValue]);

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

  // --- SKELETON LOADER PARA EL PERFIL PÚBLICO ---
  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/10 flex flex-col">
        <NavHeader points={myProfile?.points ?? 10000} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} onPointsUpdate={() => { }} userId={null} userEmail={null} onOpenAuthModal={() => { }} onSignOut={async () => { }} isAdmin={false} username={null} />
        <main className="container mx-auto px-4 py-8 flex-1 max-w-5xl">
          <div className="h-8 w-32 bg-muted/60 rounded animate-pulse mb-8" />

          {/* Perfil Info Skeleton */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-10">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-muted/60 animate-pulse shrink-0 border-4 border-background" />
            <div className="flex-1 w-full space-y-4 mt-2">
              <div className="h-10 w-48 bg-muted/60 rounded animate-pulse mx-auto sm:mx-0" />
              <div className="h-4 w-64 bg-muted/60 rounded animate-pulse mx-auto sm:mx-0" />
            </div>
          </div>

          {/* Grilla de Métricas Skeleton */}
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

          {/* Gráfico y Estadísticas Generales Skeleton */}
          <div className="h-[500px] w-full bg-muted/30 rounded-2xl border border-border/50 animate-pulse mb-12" />

          {/* Historial Skeleton */}
          <div className="h-8 w-40 bg-muted/60 rounded animate-pulse mb-6" />
          <div className="h-[400px] w-full bg-muted/30 rounded-2xl border border-border/50 animate-pulse p-6" />
        </main>
      </div>
    );
  }

  if (!viewedProfile) return null;

  const isMe = currentUser?.id === profileId;
  const displayName = viewedProfile.username || "Trader";

  // RENDER NORMAL
  return (
    <div className="min-h-screen bg-muted/10 flex flex-col">
      <NavHeader points={myProfile?.points ?? 10000} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} onPointsUpdate={() => fetchAuth()} userId={currentUser?.id ?? null} userEmail={currentUser?.email ?? null} onOpenAuthModal={() => setIsAuthModalOpen(true)} onSignOut={async () => { await supabase.auth.signOut(); router.push("/"); }} isAdmin={myProfile?.role === "admin"} username={myProfile?.username} />

      <main className="container mx-auto px-4 py-8 flex-1 max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
            <Link href="/ranking"><ArrowLeft className="w-4 h-4 mr-2" /> Volver al Ranking</Link>
          </Button>
          <Badge className="bg-primary/10 text-primary border-primary/20 font-medium">Perfil Público de Trader</Badge>
        </div>

        {/* PERFIL HEADER */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-12">
          <Avatar className="w-24 h-24 sm:w-28 sm:h-28 border-4 border-background bg-primary/10 shadow-lg shrink-0">
            {viewedProfile.avatar_url ? <AvatarImage src={viewedProfile.avatar_url} className="object-cover" /> : <AvatarFallback><UserIcon className="w-12 h-12 text-primary opacity-50" /></AvatarFallback>}
          </Avatar>
          <div className="text-center sm:text-left flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-black text-foreground truncate tracking-tighter mb-1 flex items-center justify-center sm:justify-start gap-3">
                  {displayName}
                  {isMe && <Badge className="bg-primary text-primary-foreground text-xs uppercase tracking-wider">VOS</Badge>}
                </h1>
                <p className="text-sm text-muted-foreground font-medium flex items-center justify-center sm:justify-start gap-1.5 opacity-80">
                  <CalendarDays className="w-3.5 h-3.5" /> Se unió en {new Date(viewedProfile.created_at || new Date()).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* MÉTRICAS SUPERIORES */}
        <div className="bg-card/40 backdrop-blur-xl border border-border/40 rounded-3xl p-8 md:p-12 mb-12 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* Panel 1 */}
            <div className="flex flex-col">
              <TrendingUp className="w-6 h-6 text-muted-foreground mb-4 opacity-70" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">PnL Total</p>
              <p className={cn("text-3xl font-black", isProfit ? "text-green-600 dark:text-[#00FF00]" : "text-red-600 dark:text-[#FF0000]")}>
                {isProfit ? '+' : ''}{dynamicPnl.value.toLocaleString()} pts
              </p>
              <p className="text-xs font-semibold text-muted-foreground mt-1">
                {isProfit ? '+' : ''}{dynamicPnl.percentage.toFixed(2)}%
              </p>
            </div>

            {/* Panel 2 */}
            <div className="flex flex-col">
              <Scale className="w-6 h-6 text-muted-foreground mb-4 opacity-70" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Volumen Total Operado</p>
              <p className="text-3xl font-black text-foreground">{totalVolumeCalculated.toLocaleString()}</p>
              <p className="text-xs font-semibold text-muted-foreground mt-1">pts acumulados</p>
            </div>

            {/* Panel 3 */}
            <div className="flex flex-col">
              <Target className="w-6 h-6 text-muted-foreground mb-4 opacity-70" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Posiciones Activas</p>
              <p className="text-3xl font-black text-foreground">{countActivePositions}</p>
              <p className="text-xs font-semibold text-muted-foreground mt-1">Apuestas en curso</p>
            </div>
          </div>
        </div>

        {/* GRÁFICO PRINCIPAL */}
        <Card className="bg-card border border-border/50 shadow-sm rounded-2xl overflow-hidden mb-12">
          <CardContent className="p-0">
            <div className="p-6 border-b border-border/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <div className="flex items-center gap-2 font-bold text-muted-foreground mb-1">
                  <TrendingUp className="w-4 h-4" /> Historial de Rendimiento
                </div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className={cn("text-3xl font-black tracking-tight", isProfit ? "text-green-600 dark:text-[#00FF00]" : "text-red-600 dark:text-[#FF0000]")}>
                    {isProfit ? '+' : ''}{dynamicPnl.value.toLocaleString()} <span className="text-lg opacity-80">pts</span>
                  </span>
                  <Badge variant="outline" className={cn("text-sm px-2 py-0.5 font-bold border-2", isProfit ? "bg-green-500/10 text-green-600 dark:text-[#00FF00] border-green-500/30" : "bg-red-500/10 text-red-600 dark:text-[#FF0000] border-red-500/30")}>
                    {isProfit ? '+' : ''}{dynamicPnl.percentage.toFixed(2)}%
                  </Badge>
                </div>
              </div>

              <div className="flex bg-muted/50 p-1 rounded-xl border border-border/30 w-full sm:w-auto overflow-x-auto">
                {(['1D', '1W', '1M', '6M', '1Y', 'ALL'] as TimeframeType[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none",
                      timeframe === tf ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-[350px] md:h-[450px] p-4 sm:p-6 pt-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
                    contentStyle={{ backgroundColor: tooltipBgColor, borderRadius: '12px', border: `1px solid ${axisLineColor}`, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', color: tooltipTextColor, fontWeight: 'bold', padding: '12px' }}
                    itemStyle={{ color: themeChartColor, fontSize: '14px' }}
                    labelStyle={{ color: axisTextColor, marginBottom: '4px', fontSize: '11px' }}
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

        {/* TABLA DE PREDICCIONES (ESTILO LEDGER PÚBLICO) */}
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <History className="w-6 h-6 text-primary" /> Predicciones Recientes
        </h2>

        <Card className="bg-card border-border/50 shadow-sm rounded-2xl overflow-hidden mb-8">
          <CardContent className="p-0">
            {userBets.length === 0 ? (
              <div className="p-16 text-center text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">{isMe ? "No has realizado predicciones." : "Este usuario aún no ha operado."}</p>
              </div>
            ) : (
              <div className="w-full">
                {/* Encabezado de Tabla (Solo Desktop) */}
                <div className="hidden md:grid grid-cols-12 gap-4 bg-muted/40 p-4 border-b border-border/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <div className="col-span-2">Fecha</div>
                  <div className="col-span-5">Mercado</div>
                  <div className="col-span-2">Predicción</div>
                  <div className="col-span-1 text-right">Monto</div>
                  <div className="col-span-2 text-right pr-2">Estado</div>
                </div>

                {/* Filas */}
                <div className="divide-y divide-border/30 max-h-[600px] overflow-y-auto">
                  {userBets.map((bet) => {
                    const market = bet.markets;
                    if (!market) return null;

                    const formattedDate = new Date(bet.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
                    const isResolved = market.status === 'resolved';
                    const isOldBinary = bet.outcome === 'yes' || bet.outcome === 'no';
                    const opt = marketOptions.find(o => o.id === bet.outcome);
                    const displayOutcome = opt ? opt.option_name : (isOldBinary ? (bet.outcome === 'yes' ? "SÍ" : "NO") : "Opción");
                    const direction = bet.direction || 'yes';
                    const shares = Number(bet.shares || 0);

                    const isOptBinary = ['sí', 'si', 'yes', 'no'].includes(displayOutcome.toLowerCase());
                    let predictionText = isOptBinary ? (direction === 'no' ? (displayOutcome.toLowerCase().includes('s') ? 'No' : 'Sí') : displayOutcome) : `${direction === 'no' ? 'No' : 'Sí'} a ${displayOutcome}`;
                    const isEffectivelyNo = direction === 'no' || (isOptBinary && displayOutcome.toLowerCase() === 'no' && direction === 'yes');

                    let won = false;
                    if (isResolved) {
                      won = isOldBinary ? market.winning_outcome === bet.outcome : ((direction === 'yes' && market.winning_outcome === bet.outcome) || (direction === 'no' && market.winning_outcome !== bet.outcome && market.winning_outcome !== null));
                    }

                    let cashoutValue = 0;
                    let pnlPct = 0;
                    let isPositive = false;

                    if (!isResolved && shares > 0) {
                      if (opt) cashoutValue = calculateRealCashout(bet, market, opt);
                      else cashoutValue = Math.round(bet.amount * 0.95);

                      const pnl = cashoutValue - bet.amount;
                      pnlPct = (pnl / bet.amount) * 100;
                      isPositive = pnl >= 0;
                    }

                    return (
                      <Link href={`/market/${bet.market_id}`} key={bet.id} className="block hover:bg-muted/10 transition-colors">
                        <div className="flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-4 p-4 items-start md:items-center">

                          {/* Fecha */}
                          <div className="col-span-2 text-xs font-bold text-muted-foreground w-full md:w-auto">
                            <span className="bg-muted md:bg-transparent rounded px-1.5 md:px-0 py-0.5 md:py-0">{formattedDate}</span>
                          </div>

                          {/* Mercado */}
                          <div className="col-span-5 w-full">
                            <p className="text-sm font-bold text-foreground line-clamp-2 md:line-clamp-1 group-hover:text-primary transition-colors pr-2">
                              {market.title || "Mercado no disponible"}
                            </p>
                          </div>

                          {/* Predicción */}
                          <div className="col-span-2 w-full md:w-auto flex items-center mt-1 md:mt-0">
                            <Badge variant="outline" className={cn("text-[10px] font-bold border h-6", isEffectivelyNo ? "bg-red-500/10 text-red-600 border-red-500/30" : "bg-green-500/10 text-green-600 border-green-500/30")}>
                              {predictionText}
                            </Badge>
                          </div>

                          {/* Monto */}
                          <div className="col-span-1 w-full md:w-auto flex items-center md:justify-end mt-1 md:mt-0">
                            <span className="md:hidden text-[10px] font-bold text-muted-foreground uppercase mr-2">Inversión:</span>
                            <span className="font-bold text-sm text-foreground">{bet.amount.toLocaleString()} <span className="text-[9px] opacity-70">pts</span></span>
                          </div>

                          {/* Estado/Resultado */}
                          <div className="col-span-2 w-full md:w-auto flex items-center md:justify-end mt-1 md:mt-0 md:pr-2">
                            <span className="md:hidden text-[10px] font-bold text-muted-foreground uppercase mr-2">Resultado:</span>
                            {shares === 0 && !isResolved ? (
                              <Badge variant="secondary" className="bg-muted/50 text-muted-foreground border-border/50">VENDIDA</Badge>
                            ) : !isResolved ? (
                              <span className={cn("font-black text-sm", isPositive ? "text-green-600 dark:text-[#00FF00]" : "text-red-600 dark:text-[#FF0000]")}>
                                {isPositive ? "+" : ""}{pnlPct.toFixed(1)}%
                              </span>
                            ) : won ? (
                              <span className="font-black text-sm text-green-600 dark:text-[#00FF00] flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Ganó</span>
                            ) : (
                              <span className="font-black text-sm text-red-600 dark:text-[#FF0000] flex items-center gap-1 opacity-90"><XCircle className="w-4 h-4" /> Perdió</span>
                            )}
                          </div>

                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </main>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={() => { setIsAuthModalOpen(false); fetchAuth(); }} isDarkMode={isDarkMode} />
    </div>
  );
}