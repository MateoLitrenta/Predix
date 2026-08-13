-- Migración a Liquidez Compartida (LMSR)
-- Este script añade las columnas necesarias para soportar el modelo matemático LMSR.

DO $$
BEGIN
    -- 1. Añadir el parámetro de liquidez global 'b' a los mercados.
    -- Un 'b' de 100000 provee buena profundidad para inversiones de miles de puntos.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='markets' AND column_name='liquidity_b') THEN
        ALTER TABLE public.markets ADD COLUMN liquidity_b NUMERIC NOT NULL DEFAULT 100000;
    END IF;

    -- 2. Añadir el tracker de acciones en circulación (q) para cada opción.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='market_options' AND column_name='lmsr_q') THEN
        ALTER TABLE public.market_options ADD COLUMN lmsr_q NUMERIC NOT NULL DEFAULT 0;
    END IF;
END $$;
