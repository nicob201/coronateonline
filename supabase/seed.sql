-- ============================================================================
-- seed.sql — 12 seeded titles for CoronaTeOnline
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
