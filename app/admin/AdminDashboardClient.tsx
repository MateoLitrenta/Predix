"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getProfile, approveMarket, rejectMarket, resolveMarket, updateMarket, deleteMarket, createAdminMarket } from "@/lib/actions";
import type { ProfileResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { NavHeader } from "@/components/nav-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, XCircle, ArrowLeft, Pencil, Trash2, Plus, X, Image as ImageIcon, Trophy, Clock, Search, Filter } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface MarketOption {
  id: string;
  option_name: string;
}

interface Market {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  end_date: string;
  created_at: string;
  created_by: string;
  total_volume: number;
  image_url?: string | null;
  winning_outcome?: string | null;
  market_options?: MarketOption[]; 
  [key: string]: unknown;
}

export default function AdminDashboardClient() {
  const router = useRouter();
  const supabase = createClient();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<ProfileResult>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  const [editingMarket, setEditingMarket] = useState<Market | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<{ title: string; description: string; category: string; end_date: string; image_url: string; options: MarketOption[] }>({ title: "", description: "", category: "", end_date: "", image_url: "", options: [] });
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  const [createForm, setCreateForm] = useState<{
    title: string; description: string; category: string; end_date: string; image_url: string; marketType: "binary" | "multiple"; options: string[];
  }>({ 
    title: "", description: "", category: "politica", end_date: "", image_url: "", marketType: "binary", options: ["", ""]
  });

  const [resolvingMarket, setResolvingMarket] = useState<Market | null>(null);
  const [selectedWinningOption, setSelectedWinningOption] = useState<string>("");
  
  const [deletingMarket, setDeletingMarket] = useState<{ id: string, title: string } | null>(null);

  // --- NUEVOS ESTADOS PARA LOS FILTROS ---
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todas");

  useEffect(() => {
    const check = async () => {
      const p = await getProfile();
      if (!p || p.role !== "admin") {
        router.replace("/");
        return;
      }
      setProfile(p);
      setIsCheckingAuth(false);
    };
    check();
  }, [router]);

  const fetchMarkets = async () => {
    const { data, error } = await supabase
      .from("markets")
      .select('*, market_options(id, option_name)')
      .order("created_at", { ascending: false });
      
    if (error) {
      console.error("[Admin] Error:", error);
      setMarkets([]);
    } else {
      setMarkets((data || []) as Market[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (!isCheckingAuth) {
      fetchMarkets();
      const channel = supabase
        .channel("admin-markets")
        .on("postgres_changes", { event: "*", schema: "public", table: "markets" }, () => { fetchMarkets(); })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [isCheckingAuth, supabase]);

  useEffect(() => {
    if (editingMarket) {
      const endDate = editingMarket.end_date ? new Date(editingMarket.end_date).toISOString().split("T")[0] : "";
      const rawCategory = String(editingMarket.category ?? "");
      const categoryNormalized = rawCategory.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      setEditForm({
        title: String(editingMarket.title ?? ""),
        description: String(editingMarket.description ?? ""),
        category: categoryNormalized || "politica",
        end_date: endDate,
        image_url: String(editingMarket.image_url ?? ""),
        options: editingMarket.market_options ? [...editingMarket.market_options] : []
      });
    }
  }, [editingMarket]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMarket) return;
    setIsSaving(true);
    
    const { error } = await updateMarket(editingMarket.id, {
      title: editForm.title.trim(),
      description: editForm.description.trim() || null,
      category: editForm.category,
      end_date: editForm.end_date,
      image_url: editForm.image_url.trim() || null,
    });

    if (!error && editForm.options.length > 0) {
      for (const opt of editForm.options) {
        await supabase.from("market_options").update({ option_name: opt.option_name }).eq("id", opt.id);
      }
    }

    setIsSaving(false);
    
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    } else {
      toast({ title: "Mercado actualizado", description: "Los cambios se guardaron." });
      setEditingMarket(null);
      await fetchMarkets();
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...createForm.options];
    newOptions[index] = value;
    setCreateForm(f => ({ ...f, options: newOptions }));
  };

  const addOption = () => {
    if (createForm.options.length < 10) setCreateForm(f => ({ ...f, options: [...f.options, ""] }));
  };

  const removeOption = (indexToRemove: number) => {
    if (createForm.options.length > 2) setCreateForm(f => ({ ...f, options: f.options.filter((_, i) => i !== indexToRemove) }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let finalOptions = ['Sí', 'No'];
    if (createForm.marketType === "multiple") {
      finalOptions = createForm.options.map(o => o.trim()).filter(o => o !== "");
      if (finalOptions.length < 2) {
        toast({ title: "Error", description: "Mínimo 2 opciones para mercados múltiples", variant: "destructive" });
        return;
      }
    }

    setIsCreating(true);
    const { error } = await createAdminMarket({
      title: createForm.title.trim(), description: createForm.description.trim() || null, category: createForm.category, end_date: createForm.end_date, image_url: createForm.image_url.trim() || null, options: finalOptions
    });
    setIsCreating(false);

    if (error) {
      toast({ title: "Error al crear", description: error, variant: "destructive" });
    } else {
      toast({ title: "Mercado Activo", description: "El mercado se creó y ya está público." });
      setIsCreateModalOpen(false);
      setCreateForm({ title: "", description: "", category: "politica", end_date: "", image_url: "", marketType: "binary", options: ["", ""] });
      await fetchMarkets();
    }
  };

  const handleApprove = async (marketId: string) => {
    setProcessingIds((p) => new Set(p).add(marketId));
    const { error } = await approveMarket(marketId);
    if (error) toast({ title: "Error", description: error, variant: "destructive" });
    else { toast({ title: "Aprobado", description: "El mercado ya está público." }); await fetchMarkets(); }
    setProcessingIds((p) => { const n = new Set(p); n.delete(marketId); return n; });
  };

  const handleReject = async (marketId: string) => {
    setProcessingIds((p) => new Set(p).add(marketId));
    const { error } = await rejectMarket(marketId);
    if (error) toast({ title: "Error", description: error, variant: "destructive" });
    else await fetchMarkets();
    setProcessingIds((p) => { const n = new Set(p); n.delete(marketId); return n; });
  };

  const confirmResolve = async () => {
    if (!resolvingMarket || !selectedWinningOption) return;
    const { id } = resolvingMarket;
    setProcessingIds((p) => new Set(p).add(id));
    
    const { error } = await resolveMarket(id, selectedWinningOption);
    
    setResolvingMarket(null);
    setSelectedWinningOption("");
    
    if (error) toast({ title: "Error al resolver", description: error, variant: "destructive" });
    else { toast({ title: "Mercado Finalizado", description: `Se repartieron los puntos.` }); await fetchMarkets(); }
    setProcessingIds((p) => { const n = new Set(p); n.delete(id); return n; });
  };

  const confirmDelete = async () => {
    if (!deletingMarket) return;
    const { id } = deletingMarket;
    setProcessingIds((p) => new Set(p).add(id));
    setDeletingMarket(null);
    const { error } = await deleteMarket(id);
    if (error) toast({ title: "Error al eliminar", description: error, variant: "destructive" });
    else { toast({ title: "Mercado Eliminado", description: "Se reembolsaron los puntos." }); await fetchMarkets(); }
    setProcessingIds((p) => { const n = new Set(p); n.delete(id); return n; });
  };

  const isOverdue = (endDateStr: string) => {
    if (!endDateStr) return false;
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999); 
    const now = new Date();
    return now > end;
  };

  const formatDate = (value: string | Date | null | undefined): string => {
    if (value == null) return "—";
    const d = value instanceof Date ? value : new Date(value as string);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  };

  const safeString = (v: unknown): string => v == null ? "" : typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  const safeNumber = (v: unknown): number => typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0;

  const getStatusBadge = (status: unknown) => {
    const s = safeString(status);
    switch (s) {
      case "pending": return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Pendiente</Badge>;
      case "active": return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Activo</Badge>;
      case "rejected": return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">Rechazado</Badge>;
      case "resolved": return <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/30">Finalizado</Badge>;
      default: return <Badge variant="outline">{s || "—"}</Badge>;
    }
  };

  const sortedMarkets = useMemo(() => {
    let filtered = markets.filter(market => {
      const matchesSearch = String(market.title || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "todos" || market.status === statusFilter;
      const matchesCategory = categoryFilter === "todas" || market.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });

    return filtered.sort((a, b) => {
      const aIsActive = a.status === 'active';
      const bIsActive = b.status === 'active';
      const aDate = new Date(a.end_date || 0);
      const bDate = new Date(b.end_date || 0);
      const aIsOverdue = isOverdue(a.end_date);
      const bIsOverdue = isOverdue(b.end_date);

      if (aIsActive && aIsOverdue && (!bIsActive || !bIsOverdue)) return -1;
      if (bIsActive && bIsOverdue && (!aIsActive || !aIsOverdue)) return 1;

      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;

      if (aIsActive && bIsActive) return aDate.getTime() - bDate.getTime();

      if (a.status === 'resolved' && b.status === 'resolved') {
        const aCreated = new Date(a.created_at || 0);
        const bCreated = new Date(b.created_at || 0);
        return bCreated.getTime() - aCreated.getTime(); 
      }
      return 0; 
    });
  }, [markets, searchQuery, statusFilter, categoryFilter]);

  if (isCheckingAuth) return <div className="min-h-screen flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader points={safeNumber(profile?.points ?? 10000)} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} onPointsUpdate={() => {}} userId={profile?.id ? String(profile.id) : null} userEmail={profile?.email != null ? String(profile.email) : null} onOpenAuthModal={() => {}} onSignOut={async () => { await createClient().auth.signOut(); router.replace("/"); }} isAdmin={true} username={profile?.username != null ? String(profile.username) : null} />

      <main className="container mx-auto px-4 py-8 flex-1">
        <div className="mb-6"><Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground"><Link href="/"><ArrowLeft className="w-4 h-4 mr-2" />Volver</Link></Button></div>
        
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <Badge className="mb-3 bg-primary/10 text-primary border-primary/20 font-bold uppercase tracking-widest text-[10px] px-3 py-1">ADMINISTRADOR</Badge>
            <h1 className="text-3xl md:text-4xl font-black mb-2 tracking-tight text-foreground">Centro de <span className="text-primary">Control</span></h1>
            <p className="text-muted-foreground text-base">Gestioná el ciclo de vida de los mercados de la plataforma.</p>
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)} className="shrink-0 bg-primary hover:bg-primary/90 h-12 w-full md:w-auto font-bold text-base shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"><Plus className="w-5 h-5 mr-2" /> Crear Mercado Rápido</Button>
        </div>

        {/* --- BARRA DE FILTROS REDISEÑADA Y OPTIMIZADA --- */}
        <div className="mb-8 flex flex-col lg:flex-row gap-4 p-2 bg-card/40 border border-border/50 rounded-2xl shadow-sm backdrop-blur-xl">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input 
              placeholder="Buscar mercado por pregunta..." 
              className="pl-12 h-12 bg-background/60 border-border/50 rounded-xl text-base w-full focus-visible:ring-primary font-medium" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-12 bg-background/60 border-border/50 rounded-xl w-full sm:w-[200px] font-bold text-foreground">
                <div className="flex items-center"><Filter className="w-4 h-4 mr-2 text-primary" /><SelectValue placeholder="Estado" /></div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/50">
                <SelectItem value="todos" className="font-medium h-10">Todos los Estados</SelectItem>
                <SelectItem value="active" className="font-medium h-10">🟢 Activos</SelectItem>
                <SelectItem value="pending" className="font-medium h-10">🟠 Pendientes</SelectItem>
                <SelectItem value="resolved" className="font-medium h-10">⚪ Resueltos</SelectItem>
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-12 bg-background/60 border-border/50 rounded-xl w-full sm:w-[200px] font-bold text-foreground">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/50">
                <SelectItem value="todas" className="font-medium h-10">Todas las Categorías</SelectItem>
                <SelectItem value="política" className="font-medium h-10">Política</SelectItem>
                <SelectItem value="deportes" className="font-medium h-10">Deportes</SelectItem>
                <SelectItem value="finanzas" className="font-medium h-10">Finanzas</SelectItem>
                <SelectItem value="cripto" className="font-medium h-10">Cripto</SelectItem>
                <SelectItem value="entretenimiento" className="font-medium h-10">Entretenimiento</SelectItem>
                <SelectItem value="música" className="font-medium h-10">Música</SelectItem>
                <SelectItem value="tecnología" className="font-medium h-10">Tecnología</SelectItem>
                <SelectItem value="ciencia" className="font-medium h-10">Ciencia</SelectItem>
                <SelectItem value="clima" className="font-medium h-10">Clima</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* VISTA DESKTOP: TABLA */}
            <div className="hidden md:block rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 border-b-border/50">
                    <TableHead className="font-bold text-foreground">Pregunta</TableHead>
                    <TableHead className="font-bold text-foreground">Categoría</TableHead>
                    <TableHead className="font-bold text-foreground">Estado</TableHead>
                    <TableHead className="font-bold text-foreground">Cierre</TableHead>
                    <TableHead className="font-bold text-foreground">Volumen</TableHead>
                    <TableHead className="text-right font-bold text-foreground">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMarkets.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-16 text-muted-foreground font-medium">No se encontraron mercados con esos filtros.</TableCell></TableRow>
                  ) : (
                    sortedMarkets.map((market) => {
                      const overdue = isOverdue(market.end_date) && market.status === 'active';
                      return (
                        <TableRow key={String(market.id)} className={cn("transition-colors", market.status === 'resolved' ? 'opacity-60 bg-muted/10' : overdue ? 'bg-red-500/5' : '')}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {market.image_url ? <img src={String(market.image_url)} alt="Miniatura" className="w-12 h-12 rounded-lg object-cover border border-border/50 shrink-0" /> : <div className="w-12 h-12 rounded-lg bg-muted/50 border border-border/50 flex items-center justify-center shrink-0"><ImageIcon className="w-5 h-5 text-muted-foreground/50" /></div>}
                              <p className={cn("font-semibold text-foreground line-clamp-2 max-w-[350px] leading-snug", overdue && "text-red-500 dark:text-red-400")}>{safeString(market.title)}</p>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="secondary" className="font-bold capitalize bg-muted text-muted-foreground border-border/50">{safeString(market.category)}</Badge></TableCell>
                          <TableCell>{getStatusBadge(market.status)}</TableCell>
                          <TableCell>
                            <span className={cn("font-medium flex items-center gap-1.5", overdue ? "text-red-500 font-bold" : "text-muted-foreground")}>
                              {overdue && <Clock className="w-3.5 h-3.5" />} {formatDate(market.end_date)}
                            </span>
                          </TableCell>
                          <TableCell className="text-foreground font-black">{safeNumber(market.total_volume).toLocaleString()} pts</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button size="icon" variant="outline" className="h-9 w-9 hover:text-primary transition-colors bg-background" onClick={() => setEditingMarket(market)}><Pencil className="w-4 h-4" /></Button>

                              {market.status === "pending" && (
                                <>
                                  <Button size="sm" onClick={() => handleApprove(market.id)} disabled={processingIds.has(market.id)} className="h-9 px-3 font-bold">{processingIds.has(market.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Aprobar</>}</Button>
                                  <Button size="icon" variant="destructive" onClick={() => handleReject(market.id)} disabled={processingIds.has(market.id)} className="h-9 w-9">{processingIds.has(market.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}</Button>
                                </>
                              )}
                              
                              {market.status === "active" && (
                                <Button 
                                  size="sm" 
                                  variant={overdue ? "default" : "outline"}
                                  className={cn("font-bold h-9 transition-all", overdue ? "bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-500/20 animate-pulse" : "border-primary text-primary hover:bg-primary hover:text-primary-foreground")} 
                                  onClick={() => { setResolvingMarket(market); setSelectedWinningOption(""); }} 
                                  disabled={processingIds.has(market.id)}
                                >
                                  <Trophy className="w-4 h-4 mr-1.5" /> {overdue ? "Resolver YA" : "Resolver"}
                                </Button>
                              )}

                              {market.status !== "pending" && (
                                <Button size="icon" variant="destructive" className="h-9 w-9 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20" onClick={() => setDeletingMarket({ id: market.id, title: String(market.title) })} disabled={processingIds.has(market.id)}>
                                  {processingIds.has(market.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* VISTA MOBILE: TARJETAS */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {sortedMarkets.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground bg-card rounded-xl border border-border/50 font-medium">No se encontraron mercados.</div>
              ) : (
                sortedMarkets.map((market) => {
                  const overdue = isOverdue(market.end_date) && market.status === 'active';
                  return (
                    <div key={String(market.id)} className={cn("p-4 rounded-xl border bg-card flex flex-col gap-4 shadow-sm transition-colors", market.status === 'resolved' ? 'opacity-70 bg-muted/20 border-border/50' : overdue ? 'border-red-500/50 bg-red-500/5' : 'border-border/50')}>
                      
                      <div className="flex items-start gap-3">
                        {market.image_url ? (
                          <img src={String(market.image_url)} alt="Miniatura" className="w-14 h-14 rounded-lg object-cover border border-border/50 shrink-0" />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-muted border border-border/50 flex items-center justify-center shrink-0">
                            <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
                          </div>
                        )}
                        <h3 className={cn("font-bold text-foreground text-sm leading-snug line-clamp-3", overdue && "text-red-500 dark:text-red-400")}>{safeString(market.title)}</h3>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm bg-background/50 p-3 rounded-lg border border-border/50">
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Categoría</span>
                          <Badge variant="secondary" className="w-fit font-bold capitalize text-xs bg-muted text-muted-foreground">{safeString(market.category)}</Badge>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Estado</span>
                          <div>{getStatusBadge(market.status)}</div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Cierre</span>
                          <span className={cn("font-semibold flex items-center gap-1.5", overdue ? "text-red-500 font-bold" : "text-foreground")}>
                            {overdue && <Clock className="w-3 h-3" />} {formatDate(market.end_date)}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Volumen</span>
                          <span className="font-black text-foreground">{safeNumber(market.total_volume).toLocaleString()} pts</span>
                        </div>
                      </div>

                      <div className="pt-2 flex items-center gap-2">
                        <Button size="icon" variant="outline" className="h-11 w-11 shrink-0 hover:text-primary bg-background" onClick={() => setEditingMarket(market)}>
                          <Pencil className="w-5 h-5" />
                        </Button>

                        {market.status === "pending" && (
                          <>
                            <Button size="sm" onClick={() => handleApprove(market.id)} disabled={processingIds.has(market.id)} className="flex-1 h-11 font-bold text-base">
                              {processingIds.has(market.id) ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-5 h-5 mr-1.5" /> Aprobar</>}
                            </Button>
                            <Button size="icon" variant="destructive" onClick={() => handleReject(market.id)} disabled={processingIds.has(market.id)} className="h-11 w-11 shrink-0">
                              {processingIds.has(market.id) ? <Loader2 className="w-5 h-5 animate-spin" /> : <XCircle className="w-5 h-5" />}
                            </Button>
                          </>
                        )}

                        {market.status === "active" && (
                          <Button 
                            size="sm" 
                            variant={overdue ? "default" : "outline"}
                            className={cn("flex-1 h-11 font-bold text-base transition-all", overdue ? "bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-500/20 animate-pulse" : "border-primary text-primary hover:bg-primary hover:text-primary-foreground")} 
                            onClick={() => { setResolvingMarket(market); setSelectedWinningOption(""); }} 
                            disabled={processingIds.has(market.id)}
                          >
                            <Trophy className="w-5 h-5 mr-1.5" /> {overdue ? "Resolver YA" : "Resolver"}
                          </Button>
                        )}

                        {market.status !== "pending" && (
                          <Button size="icon" variant="destructive" className="h-11 w-11 shrink-0 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20" onClick={() => setDeletingMarket({ id: market.id, title: String(market.title) })} disabled={processingIds.has(market.id)}>
                            {processingIds.has(market.id) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* MODALES MANTIENEN SU CÓDIGO ORIGINAL */}
        <Dialog open={!!deletingMarket} onOpenChange={(open) => !open && setDeletingMarket(null)}>
          <DialogContent className="w-[90vw] max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-red-500 text-xl font-black">¿Eliminar y Reembolsar?</DialogTitle>
              <DialogDescription className="text-base pt-2 text-foreground">Se borrará de forma permanente <strong>"{deletingMarket?.title}"</strong> y se devolverá la plata a los usuarios. Esta acción no se puede deshacer.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0 mt-4">
              <Button variant="outline" onClick={() => setDeletingMarket(null)} className="h-12 w-full sm:w-auto font-bold text-base">Cancelar</Button>
              <Button variant="destructive" onClick={confirmDelete} className="h-12 w-full sm:w-auto font-bold text-base">Sí, Eliminar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!resolvingMarket} onOpenChange={(open) => !open && setResolvingMarket(null)}>
          <DialogContent className="w-[90vw] max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-black"><Trophy className="w-6 h-6 text-primary" /> Declarar Ganador</DialogTitle>
              <DialogDescription className="pt-2 text-base text-foreground">
                Elegí la opción ganadora para <strong>"{resolvingMarket?.title}"</strong>. Se repartirán los <strong className="text-amber-500">{(resolvingMarket?.total_volume || 0).toLocaleString()} pts</strong> apostados.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label className="mb-3 block font-bold text-muted-foreground uppercase tracking-wider text-xs">Opción Ganadora</Label>
              <Select value={selectedWinningOption} onValueChange={setSelectedWinningOption}>
                <SelectTrigger className="h-14 text-base font-bold">
                  <SelectValue placeholder="Seleccioná al ganador..." />
                </SelectTrigger>
                <SelectContent>
                  {resolvingMarket?.market_options?.map(opt => (
                    <SelectItem key={opt.id} value={opt.id} className="h-12 text-base font-medium cursor-pointer">{opt.option_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 sm:gap-0 mt-2">
              <Button variant="outline" onClick={() => setResolvingMarket(null)} className="h-12 w-full sm:w-auto font-bold text-base">Cancelar</Button>
              <Button 
                onClick={confirmResolve} 
                disabled={!selectedWinningOption} 
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-black h-12 w-full sm:w-auto text-base shadow-md"
              >
                Confirmar Resolución
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
           <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black">Crear Mercado Inmediato</DialogTitle>
              <DialogDescription className="text-base">
                Los mercados creados por el Administrador pasan directamente a estado Activo para apostar.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit} className="space-y-5 pt-2">
              <div className="space-y-2">
                <Label className="font-bold">Pregunta</Label>
                <Input placeholder="Ej: ¿Boca ganará la Libertadores?" value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} required className="h-12 text-base bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label className="font-bold">Descripción (Opcional)</Label>
                <Textarea placeholder="Contexto de la apuesta..." value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} className="resize-none h-24 text-base bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label className="font-bold">Link de la Imagen (Opcional)</Label>
                <Input placeholder="https://ejemplo.com/foto.jpg" value={createForm.image_url} onChange={(e) => setCreateForm((f) => ({ ...f, image_url: e.target.value }))} className="h-12 text-base bg-muted/50" />
              </div>
              
              <div className="space-y-4 p-5 bg-muted/30 rounded-xl border border-border/50">
                <Label className="font-black text-base uppercase tracking-wider">Tipo de Mercado</Label>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <Button type="button" className="h-12 font-bold shadow-sm" variant={createForm.marketType === "binary" ? "default" : "outline"} onClick={() => setCreateForm(f => ({ ...f, marketType: "binary" }))}>Sí / No</Button>
                  <Button type="button" className="h-12 font-bold shadow-sm" variant={createForm.marketType === "multiple" ? "default" : "outline"} onClick={() => setCreateForm(f => ({ ...f, marketType: "multiple" }))}>Múltiples</Button>
                </div>

                {createForm.marketType === "multiple" && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300 bg-background p-4 rounded-xl border border-border/50 shadow-inner">
                    <Label className="text-sm font-bold text-muted-foreground block mb-2 uppercase tracking-wider">Opciones posibles (mínimo 2):</Label>
                    {createForm.options.map((option, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <div className="w-6 text-center text-sm font-bold text-muted-foreground">{index + 1}.</div>
                        <Input placeholder={index === 0 ? "Ej: Real Madrid" : index === 1 ? "Ej: Manchester City" : "Otra opción..."} value={option} onChange={(e) => handleOptionChange(index, e.target.value)} className="flex-1 h-12 text-base font-medium" />
                        {createForm.options.length > 2 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(index)} className="h-12 w-12 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 shrink-0"><X className="w-5 h-5" /></Button>
                        )}
                      </div>
                    ))}
                    {createForm.options.length < 10 && (
                      <Button type="button" variant="outline" size="sm" onClick={addOption} className="w-full mt-2 h-12 border-dashed font-bold text-primary hover:bg-primary/5"><Plus className="w-5 h-5 mr-2" /> Agregar opción</Button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-bold">Categoría</Label>
                  <Select value={createForm.category} onValueChange={(v) => setCreateForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger className="h-12 text-base font-medium bg-muted/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="política" className="h-12 font-medium">Política</SelectItem>
                      <SelectItem value="deportes" className="h-12 font-medium">Deportes</SelectItem>
                      <SelectItem value="finanzas" className="h-12 font-medium">Finanzas</SelectItem>
                      <SelectItem value="cripto" className="h-12 font-medium">Cripto</SelectItem>
                      <SelectItem value="tecnología" className="h-12 font-medium">Tecnología</SelectItem>
                      <SelectItem value="ciencia" className="h-12 font-medium">Ciencia</SelectItem>
                      <SelectItem value="clima" className="h-12 font-medium">Clima</SelectItem>
                      <SelectItem value="entretenimiento" className="h-12 font-medium">Entretenimiento</SelectItem>
                      <SelectItem value="música" className="h-12 font-medium">Música</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">Fecha de Cierre</Label>
                  <Input type="date" value={createForm.end_date} onChange={(e) => setCreateForm((f) => ({ ...f, end_date: e.target.value }))} required className="h-12 text-base font-medium bg-muted/50" />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0 mt-6 pt-4 border-t border-border/50">
                <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)} className="h-12 w-full sm:w-auto font-bold text-base">Cancelar</Button>
                <Button type="submit" disabled={isCreating} className="h-12 w-full sm:w-auto font-bold text-base shadow-md">{isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Publicar Activo"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editingMarket} onOpenChange={(open) => !open && setEditingMarket(null)}>
          <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black">Editar mercado</DialogTitle>
              <DialogDescription className="text-base text-foreground">Corregí errores de tipeo en las preguntas o en las opciones.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-5 pt-2">
              <div className="space-y-2">
                <Label className="font-bold">Pregunta</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} required className="h-12 text-base font-medium bg-muted/50" />
              </div>
              
              <div className="space-y-3 p-5 bg-muted/30 rounded-xl border border-border/50">
                <Label className="font-black text-base uppercase tracking-wider mb-2 block">Editar opciones</Label>
                {editForm.options.map((opt, index) => (
                  <div key={opt.id} className="flex items-center gap-3">
                    <span className="w-6 text-sm font-black text-muted-foreground">{index + 1}.</span>
                    <Input 
                      value={opt.option_name} 
                      className="h-12 text-base font-medium flex-1 bg-background"
                      onChange={(e) => {
                        const newOpts = [...editForm.options];
                        newOpts[index].option_name = e.target.value;
                        setEditForm(f => ({ ...f, options: newOpts }));
                      }} 
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label className="font-bold">Link de la Imagen (Opcional)</Label>
                <Input placeholder="https://ejemplo.com/foto.jpg" value={editForm.image_url} onChange={(e) => setEditForm((f) => ({ ...f, image_url: e.target.value }))} className="h-12 text-base font-medium bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label className="font-bold">Categoría</Label>
                <Select value={editForm.category} onValueChange={(v) => setEditForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-12 text-base font-medium bg-muted/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="política" className="h-12 font-medium">Política</SelectItem>
                    <SelectItem value="deportes" className="h-12 font-medium">Deportes</SelectItem>
                    <SelectItem value="finanzas" className="h-12 font-medium">Finanzas</SelectItem>
                    <SelectItem value="cripto" className="h-12 font-medium">Cripto</SelectItem>
                    <SelectItem value="tecnología" className="h-12 font-medium">Tecnología</SelectItem>
                    <SelectItem value="ciencia" className="h-12 font-medium">Ciencia</SelectItem>
                    <SelectItem value="clima" className="h-12 font-medium">Clima</SelectItem>
                    <SelectItem value="entretenimiento" className="h-12 font-medium">Entretenimiento</SelectItem>
                    <SelectItem value="música" className="h-12 font-medium">Música</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter className="gap-2 sm:gap-0 mt-6 pt-4 border-t border-border/50">
                <Button type="button" variant="outline" onClick={() => setEditingMarket(null)} className="h-12 w-full sm:w-auto font-bold text-base">Cancelar</Button>
                <Button type="submit" disabled={isSaving} className="h-12 w-full sm:w-auto font-bold text-base bg-primary hover:bg-primary/90 text-primary-foreground shadow-md">{isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Guardar Cambios"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}