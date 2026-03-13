-- PredicAR Database Schema

-- 1. Profiles table with points balance
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  points INTEGER NOT NULL DEFAULT 10000,
  last_bonus_claim TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. Markets table
CREATE TABLE IF NOT EXISTS public.markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('política', 'deportes', 'finanzas', 'entretenimiento')),
  yes_percentage INTEGER NOT NULL DEFAULT 50 CHECK (yes_percentage >= 0 AND yes_percentage <= 100),
  total_volume INTEGER NOT NULL DEFAULT 0,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'closed', 'resolved')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

-- Anyone can read active markets
CREATE POLICY "markets_select_active" ON public.markets FOR SELECT USING (status = 'active' OR created_by = auth.uid());
-- Only authenticated users can create markets (pending status)
CREATE POLICY "markets_insert_own" ON public.markets FOR INSERT WITH CHECK (auth.uid() = created_by);

-- 3. Bets table
CREATE TABLE IF NOT EXISTS public.bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  prediction TEXT NOT NULL CHECK (prediction IN ('yes', 'no')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bets_select_own" ON public.bets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bets_insert_own" ON public.bets FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, points)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'username', 'Usuario'),
    10000
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5. RPC function for daily bonus claim
CREATE OR REPLACE FUNCTION public.reclamar_bonus_diario()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_profile profiles;
  bonus_amount INTEGER := 500;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE id = auth.uid();
  
  IF user_profile IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;
  
  -- Check if already claimed today
  IF user_profile.last_bonus_claim IS NOT NULL 
     AND user_profile.last_bonus_claim::date = CURRENT_DATE THEN
    RETURN json_build_object('success', false, 'error', 'Ya reclamaste tu bonus hoy');
  END IF;
  
  -- Award bonus
  UPDATE profiles 
  SET 
    points = points + bonus_amount,
    last_bonus_claim = NOW(),
    updated_at = NOW()
  WHERE id = auth.uid();
  
  RETURN json_build_object(
    'success', true, 
    'bonus', bonus_amount,
    'new_balance', user_profile.points + bonus_amount
  );
END;
$$;

-- 6. Function to place a bet
CREATE OR REPLACE FUNCTION public.place_bet(
  p_market_id UUID,
  p_prediction TEXT,
  p_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_profile profiles;
  market_record markets;
BEGIN
  -- Validate prediction
  IF p_prediction NOT IN ('yes', 'no') THEN
    RETURN json_build_object('success', false, 'error', 'Predicción inválida');
  END IF;
  
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE id = auth.uid();
  
  IF user_profile IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;
  
  -- Check sufficient balance
  IF user_profile.points < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Puntos insuficientes');
  END IF;
  
  -- Check market exists and is active
  SELECT * INTO market_record FROM markets WHERE id = p_market_id AND status = 'active';
  
  IF market_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mercado no disponible');
  END IF;
  
  -- Deduct points from user
  UPDATE profiles SET points = points - p_amount, updated_at = NOW() WHERE id = auth.uid();
  
  -- Insert bet
  INSERT INTO bets (user_id, market_id, prediction, amount)
  VALUES (auth.uid(), p_market_id, p_prediction, p_amount);
  
  -- Update market volume
  UPDATE markets SET total_volume = total_volume + p_amount, updated_at = NOW() WHERE id = p_market_id;
  
  RETURN json_build_object(
    'success', true,
    'new_balance', user_profile.points - p_amount,
    'bet_amount', p_amount
  );
END;
$$;

-- 7. Insert sample active markets
INSERT INTO public.markets (question, description, category, yes_percentage, total_volume, end_date, status) VALUES
('¿Ganará Boca la Copa Libertadores 2026?', 'El Club Atlético Boca Juniors ganará la Copa Libertadores en 2026', 'deportes', 34, 125400, '2026-06-30', 'active'),
('¿El dólar superará los $1500 antes de fin de año?', 'El tipo de cambio oficial superará los $1500 ARS antes del 31/12/2026', 'finanzas', 67, 89200, '2026-12-31', 'active'),
('¿Habrá elecciones anticipadas en 2026?', 'Se convocarán elecciones anticipadas durante el año 2026', 'política', 23, 201500, '2026-12-31', 'active'),
('¿Argentina clasificará al Mundial 2026 como líder de eliminatorias?', 'La selección argentina terminará primera en la tabla de eliminatorias CONMEBOL', 'deportes', 78, 156800, '2026-09-15', 'active'),
('¿Gran Hermano 2026 superará el rating de la edición anterior?', 'La nueva edición de Gran Hermano tendrá mayor rating promedio que la edición 2025', 'entretenimiento', 45, 32100, '2026-02-28', 'active'),
('¿El Bitcoin superará los $100,000 USD en 2026?', 'Bitcoin alcanzará un valor de $100,000 USD o más durante 2026', 'finanzas', 52, 67400, '2026-12-31', 'active'),
('¿River ganará el próximo superclásico?', 'River Plate ganará el próximo partido de superclásico contra Boca', 'deportes', 41, 98700, '2026-03-15', 'active'),
('¿Se aprobará la nueva reforma judicial antes de julio?', 'El Congreso aprobará la reforma judicial propuesta antes del 1 de julio de 2026', 'política', 31, 145200, '2026-07-01', 'active'),
('¿Lali Espósito ganará un Grammy Latino en 2026?', 'Lali Espósito recibirá al menos un Grammy Latino en la ceremonia de 2026', 'entretenimiento', 28, 18500, '2026-11-30', 'active');
