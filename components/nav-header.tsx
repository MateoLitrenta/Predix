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
  Trash2
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
  message: string;
  is_read: boolean;
  created_at: string;
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
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data && !error) {
        setNotifications(data);
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
          const newNotif = payload.new as AppNotification;
          setNotifications((prev) => [newNotif, ...prev].slice(0, 10));
          setUnreadCount((prev) => prev + 1);
          toast({
            title: "¡Nueva notificación!",
            description: newNotif.message,
            className: newNotif.message.includes("Ganaste") ? "border-green-500 bg-green-500/10" : "",
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
    
    // Lo borramos de la pantalla al instante
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    
    // Le avisamos a la base de datos (usando el contrato inteligente)
    const { ok, error } = await deleteNotification(id);
    if (!ok) {
      toast({ title: "Error", description: "No se pudo borrar la notificación", variant: "destructive" });
    }
  };

  const NotificationsList = () => (
    <div className="w-full max-h-[80vh] flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-border/50 shrink-0">
        <h4 className="font-semibold flex items-center gap-2">
          <Bell className="w-4 h-4" /> Notificaciones
        </h4>
        {unreadCount > 0 && (
          <Badge variant="secondary" className="text-xs">{unreadCount} nuevas</Badge>
        )}
      </div>
      
      {/* Ocultamos la barra de scroll y evitamos desbordes */}
      <div className="overflow-y-auto overflow-x-hidden p-2 flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No tenés notificaciones recientes</p>
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map((notif) => (
              <div 
                key={notif.id} 
                className={cn(
                  "relative group p-3 pr-10 rounded-md text-sm transition-colors w-full", 
                  notif.is_read ? "bg-muted/30" : "bg-primary/10 border border-primary/20"
                )}
              >
                <div className="flex gap-3">
                  {/* Ícono */}
                  <div className="mt-0.5 shrink-0">
                    {notif.message.includes("Ganaste") ? <CheckCheck className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-red-500" />}
                  </div>
                  
                  {/* Texto */}
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground leading-snug whitespace-pre-wrap break-words">{notif.message}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {new Date(notif.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                
                {/* Botón Tachito */}
                <button
                  onClick={(e) => handleDeleteNotification(e, notif.id)}
                  className="absolute top-2 right-2 p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
                  title="Eliminar notificación"
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
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
              <span className="text-lg font-bold text-primary-foreground">P</span>
            </div>
            <span className="text-xl font-bold tracking-tight">Predic<span className="text-primary">AR</span></span>
          </Link>

          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/20 border border-secondary/30">
              <Coins className="w-5 h-5 text-secondary-foreground" />
              <span className="font-semibold text-foreground">{(points || 0).toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">pts</span>
            </div>

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
                {/* LA SOLUCIÓN ESTÁ ACÁ: Agrandamos la caja contenedora */}
                <PopoverContent align="end" className="w-[340px] sm:w-[400px] p-0">
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
                  <Button variant="ghost" className="flex items-center gap-2 px-3 rounded-full bg-muted hover:bg-muted/80">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <span className="font-medium text-sm max-w-[100px] truncate">{getUserDisplayName()}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium truncate">{userEmail || username}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{(points || 0).toLocaleString()} puntos</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="cursor-pointer flex items-center"><UserCircle className="w-4 h-4 mr-2" />Mi Perfil</Link>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="cursor-pointer flex items-center"><ShieldCheck className="w-4 h-4 mr-2" />Panel Admin</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onSignOut} className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400">
                    <LogOut className="w-4 h-4 mr-2" />Cerrar Sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button onClick={onOpenAuthModal} variant="default" className="rounded-full"><User className="w-4 h-4 mr-2" />Ingresar</Button>
            )}
          </div>

          <div className="md:hidden flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/20">
              <Coins className="w-4 h-4 text-secondary-foreground" />
              <span className="font-semibold text-sm">{(points || 0).toLocaleString()}</span>
            </div>
            {userId && (
              <Popover onOpenChange={handleOpenNotifications}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative h-8 w-8">
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1.5 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                {/* LA SOLUCIÓN ESTÁ ACÁ TAMBIÉN: Agrandamos la caja contenedora para celu */}
                <PopoverContent align="end" className="w-[340px] sm:w-[400px] p-0">
                  <NotificationsList />
                </PopoverContent>
              </Popover>
            )}
            <Button variant="ghost" size="icon" onClick={() => setShowMobileMenu(!showMobileMenu)}>
              {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {showMobileMenu && (
          <div className="md:hidden py-4 border-t border-border/40 space-y-3">
            {userId ? (
              <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-muted/50">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{userEmail}</p>
                  <p className="text-xs text-muted-foreground">{points.toLocaleString()} puntos</p>
                </div>
              </div>
            ) : (
              <Button onClick={() => { setShowMobileMenu(false); onOpenAuthModal(); }} className="w-full">
                <User className="w-4 h-4 mr-2" />Ingresar / Registrarse
              </Button>
            )}
            
            <Button variant="ghost" className="w-full justify-start text-amber-500 hover:text-amber-600 hover:bg-amber-500/10" asChild>
              <Link href="/ranking" onClick={() => setShowMobileMenu(false)}>
                <Trophy className="w-4 h-4 mr-2" />Ranking
              </Link>
            </Button>

            <Button onClick={userId ? handleClaimBonus : onOpenAuthModal} disabled={isClaimingBonus} variant="outline" className="w-full justify-center bg-transparent">
              {isClaimingBonus ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Gift className="w-4 h-4 mr-2" />} Bonus Diario
            </Button>

            <div className="flex items-center justify-center gap-4">
              <Button variant="ghost" size="icon" onClick={onToggleDarkMode}>
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>
            </div>

            {userId && (
              <>
                <Button variant="ghost" className="w-full justify-start" asChild>
                  <Link href="/profile" onClick={() => setShowMobileMenu(false)}><UserCircle className="w-4 h-4 mr-2" />Mi Perfil</Link>
                </Button>
                {isAdmin && (
                  <Button variant="ghost" className="w-full justify-start" asChild>
                    <Link href="/admin" onClick={() => setShowMobileMenu(false)}><ShieldCheck className="w-4 h-4 mr-2" />Panel Admin</Link>
                  </Button>
                )}
                <Button onClick={() => { setShowMobileMenu(false); onSignOut(); }} variant="ghost" className="w-full text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10">
                  <LogOut className="w-4 h-4 mr-2" />Cerrar Sesión
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}