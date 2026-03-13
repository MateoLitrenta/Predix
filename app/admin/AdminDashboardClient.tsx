"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getProfile, getAdminMarkets, approveMarket, rejectMarket, resolveMarket, updateMarket, deleteMarket } from "@/lib/actions";
import type { ProfileResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { NavHeader } from "@/components/nav-header";
import { Button } from "@/components/ui/button";
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
import { Loader2, CheckCircle2, XCircle, Flag, ArrowLeft, Pencil, Calendar, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Market {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  yes_votes: number;
  no_votes: number;
  end_date: string;
  created_at: string;
  created_by: string;
  total_volume: number;
  winning_outcome?: string | null;
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
  const [editForm, setEditForm] = useState({ title: "", description: "", category: "", end_date: "" });
  
  // Estados para las confirmaciones peligrosas
  const [resolvingMarket, setResolvingMarket] = useState<{ id: string, outcome: 'yes' | 'no', title: string } | null>(null);
  const [deletingMarket, setDeletingMarket] = useState<{ id: string, title: string } | null>(null);

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
    const result = await getAdminMarkets();
    const { data, error } = result;
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

      // MÁGIA: TIEMPO REAL
      const channel = supabase
        .channel("admin-markets")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "markets" },
          () => {
            fetchMarkets();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
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
    });
    setIsSaving(false);
    
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    } else {
      toast({ title: "Mercado actualizado", description: "Los cambios se guardaron." });
      setEditingMarket(null);
      await fetchMarkets();
    }
  };

  const handleApprove = async (marketId: string) => {
    setProcessingIds((p) => new Set(p).add(marketId));
    const { error } = await approveMarket(marketId);
    
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    } else {
      toast({ title: "Aprobado", description: "El mercado ya está público y el creador fue recompensado." });
      await fetchMarkets();
    }
    setProcessingIds((p) => { const n = new Set(p); n.delete(marketId); return n; });
  };

  const handleReject = async (marketId: string) => {
    setProcessingIds((p) => new Set(p).add(marketId));
    const { error } = await rejectMarket(marketId);
    
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    } else {
      await fetchMarkets();
    }
    setProcessingIds((p) => { const n = new Set(p); n.delete(marketId); return n; });
  };

  const confirmResolve = async () => {
    if (!resolvingMarket) return;
    const { id, outcome } = resolvingMarket;
    setProcessingIds((p) => new Set(p).add(id));
    setResolvingMarket(null);
    
    const { error } = await resolveMarket(id, outcome);
    
    if (error) {
      toast({ title: "Error al resolver", description: error, variant: "destructive" });
    } else {
      toast({ title: "Mercado Finalizado", description: `Se repartieron los puntos a los ganadores.` });
      await fetchMarkets();
    }
    setProcessingIds((p) => { const n = new Set(p); n.delete(id); return n; });
  };

  const confirmDelete = async () => {
    if (!deletingMarket) return;
    const { id } = deletingMarket;
    setProcessingIds((p) => new Set(p).add(id));
    setDeletingMarket(null);
    
    const { error } = await deleteMarket(id);
    
    if (error) {
      toast({ title: "Error al eliminar", description: error, variant: "destructive" });
    } else {
      toast({ title: "Mercado Eliminado", description: "Se borró el mercado y se reembolsaron los puntos." });
      await fetchMarkets();
    }
    setProcessingIds((p) => { const n = new Set(p); n.delete(id); return n; });
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
    const statusOrder: Record<string, number> = { pending: 1, active: 2, resolved: 3, rejected: 4 };
    return [...markets].sort((a, b) => {
       const orderA = statusOrder[String(a.status)] || 99;
       const orderB = statusOrder[String(b.status)] || 99;
       if (orderA !== orderB) return orderA - orderB;
       return new Date(a.end_date || 0).getTime() - new Date(b.end_date || 0).getTime();
    });
  }, [markets]);

  if (isCheckingAuth) return <div className="min-h-screen flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <NavHeader
        points={safeNumber(profile?.points ?? 10000)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onPointsUpdate={() => {}}
        userId={profile?.id ? String(profile.id) : null}
        userEmail={profile?.email != null ? String(profile.email) : null}
        onOpenAuthModal={() => {}}
        onSignOut={async () => { await createClient().auth.signOut(); router.replace("/"); }}
        isAdmin={true}
        username={profile?.username != null ? String(profile.username) : null}
      />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6"><Button variant="ghost" size="sm" asChild><Link href="/"><ArrowLeft className="w-4 h-4 mr-2" />Volver</Link></Button></div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Panel de <span className="text-primary">Administración</span></h1>
          <p className="text-muted-foreground text-lg">Aprobá propuestas y resolvé mercados en vivo.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pregunta</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Cierre</TableHead>
                  <TableHead>Volumen</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMarkets.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No hay mercados</TableCell></TableRow>
                ) : (
                  sortedMarkets.map((market) => (
                    <TableRow key={String(market.id)} className={market.status === 'resolved' ? 'opacity-70 bg-muted/10' : ''}>
                      <TableCell>
                        <p className="font-medium text-foreground">{safeString(market.title)}</p>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="font-normal capitalize">{safeString(market.category)}</Badge></TableCell>
                      <TableCell>{getStatusBadge(market.status)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(market.end_date)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {safeNumber(market.total_volume).toLocaleString()} pts<br/>
                        <span className="text-xs">SÍ {safeNumber(market.yes_votes)} / NO {safeNumber(market.no_votes)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          
                          {/* El botón de Editar aparece para TODOS */}
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setEditingMarket(market)}>
                            <Pencil className="w-4 h-4" />
                          </Button>

                          {market.status === "pending" && (
                            <>
                              <Button size="sm" onClick={() => handleApprove(market.id)} disabled={processingIds.has(market.id)}>
                                {processingIds.has(market.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleReject(market.id)} disabled={processingIds.has(market.id)}>
                                {processingIds.has(market.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                              </Button>
                            </>
                          )}
                          
                          {market.status === "active" && (
                            <>
                              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setResolvingMarket({ id: market.id, outcome: "yes", title: String(market.title) })} disabled={processingIds.has(market.id)}>
                                Ganó SÍ
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => setResolvingMarket({ id: market.id, outcome: "no", title: String(market.title) })} disabled={processingIds.has(market.id)}>
                                Ganó NO
                              </Button>
                            </>
                          )}

                          {/* Botón de Borrar (Tachito Rojo) para Activos, Rechazados y Finalizados */}
                          {market.status !== "pending" && (
                            <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => setDeletingMarket({ id: market.id, title: String(market.title) })} disabled={processingIds.has(market.id)}>
                              {processingIds.has(market.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </Button>
                          )}

                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Modal de Edición */}
        <Dialog open={!!editingMarket} onOpenChange={(open) => !open && setEditingMarket(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar mercado</DialogTitle>
              <DialogDescription>Modificá el título, descripción, categoría o fecha de cierre.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Pregunta</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select value={editForm.category} onValueChange={(v) => setEditForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="politica">Política</SelectItem>
                    <SelectItem value="deportes">Deportes</SelectItem>
                    <SelectItem value="finanzas">Finanzas</SelectItem>
                    <SelectItem value="entretenimiento">Entretenimiento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingMarket(null)}>Cancelar</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal Borrar */}
        <Dialog open={!!deletingMarket} onOpenChange={(open) => !open && setDeletingMarket(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-red-500">¿Eliminar y Reembolsar?</DialogTitle>
              <DialogDescription>
                Se borrará "{deletingMarket?.title}" y se devolverá la plata a los apostadores. Esto no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingMarket(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={confirmDelete}>Eliminar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Resolver */}
        <Dialog open={!!resolvingMarket} onOpenChange={(open) => !open && setResolvingMarket(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Confirmar Resultado?</DialogTitle>
              <DialogDescription>Declarar ganador al {resolvingMarket?.outcome === 'yes' ? 'SÍ' : 'NO'} para "{resolvingMarket?.title}". Se repartirán los puntos.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolvingMarket(null)}>Cancelar</Button>
              <Button onClick={confirmResolve} className={resolvingMarket?.outcome === 'yes' ? 'bg-green-600' : 'bg-red-600'}>Confirmar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}