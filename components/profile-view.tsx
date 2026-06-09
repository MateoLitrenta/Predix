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
import { Coins, User as UserIcon, ArrowLeft, Loader2, TrendingUp, History, Pencil, Landmark, Lock, LineChart, CheckCircle2, XCircle, MinusCircle, Gift, Copy, Check, Users, Wallet, CalendarDays, ChevronRight, ArrowDownRight, ArrowUpRight, Search, ChevronDown } from "lucide-react";
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

export type PortfolioPosition = {
  market_id: string;
  outcome: string;
  status: 'active' | 'closed';
  shares: number;
  avg_price: number;
  realized_pnl: number;
  market_title?: string;
  market_image_url?: string | null;
  option_display_name?: string;
  outcome_name?: string;
  direction?: string;
  current_price?: number;
  created_at?: string;
  last_activity?: string;
  updated_at?: string;
  timestamp?: string;
  date?: string;
  [key: string]: any;
};



export function ProfileView({ userId }: { userId?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loggedInProfile, setLoggedInProfile] = useState<any>(null);
  const isOwner = !userId || currentUser?.id === userId;
  const [bets, setBets] = useState<BetWithMarket[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [marketOptions, setMarketOptions] = useState<any[]>([]);
  const [portfolioPositions, setPortfolioPositions] = useState<PortfolioPosition[]>([]);

  const [activeTab, setActiveTab] = useState("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "highest_value" | "lowest_value">("recent");

  const filteredAndSortedPositions = useMemo(() => {
    let result = [...portfolioPositions];
    
    if (searchTerm.trim() !== '') {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(p => 
        (p.market_title?.toLowerCase().includes(lowerTerm)) ||
        (p.option_display_name?.toLowerCase().includes(lowerTerm)) ||
        (p.outcome_name?.toLowerCase().includes(lowerTerm))
      );
    }

    const getValue = (pos: PortfolioPosition) => {
      if (pos.status === 'active') {
        const cp = Number(pos.current_price) || 0;
        return pos.shares * cp;
      } else {
        return (pos.shares * pos.avg_price) + pos.realized_pnl;
      }
    };
    
    const sortedPositions = [...result];
    
    const getPosDate = (pos: any) => {
      let finalDate = 0;
      
      const relatedBets = bets.filter(b => b.market_id === pos.market_id && b.outcome === pos.outcome);
      
      if (pos.status === 'closed') {
        const market = relatedBets.length > 0 ? getMarket(relatedBets[0]) : null;
        let marketClosedTime = 0;
        let optionEliminatedTime = 0;
        
        if (market && (String(market.status).toLowerCase() === 'resolved' || String(market.status).toLowerCase() === 'rejected')) {
           marketClosedTime = new Date((market as any).updated_at || market.end_date || 0).getTime();
        }
        
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pos.outcome);
        if (isUUID && marketOptions && marketOptions.length > 0) {
           const option = marketOptions.find(o => o.id === pos.outcome);
           if (option && option.is_eliminated && option.eliminated_at) {
              optionEliminatedTime = new Date(option.eliminated_at).getTime();
           }
        }
        
        const cashoutTime = pos.shares === 0 && pos.last_activity ? new Date(pos.last_activity).getTime() : 0;
        
        if (cashoutTime > 0) {
           finalDate = cashoutTime;
        } else if (optionEliminatedTime > 0) {
           finalDate = optionEliminatedTime;
        } else if (marketClosedTime > 0) {
           finalDate = marketClosedTime;
        }
      }
      
      if (finalDate === 0) {
        if (relatedBets.length > 0) {
          finalDate = Math.max(...relatedBets.map(b => new Date(b.created_at || 0).getTime()));
        } else {
          const dateStr = pos.last_activity || pos.updated_at || pos.created_at || pos.timestamp || pos.date;
          finalDate = dateStr ? new Date(dateStr).getTime() : 0;
        }
      }
      
      return finalDate;
    };
    
    switch (sortBy) {
      case 'oldest':
        sortedPositions.sort((a, b) => getPosDate(a) - getPosDate(b));
        break;
      case 'highest_value':
        sortedPositions.sort((a, b) => getValue(b) - getValue(a));
        break;
      case 'lowest_value':
        sortedPositions.sort((a, b) => getValue(a) - getValue(b));
        break;
      case 'recent':
      default:
        sortedPositions.sort((a, b) => getPosDate(b) - getPosDate(a));
        break;
    }
    
    return sortedPositions;
  }, [portfolioPositions, searchTerm, sortBy, bets, marketOptions]);

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
    if (!profile?.id) return;

    setIsLoadingBets(true);
    setIsLoadingTransactions(true);

    let refUsers: any[] = [];
    const { data, error } = await supabase.from("profiles").select("username").eq("referred_by", profile.id);
    if (!error && data) refUsers = data;

    console.log("DEBUG: ID de usuario enviado a RPC:", profile?.id);

    let txsResData: any[] = [];
    let portfolioResData: any = null;
    let portfolioResError: any = null;
    let optionsData: any = null;

    // Lógica condicional: Dueño vs Visitante
    if (isOwner) {
      const [betsRes, txRes, optionsRes, portfolioRes] = await Promise.all([
        getMyBets(),
        getMyTransactions(),
        supabase.from("market_options").select("*"),
        supabase.rpc('get_user_portfolio', { p_user_id: profile.id })
      ]);

      if (!betsRes.error && betsRes.data) setBets(betsRes.data);
      if (!txRes.error && txRes.data) txsResData = txRes.data;
      if (optionsRes.data) {
        setMarketOptions(optionsRes.data);
        optionsData = optionsRes.data;
      }
      
      portfolioResData = portfolioRes.data;
      portfolioResError = portfolioRes.error;
    } else {
      // Visitante: Buscar datos públicos
      const [betsRes, txRes, optionsRes, portfolioRes] = await Promise.all([
        supabase.from("bets").select("*, markets(*)").eq("user_id", profile.id).order("created_at", { ascending: false }),
        supabase.rpc('get_public_transactions', { p_user_id: profile.id }),
        supabase.from("market_options").select("*"),
        supabase.rpc('get_user_portfolio', { p_user_id: profile.id })
      ]);

      if (!betsRes.error && betsRes.data) setBets(betsRes.data as any[]);
      if (!txRes.error && txRes.data) txsResData = txRes.data;
      if (optionsRes.data) {
        setMarketOptions(optionsRes.data);
        optionsData = optionsRes.data;
      }
      
      portfolioResData = portfolioRes.data;
      portfolioResError = portfolioRes.error;
    }

    setTransactions(txsResData);
    
    if (portfolioResError) {
      console.error("ERROR CRÍTICO RPC:", portfolioResError);
    }
    
    let positions: PortfolioPosition[] = [];
    if (!portfolioResError && portfolioResData) {
      positions = portfolioResData;
      const marketIds = Array.from(new Set(positions.map((p: any) => p.market_id)));
      if (marketIds.length > 0) {
        const { data: marketsData, error: marketsError } = await supabase.from('markets').select('id, title, image_url').in('id', marketIds);
        
        const marketMap = marketsData ? new Map(marketsData.map(m => [m.id, m])) : new Map();

        positions = positions.map((p: any) => {
          let option_display_name = p.outcome;
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.outcome);
          
          if (isUUID && optionsData) {
            const option = optionsData.find((o: any) => o.id === p.outcome);
            if (option && option.option_name) {
              option_display_name = option.option_name;
            }
          } else if (!isUUID && typeof p.outcome === 'string' && p.outcome.length > 0) {
            option_display_name = p.outcome.charAt(0).toUpperCase() + p.outcome.slice(1);
          }

          return {
            ...p,
            market_title: marketMap.get(p.market_id)?.title ?? "Mercado",
            market_image_url: marketMap.get(p.market_id)?.image_url ?? null,
            option_display_name
          };
        });
      }
    }
    
    console.log("DEBUG: Cantidad de posiciones activas encontradas:", positions.filter(p => p.status === 'active').length);

    setPortfolioPositions(positions);
    setReferredUsers(refUsers);

    setIsLoadingBets(false);
    setIsLoadingTransactions(false);
  }, [profile?.id, supabase]);

  const fetchAuth = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
    
    let authUserProf = null;
    if (user) {
      authUserProf = await getProfile();
      if (authUserProf) setLoggedInProfile(authUserProf);
    }
    
    if (user && !userId) {
      if (authUserProf) setProfile(authUserProf);
    } else if (userId) {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (data) setProfile(data);
    }
  }, [userId, supabase]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      let authUserProf = null;
      if (user) {
        authUserProf = await getProfile();
        if (authUserProf) setLoggedInProfile(authUserProf);
      }

      let p = null;
      if (!userId) {
        p = authUserProf;
        if (!p) { router.replace("/"); return; }
      } else {
        const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
        if (!data) { router.replace("/"); return; }
        p = data;
      }

      setProfile(p);
      setNewUsername(p.username || "");
      setPreviewUrl((p as any).avatar_url || null);
      if (typeof window !== "undefined" && p.username) { setReferralLink(`${window.location.origin}/?ref=${p.username}`); }
      setIsChecking(false);
    };
    load();
  }, [router, userId, supabase]);

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
    
    const totalCurrentValueActive = portfolioPositions
      .filter(p => p.status === 'active')
      .reduce((acc, pos) => {
        const currentPrice = Number(pos.current_price) || 0;
        return acc + (pos.shares * currentPrice);
      }, 0);

    const totalPortfolioValue = availableCapital + totalCurrentValueActive;
    return { availableCapital, totalPortfolioValue, lockedValueOffset: totalCurrentValueActive };
  }, [portfolioPositions, profile?.points]);

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

  const predictionsPlayed = portfolioPositions.length;
  const bestPredictionValue = useMemo(() => {
    if (!portfolioPositions || portfolioPositions.length === 0) return 0;
    return portfolioPositions.reduce((max, p) => Math.max(max, Number(p.realized_pnl) || 0), 0);
  }, [portfolioPositions]);

  const confirmSell = async () => {
    if (!betToSell) return;
    setSellingBetId(betToSell.id);
    const { ok, error, cashoutValue } = await sellBet(betToSell.id);
    if (!ok) { toast({ title: "Error al vender", description: error || "Hubo un problema", variant: "destructive" }); }
    else { toast({ title: "¡Venta exitosa!", description: `Ganancias: ${cashoutValue?.toLocaleString()} pts.` }); await fetchAuth(); await fetchUserData(); }
    setSellingBetId(null); setBetToSell(null);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!newUsername.trim()) return; 

    if (newPassword || confirmPassword) {
      if (newPassword !== confirmPassword) {
        toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
        return;
      }
      if (newPassword.length < 6) {
        toast({ title: "Error", description: "La contraseña debe tener al menos 6 caracteres", variant: "destructive" });
        return;
      }
    }

    setIsSaving(true);
    let finalAvatarUrl = profile.avatar_url;
    if (selectedImage) {
      const fileExt = selectedImage.name.split('.').pop(); const filePath = `${profile.id}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, selectedImage, { upsert: true });
      if (uploadError) { toast({ title: "Error", variant: "destructive" }); setIsSaving(false); return; }
      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath); finalAvatarUrl = data.publicUrl;
    }
    const { ok, error } = await updateProfileSettings(newUsername.trim(), finalAvatarUrl);
    
    let pwError = null;
    if (newPassword) {
      const res = await updateUserPassword(newPassword);
      pwError = res.error;
    }

    setIsSaving(false);
    if (error || pwError) { toast({ title: "Error", description: error || pwError, variant: "destructive" }); }
    else { 
      toast({ title: "Perfil actualizado" }); 
      setProfile({ ...profile, username: newUsername.trim(), avatar_url: finalAvatarUrl }); 
      if (isOwner) {
        setLoggedInProfile((prev: any) => prev ? { ...prev, username: newUsername.trim(), avatar_url: finalAvatarUrl } : prev);
      }
      setIsEditModalOpen(false); 
      setSelectedImage(null); 
      setNewPassword(""); 
      setConfirmPassword(""); 
      router.refresh(); 
    }
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
      <NavHeader points={loggedInProfile?.points ?? 0} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} onPointsUpdate={() => { }} userId={loggedInProfile?.id ?? null} userEmail={loggedInProfile?.email ?? null} onOpenAuthModal={() => router.push("/")} onSignOut={async () => { await createClient().auth.signOut(); router.replace("/"); }} isAdmin={loggedInProfile?.role === "admin"} username={loggedInProfile?.username ?? null} avatarUrl={loggedInProfile?.avatar_url ?? null} />

      <main className="w-full max-w-[1440px] mx-auto px-4 md:px-8 py-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-8 mb-3 md:mb-10">
          
          {/* COLUMNA IZQUIERDA (Perfil y Estadísticas) */}
          <div className="lg:col-span-4 flex flex-col gap-4 md:gap-6">
            
            {/* ENCABEZADO Y TARJETAS (DESKTOP) */}
            <div className="hidden md:flex flex-col gap-6">
              <div className="flex justify-between items-start gap-4 bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-4">
                  <Avatar className="w-20 h-20 border-4 border-background bg-primary/10 shadow-md shrink-0">
                    {profile.avatar_url ? <AvatarImage src={profile.avatar_url} className="object-cover" /> : <AvatarFallback><UserIcon className="w-8 h-8 text-primary opacity-50" /></AvatarFallback>}
                  </Avatar>
                  <div className="flex flex-col justify-center pt-1">
                    <h1 className="text-3xl font-black text-foreground truncate tracking-tighter mb-1">{displayName}</h1>
                    <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5 opacity-80">
                      <CalendarDays className="w-3.5 h-3.5" /> Miembro desde {new Date(profile.created_at || new Date()).getFullYear()}
                    </p>
                  </div>
                </div>
                {isOwner && (
                  <div>
                    <Button variant="outline" size="sm" className="flex items-center" onClick={() => { setNewUsername(profile.username || ""); setPreviewUrl(profile.avatar_url || null); setSelectedImage(null); setIsEditModalOpen(true); }}>
                      <Pencil className="w-4 h-4 mr-2" /> Editar
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 bg-card border border-border/50 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Portfolio Total</p>
                    <Wallet className="w-5 h-5 text-primary opacity-80" />
                  </div>
                  <p className="text-3xl font-black text-foreground">{portfolioStats.totalPortfolioValue.toLocaleString(undefined, {maximumFractionDigits: 0})} pts</p>
                </div>

                <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-tight">Activo</p>
                    <TrendingUp className="w-4 h-4 text-blue-500 opacity-80" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{portfolioStats.lockedValueOffset.toLocaleString(undefined, {maximumFractionDigits: 0})} pts</p>
                    <p className="text-[10px] font-semibold text-muted-foreground">{portfolioPositions.filter(p => p.status === 'active').length} mercados</p>
                  </div>
                </div>

                <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-tight">Líquido</p>
                    <Coins className="w-4 h-4 text-orange-500 opacity-80" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{(profile.points ?? 0).toLocaleString()}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground">Disponibles</p>
                  </div>
                </div>

                <div className="col-span-2 bg-card border border-border/50 rounded-2xl p-5 shadow-sm flex flex-col gap-2 justify-center">
                  <div className="flex justify-between items-center border-b border-border/30 pb-1">
                    <span className="text-xs font-bold text-muted-foreground">Mejor Predicción</span>
                    <span className={cn("text-base font-black", bestPredictionValue > 0 ? "text-green-600 dark:text-[#00FF00]" : "text-foreground")}>{bestPredictionValue > 0 ? '+' : ''}{bestPredictionValue.toLocaleString(undefined, {maximumFractionDigits: 0})} pts</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-muted-foreground">Predicciones Jugadas</span>
                    <span className="text-base font-black text-foreground">{predictionsPlayed}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ENCABEZADO COMPACTO (Mobile) */}
            <div className="flex flex-col gap-1 md:hidden">
              <div className="flex items-center gap-3 py-2">
                <Avatar className="w-12 h-12 bg-primary/10 shrink-0">
                  {profile.avatar_url ? <AvatarImage src={profile.avatar_url} className="object-cover" /> : <AvatarFallback><UserIcon className="w-6 h-6 text-primary opacity-50" /></AvatarFallback>}
                </Avatar>
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <div className="flex flex-col justify-center">
                    <h1 className="text-xl font-black text-foreground truncate tracking-tighter leading-none">{displayName}</h1>
                    <p className="text-xs text-muted-foreground font-medium mt-1">
                      Miembro desde {new Date(profile.created_at || new Date()).getFullYear()}
                    </p>
                  </div>
                  {isOwner && (
                    <div>
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-muted-foreground hover:bg-transparent" onClick={() => { setNewUsername(profile.username || ""); setPreviewUrl(profile.avatar_url || null); setSelectedImage(null); setIsEditModalOpen(true); }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* STATS SECUNDARIOS EN LÍNEA (Mobile) */}
              <div className="grid grid-cols-3 divide-x divide-border mt-2 mb-4">
                <div className="flex flex-col items-center px-2">
                  <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider mb-0.5">Líquido</span>
                  <span className="text-sm font-bold text-foreground">{(profile.points ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex flex-col items-center px-2">
                  <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider mb-0.5">Activo</span>
                  <span className="text-sm font-bold text-foreground">{portfolioStats.lockedValueOffset.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                </div>
                <div className="flex flex-col items-center px-2">
                  <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider mb-0.5">Jugadas</span>
                  <span className="text-sm font-bold text-foreground">{predictionsPlayed}</span>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA (Gráfico y Acciones) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            
            {/* GRÁFICO DE RENDIMIENTO (OPTIMIZADO) */}
            <Card className="bg-card border border-border/50 shadow-sm rounded-2xl overflow-hidden h-full flex flex-col mb-2 md:mb-0">
              <CardContent className="p-0 flex-1 flex flex-col">
                <div className="px-4 pt-3 pb-4 md:p-8 flex flex-col gap-3 md:gap-4 border-b border-border/20">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 md:gap-4">
                    
                    {/* ENCABEZADO GRAFICO (MOBILE) */}
                    <div className="md:hidden w-full">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-muted-foreground text-[11px] uppercase tracking-widest">
                          <Wallet className="w-3.5 h-3.5 text-primary" /> PORTFOLIO
                        </div>
                        <div className="text-2xl leading-none font-black tracking-tighter text-foreground text-right">
                          {portfolioStats.totalPortfolioValue.toLocaleString(undefined, {maximumFractionDigits: 0})} <span className="text-xs font-bold opacity-50 tracking-tight">pts</span>
                        </div>
                      </div>
                      
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <TrendingUp className={cn("w-3.5 h-3.5", isProfit ? "text-green-500" : "text-red-500")} />
                        <span className={cn("text-sm font-bold", isProfit ? "text-green-600 dark:text-[#00FF00]" : "text-red-600 dark:text-[#FF0000]")}>
                          {isProfit ? '+' : ''}{dynamicPnl.value.toLocaleString()} pts ({isProfit ? '+' : ''}{dynamicPnl.percentage.toFixed(2)}%)
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground ml-1">
                          {timeframeLabels[timeframe]}
                        </span>
                      </div>
                    </div>

                    {/* ENCABEZADO GRAFICO (DESKTOP) */}
                    <div className="hidden md:block">
                      <div className="flex items-center gap-2 font-bold text-muted-foreground mb-1 text-base">
                        <TrendingUp className="w-4 h-4" /> Variación
                      </div>
                      <div className="flex items-baseline gap-3 flex-wrap mt-1">
                        <span className={cn("text-5xl font-black tracking-tight", isProfit ? "text-green-600 dark:text-[#00FF00]" : "text-red-600 dark:text-[#FF0000]")}>
                          {isProfit ? '+' : ''}{dynamicPnl.value.toLocaleString()} <span className="text-2xl opacity-80">pts</span>
                        </span>
                        <Badge variant="outline" className={cn("text-base px-2 py-0.5 font-bold border-2", isProfit ? "bg-green-500/10 text-green-600 dark:text-[#00FF00] border-green-500/30" : "bg-red-500/10 text-red-600 dark:text-[#FF0000] border-red-500/30")}>
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
                </div>

                <div className="h-[200px] md:h-[300px] w-full p-2 sm:p-4 md:p-6 shrink-0">
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
          </div>
        </div>

        {/* TABS DE HISTORIAL */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-4 md:mb-8">
          <TabsList className="flex w-full h-12 mb-3 md:mb-6 bg-muted/30 rounded-xl p-1 border border-border/50 overflow-x-auto whitespace-nowrap scrollbar-none justify-start sm:justify-center shrink-0 hide-scrollbar">
            <TabsTrigger value="active" className="flex items-center gap-1.5 text-[11px] sm:text-sm font-bold rounded-lg px-4 sm:px-6"><LineChart className="w-3.5 h-3.5 hidden sm:block" />Activas <Badge variant="secondary" className="font-black h-4 px-1 ml-0.5 text-[9px]">{portfolioPositions.filter(p => p.status === 'active').length}</Badge></TabsTrigger>
            <TabsTrigger value="finished" className="flex items-center gap-1.5 text-[11px] sm:text-sm font-bold rounded-lg px-4 sm:px-6"><History className="w-3.5 h-3.5 hidden sm:block" />Cerradas</TabsTrigger>
            {isOwner && <TabsTrigger value="bank" className="flex items-center gap-1.5 text-[11px] sm:text-sm font-bold rounded-lg px-4 sm:px-6"><Landmark className="w-3.5 h-3.5 hidden sm:block" />Billetera</TabsTrigger>}
          </TabsList>

          {activeTab !== 'bank' && (
            <div className="flex flex-row items-center gap-2 mb-3 md:mb-6 w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar..." 
                  className="pl-9 bg-card hover:bg-muted/30 border-border/50 text-sm h-10 w-full rounded-xl focus-visible:ring-2 focus-visible:ring-primary/20 shadow-sm transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="relative w-[130px] sm:w-[160px] shrink-0">
                <select 
                  className="appearance-none bg-card border border-border/50 rounded-xl px-3 py-2 pr-8 text-xs sm:text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer w-full shadow-sm transition-all hover:bg-muted/30 font-medium"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                >
                  <option value="recent">Recientes</option>
                  <option value="oldest">Antiguas</option>
                  <option value="highest_value">Mayor valor</option>
                  <option value="lowest_value">Menor valor</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          )}

          <TabsContent value="active" className="m-0">
            {isLoadingBets ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary opacity-60" /></div>
            ) : filteredAndSortedPositions.filter(p => p.status === 'active').length === 0 ? (
              <div className="p-10 sm:p-16 text-center text-muted-foreground bg-muted/10 border-2 border-dashed border-border/50 rounded-2xl">
                <LineChart className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg sm:text-xl font-bold mb-2 text-foreground">Tu portfolio activo está vacío o no hay resultados de búsqueda</p>
                <Button size="sm" asChild className="mt-4 font-bold rounded-full"><Link href="/">Explorar Mercados</Link></Button>
              </div>
            ) : (
              <div className="flex flex-col border border-border/50 rounded-2xl bg-card overflow-hidden shadow-sm">
                {/* Cabecera de Tabla (Sólo Desktop) */}
                <div className="hidden md:flex items-center justify-between p-4 px-5 border-b border-border/30 bg-muted/20 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  <div className="flex-1">Mercado</div>
                  <div className="flex items-center gap-6 sm:gap-8 pr-1">
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className="w-[60px] text-right">Promedio</div>
                      <div className="w-[50px] text-right">Actual</div>
                    </div>
                    <div className="w-[90px] text-right">Valor</div>
                  </div>
                </div>

                {filteredAndSortedPositions.filter(p => p.status === 'active').map((pos, idx, arr) => {
                  const currentPrice = Number(pos.current_price) || 0;
                  const currentValue = pos.shares * currentPrice;
                  const totalInvestment = pos.shares * pos.avg_price;
                  const floatingPnl = currentValue - totalInvestment;
                  const floatingPnlPct = totalInvestment > 0 ? (floatingPnl / totalInvestment) * 100 : 0;
                  const isProfit = floatingPnl >= 0;

                  const outcomeName = String(pos.outcome_name || pos.option_display_name || pos.outcome);
                  const isBinary = ['sí', 'si', 'no', 'yes'].includes(outcomeName.toLowerCase().trim());
                  const dirText = pos.direction === 'yes' ? 'SÍ' : 'NO';
                  const badgeText = isBinary ? outcomeName.toUpperCase() : `${dirText} - ${outcomeName}`;

                  const isRedBadge = isBinary 
                    ? ['no'].includes(outcomeName.toLowerCase().trim()) 
                    : pos.direction === 'no';

                  return (
                    <div key={`${pos.market_id}-${pos.outcome}-${idx}`} className={cn("p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-muted/10 transition-colors", idx !== arr.length - 1 && "border-b border-border/30")}>
                      
                      {/* Fila Superior (Móvil) / Columna 1 (Desktop) */}
                      <div className="flex items-center gap-3 w-full md:flex-1 min-w-0">
                        {pos.market_image_url ? (
                          <img src={pos.market_image_url} alt="market" className="w-10 h-10 rounded-full object-cover border border-border/50 shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <LineChart className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <Link href={`/market/${pos.market_id}`} className="block hover:underline">
                            <p className="font-bold text-sm text-foreground leading-snug">{pos.market_title}</p>
                          </Link>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge variant="outline" className={cn("text-[10px] font-bold h-4 px-1 border", isRedBadge ? "bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/30" : "bg-green-500/10 text-green-600 dark:text-green-500 border-green-500/30")}>
                              {badgeText}
                            </Badge>
                            <span className="text-[10px] font-medium text-muted-foreground">
                              | {Number(pos.shares).toLocaleString('es-AR')} acciones
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Abajo: Métricas en gris (Mobile) / Columnas (Desktop) */}
                      <div className="mt-3 md:mt-0 flex justify-between md:justify-end items-center bg-muted/20 md:bg-transparent rounded-lg p-3 md:p-0 w-full md:w-auto border border-border/30 md:border-none gap-4 md:gap-8 pr-1">
                        <div className="flex gap-4 md:gap-6 text-sm">
                          <div className="flex flex-col md:w-[60px] md:items-end">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider md:hidden">Promedio</p>
                            <p className="font-bold text-foreground md:font-medium">${pos.avg_price.toFixed(2)}</p>
                          </div>
                          <div className="flex flex-col md:w-[50px] md:items-end">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider md:hidden">Actual</p>
                            <p className="font-bold text-foreground md:font-medium">${currentPrice.toFixed(2)}</p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end min-w-[90px] md:w-[90px]">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-0.5 md:hidden">Valor</p>
                          <p className="font-black text-base text-foreground">{currentValue.toLocaleString(undefined, {maximumFractionDigits: 0})} pts</p>
                          <p className={cn("text-[11px] font-bold mt-0.5 md:font-medium", isProfit ? "text-green-600 dark:text-[#00FF00]" : "text-red-600 dark:text-[#FF0000]")}>
                            {isProfit ? '+' : ''}{floatingPnl.toLocaleString(undefined, {maximumFractionDigits: 0})} ({isProfit ? '+' : ''}{floatingPnlPct.toFixed(1)}%)
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="finished" className="m-0 space-y-3">
            {isLoadingBets ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary opacity-60" /></div>
            ) : filteredAndSortedPositions.filter(p => p.status === 'closed').length === 0 ? (
              <div className="p-12 text-center text-muted-foreground bg-muted/10 rounded-2xl"><History className="w-10 h-10 mx-auto mb-3 opacity-20" /><p className="text-sm font-medium">No hay resultados de búsqueda o historial.</p></div>
            ) : (
              <div className="flex flex-col border border-border/50 rounded-2xl bg-card overflow-hidden shadow-sm">
                {/* Cabecera de Tabla (Sólo Desktop) */}
                <div className="hidden md:flex items-center justify-between p-4 px-5 border-b border-border/30 bg-muted/20 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  <div className="flex-1">Mercado</div>
                  <div className="flex items-center gap-6 sm:gap-8 pr-1">
                    <div className="w-[90px] text-right">Inversión</div>
                    <div className="w-[110px] text-right">Retorno Final</div>
                  </div>
                </div>

                {filteredAndSortedPositions.filter(p => p.status === 'closed').map((pos, idx, arr) => {
                  const totalInvestment = pos.shares * pos.avg_price;
                  let realized_pnl = pos.realized_pnl;

                  // Corregir realized_pnl si el usuario mantuvo las acciones hasta la resolución
                  if (pos.shares > 0) {
                     const relatedBet = bets.find(b => b.market_id === pos.market_id && b.outcome === pos.outcome);
                     const market = relatedBet ? getMarket(relatedBet) : null;
                     
                     if (market && (String(market.status).toLowerCase() === 'resolved' || String(market.status).toLowerCase() === 'rejected')) {
                         if (String(market.status).toLowerCase() === 'rejected') {
                             realized_pnl = 0; 
                         } else {
                             const outcomeNameStr = String(pos.outcome_name || pos.option_display_name || pos.outcome);
                             const isOldBinary = ['sí', 'si', 'no', 'yes'].includes(outcomeNameStr.toLowerCase().trim());
                             
                             let won = false;
                             if (isOldBinary) {
                                won = market.winning_outcome === pos.outcome;
                             } else {
                                if (pos.direction === 'yes') {
                                   won = market.winning_outcome === pos.outcome;
                                } else if (pos.direction === 'no') {
                                   won = market.winning_outcome !== pos.outcome && market.winning_outcome !== null;
                                } else {
                                   won = market.winning_outcome === pos.outcome;
                                }
                             }

                             if (won) {
                                realized_pnl = pos.shares - totalInvestment;
                             } else {
                                realized_pnl = -totalInvestment;
                             }
                         }
                     }
                  }

                  const finalAmount = totalInvestment + realized_pnl;
                  const pnlPct = totalInvestment > 0 ? (realized_pnl / totalInvestment) * 100 : 0;
                  const isLoss = realized_pnl < 0;
                  const isProfit = realized_pnl > 0;
                  const isTie = realized_pnl === 0;

                  const outcomeName = String(pos.outcome_name || pos.option_display_name || pos.outcome);
                  const isBinary = ['sí', 'si', 'no', 'yes'].includes(outcomeName.toLowerCase().trim());
                  const dirText = pos.direction === 'yes' ? 'SÍ' : 'NO';
                  const badgeText = isBinary ? outcomeName.toUpperCase() : `${dirText} - ${outcomeName}`;

                  const isRedBadge = isBinary 
                    ? ['no'].includes(outcomeName.toLowerCase().trim()) 
                    : pos.direction === 'no';

                  return (
                    <div key={`${pos.market_id}-${pos.outcome}-${idx}`} className="flex flex-col md:flex-row md:items-center border-b border-border/60 md:border-border/30 py-5 px-4 md:py-4 md:px-5 last:border-0 hover:bg-muted/5 md:hover:bg-muted/10 transition-colors gap-4">
                      
                      {/* Arriba: Imagen y Título */}
                      <div className="flex items-start gap-3 w-full md:flex-1 md:items-center">
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 border hidden md:flex", 
                          isProfit ? "bg-green-500/10 border-green-500/30" : 
                          isLoss ? "bg-red-500/10 border-red-500/30" : 
                          "bg-muted/50 border-border/50"
                        )}>
                          {isProfit && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          {isLoss && <XCircle className="w-4 h-4 text-red-500" />}
                          {isTie && <MinusCircle className="w-4 h-4 text-muted-foreground" />}
                        </div>
                        {pos.market_image_url ? (
                          <img src={pos.market_image_url} alt="market" className="w-10 h-10 rounded-full object-cover border border-border/50 shrink-0 mt-0.5 md:mt-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5 md:mt-0">
                            <History className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <Link href={`/market/${pos.market_id}`} className="block hover:underline">
                            <p className="font-semibold text-sm leading-tight text-foreground md:truncate">{pos.market_title}</p>
                          </Link>
                          
                          {/* Centro: Insignia Ganado/Perdido debajo del título */}
                          {isProfit ? (
                            <div className="flex items-center gap-1 text-green-500 font-semibold text-xs mt-1 md:hidden">
                              <CheckCircle2 className="w-3 h-3" /> Ganado
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground text-xs mt-1 font-semibold md:hidden">
                              <XCircle className="w-3 h-3" /> Perdido
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 mt-2 md:mt-1 flex-wrap">
                            <Badge variant="outline" className={cn("text-[10px] font-bold h-4 px-1 border", isRedBadge ? "bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/30" : "bg-green-500/10 text-green-600 dark:text-green-500 border-green-500/30")}>
                              {badgeText}
                            </Badge>
                            <span className="text-[10px] font-medium text-muted-foreground">
                              | {Number(pos.shares).toLocaleString('es-AR')} acciones a ${(Number(pos.avg_price) || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Abajo: Métricas en gris (Mobile) / Columnas (Desktop) */}
                      <div className="mt-3 md:mt-0 flex justify-between md:justify-end items-center bg-muted/20 md:bg-transparent rounded-lg p-3 md:p-0 w-full md:w-auto border border-border/30 md:border-none gap-4 md:gap-8 pr-1">
                        <div className="flex flex-col md:w-[90px] md:items-end">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider md:hidden">Inversión</p>
                          <p className="font-bold text-foreground md:font-medium">{totalInvestment.toLocaleString(undefined, {maximumFractionDigits: 0})} pts</p>
                        </div>

                        <div className="flex flex-col items-end min-w-[90px] md:w-[110px]">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-0.5 md:hidden">Retorno Final</p>
                          <p className="font-black text-base text-foreground">{finalAmount.toLocaleString(undefined, {maximumFractionDigits: 0})} pts</p>
                          <p className={cn("text-[11px] font-bold mt-0.5 md:font-medium", isProfit ? "text-green-600 dark:text-[#00FF00]" : isLoss ? "text-red-600 dark:text-[#FF0000]" : "text-muted-foreground")}>
                            {isProfit ? '+' : ''}{realized_pnl.toLocaleString(undefined, {maximumFractionDigits: 0})} ({isProfit ? '+' : ''}{pnlPct.toFixed(1)}%)
                          </p>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
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
                {/* Cabecera de Tabla (Sólo Desktop) */}
                <div className="hidden md:flex items-center justify-between p-4 px-5 border-b border-border/30 bg-muted/20 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  <div className="flex-1 pl-[52px]">Descripción</div>
                  <div className="flex items-center gap-6 sm:gap-8 pr-1">
                    <div className="w-[80px] text-right">Precio</div>
                    <div className="w-[80px] text-right">Acciones</div>
                    <div className="w-[100px] text-right">Valor</div>
                  </div>
                </div>
                <div className="divide-y divide-border/30 max-h-[500px] overflow-y-auto scrollbar-none">
                  {processedTransactions.map((tx) => {
                    const desc = tx.description || "";
                    const isBonusDiario = desc.toLowerCase().includes("bonus diario");

                    const amount = Number(tx.amount || 0);
                    const isBuy = amount < 0;
                    const isPositive = amount > 0;
                    const formattedDate = new Date(tx.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });

                    const marketTitle = tx.markets?.title || tx.market?.title;

                    // Leer estrictamente del objeto de la transacción
                    const sharesAmount = Number(tx.shares || tx.metadata?.shares || 0);
                    const price = sharesAmount > 0 ? (Math.abs(tx.amount) / sharesAmount).toFixed(2) : '-';

                    return (
                      <div key={tx.id} className="flex flex-col md:flex-row justify-between border-b border-border/50 py-4 px-4 hover:bg-muted/10 transition-colors last:border-0 w-full">
                        
                        {/* Fila Superior (Descripción) */}
                        <div className="flex items-center gap-3 w-full md:w-auto md:flex-1 min-w-0">
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                            {isPositive ? <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5 text-green-500" /> : <ArrowDownRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            {(() => {
                              if (isBonusDiario) {
                                return (
                                  <p className="text-sm font-semibold text-foreground truncate">
                                    Bonus Diario
                                  </p>
                                );
                              }

                              const renderStyledDescription = (text: string) => {
                                const parts = text.split(/(".*?")/g);
                                return parts.map((part, i) => {
                                  if (part.startsWith('"') && part.endsWith('"')) {
                                    return <span key={i} className="font-semibold text-foreground">{part}</span>;
                                  }
                                  return <span key={i}>{part}</span>;
                                });
                              };

                              let finalDesc = desc;
                              if (marketTitle) {
                                const actionText = amount < 0 ? "Compra" : "Venta";
                                finalDesc = `${actionText} de acciones en "${marketTitle}"`;
                              }

                              return (
                                <p className="text-sm text-foreground font-medium leading-snug">
                                  {renderStyledDescription(finalDesc)}
                                </p>
                              );
                            })()}
                            <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{formattedDate} • Saldo: {tx.balanceAfter.toLocaleString()} pts</p>
                          </div>
                        </div>

                        {/* Fila Inferior (Datos agrupaditos en móvil) */}
                        <div className="mt-3 md:mt-0 flex justify-between items-center w-full md:w-auto md:ml-auto gap-4 md:gap-8 shrink-0">
                          
                          <div className="flex items-center gap-6 md:gap-8">
                            {/* Columna: Precio */}
                            <div className="flex flex-col items-start md:items-end w-auto md:w-[80px] justify-center">
                              <p className="text-xs md:text-sm font-bold text-muted-foreground md:text-foreground">
                                <span className="text-xs md:hidden font-medium text-muted-foreground mr-1">Precio:</span>{price !== '-' ? `$${price}` : '-'}
                              </p>
                            </div>

                            {/* Columna: Acciones */}
                            <div className="flex flex-col items-start md:items-end w-auto md:w-[80px] justify-center">
                              <p className="text-xs md:text-sm font-bold text-muted-foreground md:text-foreground">
                                <span className="text-xs md:hidden font-medium text-muted-foreground mr-1">Acc:</span>{sharesAmount > 0 ? sharesAmount.toLocaleString('es-AR') : '-'}
                              </p>
                            </div>
                          </div>

                          {/* Columna: Valor */}
                          <div className="flex flex-col items-end min-w-[80px] md:w-[100px] justify-center">
                            <span className={cn("font-black text-sm md:text-base text-right", isPositive ? "text-green-600 dark:text-[#00FF00]" : "text-foreground")}>
                              {isPositive ? '+' : ''}{tx.amount.toLocaleString()}
                            </span>
                          </div>
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
        <DialogContent className="sm:max-w-md w-[90vw] max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader><DialogTitle>Configuración de Cuenta</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveProfile} className="space-y-6 pt-4">
            
            {/* SECCIÓN PERFIL */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-muted-foreground border-b border-border/30 pb-2">Perfil Público</h3>
              
              <div className="flex flex-col items-center gap-4 mb-2">
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-primary/10 flex items-center justify-center border-2 border-border overflow-hidden">
                  {previewUrl ? <img src={previewUrl} alt="Avatar" className="w-full h-full object-cover" /> : <UserIcon className="w-10 h-10 text-primary opacity-50" />}
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => { if (e.target.files && e.target.files[0]) { setSelectedImage(e.target.files[0]); setPreviewUrl(URL.createObjectURL(e.target.files[0])); } }} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="rounded-full text-xs">Cambiar foto</Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Nombre de usuario</Label>
                <Input id="username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required className="rounded-xl h-12" />
              </div>
            </div>

            {/* SECCIÓN SEGURIDAD */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-muted-foreground border-b border-border/30 pb-2">Seguridad (Opcional)</h3>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nueva Contraseña</Label>
                <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} className="rounded-xl h-12" placeholder="Dejar en blanco para no cambiar" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Nueva Contraseña</Label>
                <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} className="rounded-xl h-12" />
              </div>
            </div>

            <Button type="submit" className="w-full h-12 rounded-xl font-bold mt-2" disabled={isSaving}>{isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Guardar Cambios</Button>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}