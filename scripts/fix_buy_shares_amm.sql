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
  v_shares NUMERIC;
  v_market_id UUID;
  v_direction TEXT;
  v_option_name TEXT;
  v_k NUMERIC;
BEGIN
  -- 1. Validaciones básicas
  IF p_investment_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'El monto debe ser mayor a 0');
  END IF;

  -- 2. Obtener y bloquear el perfil del usuario para evitar race conditions
  SELECT * INTO v_user FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  IF v_user.points < p_investment_amount THEN
    RETURN json_build_object('success', false, 'error', 'Saldo de puntos insuficiente');
  END IF;

  -- 3. Obtener y bloquear la opción de mercado
  SELECT * INTO v_option FROM market_options WHERE id = p_market_option_id FOR UPDATE;
  IF v_option IS NULL OR v_option.is_eliminated THEN
    RETURN json_build_object('success', false, 'error', 'Opción de mercado no disponible o eliminada');
  END IF;

  v_market_id := v_option.market_id;
  v_option_name := v_option.option_name;

  -- Verificar estado del mercado
  SELECT * INTO v_market FROM markets WHERE id = v_market_id;
  IF v_market IS NULL OR v_market.status != 'active' THEN
    RETURN json_build_object('success', false, 'error', 'El mercado no está activo');
  END IF;

  -- 4. Matemática CPMM Exacta e Infalible
  v_py := COALESCE(v_option.pool_yes, 50000);
  v_pn := COALESCE(v_option.pool_no, 50000);
  
  IF v_py <= 0 OR v_pn <= 0 THEN
    v_py := 50000;
    v_pn := 50000;
  END IF;

  v_k := v_py * v_pn;

  IF p_buy_yes THEN
    v_direction := 'yes';
    -- MATEMÁTICA CPMM: Invertir en SÍ significa agregar la liquidez virtual al pool_no
    v_new_pn := v_pn + p_investment_amount;
    -- Restablecer el invariante k para hallar el nuevo pool_yes
    v_new_py := v_k / v_new_pn;
    -- Las acciones emitidas para el usuario son el exceso resultante (inversión original + liquidez previa - nueva liquidez)
    v_shares := (v_py + p_investment_amount) - v_new_py;
  ELSE
    v_direction := 'no';
    -- MATEMÁTICA CPMM: Invertir en NO significa agregar la liquidez virtual al pool_yes
    v_new_py := v_py + p_investment_amount;
    -- Restablecer el invariante k para hallar el nuevo pool_no
    v_new_pn := v_k / v_new_py;
    -- Las acciones emitidas para el usuario son el exceso resultante
    v_shares := (v_pn + p_investment_amount) - v_new_pn;
  END IF;

  IF v_shares <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Slippage extremo: Retorno de acciones inválido');
  END IF;

  -- 5. Actualizar el pool de liquidez
  UPDATE market_options
  SET 
    pool_yes = v_new_py,
    pool_no = v_new_pn,
    liquidity_k = v_k,
    total_votes = COALESCE(total_votes, 0) + p_investment_amount
  WHERE id = p_market_option_id;

  -- 6. Actualizar el volumen del mercado
  UPDATE markets
  SET total_volume = COALESCE(total_volume, 0) + p_investment_amount,
      updated_at = NOW()
  WHERE id = v_market_id;

  -- 7. Deducir puntos del usuario
  UPDATE profiles
  SET points = points - ROUND(p_investment_amount)
  WHERE id = p_user_id;

  -- 8. Actualizar o insertar posesión en user_shares
  IF EXISTS (SELECT 1 FROM user_shares WHERE user_id = p_user_id AND market_option_id = p_market_option_id) THEN
    UPDATE user_shares
    SET 
      shares_yes_owned = COALESCE(shares_yes_owned, 0) + CASE WHEN p_buy_yes THEN v_shares ELSE 0 END,
      shares_no_owned = COALESCE(shares_no_owned, 0) + CASE WHEN NOT p_buy_yes THEN v_shares ELSE 0 END,
      updated_at = NOW()
    WHERE user_id = p_user_id AND market_option_id = p_market_option_id;
  ELSE
    INSERT INTO user_shares (user_id, market_option_id, shares_yes_owned, shares_no_owned)
    VALUES (
      p_user_id, 
      p_market_option_id, 
      CASE WHEN p_buy_yes THEN v_shares ELSE 0 END, 
      CASE WHEN NOT p_buy_yes THEN v_shares ELSE 0 END
    );
  END IF;

  -- 9. Registrar la apuesta
  INSERT INTO bets (user_id, market_id, outcome, direction, amount, shares, status)
  VALUES (p_user_id, v_market_id, p_market_option_id::text, v_direction, ROUND(p_investment_amount), v_shares, 'active');

  -- 10. Registrar en transacciones
  INSERT INTO transactions (user_id, market_id, outcome, direction, type, amount, shares, description)
  VALUES (
    p_user_id, 
    v_market_id,
    p_market_option_id::text,
    v_direction,
    'buy', 
    ROUND(p_investment_amount), 
    v_shares, 
    'Compró ' || ROUND(v_shares, 2) || CASE WHEN p_buy_yes THEN ' acciones de SÍ en "' ELSE ' acciones de NO en "' END || v_option_name || '"'
  );

  RETURN json_build_object(
    'success', true,
    'shares', v_shares,
    'avg_price', p_investment_amount / v_shares
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
