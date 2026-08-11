CREATE OR REPLACE FUNCTION buy_shares_amm(
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
  v_py NUMERIC;
  v_pn NUMERIC;
  v_new_py NUMERIC;
  v_new_pn NUMERIC;
  v_shares_bought NUMERIC;
  v_market_id UUID;
  v_direction TEXT;
  v_option_name TEXT;
  v_k NUMERIC;
BEGIN
  -- 1. Validaciones básicas
  IF p_investment_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'El monto debe ser mayor a 0');
  END IF;

  -- 2. Obtener y bloquear el perfil
  SELECT * INTO v_user FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  IF v_user.points < p_investment_amount THEN
    RETURN json_build_object('success', false, 'error', 'Saldo de puntos insuficiente');
  END IF;

  -- 3. Obtener y bloquear la opción
  SELECT * INTO v_option FROM market_options WHERE id = p_market_option_id FOR UPDATE;
  IF v_option IS NULL OR v_option.is_eliminated THEN
    RETURN json_build_object('success', false, 'error', 'Opción no disponible');
  END IF;

  v_market_id := v_option.market_id;
  v_option_name := v_option.option_name;

  SELECT * INTO v_market FROM markets WHERE id = v_market_id;
  IF v_market IS NULL OR v_market.status != 'active' THEN
    RETURN json_build_object('success', false, 'error', 'Mercado inactivo');
  END IF;

  -- 4. Matemática CPMM ESTRICTA (Aplicando la lógica solicitada para corregir variables cruzadas)
  v_py := COALESCE(v_option.pool_yes, 50000);
  v_pn := COALESCE(v_option.pool_no, 50000);
  IF v_py <= 0 OR v_pn <= 0 THEN
    v_py := 50000;
    v_pn := 50000;
  END IF;
  
  v_k := v_py * v_pn;

  IF p_buy_yes THEN
    v_direction := 'yes';
    -- ESTRICTAMENTE LOGICA PARA COMPRAR 'YES':
    -- El pool que recibe la inversión (y crece) es el pool_no
    v_new_pn := v_pn + p_investment_amount;
    
    -- El nuevo pool_yes se calcula con la constante k
    v_new_py := v_k / v_new_pn;
    
    -- Las acciones emitidas son la diferencia de liquidez más la inversión
    v_shares_bought := (v_py + p_investment_amount) - v_new_py;
  ELSE
    v_direction := 'no';
    -- ESTRICTAMENTE LOGICA PARA COMPRAR 'NO':
    -- Crece el pool_yes
    v_new_py := v_py + p_investment_amount;
    
    v_new_pn := v_k / v_new_py;
    
    v_shares_bought := (v_pn + p_investment_amount) - v_new_pn;
  END IF;

  IF v_shares_bought <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Cálculo de acciones inválido');
  END IF;

  -- 5. Actualizaciones de estado
  UPDATE market_options SET pool_yes = v_new_py, pool_no = v_new_pn, liquidity_k = v_k, total_votes = COALESCE(total_votes, 0) + p_investment_amount WHERE id = p_market_option_id;
  UPDATE markets SET total_volume = COALESCE(total_volume, 0) + p_investment_amount, updated_at = NOW() WHERE id = v_market_id;
  UPDATE profiles SET points = points - ROUND(p_investment_amount) WHERE id = p_user_id;

  IF EXISTS (SELECT 1 FROM user_shares WHERE user_id = p_user_id AND market_option_id = p_market_option_id) THEN
    UPDATE user_shares SET 
      shares_yes_owned = COALESCE(shares_yes_owned, 0) + CASE WHEN p_buy_yes THEN v_shares_bought ELSE 0 END,
      shares_no_owned = COALESCE(shares_no_owned, 0) + CASE WHEN NOT p_buy_yes THEN v_shares_bought ELSE 0 END,
      updated_at = NOW()
    WHERE user_id = p_user_id AND market_option_id = p_market_option_id;
  ELSE
    INSERT INTO user_shares (user_id, market_option_id, shares_yes_owned, shares_no_owned)
    VALUES (p_user_id, p_market_option_id, CASE WHEN p_buy_yes THEN v_shares_bought ELSE 0 END, CASE WHEN NOT p_buy_yes THEN v_shares_bought ELSE 0 END);
  END IF;

  INSERT INTO bets (user_id, market_id, outcome, direction, amount, shares, status)
  VALUES (p_user_id, v_market_id, p_market_option_id::text, v_direction, ROUND(p_investment_amount), v_shares_bought, 'active');

  INSERT INTO transactions (user_id, market_id, outcome, direction, type, amount, shares, description)
  VALUES (p_user_id, v_market_id, p_market_option_id::text, v_direction, 'buy', ROUND(p_investment_amount), v_shares_bought, 'Compró ' || ROUND(v_shares_bought, 2) || CASE WHEN p_buy_yes THEN ' acciones de SÍ' ELSE ' acciones de NO' END);

  RETURN json_build_object('success', true, 'shares', v_shares_bought, 'avg_price', p_investment_amount / v_shares_bought);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
