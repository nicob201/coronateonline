import Link from "next/link";
import { BotBadge } from "@/components/bot-badge";
import { formatCoronas } from "@/lib/format";
import { BASE_PRICE } from "@/lib/titles";
import type { ProvinceSummary } from "@/types";
import { ProvinceReignList } from "./province-reign-list";

// Side panel (bottom sheet on mobile) with a province's crown and its longest reigns.
export function ProvincePanel({
  province,
  onClose,
}: {
  province: ProvinceSummary;
  onClose: () => void;
}) {
  const { crown, reigns } = province;
  const holder = crown?.holder ?? null;

  return (
    <aside
      key={province.code}
      aria-label={`Provincia ${province.name}`}
      className="glass-panel panel-in absolute inset-x-0 bottom-0 z-10 flex max-h-[60%] flex-col gap-4 overflow-y-auto rounded-t-2xl p-4 md:inset-x-auto md:top-4 md:right-4 md:bottom-4 md:max-h-none md:w-80 md:rounded-2xl"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-label-caps font-label-caps text-tertiary">PROVINCIA</p>
          <h2 className="text-title-md font-title-md text-on-surface uppercase tracking-tighter">
            {province.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="rounded-full p-1 text-on-surface-variant hover:text-on-surface"
        >
          <span aria-hidden="true" className="material-symbols-outlined">close</span>
        </button>
      </div>

      {crown && (
        <div className="flex flex-col gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-high/50 p-3">
          <p className="text-label-caps font-label-caps text-tertiary">CORONA PROVINCIAL</p>
          <p className="text-body-lg font-body-lg font-bold text-on-surface">
            {crown.emoji} {crown.name}
          </p>
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            {holder ? (
              <>
                Rey: {holder.display_name?.trim() || holder.username}
                {holder.is_bot && <BotBadge />} · Valor: {formatCoronas(crown.price ?? 0)}
              </>
            ) : (
              <span className="text-primary">Trono vacío</span>
            )}
          </p>
          <Link
            href={`/t/${crown.slug}`}
            className={`mt-1 rounded-lg px-4 py-3 text-center text-label-caps font-label-caps font-bold tracking-widest ${
              holder
                ? "btn-destronar border border-secondary-container/50 text-on-surface"
                : "btn-gradient text-on-primary-fixed"
            }`}
          >
            {holder
              ? `DESTRONAR · ${formatCoronas((crown.price ?? 0) + 1)}`
              : `CORONARME · ${formatCoronas(BASE_PRICE)}`}
          </Link>
        </div>
      )}

      {reigns.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-label-caps font-label-caps text-on-surface-variant">REYES CON MÁS REINADO</h3>
          <ProvinceReignList reigns={reigns} />
        </section>
      )}
    </aside>
  );
}
