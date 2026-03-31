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
  Clock, XCircle, TrendingUp, CalendarDays
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

import { ResponsiveContainer, AreaChart, Area, YAxis, XAxis, Tooltip } from "recharts";

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

    // RESTAURAMOS TU RPC PARA EVITAR PROBLEMAS DE PERMISOS
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

  const processedTransactions = useMemo(() => {
    if (!transactions.length) return [];
    let currentTempBalance = viewedProfile?.points ?? 0;
    return transactions.map((tx) => {
      const balanceAfter = currentTempBalance;
      const balanceBefore = currentTempBalance - tx.amount;
      currentTempBalance = balanceBefore; 
      return { ...tx, balanceAfter, balanceBefore };
    });
  }, [transactions, viewedProfile?.points]);

  const chartData = useMemo(() => {
    const chronological = [...processedTransactions].reverse(); 
    const offset = portfolioStats.lockedValueOffset; 
    const now = Date.now();
    
    // REGLA DE FECHA A PRUEBA DE BALAS: Compara perfil creado vs primer movimiento
    let accountCreatedAt = viewedProfile?.created_at ? new Date(viewedProfile.created_at).getTime() : now;
    if (chronological.length > 0) {
        const firstTxTime = new Date(chronological[0].created_at).getTime();
        if (firstTxTime < accountCreatedAt) {
            accountCreatedAt = firstTxTime; // Si el movimiento es más viejo, usamos esa fecha
        }
    }
    
    let startTimeForAll = accountCreatedAt;
    
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

    if (accountCreatedAt >= startTime && accountCreatedAt <= now) {
        timestamps.push(accountCreatedAt);
    }

    timestamps = Array.from(new Set(timestamps)).sort((a, b) => a - b);

    const data = timestamps.map(ts => {
        if (ts < accountCreatedAt - 3600000) {
            return { timestamp: ts, value: 0 };
        }

        const pastTxs = chronological.filter(tx => new Date(tx.created_at).getTime() <= ts);
        let baseBalance = 0;
        
        if (pastTxs.length > 0) {
            baseBalance = pastTxs[pastTxs.length - 1].balanceAfter;
        } else if (chronological.length > 0) {
            baseBalance = chronological[0].balanceBefore;
        } else {
            baseBalance = viewedProfile?.points || 0;
        }
        
        let val = baseBalance + offset;
        val = Math.max(0, val); 
        
        return { timestamp: ts, value: val };
    });

    if (data.length === 0 || data[data.length - 1].timestamp !== now) {
        data.push({ timestamp: now, value: portfolioStats.totalPortfolioValue });
    }

    return data;
  }, [processedTransactions, timeframe, portfolioStats, viewedProfile]);

  const dynamicPnl = useMemo(() => {
    if (chartData.length < 2) return { value: 0, percentage: 0 };
    
    let startValue = chartData[0].value; 
    const endValue = chartData[chartData.length - 1].value;
    
    if (timeframe === 'ALL' || startValue === 0) {
       startValue = 10000;
    }

    const val = endValue - startValue;
    const pct = (val / Math.abs(startValue)) * 100;
    
    return { value: val, percentage: pct };
  }, [chartData, timeframe]);

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

  const axisTextColor = isDarkMode ? '#a1a1aa' : '#64748b'; 
  const axisLineColor = isDarkMode ? '#334155' : '#e2e8f0'; 
  const tooltipBgColor = isDarkMode ? '#0f172a' : '#ffffff'; 
  const tooltipTextColor = isDarkMode ? '#f8fafc' : '#0f172a';

  if (isLoading) return <div className="min-h-screen bg-background flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!viewedProfile) return null;

  const isMe = currentUser?.id === profileId;
  const displayName = viewedProfile.username || "Trader";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader points={myProfile?.points ?? 10000} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} onPointsUpdate={() => fetchAuth()} userId={currentUser?.id ?? null} userEmail={currentUser?.email ?? null} onOpenAuthModal={() => setIsAuthModalOpen(true)} onSignOut={async () => { await supabase.auth.signOut(); router.push("/"); }} isAdmin={myProfile?.role === "admin"} username={myProfile?.username} />

      <main className="container mx-auto px-4 py-8 flex-1 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
            <Link href="/ranking"><ArrowLeft className="w-4 h-4 mr-2" /> Volver al Ranking</Link>
          </Button>
          <Badge className="bg-primary/10 text-primary border-primary/20 font-medium">Perfil Público de PREDIX</Badge>
        </div>

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
                            <CalendarDays className="w-3.5 h-3.5" /> Unido en {new Date(viewedProfile.created_at || new Date()).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <Card className="bg-card border border-border/50 shadow-sm rounded-2xl overflow-hidden mb-12">
          <CardContent className="p-0">
            <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-border/20">
              <div>
                <div className="flex items-center gap-2 font-bold text-muted-foreground mb-2">
                  <TrendingUp className="w-4 h-4" /> Crecimiento de Cuenta
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
                  Rendimiento en {timeframeLabels[timeframe]} • Total: {portfolioStats.totalPortfolioValue.toLocaleString()} pts
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
                      <stop offset="5%" stopColor={themeChartColor} stopOpacity={0.2}/>
                      <stop offset="95%" stopColor={themeChartColor} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  
                  <XAxis 
                    dataKey="timestamp" 
                    type="number" 
                    domain={['dataMin', 'dataMax']} 
                    tickFormatter={xAxisFormatter}
                    tick={{ fill: axisTextColor, fontSize: 12, fontWeight: 500 }}
                    tickLine={false}
                    axisLine={{ stroke: axisLineColor, strokeWidth: 1.5 }}
                    minTickGap={60}
                    dy={15}
                  />
                  
                  <YAxis 
                    domain={['auto', 'auto']} 
                    tickFormatter={yAxisFormatter}
                    tick={{ fill: axisTextColor, fontSize: 12, fontWeight: 500 }}
                    tickLine={false}
                    axisLine={{ stroke: axisLineColor, strokeWidth: 1.5 }}
                    width={55}
                    orientation="left"
                    dx={-10}
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

        {/* ACTIVIDAD RECIENTE DEL USUARIO PÚBLICO */}
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <History className="w-6 h-6 text-primary" /> Actividad Reciente
        </h2>
        <Card className="bg-card border-border/50 shadow-sm overflow-hidden rounded-2xl mb-8">
          <CardContent className="p-0">
            {userBets.length === 0 ? (
              <div className="p-16 text-center text-muted-foreground">
                <History className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">{isMe ? "No has realizado predicciones." : "Este usuario aún no ha operado."}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {userBets.map((bet) => {
                  const market = bet.markets;
                  if (!market) return null;

                  const isResolved = market.status === 'resolved';
                  const isOldBinary = bet.outcome === 'yes' || bet.outcome === 'no';
                  const opt = marketOptions.find(o => o.id === bet.outcome);
                  const displayOutcome = opt ? opt.option_name : (isOldBinary ? (bet.outcome === 'yes' ? "SÍ" : "NO") : "Opción");
                  const direction = bet.direction || 'yes';

                  const isOptBinary = ['sí', 'si', 'yes', 'no'].includes(displayOutcome.toLowerCase());
                  let predictionText = "";
                  if (isOptBinary) {
                    predictionText = direction === 'no' ? (displayOutcome.toLowerCase().includes('s') ? 'No' : 'Sí') : displayOutcome;
                  } else {
                    predictionText = `${direction === 'no' ? 'No' : 'Sí'} a ${displayOutcome}`;
                  }
                  const isEffectivelyNo = direction === 'no' || (isOptBinary && displayOutcome.toLowerCase() === 'no' && direction === 'yes');

                  let won = false;
                  if (isResolved) {
                    if (isOldBinary) {
                      won = market.winning_outcome === bet.outcome;
                    } else {
                      const wonYes = direction === 'yes' && market.winning_outcome === bet.outcome;
                      const wonNo = direction === 'no' && market.winning_outcome !== bet.outcome && market.winning_outcome !== null;
                      won = wonYes || wonNo;
                    }
                  }

                  let cashoutValue = 0;
                  let pnlPct = 0;
                  let isPositive = false;

                  if (!isResolved) {
                    const shares = Number(bet.shares || 0);

                    if (shares > 0 && opt) {
                      cashoutValue = calculateRealCashout(bet, market, opt);
                    } else {
                      let currVal = bet.amount;
                      if (opt && bet.outcome.length > 10) {
                        const totalVotes = Number(opt.total_votes);
                        if (totalVotes > 0) currVal = (bet.amount / totalVotes) * Number(market.total_volume);
                      }
                      cashoutValue = Math.round(currVal * 0.95);
                    }

                    const pnl = cashoutValue - bet.amount;
                    pnlPct = (pnl / bet.amount) * 100;
                    isPositive = pnl >= 0;
                  }

                  return (
                    <Link href={`/market/${bet.market_id}`} key={bet.id} className="block p-5 sm:p-6 hover:bg-muted/30 transition-colors group">
                      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider bg-background">{market.category || "Mercado"}</Badge>
                            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {new Date(bet.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          <h3 className="font-bold text-lg sm:text-xl text-foreground group-hover:text-primary transition-colors line-clamp-2 pr-4 leading-tight">
                            {market.title || "Mercado no disponible"}
                          </h3>
                        </div>
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 sm:gap-6 bg-muted/10 sm:bg-transparent p-4 sm:p-0 rounded-xl border sm:border-none border-border/50">
                          <div className="flex flex-col min-w-[90px]">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Inversión</p>
                            <p className="font-black text-foreground text-lg sm:text-xl flex items-center gap-1">
                              {bet.amount.toLocaleString()} <span className="text-xs font-bold text-muted-foreground mt-1">pts</span>
                            </p>
                          </div>
                          <div className="flex flex-col min-w-[120px]">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Posición</p>
                            <Badge variant="outline" className={cn("text-xs sm:text-sm font-bold border h-7 sm:h-8 justify-center", isEffectivelyNo ? "bg-red-500/10 text-red-600 dark:text-[#FF0000] border-red-500/30" : "bg-green-500/10 text-green-600 dark:text-[#00FF00] border-green-500/30")}>
                              {predictionText}
                            </Badge>
                          </div>
                          <div className="flex flex-col min-w-[90px] text-right sm:text-left">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1 hidden sm:block">Resultado</p>
                            {!isResolved ? (
                                <span className={cn("font-black text-lg sm:text-xl", isPositive ? "text-[#00FF00]" : "text-[#FF0000]")}>
                                    {isPositive ? "+" : ""}{pnlPct.toFixed(1)}%
                                </span>
                            ) : won ? (
                                <span className="font-black text-lg sm:text-xl text-[#00FF00] flex items-center justify-end sm:justify-start gap-1"><CheckCircle2 className="w-5 h-5" /> Ganó</span>
                            ) : (
                                <span className="font-black text-lg sm:text-xl text-[#FF0000] flex items-center justify-end sm:justify-start gap-1 opacity-90"><XCircle className="w-5 h-5" /> Perdió</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </main>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={() => { setIsAuthModalOpen(false); fetchAuth(); }} isDarkMode={isDarkMode} />
    </div>
  );
}