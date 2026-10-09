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
