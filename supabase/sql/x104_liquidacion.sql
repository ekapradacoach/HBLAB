-- ═══════════════════════════════════════════════════════════════════
-- Etapa X.104 — Liquidación mensual a coaches
-- Correr en Supabase → SQL Editor ANTES de subir process-payment.
-- Es idempotente: se puede correr más de una vez sin romper nada.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Fecha del reembolso (para descontarlo en el mes en que se devolvió la plata)
ALTER TABLE public.user_courses
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- 2) El coach puede VER la publicidad de sus propios cursos (solo lectura).
--    El admin sigue gestionando todo con sus policies existentes.
DROP POLICY IF EXISTS "Coach lee ad_spend de sus cursos" ON public.ad_spend;
CREATE POLICY "Coach lee ad_spend de sus cursos" ON public.ad_spend
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.coach_courses cc
            WHERE cc.coach_id = auth.uid() AND cc.course_id = ad_spend.course_id)
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- 3) Verificación rápida (opcional): debería listar la columna nueva
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'user_courses' AND column_name IN ('net_amount','mp_payment_id','refunded_at');
