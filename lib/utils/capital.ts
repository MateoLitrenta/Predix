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
  if (!userId) return 10000;

  const { data, error } = await supabase.rpc('get_base_capitals', {
    p_user_ids: [userId],
    p_timeframe: timeframe
  });

  if (error) {
    console.error('Error fetching base capital:', error.message, error.details, error.hint);
    return 10000; // Fallback seguro
  }

  if (!data || data.length === 0) {
    return 10000;
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
  // Limpiar posibles nulos o vacíos que rompan el casteo a uuid[]
  const validIds = (userIds || []).filter(id => id && typeof id === 'string' && id.trim().length > 0);
  
  if (validIds.length === 0) return {};

  const { data, error } = await supabase.rpc('get_base_capitals', {
    p_user_ids: validIds,
    p_timeframe: timeframe
  });

  if (error) {
    console.error('Error fetching multiple base capitals:', error.message, error.details, error.hint);
    return {};
  }

  if (!data) return {};

  const map: Record<string, number> = {};
  for (const row of data) {
    map[row.user_id] = Number(row.base_capital);
  }
  
  return map;
}
