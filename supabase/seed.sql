-- ============================================================================
-- seed.sql — 12 seeded titles + dev fixtures (users, reigns) for CoronaTeOnline
-- Idempotent: safe to re-run via `supabase db push --include-seed`.
-- ============================================================================

INSERT INTO titles (slug, name, emoji, description) VALUES
  ('rey-de-cordoba',             'Rey de Córdoba',                        '👑', 'El monarca absoluto de la capital provincial. Su corona brilla más que el sol de julio.'),
  ('rey-de-argentina',           'Rey de Argentina',                      '🇦🇷', 'El más patriota de todos. Lleva la escarapela en el corazón y el mate en la mano.'),
  ('mejor-programador',          'Mejor Programador de Argentina',        '💻', 'Escribe código que compila a la primera. Dicen que es mentira, pero nadie puede comprobarlo.'),
  ('mejor-gamer',                'Mejor Gamer de Argentina',              '🎮', 'No toca pasto, pero sí toca teclas. Speedrunner de la vida real.'),
  ('rey-de-la-pizza',            'Rey de la Pizza',                       '🍕', 'Conocedor supremo de la fugazzetta. Su horno es más rápido que tu CPU.'),
  ('ceo-de-los-lunes',           'CEO de los Lunes',                      '💼', 'Llega tarde a la oficina pero con actitud de dueño. El lunes es su día... o no.'),
  ('emperador-de-los-perros',    'Emperador de los Perros',               '🐕', 'Todos los perros del barrio lo obedecen. Los gatos lo ignoran, pero eso es otro tema.'),
  ('rey-de-internet',            'Rey de Internet',                       '🌐', 'Domina los memes, controla los trends. Su WiFi nunca se cae.'),
  ('persona-mas-importante',     'Persona Más Importante de Argentina',   '⭐', 'Si no estás en esta lista, es porque ella ya te superó.'),
  ('duque-del-asado',            'Duque del Asado',                       '🥩', 'Sabe la diferencia entre choripán y parrilla. Eso ya lo hace superior.'),
  ('reina-de-las-malvinas',      'Reina de las Malvinas',                 '🏝️', 'Defiende las islas con un tweet y un mate. La diplomacia en estado puro.'),
  ('lord-del-fernet',            'Lord del Fernet',                       '🥃', 'Toma fernet con Coca y no le hace mal a nadie. Rey de la picada.')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Dev fixtures — NOT for production. Four users + a handful of reigns so the
-- "held" states, the activity feed and the Hall of Fame render with data.
-- The on_auth_user_created trigger auto-creates the matching profiles rows.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
VALUES
  ('a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'nico@coronate.test',  '{"provider":"email","providers":["email"]}', '{"full_name":"Nico"}',  now(), now(), now()),
  ('a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'juana@coronate.test', '{"provider":"email","providers":["email"]}', '{"full_name":"Juana"}', now(), now(), now()),
  ('a3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'fran@coronate.test',  '{"provider":"email","providers":["email"]}', '{"full_name":"Fran"}',  now(), now(), now()),
  ('a4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'sofia@coronate.test', '{"provider":"email","providers":["email"]}', '{"full_name":"Sofia"}', now(), now(), now())
ON CONFLICT (id) DO NOTHING;

UPDATE profiles SET display_name = 'Nico'  WHERE id = 'a1111111-1111-4111-8111-111111111111' AND display_name IS NULL;
UPDATE profiles SET display_name = 'Juana' WHERE id = 'a2222222-2222-4222-8222-222222222222' AND display_name IS NULL;
UPDATE profiles SET display_name = 'Fran'  WHERE id = 'a3333333-3333-4333-8333-333333333333' AND display_name IS NULL;
UPDATE profiles SET display_name = 'Sofía' WHERE id = 'a4444444-4444-4444-8444-444444444444' AND display_name IS NULL;

-- Reigns. Fixed ids so re-runs are no-ops. rey-de-cordoba has 3 seasons (2 closed + 1 active).
INSERT INTO reigns (id, title_id, user_id, price_paid, started_at, ended_at) VALUES
  ('b1111111-1111-4111-8111-111111111111', (SELECT id FROM titles WHERE slug = 'rey-de-cordoba'),    'a4444444-4444-4444-8444-444444444444', 10000, now() - interval '20 days', now() - interval '12 days'),
  ('b2222222-2222-4222-8222-222222222222', (SELECT id FROM titles WHERE slug = 'rey-de-cordoba'),    'a2222222-2222-4222-8222-222222222222', 30000, now() - interval '12 days', now() - interval '5 days'),
  ('b3333333-3333-4333-8333-333333333333', (SELECT id FROM titles WHERE slug = 'rey-de-cordoba'),    'a1111111-1111-4111-8111-111111111111', 52000, now() - interval '5 days',  NULL),
  ('b4444444-4444-4444-8444-444444444444', (SELECT id FROM titles WHERE slug = 'mejor-programador'), 'a3333333-3333-4333-8333-333333333333', 24000, now() - interval '8 days',  NULL),
  ('b5555555-5555-4555-8555-555555555555', (SELECT id FROM titles WHERE slug = 'mejor-gamer'),       'a3333333-3333-4333-8333-333333333333', 45000, now() - interval '10 days', NULL),
  ('b6666666-6666-4666-8666-666666666666', (SELECT id FROM titles WHERE slug = 'rey-de-la-pizza'),   'a2222222-2222-4222-8222-222222222222',  6000, now() - interval '3 days',  NULL),
  ('b7777777-7777-4777-8777-777777777777', (SELECT id FROM titles WHERE slug = 'ceo-de-los-lunes'),  'a1111111-1111-4111-8111-111111111111', 13000, now() - interval '1 day',   NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Nivel 0 — emotion layer seed data (guarded UPDATEs, idempotent)
-- ---------------------------------------------------------------------------

-- rey-de-cordoba reign chain: dethroned_user_id for closed reigns
UPDATE reigns SET dethroned_user_id = 'a4444444-4444-4444-8444-444444444444'
WHERE id = 'b2222222-2222-4222-8222-222222222222' AND dethroned_user_id IS NULL;

UPDATE reigns SET dethroned_user_id = 'a2222222-2222-4222-8222-222222222222'
WHERE id = 'b3333333-3333-4333-8333-333333333333' AND dethroned_user_id IS NULL;

-- Coronation messages (Spanish, <= 80 chars)
UPDATE reigns SET message = 'Arranca el reinado, cordobeses. ¡No me miren, admiren!'
WHERE id = 'b3333333-3333-4333-8333-333333333333' AND message IS NULL;

UPDATE reigns SET message = 'La pizza Perfecta tiene masa, queso y actitud. Punto.'
WHERE id = 'b6666666-6666-4666-8666-666666666666' AND message IS NULL;

UPDATE reigns SET message = 'Los lunes se conquistan con café y audacia. ¡Hola, equipo!'
WHERE id = 'b7777777-7777-4777-8777-777777777777' AND message IS NULL;
