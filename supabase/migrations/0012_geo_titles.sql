-- ============================================================================
-- 0012_geo_titles.sql — D12 geographic titles
--   1. provinces: the 24 IGN provinces, keyed by 2-digit INDEC code
--   2. titles gain level / province_code / location (PostGIS point)
--   3. the 24 province crowns (rey-de-cordoba becomes Córdoba's)
--   4. titles_priced exposes level + province_code
--   5. province_leaderboard: longest reigns across every title in a province
--   Additive: old code ignores the new table, columns and function.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. PROVINCES — read-only reference data
-- ---------------------------------------------------------------------------
CREATE TABLE public.provinces (
  code text PRIMARY KEY CHECK (code ~ '^[0-9]{2}$'),
  slug text UNIQUE NOT NULL,
  name text NOT NULL
);

ALTER TABLE public.provinces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provinces are viewable by everyone"
  ON public.provinces FOR SELECT USING (true);

GRANT SELECT ON public.provinces TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.provinces FROM anon, authenticated;

INSERT INTO public.provinces (code, slug, name) VALUES
  ('02', 'caba',                'Ciudad de Buenos Aires'),
  ('06', 'buenos-aires',        'Buenos Aires'),
  ('10', 'catamarca',           'Catamarca'),
  ('14', 'cordoba',             'Córdoba'),
  ('18', 'corrientes',          'Corrientes'),
  ('22', 'chaco',               'Chaco'),
  ('26', 'chubut',              'Chubut'),
  ('30', 'entre-rios',          'Entre Ríos'),
  ('34', 'formosa',             'Formosa'),
  ('38', 'jujuy',               'Jujuy'),
  ('42', 'la-pampa',            'La Pampa'),
  ('46', 'la-rioja',            'La Rioja'),
  ('50', 'mendoza',             'Mendoza'),
  ('54', 'misiones',            'Misiones'),
  ('58', 'neuquen',             'Neuquén'),
  ('62', 'rio-negro',           'Río Negro'),
  ('66', 'salta',               'Salta'),
  ('70', 'san-juan',            'San Juan'),
  ('74', 'san-luis',            'San Luis'),
  ('78', 'santa-cruz',          'Santa Cruz'),
  ('82', 'santa-fe',            'Santa Fe'),
  ('86', 'santiago-del-estero', 'Santiago del Estero'),
  ('90', 'tucuman',             'Tucumán'),
  ('94', 'tierra-del-fuego',    'Tierra del Fuego');

-- ---------------------------------------------------------------------------
-- 2. TITLES — a title is either plain or fully geographic (level + province + point)
-- ---------------------------------------------------------------------------
ALTER TABLE public.titles
  ADD COLUMN level         text CHECK (level IN ('provincia', 'ciudad', 'barrio')),
  ADD COLUMN province_code text REFERENCES public.provinces(code),
  ADD COLUMN location      extensions.geography(Point, 4326),
  ADD CONSTRAINT titles_geo_all_or_nothing CHECK (
    (level IS NULL) = (province_code IS NULL) AND (level IS NULL) = (location IS NULL)
  );

CREATE UNIQUE INDEX titles_one_crown_per_province
  ON public.titles (province_code) WHERE level = 'provincia';

-- ---------------------------------------------------------------------------
-- 3. PROVINCE CROWNS — points are interior points of the IGN polygons (Tierra del
--    Fuego is hand-picked on Isla Grande). An existing row keeps its id, name and
--    emoji, which is how rey-de-cordoba keeps its reigns; seed.sql runs after this
--    on a reset and its ON CONFLICT leaves the geo columns alone.
-- ---------------------------------------------------------------------------
INSERT INTO public.titles (slug, name, emoji, description, level, province_code, location)
SELECT v.slug, v.name, v.emoji, v.description, 'provincia', v.province_code,
       extensions.st_setsrid(extensions.st_makepoint(v.lon, v.lat), 4326)::extensions.geography
FROM (VALUES
  ('02', 'rey-de-caba',                'Rey de CABA',                         '🏙️', 'Dueño del Obelisco y de todos los bondis. Cruza la 9 de Julio sin mirar.', -58.447, -34.607),
  ('06', 'rey-de-buenos-aires',        'Rey de la Provincia de Buenos Aires', '🌾', 'Gobierna del conurbano a la costa, pasando por la pampa y el último kiosco.', -60.278, -36.394),
  ('10', 'rey-de-catamarca',           'Rey de Catamarca',                    '🧶', 'Señor de los ponchos y las nueces. Teje su propia leyenda con paciencia.', -67.161, -27.204),
  ('14', 'rey-de-cordoba',             'Rey de Córdoba',                      '👑', 'El monarca absoluto de la provincia, de las sierras al Mar de Ansenuza. Fernet en mano, cuarteto de fondo.', -63.562, -32.104),
  ('18', 'rey-de-corrientes',          'Rey de Corrientes',                   '🎭', 'Rey del chamamé y del carnaval más largo del país. El tereré no se negocia.', -57.805, -28.703),
  ('22', 'rey-de-chaco',               'Rey del Chaco',                       '☀️', 'Soberano del monte y del calor. Sobrevive al sol y a la siesta eterna.', -60.556, -26.828),
  ('26', 'rey-de-chubut',              'Rey de Chubut',                       '🐋', 'Rey de las ballenas y los pingüinos. Gobierna la Patagonia con el viento en contra.', -68.610, -44.000),
  ('30', 'rey-de-entre-rios',          'Rey de Entre Ríos',                   '🛶', 'Navega entre el Paraná y el Uruguay. Su mate nunca se enfría.', -59.321, -32.201),
  ('34', 'rey-de-formosa',             'Rey de Formosa',                      '🐟', 'Rey del pacú y del pantano. Aguanta el calor sin pestañear.', -59.570, -25.203),
  ('38', 'rey-de-jujuy',               'Rey de Jujuy',                        '🦙', 'Rey de la Quebrada y los siete colores. Allá arriba el aire no alcanza, pero la corona sí.', -65.997, -22.732),
  ('42', 'rey-de-la-pampa',            'Rey de La Pampa',                     '🐎', 'Rey de la llanura infinita. Si ves un caldén, saludalo: es su guardia real.', -65.494, -37.401),
  ('46', 'rey-de-la-rioja',            'Rey de La Rioja',                     '🏜️', 'Rey de los cañones rojos del Talampaya y del Famatina. Gobierna sin apuro bajo el sol.', -67.181, -29.412),
  ('50', 'rey-de-mendoza',             'Rey de Mendoza',                      '🍇', 'Rey del Malbec y de la montaña más alta de América. Brinda desde las alturas.', -68.343, -34.499),
  ('54', 'rey-de-misiones',            'Rey de Misiones',                     '💦', 'Rey de las Cataratas y la tierra colorada. Su yerba es la mejor y no se discute.', -54.367, -26.850),
  ('58', 'rey-de-neuquen',             'Rey de Neuquén',                      '🦖', 'Rey de los dinosaurios más grandes del mundo. Pasó el Cretácico, pero el trono sigue en pie.', -69.659, -38.394),
  ('62', 'rey-de-rio-negro',           'Rey de Río Negro',                    '🍫', 'Rey de las manzanas, el chocolate y los lagos de Bariloche. Gobierna con campera polar.', -66.921, -40.435),
  ('66', 'rey-de-salta',               'Rey de Salta',                        '🎸', 'Rey de la peña y la empanada salteña. Si la guitarra suena, él manda.', -65.546, -25.268),
  ('70', 'rey-de-san-juan',            'Rey de San Juan',                     '🌙', 'Rey del sol, del vino y del Valle de la Luna. Trabaja de noche, brilla de día.', -68.858, -30.895),
  ('74', 'rey-de-san-luis',            'Rey de San Luis',                     '⛰️', 'Rey de las sierras y los cielos despejados. Acá la calma es política de Estado.', -66.127, -33.119),
  ('78', 'rey-de-santa-cruz',          'Rey de Santa Cruz',                   '🧊', 'Rey del Perito Moreno y del viento que no para. Gobierna donde se termina el mapa.', -70.028, -48.328),
  ('82', 'rey-de-santa-fe',            'Rey de Santa Fe',                     '🚢', 'Rey del Paraná y de la Bandera. Rosarino de ley o santafesino a muerte.', -60.815, -30.410),
  ('86', 'rey-de-santiago-del-estero', 'Rey de Santiago del Estero',          '🪕', 'Rey del folklore y la madre de ciudades. Su chacarera no se baila: se hereda.', -63.285, -27.812),
  ('90', 'rey-de-tucuman',             'Rey de Tucumán',                      '🍋', 'Rey del limón y la empanada. El más chiquito del país, pero el más ruidoso.', -65.295, -26.895),
  ('94', 'rey-de-tierra-del-fuego',    'Rey de Tierra del Fuego',             '🐧', 'Rey del Fin del Mundo. Gobierna a pura nieve, de Ushuaia a la Antártida.', -67.500, -54.200)
) AS v(province_code, slug, name, emoji, description, lon, lat)
ON CONFLICT (slug) DO UPDATE SET
  description   = EXCLUDED.description,
  level         = EXCLUDED.level,
  province_code = EXCLUDED.province_code,
  location      = EXCLUDED.location;

-- ---------------------------------------------------------------------------
-- 4. READ PATH — titles_priced keeps its columns and appends level + province_code
--    (CREATE OR REPLACE VIEW only allows appending).
-- ---------------------------------------------------------------------------
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
  p.is_bot       AS holder_is_bot,
  t.level,
  t.province_code
FROM public.titles t
LEFT JOIN public.reigns   r ON r.title_id = t.id AND r.ended_at IS NULL
LEFT JOIN public.profiles p ON p.id = r.user_id;

-- ---------------------------------------------------------------------------
-- 5. LEADERBOARD — every reign (active or ended) of every geographic title,
--    ranked per province by duration; active reigns are measured to now().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.province_leaderboard(p_limit int DEFAULT 10)
RETURNS TABLE (
  province_code       text,
  rank                bigint,
  reign_id            uuid,
  title_slug          text,
  title_name          text,
  title_emoji         text,
  holder_username     text,
  holder_display_name text,
  holder_is_bot       boolean,
  price_paid          int,
  started_at          timestamptz,
  ended_at            timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT ranked.province_code, ranked.rank, ranked.reign_id, ranked.title_slug, ranked.title_name,
         ranked.title_emoji, ranked.holder_username, ranked.holder_display_name, ranked.holder_is_bot,
         ranked.price_paid, ranked.started_at, ranked.ended_at
  FROM (
    SELECT
      t.province_code,
      row_number() OVER (
        PARTITION BY t.province_code
        ORDER BY COALESCE(r.ended_at, now()) - r.started_at DESC, r.started_at
      ) AS rank,
      r.id AS reign_id,
      t.slug AS title_slug,
      t.name AS title_name,
      t.emoji AS title_emoji,
      p.username AS holder_username,
      p.display_name AS holder_display_name,
      p.is_bot AS holder_is_bot,
      r.price_paid,
      r.started_at,
      r.ended_at
    FROM public.reigns r
    JOIN public.titles t   ON t.id = r.title_id
    JOIN public.profiles p ON p.id = r.user_id
    WHERE t.province_code IS NOT NULL
  ) ranked
  WHERE ranked.rank <= p_limit
  ORDER BY ranked.province_code, ranked.rank;
$$;

GRANT EXECUTE ON FUNCTION public.province_leaderboard(int) TO anon, authenticated;
