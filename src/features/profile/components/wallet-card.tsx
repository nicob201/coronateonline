import { formatCoronas, formatDate } from "@/lib/format";
import type { CoinMovement } from "@/types";
import { describeMovement } from "@/features/profile/lib/describe-movement";

// Shows the user's Coronas balance and their latest wallet movements.
export function WalletCard({
  balance,
  movements,
}: {
  balance: number;
  movements: CoinMovement[];
}) {
  return (
    <section className="glass-panel rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-label-caps font-label-caps text-on-surface-variant">BILLETERA</h2>
        <span className="text-title-md font-title-md text-tertiary">{formatCoronas(balance)}</span>
      </div>
      <ul className="flex flex-col divide-y divide-outline-variant/20">
        {movements.map((m) => (
          <li key={m.id} className="flex items-center gap-4 py-2 text-body-sm font-body-sm">
            <span className="flex-1 text-on-surface">{describeMovement(m)}</span>
            <span className="text-on-surface-variant">{formatDate(m.created_at)}</span>
            <span className={m.amount > 0 ? "text-tertiary" : "text-error"}>
              {m.amount > 0 ? "+" : ""}
              {formatCoronas(m.amount)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
