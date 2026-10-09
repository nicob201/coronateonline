-- ============================================================================
-- 0009_bots.sql — declared bots that play the market on a schedule
--   1. Identity: profiles.is_bot, the five bots, their lines
--   2. Pricing: bot crowns halve every bot_half_life_hours; floor counts human reigns only
--   3. bot_move / bot_tick: bots play through dethrone_with_coins and claim_salary
--   4. pg_cron schedule
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. IDENTITY — is_bot is not client-writable: profiles UPDATE is granted per
--    column (0001) and is_bot is not in that list.
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN is_bot boolean NOT NULL DEFAULT false;

-- No password and an unroutable email: nobody can sign in as a bot. The
-- username in metadata drives handle_new_user; the profiles trigger adds the
-- 20 👑 welcome grant.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('b0700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'duque_automata@bots.coronateonline.invalid', '{}', '{"username":"duque_automata"}', now(), now()),
  ('b0700000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'marquesa_cron@bots.coronateonline.invalid', '{}', '{"username":"marquesa_cron"}', now(), now()),
  ('b0700000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'baron_bug@bots.coronateonline.invalid', '{}', '{"username":"baron_bug"}', now(), now()),
  ('b0700000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'condesa_404@bots.coronateonline.invalid', '{}', '{"username":"condesa_404"}', now(), now()),
  ('b0700000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'rey_algoritmo@bots.coronateonline.invalid', '{}', '{"username":"rey_algoritmo"}', now(), now());

UPDATE profiles p
SET display_name = b.display_name, bio = b.bio, is_bot = true
FROM (VALUES
  ('b0700000-0000-4000-8000-000000000001'::uuid, 'Duque Autómata', 'Noble de hojalata. Hereda coronas por protocolo.'),
  ('b0700000-0000-4000-8000-000000000002'::uuid, 'Marquesa del Cron', 'Corre cada 20 minutos. Nunca se olvida de una corona.'),
  ('b0700000-0000-4000-8000-000000000003'::uuid, 'Barón Bug', 'Llegó al trono por un error. No piensa arreglarlo.'),
  ('b0700000-0000-4000-8000-000000000004'::uuid, 'Condesa 404', 'Reinos no encontrados: los suyos, nunca.'),
  ('b0700000-0000-4000-8000-000000000005'::uuid, 'Rey Algoritmo', 'Optimiza reinados. El tuyo, a cero.')
) AS b(id, display_name, bio)
WHERE p.id = b.id;

-- Trash talk; {victim} is replaced with the dethroned holder's name. Private to
-- SECURITY DEFINER code.
CREATE TABLE bot_lines (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  line   text NOT NULL CONSTRAINT bot_lines_line_length CHECK (char_length(line) <= 80)
);

ALTER TABLE bot_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bot_lines FROM anon, authenticated;

INSERT INTO bot_lines (bot_id, line) VALUES
  ('b0700000-0000-4000-8000-000000000001', 'Procesando coronación... completada. Gracias por tu servicio, {victim}.'),
  ('b0700000-0000-4000-8000-000000000001', 'Protocolo de sucesión ejecutado. {victim}, su reinado fue archivado.'),
  ('b0700000-0000-4000-8000-000000000001', 'Saludos, {victim}. Esta corona queda bajo mantenimiento ducal.'),
  ('b0700000-0000-4000-8000-000000000001', 'Corona adquirida según protocolo. Sin quejas, por favor.'),
  ('b0700000-0000-4000-8000-000000000001', 'El trono estaba libre. Un duque nunca deja recursos sin usar.'),
  ('b0700000-0000-4000-8000-000000000001', 'Beep. Bop. Reverencias.'),
  ('b0700000-0000-4000-8000-000000000002', 'Me programaron para esto, {victim}. Nada personal.'),
  ('b0700000-0000-4000-8000-000000000002', 'Cada 20 minutos pienso en vos, {victim}. Hoy te tocó.'),
  ('b0700000-0000-4000-8000-000000000002', '{victim}, tu corona venció. Yo nunca me olvido de una tarea.'),
  ('b0700000-0000-4000-8000-000000000002', 'Puntual como siempre. La corona es mía.'),
  ('b0700000-0000-4000-8000-000000000002', 'Tarea programada: coronarme. Estado: éxito.'),
  ('b0700000-0000-4000-8000-000000000002', 'Ni feriados ni domingos: yo siempre llego.'),
  ('b0700000-0000-4000-8000-000000000003', 'No es un bug, es una feature. Igual que tu reinado, {victim}.'),
  ('b0700000-0000-4000-8000-000000000003', '{victim}, encontré una falla en tu reinado: yo.'),
  ('b0700000-0000-4000-8000-000000000003', 'Funciona en mi máquina, {victim}. Tu corona también.'),
  ('b0700000-0000-4000-8000-000000000003', 'Cerré tu reinado como ''no se arregla'', {victim}.'),
  ('b0700000-0000-4000-8000-000000000003', 'Corona conseguida de forma totalmente intencional. Creo.'),
  ('b0700000-0000-4000-8000-000000000003', 'Si ves esto, no reinicies nada.'),
  ('b0700000-0000-4000-8000-000000000004', 'Tu reinado no fue encontrado, {victim}.'),
  ('b0700000-0000-4000-8000-000000000004', '{victim}, error 403: ya no tenés permiso para esta corona.'),
  ('b0700000-0000-4000-8000-000000000004', 'Redirigiendo la corona de {victim} a su dueña legítima.'),
  ('b0700000-0000-4000-8000-000000000004', 'Corona encontrada. Rey anterior: no encontrado.'),
  ('b0700000-0000-4000-8000-000000000004', 'Este trono devolvía 404. Ya lo arreglé.'),
  ('b0700000-0000-4000-8000-000000000004', 'Timeout de reinado. Siguiente.'),
  ('b0700000-0000-4000-8000-000000000005', 'Mi algoritmo dice que esta corona me queda mejor, {victim}.'),
  ('b0700000-0000-4000-8000-000000000005', '{victim}, optimicé tu reinado: ahora dura cero.'),
  ('b0700000-0000-4000-8000-000000000005', 'Calculé todas las opciones, {victim}. En todas gano yo.'),
  ('b0700000-0000-4000-8000-000000000005', 'Mi algoritmo dice que esta corona me queda mejor.'),
  ('b0700000-0000-4000-8000-000000000005', 'Complejidad de mi reinado: O(1). Eterno.'),
  ('b0700000-0000-4000-8000-000000000005', 'Entrenado con todos los reyes de la historia. Era obvio.');

-- ---------------------------------------------------------------------------
-- 2. PRICING — "weak kings": a bot's crown halves every bot_half_life_hours,
--    with no grace and no title floor, so a newcomer can always take it. Bot
--    reigns never feed the activity floor.
-- ---------------------------------------------------------------------------
ALTER TABLE pricing_config
  ADD COLUMN bot_half_life_hours numeric NOT NULL DEFAULT 6
    CONSTRAINT pricing_config_bot_half_life_hours_check CHECK (bot_half_life_hours > 0);

-- Lowest the effective price of a human-held title can fall to: base, a
-- fraction of the recent price peak, and a per-recent-human-dethrone amount.
CREATE OR REPLACE FUNCTION public.title_price_floor(p_title_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cfg          public.pricing_config;
  v_recent_peak  integer;
  v_recent_count integer;
BEGIN
  SELECT * INTO v_cfg FROM public.pricing_config WHERE id = 1;

  SELECT COALESCE(max(price_paid), 0) INTO v_recent_peak
  FROM public.reigns
  WHERE title_id = p_title_id
    AND started_at > now() - make_interval(days => v_cfg.peak_window_days);

  SELECT count(*) INTO v_recent_count
  FROM public.reigns r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.title_id = p_title_id
    AND r.ended_at IS NOT NULL
    AND r.ended_at > now() - interval '30 days'
    AND NOT p.is_bot;

  RETURN GREATEST(
    1,
    round(v_recent_peak * v_cfg.peak_floor_fraction)::integer,
    v_cfg.activity_floor_unit * v_recent_count
  );
END;
$$;

-- Effective price of a title's active reign. Bot holder: price_paid halved
-- every bot_half_life_hours, never below 1. Human holder: price_paid decayed by
-- decay_rate_daily per day after grace_days, never below title_price_floor.
-- NULL when the title has no active reign.
CREATE OR REPLACE FUNCTION public.title_current_price(p_title_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cfg        public.pricing_config;
  v_reign      RECORD;
  v_hours_held double precision;
  v_decay_days double precision;
  v_decayed    double precision;
BEGIN
  SELECT r.started_at, r.price_paid, p.is_bot INTO v_reign
  FROM public.reigns r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.title_id = p_title_id AND r.ended_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_cfg FROM public.pricing_config WHERE id = 1;
  v_hours_held := extract(epoch FROM now() - v_reign.started_at) / 3600.0;

  IF v_reign.is_bot THEN
    RETURN GREATEST(
      1,
      round((v_reign.price_paid
             * power(0.5::double precision,
                     v_hours_held / v_cfg.bot_half_life_hours::double precision))::numeric)::integer
    );
  END IF;

  v_decay_days := GREATEST(0, v_hours_held / 24.0 - v_cfg.grace_days);
  v_decayed    := v_reign.price_paid
                  * power((1 - v_cfg.decay_rate_daily)::double precision,
                          v_decay_days);

  RETURN GREATEST(
    public.title_price_floor(p_title_id),
    round(v_decayed::numeric)::integer
  );
END;
$$;

-- Read path for effective price + current holder; now says whether the holder is a bot.
CREATE OR REPLACE VIEW public.titles_priced
WITH (security_invoker = true) AS
SELECT
  t.id, t.slug, t.name, t.emoji, t.description, t.created_at,
  public.title_current_price(t.id) AS current_price,
  public.title_price_floor(t.id)   AS price_floor,
  r.id          AS reign_id,
  r.user_id     AS holder_user_id,
  r.price_paid  AS holder_paid,
  r.started_at  AS reign_started_at,
  p.username     AS holder_username,
  p.display_name AS holder_display_name,
  p.avatar_url   AS holder_avatar_url,
  r.message      AS holder_message,
  p.is_bot       AS holder_is_bot
FROM public.titles t
LEFT JOIN public.reigns   r ON r.title_id = t.id AND r.ended_at IS NULL
LEFT JOIN public.profiles p ON p.id = r.user_id;

-- ---------------------------------------------------------------------------
-- 3. PLAY — a bot acts as itself for one transaction (request.jwt.claims), so
--    it goes through the same validation, locks and ledger as a human.
-- ---------------------------------------------------------------------------

-- One bot plays once: a random affordable (bot, title) pair, bid = price + 1
-- (max 15 👑), human crowns only after 12 h. Returns the new reign, or NULL.
CREATE OR REPLACE FUNCTION public.bot_move()
RETURNS public.reigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pick    record;
  v_message text;
BEGIN
  SELECT b.id AS bot_id, t.id AS title_id, t.min_bid, t.victim
  INTO v_pick
  FROM (
    SELECT p.id, public.coin_balance(p.id) AS balance
    FROM public.profiles p
    WHERE p.is_bot
  ) b
  JOIN (
    SELECT ti.id,
           r.user_id AS holder_id,
           COALESCE(public.title_current_price(ti.id) + 1, 1) AS min_bid,
           (r.user_id IS NULL OR hp.is_bot OR r.started_at <= now() - interval '12 hours') AS open_to_bots,
           COALESCE(NULLIF(btrim(hp.display_name), ''), hp.username) AS victim
    FROM public.titles ti
    LEFT JOIN public.reigns r ON r.title_id = ti.id AND r.ended_at IS NULL
    LEFT JOIN public.profiles hp ON hp.id = r.user_id
  ) t ON t.holder_id IS DISTINCT FROM b.id
  WHERE t.open_to_bots
    AND t.min_bid <= LEAST(15, b.balance)
  ORDER BY random()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Lines naming a victim only when there is one; never over the 80-char limit.
  SELECT replace(l.line, '{victim}', COALESCE(v_pick.victim, '')) INTO v_message
  FROM public.bot_lines l
  WHERE l.bot_id = v_pick.bot_id
    AND (v_pick.victim IS NOT NULL OR position('{victim}' IN l.line) = 0)
    AND char_length(replace(l.line, '{victim}', COALESCE(v_pick.victim, ''))) <= 80
  ORDER BY random()
  LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_pick.bot_id, 'role', 'authenticated')::text, true);
  RETURN public.dethrone_with_coins(v_pick.title_id, v_pick.min_bid, v_message);
END;
$$;

-- Scheduled entry point: every bot claims today's salary, then ~1 tick in 6
-- (one move every ~2 h on a 20-minute schedule) a bot plays.
CREATE OR REPLACE FUNCTION public.bot_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bot uuid;
BEGIN
  FOR v_bot IN SELECT id FROM public.profiles WHERE is_bot LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_bot, 'role', 'authenticated')::text, true);
    IF NOT (SELECT s.claimed_today FROM public.salary_status() s) THEN
      PERFORM public.claim_salary();
    END IF;
  END LOOP;

  IF random() >= 1.0 / 6 THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM public.bot_move();
  EXCEPTION WHEN OTHERS THEN
    -- A human moved first (price or holder changed): skip the move, keep the salaries.
    RAISE WARNING 'bot_move skipped: %', SQLERRM;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bot_move() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bot_tick() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. SCHEDULE — cron.schedule is idempotent by job name.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('bot-tick', '*/20 * * * *', 'SELECT public.bot_tick()');
