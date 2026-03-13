"use server";

import { createClient } from "@/lib/supabase/server";

export type ProfileResult = {
  id: string;
  username: string | null;
  role: string | null;
  points: number;
  email?: string | null;
  full_name?: string | null;
  date_of_birth?: string | null;
} | null;

export async function getProfile(): Promise<ProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, role, points, full_name, date_of_birth")
    .eq("id", user.id)
    .single();

  if (error || !profile) return null;
  return { ...profile, email: user.email ?? null } as ProfileResult;
}

export type BetWithMarket = {
  id: string;
  user_id: string;
  market_id: string;
  amount: number;
  outcome: string;
  created_at?: string;
  /** Joined market (Supabase may return as "markets" or "market" depending on FK name). */
  markets?: { id: string; title: string; status: string; end_date?: string; winning_outcome?: string | null } | null;
  market?: { id: string; title: string; status: string; end_date?: string; winning_outcome?: string | null } | null;
};

/** Returns the current user's bets joined with market info. */
export async function getMyBets(): Promise<{ data: BetWithMarket[] | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data, error } = await supabase
    .from("bets")
    .select("*, markets(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as BetWithMarket[], error: null };
}

/** Returns ALL markets (pending, active, rejected, resolved) — no filter by status. */
export async function getAdminMarkets() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getAdminMarkets] Supabase error (p. ej. RLS):", error.message, error.code);
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

export async function approveMarket(marketId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("aprobar_mercado", { p_market_id: marketId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function rejectMarket(marketId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rechazar_mercado", { p_market_id: marketId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function deleteMarket(marketId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("eliminar_mercado", { p_market_id: marketId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function resolveMarket(marketId: string, outcome: "yes" | "no") {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolver_mercado", {
    p_market_id: marketId,
    p_outcome: outcome,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function updateMarket(
  marketId: string,
  params: { title: string; description: string | null; category: string; end_date: string }
) {
  const supabase = await createClient();
  const categoryNormalized = params.category
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const { error } = await supabase
    .from("markets")
    .update({
      title: params.title,
      description: params.description || null,
      category: categoryNormalized,
      end_date: params.end_date,
    })
    .eq("id", marketId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function createMarket(params: {
  title: string;
  description: string | null;
  category: string;
  end_date: string;
  created_by: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== params.created_by) {
    return { ok: false, error: "No autorizado" };
  }

  const categoryNormalized = params.category
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const { error } = await supabase.from("markets").insert({
    title: params.title,
    description: params.description || null,
    category: categoryNormalized,
    status: "pending",
    end_date: params.end_date,
    created_by: params.created_by,
    yes_votes: 0,
    no_votes: 0,
    total_volume: 0,
    yes_percentage: 50,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function claimDailyBonus(): Promise<{ ok: boolean; error: string | null; newPoints?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "No autenticado" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("points, last_bonus_claim")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, error: profileError?.message ?? "Perfil no encontrado" };
  }

  const BONUS_AMOUNT = 2000;
  const now = new Date();
  let canClaim = false;

  if (!profile.last_bonus_claim) {
    canClaim = true;
  } else {
    const last = new Date(profile.last_bonus_claim as string);
    const diffMs = now.getTime() - last.getTime();
    const isDifferentCalendarDay = now.toDateString() !== last.toDateString();

    if (isDifferentCalendarDay || diffMs >= 24 * 60 * 60 * 1000) {
      canClaim = true;
    }
  }

  if (!canClaim) {
    return {
      ok: false,
      error: "Ya reclamaste tu bonus diario. Volvé mañana.",
    };
  }

  const newPoints = (profile.points ?? 0) + BONUS_AMOUNT;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      points: newPoints,
      last_bonus_claim: now.toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // Guardar en el historial de transacciones
  await supabase.from("transactions").insert({
    user_id: user.id,
    amount: BONUS_AMOUNT,
    type: 'bonus',
    description: 'Bonus Diario'
  });

  return { ok: true, error: null, newPoints };
}

export async function updateProfileName(username: string) {
  const supabase = await createClient(); // <--- ACÁ ESTABA EL ERROR: faltaba el "await"
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { error } = await supabase
    .from("profiles")
    .update({ username })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { ok: true };
}

// --- BANCO Y TRANSACCIONES ---

export type Transaction = {
  id: string;
  amount: number;
  type: string;
  description: string;
  created_at: string;
};

export async function getMyTransactions(): Promise<{ data: Transaction[] | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data as Transaction[], error: null };
}

export async function registrarTransaccion(amount: number, type: string, description: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("transactions").insert({
    user_id: user.id,
    amount,
    type,
    description
  });
}

// --- NOTIFICACIONES ---

export async function deleteNotification(notificationId: string) {
  const supabase = await createClient();
  
  // Llamamos a nuestro Contrato Inteligente
  const { error } = await supabase.rpc("eliminar_notificacion", { 
    p_notification_id: notificationId 
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function updateUserPassword(newPassword: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}