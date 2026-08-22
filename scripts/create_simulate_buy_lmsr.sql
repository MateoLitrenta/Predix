-- Simulator RPC for LMSR Buy
-- This calculates the estimated shares you will receive (Max Payout)
-- without altering the database state. It uses the Log-Sum-Exp trick 
-- to prevent overflows.

CREATE OR REPLACE FUNCTION public.simulate_buy_lmsr(
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
  v_shares NUMERIC;
  v_market_id UUID;
  v_spot_price NUMERIC;
BEGIN
  IF p_investment_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Monto inválido');
  END IF;

  SELECT * INTO v_option FROM market_options WHERE id = p_market_option_id;
  IF v_option IS NULL OR v_option.is_eliminated THEN
    RETURN json_build_object('success', false, 'error', 'Opción inválida');
  END IF;

  v_market_id := v_option.market_id;
  SELECT * INTO v_market FROM markets WHERE id = v_market_id;

  v_b := COALESCE(v_market.liquidity_b, 100000);
  
  -- 1. LMSR Math con Log-Sum-Exp Trick
  SELECT COALESCE(MAX(lmsr_q / v_b), 0) INTO v_M FROM market_options WHERE market_id = v_market_id AND is_eliminated = false;
  
  SELECT 
    COALESCE(SUM(EXP(lmsr_q / v_b - v_M)), 0),
    COALESCE(SUM(CASE WHEN id != p_market_option_id THEN EXP(lmsr_q / v_b - v_M) ELSE 0 END), 0)
  INTO v_S, v_S_minus_k
  FROM market_options WHERE market_id = v_market_id AND is_eliminated = false;

  v_I_b := p_investment_amount / v_b;
  v_Q_k := v_option.lmsr_q / v_b;

  -- 2. Calcular precio Spot previo a la compra
  v_spot_price := EXP(v_Q_k - v_M) / v_S;

  -- 3. Calcular acciones resultantes (Max Payout)
  IF p_buy_yes THEN
    v_A := EXP(v_Q_k - v_M) + (1.0 - EXP(-v_I_b)) * v_S_minus_k;
    v_shares := v_b * (v_I_b + v_M + LN(v_A) - v_Q_k);
  ELSE
    v_B := (1.0 - EXP(-v_I_b)) * EXP(v_Q_k - v_M) + v_S_minus_k;
    v_shares := v_b * (v_I_b + LN(v_B) - LN(v_S_minus_k));
  END IF;

  RETURN json_build_object('success', true, 'shares', v_shares, 'spot_price', v_spot_price);
END;
$$;
