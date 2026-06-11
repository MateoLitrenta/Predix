import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  
  // Get all bets
  const { data: bets, error: betsError } = await supabase
    .from("bets")
    .select("*, markets(title)")
    .order("created_at", { ascending: false });

  // Get all transactions
  const { data: txs, error: txsError } = await supabase
    .from("transactions")
    .select("*, markets(title)")
    .order("created_at", { ascending: false });

  return NextResponse.json({
    bets,
    betsError,
    txs,
    txsError
  });
}
