DROP FUNCTION IF EXISTS public.get_user_portfolio(UUID);

CREATE OR REPLACE FUNCTION public.get_user_portfolio(p_user_id UUID)
RETURNS TABLE (
    market_id UUID,
    outcome TEXT,
    direction TEXT,
    status TEXT,
    shares NUMERIC,
    avg_price NUMERIC,
    realized_pnl NUMERIC,
    current_price NUMERIC,
    option_display_name TEXT,
    closed_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH base_data AS (
        SELECT 
            t.market_id as bd_market_id,
            t.outcome::TEXT as outcome_text,
            t.direction::TEXT as bet_direction,
            t.status as bet_status,
            t.shares as bet_shares,
            t.amount as bet_amount,
            t.payout_amount as bet_payout,
            t.realized_pnl as bet_realized_pnl,
            t.created_at as bet_created_at,
            m.status as m_status,
            m.total_volume as m_volume,
            mo.total_votes as o_votes,
            (SELECT count(*) FROM market_options mo_sub WHERE mo_sub.market_id = t.market_id) as total_opts,
            COALESCE(mo.is_eliminated, false) as is_eliminated,
            mo.option_name::TEXT as opt_name
        FROM bets t
        LEFT JOIN markets m ON t.market_id = m.id
        LEFT JOIN market_options mo ON t.outcome::TEXT = mo.id::TEXT
        WHERE t.user_id = p_user_id
    ),
    active_grouped AS (
        SELECT 
            bd.bd_market_id, bd.outcome_text, bd.bet_direction,
            COALESCE(SUM(bd.bet_shares), 0) AS active_shares,
            COALESCE(SUM(bd.bet_amount), 0) AS active_cost,
            MAX(LOWER(bd.m_status)) as market_status,
            MAX(bd.m_volume) as m_volume,
            MAX(bd.o_votes) as o_votes,
            MAX(bd.total_opts) as total_opts,
            BOOL_OR(bd.is_eliminated) as is_eliminated,
            MAX(bd.opt_name) as opt_name 
        FROM base_data bd
        WHERE bd.bet_status = 'active'
        GROUP BY bd.bd_market_id, bd.outcome_text, bd.bet_direction
    ),
    active_calc AS (
        SELECT 
            ag.bd_market_id, ag.outcome_text, ag.bet_direction,
            ag.active_shares, ag.active_cost, ag.market_status,
            ag.is_eliminated, ag.opt_name,
            (CASE 
                WHEN ag.is_eliminated THEN 0.0 
                WHEN ag.total_opts > 0 AND (COALESCE(ag.m_volume, 0) + (ag.total_opts * 100.0)) > 0 THEN 
                    (COALESCE(ag.o_votes, 0) + 100.0) / (COALESCE(ag.m_volume, 0) + (ag.total_opts * 100.0)) 
                ELSE 0.50 
            END) AS base_price
        FROM active_grouped ag
    ),
    sold_data AS (
        SELECT 
            bd.bd_market_id, bd.outcome_text, bd.bet_direction,
            bd.bet_shares, bd.bet_amount, bd.bet_realized_pnl, bd.bet_created_at,
            bd.opt_name,
            (CASE 
                WHEN bd.is_eliminated THEN 0.0 
                WHEN bd.total_opts > 0 AND (COALESCE(bd.m_volume, 0) + (bd.total_opts * 100.0)) > 0 THEN 
                    (COALESCE(bd.o_votes, 0) + 100.0) / (COALESCE(bd.m_volume, 0) + (bd.total_opts * 100.0)) 
                ELSE 0.50 
            END) AS base_price
        FROM base_data bd
        WHERE bd.bet_status = 'sold'
    )
    
    -- 1. Posiciones Activas (Mercado Abierto)
    SELECT ac.bd_market_id as market_id, ac.outcome_text as outcome, ac.bet_direction as direction, 'active'::TEXT as status, ac.active_shares::NUMERIC as shares, 
           (CASE WHEN ac.active_shares > 0 THEN ac.active_cost / ac.active_shares ELSE 0 END)::NUMERIC as avg_price, 0.0::NUMERIC as realized_pnl,
           (CASE WHEN ac.bet_direction = 'no' THEN (1.0 - ac.base_price) ELSE ac.base_price END)::NUMERIC AS current_price,
           ac.opt_name as option_display_name, NULL::TIMESTAMP WITH TIME ZONE as closed_at
    FROM active_calc ac WHERE ac.active_shares > 0 AND ac.market_status = 'active' AND ac.is_eliminated = false
    
    UNION ALL
    
    -- 2. Posiciones Vendidas (Individuales, mercado abierto o cerrado)
    SELECT sd.bd_market_id as market_id, sd.outcome_text as outcome, sd.bet_direction as direction, 'sold'::TEXT as status, sd.bet_shares::NUMERIC as shares, 
           (CASE WHEN sd.bet_shares > 0 THEN sd.bet_amount / sd.bet_shares ELSE 0 END)::NUMERIC as avg_price, 
           sd.bet_realized_pnl::NUMERIC as realized_pnl,
           (CASE WHEN sd.bet_direction = 'no' THEN (1.0 - sd.base_price) ELSE sd.base_price END)::NUMERIC AS current_price,
           sd.opt_name as option_display_name, sd.bet_created_at as closed_at
    FROM sold_data sd WHERE sd.bet_shares > 0
    
    UNION ALL
    
    -- 3. Posiciones Cerradas (Mercado Resuelto - Para la parte Activa que cerró)
    SELECT ac.bd_market_id as market_id, ac.outcome_text as outcome, ac.bet_direction as direction, 'closed'::TEXT as status, ac.active_shares::NUMERIC as shares, 
           (CASE WHEN ac.active_shares > 0 THEN ac.active_cost / ac.active_shares ELSE 0 END)::NUMERIC as avg_price, 
           0.0::NUMERIC as realized_pnl,
           (CASE WHEN ac.bet_direction = 'no' THEN (1.0 - ac.base_price) ELSE ac.base_price END)::NUMERIC AS current_price,
           ac.opt_name as option_display_name, NULL::TIMESTAMP WITH TIME ZONE as closed_at
    FROM active_calc ac WHERE ac.market_status != 'active' AND ac.active_shares > 0
    
    UNION ALL
    
    -- 4. Opciones Eliminadas (Solo la parte activa se va a 0)
    SELECT ac.bd_market_id as market_id, ac.outcome_text as outcome, ac.bet_direction as direction, 'closed'::TEXT as status, ac.active_shares::NUMERIC as shares, 
           (CASE WHEN ac.active_shares > 0 THEN ac.active_cost / ac.active_shares ELSE 0 END)::NUMERIC as avg_price, 
           (CASE WHEN ac.bet_direction = 'no' THEN (ac.active_shares * 1.0) - ac.active_cost ELSE (0.0 - ac.active_cost) END)::NUMERIC AS realized_pnl,
           (CASE WHEN ac.bet_direction = 'no' THEN 1.0 ELSE 0.0 END)::NUMERIC AS current_price,
           ac.opt_name as option_display_name, NULL::TIMESTAMP WITH TIME ZONE as closed_at
    FROM active_calc ac WHERE ac.market_status = 'active' AND ac.is_eliminated = true AND ac.active_shares > 0;
END;
$$;
