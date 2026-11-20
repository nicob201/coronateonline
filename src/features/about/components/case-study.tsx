import Link from "next/link";
import { DECISIONS, METRICS, REVISITS, STACK } from "../content";
import { ArchitectureDiagram } from "./architecture-diagram";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-title-md font-title-md text-on-surface uppercase border-b border-outline-variant/30 pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

const BODY = "text-body-lg font-body-lg text-on-surface-variant max-w-3xl";

// The /acerca case study: the problem, the architecture, the decisions, one bug, what would change and the numbers.
export function CaseStudy() {
  return (
    <div className="flex flex-col gap-16">
      <header className="flex flex-col gap-5">
        <p className="text-label-caps font-label-caps text-tertiary uppercase">Caso de estudio</p>
        <h1 className="text-headline-lg-mobile md:text-display-xl font-display-xl text-on-surface uppercase tracking-tighter">
          Un juego de estatus, <span className="text-gradient-primary">pensado como sistema</span>
        </h1>
        <p className={BODY}>
          CoronaTeOnline es un mercado de títulos absurdos donde la corona es de quien pague más. Es un proyecto de portfolio, y esta página cuenta cómo está hecho por dentro: qué se decidió, a cambio de qué y qué cambiaría hoy.
        </p>
      </header>

      <Section title="El problema">
        <p className={BODY}>
          Destronar parece una sola escritura, pero no lo es: hay que leer un precio que decae con el tiempo, verificar el saldo, cerrar un reinado, abrir otro y mover Coronas entre dos personas. Y puede pasar a la vez con otra persona, con un bot o desde dos pestañas. Todo el diseño parte de ahí: que ningún paso pueda quedar a medias ni leerse de una copia vieja.
        </p>
      </Section>

      <Section title="Cómo está armado">
        <ArchitectureDiagram />
        <ul className="flex flex-col gap-2 text-body-lg font-body-lg text-on-surface-variant max-w-3xl list-disc pl-5">
          <li>Los datos se cargan en Server Components y llegan a los Client Components como props.</li>
          <li>Todo lo que escribe pasa por una Server Action que valida con Zod y delega en un servicio.</li>
          <li>Todas las tablas tienen RLS: el cliente no puede escribir títulos, reinados ni el ledger, solo lo hacen funciones con permisos propios.</li>
        </ul>
      </Section>

      <Section title="Siete decisiones y lo que costaron">
        <div className="flex flex-col gap-3">
          {DECISIONS.map((d) => (
            <details key={d.adr} className="glass-panel rounded-2xl p-5 group">
              <summary className="cursor-pointer text-body-lg font-body-lg font-bold text-on-surface flex items-baseline gap-3">
                <span className="text-label-caps font-label-caps text-outline">{d.adr}</span>
                {d.title}
                <span aria-hidden="true" className="ml-auto text-outline text-title-md transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-4 flex flex-col gap-3 max-w-3xl">
                <p className="text-body-lg font-body-lg text-on-surface-variant">{d.what}</p>
                <p className="text-body-sm font-body-sm text-on-surface-variant">
                  <span className="text-tertiary font-bold uppercase text-label-caps font-label-caps">A cambio · </span>
                  {d.tradeoff}
                </p>
              </div>
            </details>
          ))}
        </div>
      </Section>

      <Section title="Un bug que valió la pena">
        <p className={BODY}>
          La primera versión de la función de destronar bloqueaba el perfil del que desafía con <code className="text-on-surface">FOR UPDATE</code>. En la revisión apareció un deadlock cuando dos personas se destronan entre sí al mismo tiempo: las claves foráneas del ledger toman un lock <code className="text-on-surface">KEY SHARE</code> sobre el perfil del otro, y ese lock choca con <code className="text-on-surface">FOR UPDATE</code>. <code className="text-on-surface">FOR NO KEY UPDATE</code> alcanza para ordenar los gastos de una misma persona y no choca.
        </p>
        <p className={BODY}>
          Eso quedó escrito durante semanas sin una prueba. Hoy hay un test con sesiones concurrentes reales que cubre tres casos: tres desafíos al mismo título, una persona gastando dos veces y dos personas destronándose a la vez. Se verificó que falla si se saca cualquiera de los locks.
        </p>
      </Section>

      <Section title="Lo que haría distinto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {REVISITS.map((r) => (
            <div key={r.title} className="glass-panel rounded-2xl p-5 flex flex-col gap-2">
              <h3 className="text-body-lg font-body-lg font-bold text-on-surface">{r.title}</h3>
              <p className="text-body-sm font-body-sm text-on-surface-variant">{r.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Los números">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {METRICS.map((m) => (
            <div key={m.label} className="glass-panel rounded-2xl p-5 flex flex-col gap-2">
              <dt className="text-headline-lg-mobile md:text-headline-lg font-display-xl text-gradient-primary">{m.value}</dt>
              <dd className="text-body-sm font-body-sm text-on-surface-variant">{m.label}</dd>
            </div>
          ))}
        </dl>
        <p className="text-body-sm font-body-sm text-outline">Lighthouse medido en producción, en móvil, el 2026-11-11.</p>
      </Section>

      <Section title="Con qué está hecho">
        <ul className="flex flex-wrap gap-2">
          {STACK.map((item) => (
            <li key={item} className="glass-panel rounded-full px-4 py-1.5 text-body-sm font-body-sm text-on-surface-variant">
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <div className="flex flex-wrap gap-4">
        <Link href="/" className="btn-gradient px-6 py-3 rounded-lg text-label-caps font-label-caps text-on-primary-fixed font-bold tracking-widest">
          Probar la demo
        </Link>
        <Link href="/mapa" className="glass-panel px-6 py-3 rounded-lg text-label-caps font-label-caps text-on-surface font-bold tracking-widest">
          Ver el mapa del reino
        </Link>
      </div>
    </div>
  );
}
