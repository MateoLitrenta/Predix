-- 1. Agregar las columnas necesarias a la tabla bets si no existen
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC DEFAULT 0;

-- 2. Crear o reemplazar la función de venta parcial
CREATE OR REPLACE FUNCTION public.vender_acciones_parciales(
  p_user_id UUID,
  p_market_id UUID,
  p_outcome UUID,
  p_direction TEXT,
  p_shares_to_sell NUMERIC DEFAULT NULL,
  p_shares NUMERIC DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_market_status TEXT;
  v_existing_shares NUMERIC;
  v_existing_amount NUMERIC;
  v_proportional_amount NUMERIC;
  v_actual_shares_to_sell NUMERIC;
  
  -- AMM vars
  v_option_votes NUMERIC;
  v_total_vol NUMERIC;
  v_total_options INTEGER;
  v_start_price NUMERIC;
  v_end_price NUMERIC;
  v_avg_price NUMERIC;
  v_cashout_value NUMERIC;
  
  -- AMM update vars
  v_other_options_count INTEGER;
  v_amount_per_option NUMERIC;
BEGIN
  v_actual_shares_to_sell := COALESCE(p_shares_to_sell, p_shares);

  -- 1. Validar que el mercado esté activo
  SELECT status, total_volume INTO v_market_status, v_total_vol FROM public.markets WHERE id = p_market_id;
  IF v_market_status != 'active' THEN
    RAISE EXCEPTION 'El mercado no está activo.';
  END IF;

  -- 2. Buscar las posiciones consolidadas del usuario (para asegurar que tiene suficientes acciones)
  SELECT COALESCE(sum(shares), 0), COALESCE(sum(amount), 0)
  INTO v_existing_shares, v_existing_amount
  FROM public.bets
  WHERE user_id = p_user_id 
    AND market_id = p_market_id 
    AND outcome = p_outcome::text 
    AND direction = p_direction
    AND status = 'active';

  IF v_existing_shares < v_actual_shares_to_sell THEN
    RAISE EXCEPTION 'No tienes suficientes acciones para vender.';
  END IF;

  -- 3. Calcular el costo proporcional de las acciones que se están vendiendo
  v_proportional_amount := (v_actual_shares_to_sell / v_existing_shares) * v_existing_amount;

  -- 4. Simular el cashout del AMM para saber cuánto valor se devuelve
  SELECT total_votes INTO v_option_votes FROM public.market_options WHERE id = p_outcome;
  SELECT count(*) INTO v_total_options FROM public.market_options WHERE market_id = p_market_id AND is_eliminated = false;
  
  v_start_price := (v_option_votes + 100.0) / (v_total_vol + (v_total_options * 100.0));
  
  IF p_direction = 'yes' THEN
    v_end_price := GREATEST(0.01, (v_option_votes - v_actual_shares_to_sell + 100.0) / (GREATEST(1.0, v_total_vol - v_actual_shares_to_sell) + (v_total_options * 100.0)));
    v_avg_price := (v_start_price + v_end_price) / 2.0;
    v_avg_price := GREATEST(0.01, LEAST(0.99, v_avg_price));
    v_cashout_value := ROUND(v_actual_shares_to_sell * v_avg_price);
  ELSE
    v_end_price := GREATEST(0.01, (v_option_votes + 100.0) / (GREATEST(1.0, v_total_vol - v_actual_shares_to_sell) + (v_total_options * 100.0)));
    v_avg_price := (v_start_price + v_end_price) / 2.0;
    v_avg_price := GREATEST(0.01, LEAST(0.99, v_avg_price));
    v_cashout_value := ROUND(v_actual_shares_to_sell * (1 - v_avg_price));
  END IF;

  -- 5. Actualizar la liquidez del mercado (AMM)
  UPDATE public.markets SET total_volume = GREATEST(0, total_volume - v_cashout_value) WHERE id = p_market_id;

  IF p_direction = 'yes' THEN
    UPDATE public.market_options SET total_votes = GREATEST(0, total_votes - v_cashout_value) WHERE id = p_outcome;
  ELSE
    SELECT count(*) INTO v_other_options_count FROM public.market_options WHERE market_id = p_market_id AND id != p_outcome AND is_eliminated = false;
    IF v_other_options_count > 0 THEN
      v_amount_per_option := v_cashout_value / v_other_options_count;
      UPDATE public.market_options SET total_votes = GREATEST(0, total_votes - v_amount_per_option) WHERE market_id = p_market_id AND id != p_outcome AND is_eliminated = false;
    END IF;
  END IF;

  -- 6. Actualizar las apuestas (Historial y Activas)
  
  -- Ajuste negativo a las posiciones activas
  INSERT INTO public.bets (user_id, market_id, outcome, direction, amount, shares, status)
  VALUES (p_user_id, p_market_id, p_outcome::text, p_direction, -v_proportional_amount, -v_actual_shares_to_sell, 'active');

  -- Fila de venta consolidada para el historial (Cerradas)
  -- Guardamos la ganancia neta en realized_pnl: (Retorno Cashout - Costo Proporcional)
  INSERT INTO public.bets (user_id, market_id, outcome, direction, amount, shares, status, realized_pnl)
  VALUES (p_user_id, p_market_id, p_outcome::text, p_direction, v_proportional_amount, v_actual_shares_to_sell, 'sold', v_cashout_value - v_proportional_amount);

  -- 7. Acreditar los puntos al usuario
  UPDATE public.profiles SET points = points + v_cashout_value WHERE id = p_user_id;

  -- 8. Insertar el historial en transactions para la billetera
  INSERT INTO public.transactions (user_id, market_id, type, amount, description)
  VALUES (p_user_id, p_market_id, 'cashout', v_cashout_value, 'Venta parcial de ' || ROUND(v_actual_shares_to_sell) || ' acciones');

  -- 9. Retornar el valor de liquidación
  RETURN v_cashout_value;
END;
$$;
