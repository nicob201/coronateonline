type Layer = { name: string; detail: string[] };

const LAYERS: Layer[] = [
  { name: "Navegador", detail: ["Client Components (React 19)", "Suscripción a Realtime", "Entrada de invitados"] },
  { name: "Vercel · Next.js 16", detail: ["Server Components: carga inicial", "Server Actions: auth → Zod → servicio"] },
  { name: "Supabase", detail: ["Postgres: RLS + funciones atómicas", "Auth con invitados anónimos", "Realtime y pg_cron (bots)"] },
];

const LINKS = ["navegación y acciones", "consultas y RPC"];

// Three-layer diagram of the request path plus the realtime loop that closes it.
export function ArchitectureDiagram() {
  return (
    <figure className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-3 md:gap-2">
        {LAYERS.flatMap((layer, i) => {
          const card = (
            <div key={layer.name} className="glass-panel rounded-2xl p-5 flex flex-col gap-2">
              <h3 className="text-label-caps font-label-caps text-tertiary uppercase">{layer.name}</h3>
              <ul className="flex flex-col gap-1">
                {layer.detail.map((line) => (
                  <li key={line} className="text-body-sm font-body-sm text-on-surface-variant">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          );
          if (i === LAYERS.length - 1) return [card];
          return [
            card,
            <div
              key={`link-${i}`}
              aria-hidden="true"
              className="flex md:flex-col items-center justify-center gap-2 text-outline text-label-caps font-label-caps"
            >
              <span className="md:hidden">↓</span>
              <span className="hidden md:inline">→</span>
              <span className="text-center">{LINKS[i]}</span>
            </div>,
          ];
        })}
      </div>
      <figcaption className="text-body-sm font-body-sm text-on-surface-variant">
        El circuito se cierra solo: un <code className="text-on-surface">INSERT</code> en <code className="text-on-surface">reigns</code> llega al navegador por Realtime y dispara un <code className="text-on-surface">router.refresh()</code>, que vuelve a pedir los datos a los mismos Server Components.
      </figcaption>
    </figure>
  );
}
