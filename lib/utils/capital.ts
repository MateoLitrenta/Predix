import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Llama al RPC get_base_capitals para un único usuario y devuelve su capital base calculado en el motor de base de datos.
 * @param supabase Cliente de Supabase autenticado.
 * @param userId ID del perfil del usuario.
 * @param timeframe Filtro de tiempo ('ALL', '1D', '1W', '1M', '3M', '1Y').
 */
export async function getUserBaseCapital(
  supabase: SupabaseClient, 
  userId: string, 
  timeframe: string = 'ALL'
): Promise<number> {
  const { data, error } = await supabase.rpc('get_base_capitals', {
    p_user_ids: [userId],
    p_timeframe: timeframe
  });

  if (error || !data || data.length === 0) {
    console.error('Error fetching base capital:', error);
    return 10000; // Fallback seguro
  }

  return Number(data[0].base_capital);
}

/**
 * Llama al RPC get_base_capitals para múltiples usuarios a la vez, devolviendo un mapa de Capitales Base.
 * @param supabase Cliente de Supabase autenticado.
 * @param userIds Array de IDs de perfiles.
 * @param timeframe Filtro de tiempo ('ALL', '1D', '1W', '1M', '3M', '1Y').
 */
export async function getMultipleUsersBaseCapital(
  supabase: SupabaseClient, 
  userIds: string[], 
  timeframe: string = 'ALL'
): Promise<Record<string, number>> {
  if (!userIds || userIds.length === 0) return {};

  const { data, error } = await supabase.rpc('get_base_capitals', {
    p_user_ids: userIds,
    p_timeframe: timeframe
  });

  if (error || !data) {
    console.error('Error fetching multiple base capitals:', error);
    return {};
  }

  const map: Record<string, number> = {};
  for (const row of data) {
    map[row.user_id] = Number(row.base_capital);
  }
  
  return map;
}
