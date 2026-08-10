DROP FUNCTION IF EXISTS eliminar_mercado(UUID);

CREATE OR REPLACE FUNCTION eliminar_mercado(p_market_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market markets;
  v_bet RECORD;
BEGIN
  -- Verificar si el mercado existe
  SELECT * INTO v_market FROM markets WHERE id = p_market_id;
  IF v_market IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mercado no encontrado');
  END IF;

  IF v_market.status = 'resolved' THEN
    RETURN json_build_object('success', false, 'error', 'No se puede eliminar un mercado finalizado');
  END IF;

  -- 1. REEMBOLSO: Devolver los puntos de las apuestas activas
  FOR v_bet IN 
    SELECT user_id, SUM(amount) as total_refund 
    FROM bets 
    WHERE market_id = p_market_id AND status = 'active'
    GROUP BY user_id
  LOOP
    UPDATE profiles 
    SET points = points + v_bet.total_refund 
    WHERE id = v_bet.user_id;
  END LOOP;

  -- 2. LIMPIEZA DE DEPENDENCIAS: 
  -- Borrar registros en un orden que respete las Foreign Keys
  
  -- Transacciones y Notificaciones asociadas al mercado
  DELETE FROM transactions WHERE market_id = p_market_id;
  DELETE FROM notifications WHERE market_id = p_market_id;
  
  -- Apuestas asociadas al mercado
  DELETE FROM bets WHERE market_id = p_market_id;

  -- Historial de opciones
  DELETE FROM market_option_history WHERE market_id = p_market_id;
  
  -- Shares de usuarios (tienen FK a market_options)
  DELETE FROM user_shares 
  WHERE market_option_id IN (SELECT id FROM market_options WHERE market_id = p_market_id);

  -- 3. ELIMINACIÓN PRINCIPAL
  -- Opciones del mercado
  DELETE FROM market_options WHERE market_id = p_market_id;

  -- Finalmente, eliminar el mercado
  DELETE FROM markets WHERE id = p_market_id;

  RETURN json_build_object('success', true, 'message', 'Mercado eliminado y puntos reembolsados correctamente');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
