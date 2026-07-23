-- Migración SQL para corregir la resolución de mercados y distribución de premios (AMM)
-- Mantiene las propiedades ACID garantizando que todos los pagos se hagan en una sola transacción

DROP FUNCTION IF EXISTS public.resolve_market_amm(uuid, uuid);

CREATE OR REPLACE FUNCTION public.resolve_market_amm(
  p_market_id UUID,
  p_winning_option_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market markets;
  v_option_record RECORD;
  v_share_record RECORD;
  v_total_payout NUMERIC := 0;
  v_won_yes BOOLEAN;
  v_won_no BOOLEAN;
  v_payout_yes NUMERIC;
  v_payout_no NUMERIC;
BEGIN
  -- 1. Validar Mercado
  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;
  IF v_market IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mercado no encontrado');
  END IF;

  IF v_market.status = 'resolved' OR v_market.status = 'rejected' THEN
    RETURN json_build_object('success', false, 'error', 'El mercado ya fue resuelto o cancelado');
  END IF;

  -- 2. Cambiar estado del mercado
  UPDATE markets
  SET 
    status = 'resolved',
    winning_outcome = p_winning_option_id::text,
    resolved_at = NOW(),
    updated_at = NOW()
  WHERE id = p_market_id;

  -- 3. Iterar sobre TODAS las posiciones (user_shares) de las opciones de este mercado
  FOR v_share_record IN 
    SELECT 
      us.user_id,
      us.market_option_id,
      COALESCE(us.shares_yes_owned, 0) as shares_yes_owned,
      COALESCE(us.shares_no_owned, 0) as shares_no_owned,
      mo.option_name
    FROM user_shares us
    JOIN market_options mo ON us.market_option_id = mo.id
    WHERE mo.market_id = p_market_id 
      AND (COALESCE(us.shares_yes_owned, 0) > 0 OR COALESCE(us.shares_no_owned, 0) > 0)
    FOR UPDATE OF us
  LOOP
    
    -- Determinar ganadores
    IF v_share_record.market_option_id = p_winning_option_id THEN
      v_won_yes := TRUE;
      v_won_no := FALSE;
    ELSE
      v_won_yes := FALSE;
      v_won_no := TRUE;
    END IF;

    -- Calcular pagos (1 acción ganadora = $1.00)
    v_payout_yes := CASE WHEN v_won_yes THEN v_share_record.shares_yes_owned ELSE 0 END;
    v_payout_no := CASE WHEN v_won_no THEN v_share_record.shares_no_owned ELSE 0 END;

    -- Procesar YES shares
    IF v_share_record.shares_yes_owned > 0 THEN
      IF v_payout_yes > 0 THEN
        -- Acreditar puntos al usuario
        UPDATE profiles SET points = points + v_payout_yes WHERE id = v_share_record.user_id;
        v_total_payout := v_total_payout + v_payout_yes;
      END IF;

      -- Registrar transacción (Siempre type 'reward', amount = payout)
      INSERT INTO transactions (user_id, market_id, outcome, direction, type, amount, shares, description)
      VALUES (
        v_share_record.user_id, 
        p_market_id, 
        v_share_record.market_option_id::text,
        'yes',
        'reward', 
        v_payout_yes, 
        v_share_record.shares_yes_owned, 
        CASE WHEN v_won_yes THEN 'Ganó SÍ en "' ELSE 'Perdió SÍ en "' END || v_share_record.option_name || '"'
      );
    END IF;

    -- Procesar NO shares
    IF v_share_record.shares_no_owned > 0 THEN
      IF v_payout_no > 0 THEN
        -- Acreditar puntos al usuario
        UPDATE profiles SET points = points + v_payout_no WHERE id = v_share_record.user_id;
        v_total_payout := v_total_payout + v_payout_no;
      END IF;

      -- Registrar transacción
      INSERT INTO transactions (user_id, market_id, outcome, direction, type, amount, shares, description)
      VALUES (
        v_share_record.user_id, 
        p_market_id, 
        v_share_record.market_option_id::text,
        'no',
        'reward', 
        v_payout_no, 
        v_share_record.shares_no_owned, 
        CASE WHEN v_won_no THEN 'Ganó NO en "' ELSE 'Perdió NO en "' END || v_share_record.option_name || '"'
      );
    END IF;

    -- Vaciar las acciones del usuario (liquidación)
    UPDATE user_shares
    SET 
      shares_yes_owned = 0,
      shares_no_owned = 0
    WHERE user_id = v_share_record.user_id AND market_option_id = v_share_record.market_option_id;

  END LOOP;

  RETURN json_build_object(
    'success', true,
    'message', 'Mercado resuelto exitosamente',
    'total_payout_distributed', v_total_payout
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_market_amm TO authenticated, service_role;
