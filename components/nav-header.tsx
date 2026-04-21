"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Coins,
  Gift,
  Moon,
  Sun,
  Bell,
  User,
  Menu,
  X,
  Sparkles,
  Loader2,
  LogOut,
  UserCircle,
  ShieldCheck,
  CheckCheck,
  Trophy,
  Trash2,
  TrendingUp,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { claimDailyBonus, deleteNotification } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";

interface NavHeaderProps {
  points: number;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onPointsUpdate: (newPoints: number) => void;
  userId: string | null;
  userEmail: string | null;
  onOpenAuthModal: () => void;
  onSignOut: () => void;
  isAdmin?: boolean;
  username?: string | null;
}

interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;    
  market_id?: string;
  is_read: boolean;
  created_at: string;
  markets?: { title: string };
}

export function NavHeader({
  points,
  isDarkMode,
  onToggleDarkMode,
  onPointsUpdate,
  userId,
  userEmail,
  onOpenAuthModal,
  onSignOut,
  isAdmin = false,
  username = null,
}: NavHeaderProps) {
  const router = useRouter();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [bonusClaimed, setBonusClaimed] = useState(false);
  const [isClaimingBonus, setIsClaimingBonus] = useState(false);
  const [bonusError, setBonusError] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    
    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*, markets(title)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(15);
        
      if (data && !error) {
        setNotifications(data as AppNotification[]);
        setUnreadCount(data.filter((n) => !n.is_read).length);
      }
    };
    
    fetchNotifications();
    
    const channel = supabase
      .channel("realtime-notifs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          fetchNotifications();
          toast({
            title: payload.new.title || "¡Nueva notificación!",
            description: payload.new.message || "Tenés una actualización en tu cuenta.",
          });
          router.refresh(); 
        }
      )
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [userId, router]);

  const handleClaimBonus = async () => {
    if (!userId || isClaimingBonus || bonusClaimed) return;
    setIsClaimingBonus(true);
    setBonusError(null);
    try {
      const { ok, error, newPoints } = await claimDailyBonus();
      if (!ok) {
        const message = error || "Ya reclamaste tu bonus diario. Volvé mañana.";
        setBonusError(message);
        toast({ title: "Bonus no disponible", description: message, variant: "destructive" });
        setTimeout(() => setBonusError(null), 3000);
        return;
      }
      setBonusClaimed(true);
      if (typeof newPoints === "number") onPointsUpdate(newPoints);
      toast({ title: "¡Ganaste 2000 puntos!", description: "Tu bonus diario fue acreditado." });
      router.refresh();
      setTimeout(() => setBonusClaimed(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado al reclamar el bonus";
      setBonusError(message);
      toast({ title: "Error al reclamar bonus", description: message, variant: "destructive" });
      setTimeout(() => setBonusError(null), 3000);
    } finally {
      setIsClaimingBonus(false);
    }
  };

  const getUserDisplayName = () => {
    if (username) return username;
    if (!userEmail) return null;
    const atIndex = userEmail.indexOf("@");
    return atIndex > 0 ? userEmail.slice(0, atIndex) : userEmail;
  };

  const handleOpenNotifications = async (isOpen: boolean) => {
    if (isOpen && unreadCount > 0 && userId) {
      const supabase = createClient();
      const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
    }
  };

  const handleDeleteNotification = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation(); 
    
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    
    const { ok, error } = await deleteNotification(id);
    if (!ok) {
      toast({ title: "Error", description: "No se pudo borrar la notificación", variant: "destructive" });
    }
  };

  const handleNotificationClick = (notif: AppNotification) => {
    if (notif.market_id) {
      router.push(`/market/${notif.market_id}`);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch(type) {
      case 'bonus': return <Gift className="w-5 h-5 text-green-500" />;
      case 'cashout': return <Coins className="w-5 h-5 text-amber-500" />;
      case 'market_resolved': return <Trophy className="w-5 h-5 text-primary" />;
      case 'referral': return <Users className="w-5 h-5 text-blue-400" />;
      default: return <Bell className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const NotificationsList = () => (
    <div className="w-full max-h-[80vh] flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border/50 shrink-0">
        <h4 className="font-bold flex items-center gap-2">
          <Bell className="w-4 h-4" /> Notificaciones
        </h4>
        {unreadCount > 0 && (
          <Badge variant="secondary" className="text-xs bg-primary/20 text-primary hover:bg-primary/30">{unreadCount} nuevas</Badge>
        )}
      </div>
      
      <div className="overflow-y-auto overflow-x-hidden p-2 flex-1 scrollbar-thin scrollbar-thumb-border">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
             <Bell className="w-10 h-10 mb-3 opacity-20" />
             <p className="text-sm font-medium">No tenés notificaciones recientes</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {notifications.map((notif) => (
                <div 
                  key={notif.id} 
                  onClick={() => handleNotificationClick(notif)}
                  className={cn(
                    "relative group p-3 pr-10 rounded-xl text-sm transition-all w-full", 
                    notif.market_id ? "cursor-pointer hover:bg-muted/50" : "cursor-default",
                    notif.is_read ? "bg-transparent" : "bg-primary/5 border border-primary/20"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 bg-muted/50 p-2 rounded-full border border-border/50">
                       {getNotificationIcon(notif.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground mb-0.5 leading-snug">{notif.title}</p>
                      <p className="text-foreground/80 leading-snug text-xs whitespace-pre-wrap break-words">{notif.message}</p>
                      <p className="text-[10px] font-semibold text-muted-foreground mt-2 uppercase tracking-wider">
                        {new Date(notif.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => handleDeleteNotification(e, notif.id)}
                    className="absolute top-3 right-2 p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          
          <Link href="/" className="flex items-center hover:opacity-90 transition-opacity py-2 group mr-4">
            <div className="flex items-baseline">
              <span className="text-2xl sm:text-3xl font-black tracking-tighter text-foreground">
                PREDI
              </span>
              <div className="relative">
                <span className="text-2xl sm:text-3xl font-black tracking-tighter text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.3)]">
                  X
                </span>
                <TrendingUp 
                  className="absolute -top-2.5 -right-5 w-6 h-6 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.4)] group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform duration-300" 
                  strokeWidth={3} 
                />
              </div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-3">
            {userId && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/20 border border-secondary/30">
                <Coins className="w-5 h-5 text-secondary-foreground" />
                <span className="font-semibold text-foreground">{(points || 0).toLocaleString()}</span>
                <span className="text-sm text-muted-foreground">pts</span>
              </div>
            )}

            <Button variant="ghost" asChild className="hover:text-amber-500 hover:bg-amber-500/10 transition-colors">
              <Link href="/ranking">
                <Trophy className="w-4 h-4 mr-2 text-amber-500" />
                <span>Ranking</span>
              </Link>
            </Button>

            <Button onClick={userId ? handleClaimBonus : onOpenAuthModal} disabled={isClaimingBonus} variant="outline" className={cn("relative overflow-hidden border-primary/30 hover:border-primary hover:bg-primary/10 transition-all duration-300", bonusClaimed && "bg-green-500/20 border-green-500/50", bonusError && "bg-red-500/20 border-red-500/50")}>
              {isClaimingBonus ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /><span>Reclamando...</span></> : bonusClaimed ? <><Sparkles className="w-4 h-4 mr-2 text-green-500" /><span className="text-green-600 dark:text-green-400">+2000 pts</span></> : bonusError ? <span className="text-red-600 dark:text-red-400 text-xs">Ya reclamaste hoy</span> : <><Gift className="w-4 h-4 mr-2 text-primary" /><span>Bonus Diario</span></>}
              {!bonusClaimed && !bonusError && !isClaimingBonus && <Badge className="ml-2 h-5 px-1.5 text-[10px] bg-primary text-primary-foreground">NUEVO</Badge>}
            </Button>

            {userId && (
              <Popover onOpenChange={handleOpenNotifications}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1.5 right-2 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[340px] sm:w-[420px] p-0 rounded-2xl shadow-xl border border-border/50">
                  <NotificationsList />
                </PopoverContent>
              </Popover>
            )}

            <Button variant="ghost" size="icon" onClick={onToggleDarkMode} className="hover:bg-primary/10">
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>

            {userId ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 px-3 rounded-full bg-muted hover:bg-muted/80 border border-border/50 shadow-sm">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <span className="font-semibold text-sm max-w-[100px] truncate">{getUserDisplayName()}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-lg border-border/50 p-2">
                  <div className="px-3 py-3 bg-muted/20 rounded-lg mb-2">
                    <p className="text-sm font-bold truncate text-foreground">{userEmail || username}</p>
                    <p className="text-xs font-semibold text-primary mt-1">{(points || 0).toLocaleString()} puntos</p>
                  </div>
                  <DropdownMenuItem asChild className="rounded-lg mb-1 cursor-pointer">
                    <Link href="/profile" className="flex items-center font-medium"><UserCircle className="w-4 h-4 mr-3" />Mi Perfil</Link>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem asChild className="rounded-lg mb-1 cursor-pointer">
                      <Link href="/admin" className="flex items-center font-medium text-amber-500 focus:text-amber-500"><ShieldCheck className="w-4 h-4 mr-3" />Panel Admin</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="bg-border/50 my-2" />
                  <DropdownMenuItem onClick={onSignOut} className="rounded-lg cursor-pointer font-bold text-red-600 focus:bg-red-500/10 focus:text-red-600">
                    <LogOut className="w-4 h-4 mr-3" />Cerrar Sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button onClick={onOpenAuthModal} variant="default" className="rounded-full shadow-md font-bold px-6 hover:scale-[1.02] transition-transform"><User className="w-4 h-4 mr-2" />Ingresar</Button>
            )}
          </div>

          {/* BOTONES MÓVILES */}
          <div className="md:hidden flex items-center gap-1">
            {userId && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 mr-1 rounded-lg bg-secondary/20">
                <Coins className="w-4 h-4 text-secondary-foreground" />
                <span className="font-semibold text-sm">{(points || 0).toLocaleString()}</span>
              </div>
            )}
            
            {userId && (
              <Popover onOpenChange={handleOpenNotifications}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative h-9 w-9">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[340px] p-0 rounded-2xl border border-border/50 shadow-2xl">
                  <NotificationsList />
                </PopoverContent>
              </Popover>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowMobileMenu(!showMobileMenu)}>
              {showMobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </Button>
          </div>
        </div>
      </div>

      {showMobileMenu && (
        <div className="md:hidden absolute top-full left-0 w-full bg-background/95 backdrop-blur-xl border-b border-border/50 shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200 z-50">
          <div className="p-4 space-y-4">
            
            {userId ? (
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/30 border border-border/50">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 shrink-0">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-foreground truncate">{getUserDisplayName()}</p>
                  <p className="text-sm font-medium text-amber-500 mt-0.5">{points.toLocaleString()} pts disponibles</p>
                </div>
              </div>
            ) : (
              <Button onClick={() => { setShowMobileMenu(false); onOpenAuthModal(); }} className="w-full h-12 text-base font-bold rounded-xl shadow-md">
                <User className="w-5 h-5 mr-2" /> Ingresar / Registrarse
              </Button>
            )}
            
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-16 flex flex-col items-center justify-center gap-1 border-border/50 hover:bg-muted/50 rounded-xl bg-card" asChild>
                <Link href="/ranking" onClick={() => setShowMobileMenu(false)}>
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <span className="text-xs font-semibold mt-1">Ranking Global</span>
                </Link>
              </Button>

              <Button onClick={userId ? handleClaimBonus : onOpenAuthModal} disabled={isClaimingBonus} variant="outline" className={cn("h-16 flex flex-col items-center justify-center gap-1 border-border/50 rounded-xl bg-card", bonusClaimed && "border-green-500/50 bg-green-500/10")}>
                {isClaimingBonus ? <Loader2 className="w-5 h-5 animate-spin" /> : <Gift className={cn("w-5 h-5", bonusClaimed ? "text-green-500" : "text-primary")} />}
                <span className="text-xs font-semibold mt-1">{bonusClaimed ? "¡Reclamado!" : "Bonus Diario"}</span>
              </Button>
            </div>

            {userId && (
              <div className="space-y-1 bg-muted/10 p-2 rounded-2xl border border-border/50">
                <Button variant="ghost" className="w-full justify-start h-12 rounded-xl" asChild>
                  <Link href="/profile" onClick={() => setShowMobileMenu(false)}>
                    <UserCircle className="w-5 h-5 mr-3 text-muted-foreground" />
                    <span className="text-sm font-medium">Mi Perfil (Portfolio)</span>
                  </Link>
                </Button>
                
                {isAdmin && (
                  <Button variant="ghost" className="w-full justify-start h-12 rounded-xl" asChild>
                    <Link href="/admin" onClick={() => setShowMobileMenu(false)}>
                      <ShieldCheck className="w-5 h-5 mr-3 text-amber-500" />
                      <span className="text-sm font-medium">Panel de Control</span>
                    </Link>
                  </Button>
                )}

                <div className="flex items-center justify-between px-4 py-2 my-1 border-y border-border/30">
                  <div className="flex items-center gap-3">
                    {isDarkMode ? <Moon className="w-5 h-5 text-muted-foreground" /> : <Sun className="w-5 h-5 text-muted-foreground" />}
                    <span className="text-sm font-medium">Modo Oscuro</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={onToggleDarkMode} className="rounded-full h-8 w-8 bg-background border border-border/50 shadow-sm">
                    {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </Button>
                </div>

                <Button onClick={() => { setShowMobileMenu(false); onSignOut(); }} variant="ghost" className="w-full justify-start h-12 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-xl mt-1">
                  <LogOut className="w-5 h-5 mr-3" />
                  <span className="text-sm font-bold">Cerrar Sesión</span>
                </Button>
              </div>
            )}
            
          </div>
        </div>
      )}
    </header>
  );
}