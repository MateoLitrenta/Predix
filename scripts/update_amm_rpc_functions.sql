-- Migración SQL al Motor LMSR (Liquidez Compartida)
-- Con factorizaciones log-sum-exp para prevención absoluta de Overflows

DROP FUNCTION IF EXISTS public.buy_shares_amm(uuid, uuid, numeric, boolean);
DROP FUNCTION IF EXISTS public.buy_shares_amm(uuid, uuid, integer, boolean);
DROP FUNCTION IF EXISTS public.sell_shares_amm(uuid, uuid, numeric, boolean);
DROP FUNCTION IF EXISTS public.sell_shares_amm(uuid, uuid, integer, boolean);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_shares' AND column_name='updated_at') THEN
        ALTER TABLE user_shares ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.buy_shares_amm(
  p_user_id UUID,
  p_market_option_id UUID,
  p_investment_amount NUMERIC,
  p_buy_yes BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user profiles;
  v_option market_options;
  v_market markets;
  v_b NUMERIC;
  v_M NUMERIC;
  v_S NUMERIC;
  v_S_minus_k NUMERIC;
  v_I_b NUMERIC;
  v_Q_k NUMERIC;
  v_A NUMERIC;
  v_B NUMERIC;
  v_prob NUMERIC;
  v_shares NUMERIC;
  v_market_id UUID;
  v_direction TEXT;
  v_option_name TEXT;
  v_new_py NUMERIC;
  v_new_pn NUMERIC;
  rec RECORD;
BEGIN
  IF p_investment_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'El monto de inversión debe ser positivo');
  END IF;

  SELECT * INTO v_user FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  IF v_user.points < p_investment_amount THEN
    RETURN json_build_object('success', false, 'error', 'Saldo de puntos insuficiente');
  END IF;

  SELECT * INTO v_option FROM market_options WHERE id = p_market_option_id FOR UPDATE;
  IF v_option IS NULL OR v_option.is_eliminated THEN
    RETURN json_build_object('success', false, 'error', 'Opción de mercado no disponible o eliminada');
  END IF;

  v_market_id := v_option.market_id;
  v_option_name := v_option.option_name;

  SELECT * INTO v_market FROM markets WHERE id = v_market_id;
  IF v_market IS NULL OR v_market.status != 'active' THEN
    RETURN json_build_object('success', false, 'error', 'El mercado no está activo');
  END IF;

  v_b := COALESCE(v_market.liquidity_b, 100000);
  
  -- Prevenir que otras transacciones alteren opciones de este mercado al mismo tiempo
  PERFORM * FROM market_options WHERE market_id = v_market_id FOR UPDATE;

  -- 1. Matemática LMSR con Log-Sum-Exp Trick
  SELECT COALESCE(MAX(lmsr_q / v_b), 0) INTO v_M 
  FROM market_options WHERE market_id = v_market_id AND is_eliminated = false;

  SELECT 
    COALESCE(SUM(EXP(lmsr_q / v_b - v_M)), 0),
    COALESCE(SUM(CASE WHEN id != p_market_option_id THEN EXP(lmsr_q / v_b - v_M) ELSE 0 END), 0)
  INTO v_S, v_S_minus_k
  FROM market_options WHERE market_id = v_market_id AND is_eliminated = false;

  v_I_b := p_investment_amount / v_b;
  v_Q_k := v_option.lmsr_q / v_b;

  IF p_buy_yes THEN
    v_direction := 'yes';
    -- Fórmula sin overflow para YES
    v_A := EXP(v_Q_k - v_M) + (1.0 - EXP(-v_I_b)) * v_S_minus_k;
    v_shares := v_b * (v_I_b + v_M + LN(v_A) - v_Q_k);
    
    UPDATE market_options SET lmsr_q = lmsr_q + v_shares, total_votes = COALESCE(total_votes, 0) + p_investment_amount 
    WHERE id = p_market_option_id;
  ELSE
    v_direction := 'no';
    -- Fórmula sin overflow para NO
    v_B := (1.0 - EXP(-v_I_b)) * EXP(v_Q_k - v_M) + v_S_minus_k;
    v_shares := v_b * (v_I_b + LN(v_B) - LN(v_S_minus_k));
    
    UPDATE market_options SET lmsr_q = lmsr_q + v_shares 
    WHERE market_id = v_market_id AND is_eliminated = false AND id != p_market_option_id;
    
    UPDATE market_options SET total_votes = COALESCE(total_votes, 0) + p_investment_amount 
    WHERE id = p_market_option_id;
  END IF;

  IF v_shares <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Cálculo de acciones inválido');
  END IF;

  -- 2. Actualizar probabilidades (Fake CPMM Pools) para compatibilidad Frontend
  SELECT COALESCE(MAX(lmsr_q / v_b), 0) INTO v_M FROM market_options WHERE market_id = v_market_id AND is_eliminated = false;
  SELECT COALESCE(SUM(EXP(lmsr_q / v_b - v_M)), 0) INTO v_S FROM market_options WHERE market_id = v_market_id AND is_eliminated = false;
  
  FOR rec IN SELECT id, lmsr_q FROM market_options WHERE market_id = v_market_id AND is_eliminated = false LOOP
    v_prob := EXP(rec.lmsr_q / v_b - v_M) / v_S;
    
    UPDATE market_options 
    SET pool_no = ROUND(v_prob * 1000000), 
        pool_yes = ROUND((1.0 - v_prob) * 1000000)
    WHERE id = rec.id;
    
    IF rec.id = p_market_option_id THEN
      v_new_pn := ROUND(v_prob * 1000000);
      v_new_py := ROUND((1.0 - v_prob) * 1000000);
    END IF;
  END LOOP;

  UPDATE markets SET total_volume = COALESCE(total_volume, 0) + p_investment_amount, updated_at = NOW() WHERE id = v_market_id;
  UPDATE profiles SET points = points - ROUND(p_investment_amount) WHERE id = p_user_id;

  IF EXISTS (SELECT 1 FROM user_shares WHERE user_id = p_user_id AND market_option_id = p_market_option_id) THEN
    UPDATE user_shares
    SET 
      shares_yes_owned = COALESCE(shares_yes_owned, 0) + CASE WHEN p_buy_yes THEN v_shares ELSE 0 END,
      shares_no_owned = COALESCE(shares_no_owned, 0) + CASE WHEN NOT p_buy_yes THEN v_shares ELSE 0 END,
      updated_at = NOW()
    WHERE user_id = p_user_id AND market_option_id = p_market_option_id;
  ELSE
    INSERT INTO user_shares (user_id, market_option_id, shares_yes_owned, shares_no_owned)
    VALUES (p_user_id, p_market_option_id, CASE WHEN p_buy_yes THEN v_shares ELSE 0 END, CASE WHEN NOT p_buy_yes THEN v_shares ELSE 0 END);
  END IF;

  INSERT INTO bets (user_id, market_id, outcome, direction, amount, shares, status)
  VALUES (p_user_id, v_market_id, p_market_option_id::text, v_direction, ROUND(p_investment_amount), v_shares, 'active');

  INSERT INTO transactions (user_id, market_id, outcome, direction, type, amount, shares, description)
  VALUES (p_user_id, v_market_id, p_market_option_id::text, v_direction, 'buy', ROUND(p_investment_amount), v_shares, 
    'Compró ' || ROUND(v_shares, 2) || CASE WHEN p_buy_yes THEN ' acciones de SÍ en "' ELSE ' acciones de NO en "' END || v_option_name || '"');

  RETURN json_build_object('success', true, 'shares', ROUND(v_shares, 4), 'avg_price', ROUND((p_investment_amount / v_shares)::numeric, 4), 'new_pool_yes', ROUND(v_new_py, 4), 'new_pool_no', ROUND(v_new_pn, 4));
END;
$$;


CREATE OR REPLACE FUNCTION public.sell_shares_amm(
  p_user_id UUID,
  p_market_option_id UUID,
  p_shares_to_sell NUMERIC,
  p_sell_yes BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_option market_options;
  v_market markets;
  v_b NUMERIC;
  v_M NUMERIC;
  v_S NUMERIC;
  v_S_minus_k NUMERIC;
  v_y_b NUMERIC;
  v_Q_k NUMERIC;
  v_C NUMERIC;
  v_D NUMERIC;
  v_prob NUMERIC;
  v_payout NUMERIC;
  v_market_id UUID;
  v_direction TEXT;
  v_option_name TEXT;
  v_current_shares NUMERIC;
  v_new_py NUMERIC;
  v_new_pn NUMERIC;
  rec RECORD;
BEGIN
  IF p_shares_to_sell <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'La cantidad de acciones a vender debe ser positiva');
  END IF;

  SELECT * INTO v_option FROM market_options WHERE id = p_market_option_id FOR UPDATE;
  IF v_option IS NULL OR v_option.is_eliminated THEN
    RETURN json_build_object('success', false, 'error', 'Opción de mercado inválida o eliminada');
  END IF;

  v_market_id := v_option.market_id;
  v_option_name := v_option.option_name;

  SELECT * INTO v_market FROM markets WHERE id = v_market_id;
  IF v_market IS NULL OR v_market.status != 'active' THEN
    RETURN json_build_object('success', false, 'error', 'El mercado no está activo');
  END IF;

  IF p_sell_yes THEN
    SELECT COALESCE(shares_yes_owned, 0) INTO v_current_shares FROM user_shares WHERE user_id = p_user_id AND market_option_id = p_market_option_id;
    v_direction := 'yes';
  ELSE
    SELECT COALESCE(shares_no_owned, 0) INTO v_current_shares FROM user_shares WHERE user_id = p_user_id AND market_option_id = p_market_option_id;
    v_direction := 'no';
  END IF;

  IF v_current_shares IS NULL OR v_current_shares < p_shares_to_sell THEN
    RETURN json_build_object('success', false, 'error', 'No tienes suficientes acciones para vender');
  END IF;

  v_b := COALESCE(v_market.liquidity_b, 100000);
  PERFORM * FROM market_options WHERE market_id = v_market_id FOR UPDATE;

  -- 1. Matemática LMSR con Log-Sum-Exp Trick para el Payout
  SELECT COALESCE(MAX(lmsr_q / v_b), 0) INTO v_M FROM market_options WHERE market_id = v_market_id AND is_eliminated = false;
  
  SELECT 
    COALESCE(SUM(EXP(lmsr_q / v_b - v_M)), 0),
    COALESCE(SUM(CASE WHEN id != p_market_option_id THEN EXP(lmsr_q / v_b - v_M) ELSE 0 END), 0)
  INTO v_S, v_S_minus_k
  FROM market_options WHERE market_id = v_market_id AND is_eliminated = false;

  v_y_b := p_shares_to_sell / v_b;
  v_Q_k := v_option.lmsr_q / v_b;

  IF p_sell_yes THEN
    -- Fórmula sin overflow para venta de YES
    v_C := v_S_minus_k + EXP(v_Q_k - v_M - v_y_b);
    v_payout := v_b * (LN(v_S) - LN(v_C));
    
    UPDATE market_options SET lmsr_q = lmsr_q - p_shares_to_sell WHERE id = p_market_option_id;
  ELSE
    -- Fórmula sin overflow para venta de NO
    v_D := EXP(v_Q_k - v_M) + v_S_minus_k * EXP(-v_y_b);
    v_payout := v_b * (LN(v_S) - LN(v_D));
    
    UPDATE market_options SET lmsr_q = lmsr_q - p_shares_to_sell WHERE market_id = v_market_id AND is_eliminated = false AND id != p_market_option_id;
  END IF;

  IF v_payout <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Cálculo de retorno inválido');
  END IF;

  -- 2. Actualizar probabilidades Frontend
  SELECT COALESCE(MAX(lmsr_q / v_b), 0) INTO v_M FROM market_options WHERE market_id = v_market_id AND is_eliminated = false;
  SELECT COALESCE(SUM(EXP(lmsr_q / v_b - v_M)), 0) INTO v_S FROM market_options WHERE market_id = v_market_id AND is_eliminated = false;
  
  FOR rec IN SELECT id, lmsr_q FROM market_options WHERE market_id = v_market_id AND is_eliminated = false LOOP
    v_prob := EXP(rec.lmsr_q / v_b - v_M) / v_S;
    
    UPDATE market_options 
    SET pool_no = ROUND(v_prob * 1000000), 
        pool_yes = ROUND((1.0 - v_prob) * 1000000)
    WHERE id = rec.id;
    
    IF rec.id = p_market_option_id THEN
      v_new_pn := ROUND(v_prob * 1000000);
      v_new_py := ROUND((1.0 - v_prob) * 1000000);
    END IF;
  END LOOP;

  UPDATE user_shares
  SET 
    shares_yes_owned = CASE WHEN p_sell_yes THEN shares_yes_owned - p_shares_to_sell ELSE shares_yes_owned END,
    shares_no_owned = CASE WHEN NOT p_sell_yes THEN shares_no_owned - p_shares_to_sell ELSE shares_no_owned END,
    updated_at = NOW()
  WHERE user_id = p_user_id AND market_option_id = p_market_option_id;

  UPDATE profiles SET points = points + ROUND(v_payout) WHERE id = p_user_id;

  INSERT INTO bets (user_id, market_id, outcome, direction, amount, shares, status)
  VALUES (p_user_id, v_market_id, p_market_option_id::text, v_direction, ROUND(v_payout), p_shares_to_sell, 'sold');

  INSERT INTO transactions (user_id, market_id, outcome, direction, type, amount, shares, description)
  VALUES (p_user_id, v_market_id, p_market_option_id::text, v_direction, 'sell', ROUND(v_payout), p_shares_to_sell, 
    'Vendió ' || ROUND(p_shares_to_sell, 2) || CASE WHEN p_sell_yes THEN ' acciones de SÍ en "' ELSE ' acciones de NO en "' END || v_option_name || '"');

  RETURN json_build_object('success', true, 'payout', ROUND(v_payout, 4), 'avg_price', ROUND((v_payout / p_shares_to_sell)::numeric, 4), 'new_pool_yes', ROUND(v_new_py, 4), 'new_pool_no', ROUND(v_new_pn, 4));
END;
$$;
