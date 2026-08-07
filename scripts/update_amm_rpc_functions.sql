-- Migración SQL para unificar y corregir el motor CPMM en el Backend (Supabase Postgres)
-- Implementación infalible con constante dinámica k = pool_yes * pool_no

-- 1. Los 4 DROP FUNCTION IF EXISTS para evitar conflictos de firmas de retorno o argumentos
DROP FUNCTION IF EXISTS public.buy_shares_amm(uuid, uuid, numeric, boolean);
DROP FUNCTION IF EXISTS public.buy_shares_amm(uuid, uuid, integer, boolean);
DROP FUNCTION IF EXISTS public.sell_shares_amm(uuid, uuid, numeric, boolean);
DROP FUNCTION IF EXISTS public.sell_shares_amm(uuid, uuid, integer, boolean);

-- PARCHE: Asegurar que user_shares tenga la columna updated_at para el ordenamiento del portfolio
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
  v_py NUMERIC;
  v_pn NUMERIC;
  v_k NUMERIC;
  v_new_py NUMERIC;
  v_new_pn NUMERIC;
  v_shares NUMERIC;
  v_market_id UUID;
  v_direction TEXT;
  v_option_name TEXT;
BEGIN
  -- 1. Validar monto de inversión positivo
  IF p_investment_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'El monto de inversión debe ser positivo');
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

  -- 4. Matemática CPMM Exacta e Infalible con k dinámico
  v_py := COALESCE(v_option.pool_yes, 50000);
  v_pn := COALESCE(v_option.pool_no, 50000);
  
  IF v_py <= 0 OR v_pn <= 0 THEN
    v_py := 50000;
    v_pn := 50000;
  END IF;

  v_k := v_py * v_pn;

  IF p_buy_yes THEN
    v_direction := 'yes';
    -- Añadir colateral al pool NO y calcular target para YES
    v_new_pn := v_pn + p_investment_amount;
    v_new_py := v_k / v_new_pn;
    v_shares := (v_py + p_investment_amount) - v_new_py;
  ELSE
    v_direction := 'no';
    -- Añadir colateral al pool YES y calcular target para NO
    v_new_py := v_py + p_investment_amount;
    v_new_pn := v_k / v_new_py;
    v_shares := (v_pn + p_investment_amount) - v_new_pn;
  END IF;

  IF v_shares <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Cálculo de acciones inválido debido al slippage');
  END IF;

  -- 5. Actualizar el pool de liquidez y votos
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

  -- 7. Deducir puntos del perfil de usuario
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

  -- 9. Registrar la apuesta para historial
  INSERT INTO bets (user_id, market_id, outcome, direction, amount, shares, status)
  VALUES (p_user_id, v_market_id, p_market_option_id::text, v_direction, ROUND(p_investment_amount), v_shares, 'active');

  -- 10. Registrar en transacciones públicas
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
    'shares', ROUND(v_shares, 4),
    'avg_price', ROUND((p_investment_amount / v_shares)::numeric, 4),
    'new_pool_yes', ROUND(v_new_py, 4),
    'new_pool_no', ROUND(v_new_pn, 4)
  );
END;
$$;


-- 3. Función de venta AMM basada en CPMM Exacto (k = pool_yes * pool_no)
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
  v_py NUMERIC;
  v_pn NUMERIC;
  v_payout NUMERIC;
  v_new_py NUMERIC;
  v_new_pn NUMERIC;
  v_market_id UUID;
  v_direction TEXT;
  v_option_name TEXT;
  v_current_shares NUMERIC;
  v_sum NUMERIC;
  v_discriminant NUMERIC;
  v_k NUMERIC;
  v_spot_price NUMERIC;
BEGIN
  IF p_shares_to_sell <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'La cantidad de acciones a vender debe ser positiva');
  END IF;

  -- Obtener opción
  SELECT * INTO v_option FROM market_options WHERE id = p_market_option_id FOR UPDATE;
  IF v_option IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Opción no encontrada');
  END IF;

  v_market_id := v_option.market_id;
  v_option_name := v_option.option_name;

  -- Verificar posesión de acciones
  SELECT CASE WHEN p_sell_yes THEN COALESCE(shares_yes_owned, 0) ELSE COALESCE(shares_no_owned, 0) END
  INTO v_current_shares
  FROM user_shares
  WHERE user_id = p_user_id AND market_option_id = p_market_option_id FOR UPDATE;

  IF v_current_shares IS NULL OR v_current_shares < p_shares_to_sell THEN
    RETURN json_build_object('success', false, 'error', 'Acciones insuficientes para vender');
  END IF;

  v_py := COALESCE(v_option.pool_yes, 50000);
  v_pn := COALESCE(v_option.pool_no, 50000);
  IF v_py <= 0 OR v_pn <= 0 THEN
    v_py := 50000;
    v_pn := 50000;
  END IF;

  v_k := v_py * v_pn;
  v_sum := v_py + v_pn + p_shares_to_sell;

  IF p_sell_yes THEN
    v_direction := 'yes';
    v_discriminant := v_sum * v_sum - 4 * p_shares_to_sell * v_pn;
    IF v_discriminant < 0 THEN v_discriminant := 0; END IF;
    v_payout := (v_sum - SQRT(v_discriminant)) / 2;
    
    v_spot_price := v_pn / (v_py + v_pn);
    IF (v_payout / p_shares_to_sell) > v_spot_price THEN
       v_payout := p_shares_to_sell * v_spot_price;
    END IF;
    
    v_new_pn := v_pn - v_payout;
    IF v_new_pn <= 0 THEN
       RETURN json_build_object('success', false, 'error', 'Liquidez insuficiente en el pool (NO)');
    END IF;
    v_new_py := v_k / v_new_pn;
  ELSE
    v_direction := 'no';
    v_discriminant := v_sum * v_sum - 4 * p_shares_to_sell * v_py;
    IF v_discriminant < 0 THEN v_discriminant := 0; END IF;
    v_payout := (v_sum - SQRT(v_discriminant)) / 2;
    
    v_spot_price := v_py / (v_py + v_pn);
    IF (v_payout / p_shares_to_sell) > v_spot_price THEN
       v_payout := p_shares_to_sell * v_spot_price;
    END IF;
    
    v_new_py := v_py - v_payout;
    IF v_new_py <= 0 THEN
       RETURN json_build_object('success', false, 'error', 'Liquidez insuficiente en el pool (YES)');
    END IF;
    v_new_pn := v_k / v_new_py;
  END IF;

  -- SAFEGUARD ESTRICTO: El precio de venta nunca puede superar $0.99 por acción.
  IF (v_payout / p_shares_to_sell) > 0.99 THEN
    RAISE EXCEPTION 'Error de AMM: Precio de venta excede $1.00';
  END IF;

  v_payout := FLOOR(v_payout);
  IF v_payout <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'El retorno calculado es demasiado bajo para liquidarse');
  END IF;

  -- Actualizar pools
  UPDATE market_options
  SET pool_yes = v_new_py,
      pool_no = v_new_pn,
      liquidity_k = v_new_py * v_new_pn
  WHERE id = p_market_option_id;

  -- Actualizar acciones del usuario
  UPDATE user_shares
  SET 
    shares_yes_owned = CASE WHEN p_sell_yes THEN shares_yes_owned - p_shares_to_sell ELSE shares_yes_owned END,
    shares_no_owned = CASE WHEN NOT p_sell_yes THEN shares_no_owned - p_shares_to_sell ELSE shares_no_owned END,
    updated_at = NOW()
  WHERE user_id = p_user_id AND market_option_id = p_market_option_id;

  -- Acreditar puntos al usuario
  UPDATE profiles
  SET points = points + v_payout
  WHERE id = p_user_id;

  -- Registrar en transacciones
  INSERT INTO transactions (user_id, market_id, outcome, direction, type, amount, shares, description)
  VALUES (
    p_user_id, 
    v_market_id, 
    p_market_option_id::text,
    v_direction,
    'sell', 
    v_payout, 
    p_shares_to_sell, 
    'Vendió ' || ROUND(p_shares_to_sell, 2) || CASE WHEN p_sell_yes THEN ' acciones de SÍ en "' ELSE ' acciones de NO en "' END || v_option_name || '"'
  );

  RETURN json_build_object(
    'success', true,
    'payout', v_payout,
    'new_pool_yes', ROUND(v_new_py, 4),
    'new_pool_no', ROUND(v_new_pn, 4)
  );
END;
$$;

-- 4. Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.buy_shares_amm TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.sell_shares_amm TO authenticated, service_role, anon;
