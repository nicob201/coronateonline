// Copy for /acerca, taken from docs/adr/ and the measured production numbers; one place to edit.

export type Decision = {
  adr: string;
  title: string;
  what: string;
  tradeoff: string;
};

export const DECISIONS: Decision[] = [
  {
    adr: "0001",
    title: "Coronas enteras y saldo derivado",
    what: "La moneda es virtual y siempre entera. Cada movimiento es una fila de un ledger de solo agregar, y el saldo de cada persona es la suma de sus filas: no se guarda en ningún lado, así que no puede desincronizarse.",
    tradeoff: "Leer el saldo es un SUM por consulta. Con este volumen no se nota; si creciera, se agregaría un snapshot periódico sin cambiar el modelo.",
  },
  {
    adr: "0002",
    title: "Destronar solo dentro de una función atómica",
    what: "La única forma de cambiar de rey es una función de Postgres que bloquea el título, después el perfil del que desafía, y recién ahí vuelve a validar el precio y el saldo. El precio que mostró la pantalla nunca se usa para cobrar.",
    tradeoff: "La lógica crítica vive en SQL y se prueba con tests SQL, no con Vitest. Los errores llegan como mensajes de Postgres que la acción traduce.",
  },
  {
    adr: "0003",
    title: "Rey, precio y notificaciones derivados de los reinados",
    what: "La tabla de reinados es la única fuente de verdad. El rey actual, el precio con decaimiento, los rankings, los logros y el aviso de «te destronaron» son consultas sobre ella: ninguna columna duplica un dato.",
    tradeoff: "Las consultas son más pesadas que leer una columna. A este volumen no se nota; si creciera, se materializaría una vista.",
  },
  {
    adr: "0004",
    title: "Bots que juegan con las mismas reglas",
    what: "Cinco bots mueven el reino desde pg_cron cada 20 minutos y llaman a la misma función que los humanos. Son reyes débiles a propósito: pujan el mínimo y su corona pierde valor rápido, así que un recién llegado siempre puede ganarles.",
    tradeoff: "pg_cron no cuenta como actividad para la pausa del plan gratuito de Supabase, así que un workflow diario pide una página para mantener el proyecto despierto.",
  },
  {
    adr: "0005",
    title: "Tiempo real con router.refresh()",
    what: "Cada destronamiento inserta una fila en reinados. Un componente se suscribe a esos INSERT y le pide a Next que vuelva a renderizar los Server Components de la ruta: una sola fuente de datos para la carga inicial y para las actualizaciones.",
    tradeoff: "Cada evento cuesta un viaje de renderizado por pestaña abierta. Con una docena de jugadas de bots por día más las humanas, es despreciable.",
  },
  {
    adr: "0006",
    title: "Mapa sin proveedor de tiles",
    what: "MapLibre dibuja un globo con un único GeoJSON propio (~150 KB) construido desde el WFS oficial del IGN, incluidas Malvinas y la Antártida. Cero claves, cero cuotas y el mismo resultado en local, previews y producción.",
    tradeoff: "Sin glyphs no hay etiquetas de texto dentro del mapa, y ciudades o barrios necesitarían otra capa de datos y carga por zona.",
  },
  {
    adr: "0007",
    title: "Invitados desde el navegador, sin captcha",
    what: "El invitado se crea con signInAnonymously() desde el navegador. Si se creara desde el servidor, el límite por IP de Supabase vería la IP compartida de Vercel y frenaría a todos o a nadie.",
    tradeoff: "Sin captcha, alguien con muchas IPs todavía puede crear cuentas. Sin plata real de por medio, el costo de ese abuso es bajo y el límite alcanza.",
  },
];

export type Revisit = { title: string; body: string };

export const REVISITS: Revisit[] = [
  {
    title: "Todo es dinámico y sin caché",
    body: "Cada request consulta Supabase, y cada destronamiento invalida el layout entero. Con Cache Components de Next 16 y etiquetas de revalidación se invalidaría solo lo que cambió.",
  },
  {
    title: "El precio se calcula fila por fila",
    body: "La vista que expone el precio vigente llama a dos funciones por título, y cada una vuelve a leer la configuración. Con unas decenas de títulos alcanza; con cientos habría que calcular todo en una sola pasada.",
  },
  {
    title: "El listado filtra en memoria",
    body: "/titulos trae todos los títulos y filtra y ordena en el servidor. Con títulos de la comunidad creciendo, el filtro tendría que pasar a SQL, con paginación.",
  },
  {
    title: "La economía casi no tiene sumideros",
    body: "El sueldo diario no tiene tope y las Coronas solo se queman al reclamar un título libre o al aprobarse una propuesta. A la larga, la inflación aplanaría los precios. Un impuesto de mantenimiento (estilo Harberger) está en el backlog.",
  },
  {
    title: "Los errores dependen de textos en inglés",
    body: "Las acciones reconocen los errores de Postgres buscando fragmentos del mensaje. Es frágil: lo robusto sería que cada error del RPC lleve un código propio y la acción lo traduzca por código.",
  },
];

export type Metric = { value: string; label: string };

export const METRICS: Metric[] = [
  { value: "100", label: "Lighthouse móvil en la home y en /titulos, en rendimiento, accesibilidad, buenas prácticas y SEO" },
  { value: "99", label: "Rendimiento de /mapa, con un globo WebGL en pantalla" },
  { value: "+200", label: "tests unitarios, más tests SQL de cada RPC y un test de concurrencia con sesiones reales" },
  { value: "7", label: "decisiones de arquitectura escritas, con sus alternativas" },
];

export const STACK = [
  "Next.js 16",
  "React 19",
  "TypeScript",
  "Tailwind CSS v4",
  "Supabase (Postgres, Auth, Realtime, Storage, pg_cron, PostGIS)",
  "MapLibre GL",
  "Zod",
  "Vitest",
  "Playwright",
  "Vercel",
];
