import { formatCoronas, formatDate } from "@/lib/format";
import type { CoinMovement, SalaryStatus } from "@/types";
import { describeMovement } from "@/features/profile/lib/describe-movement";
import { SalaryButton } from "@/features/profile/components/salary-button";
import { AnimatedCoronas } from "@/components/animated-coronas";

// Shows the user's Coronas balance, the daily salary with its streak, and the latest wallet movements.
export function WalletCard({
  balance,
  salary,
  movements,
}: {
  balance: number;
  salary: SalaryStatus;
  movements: CoinMovement[];
}) {
  return (
    <section className="glass-panel rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-label-caps font-label-caps text-on-surface-variant">BILLETERA</h2>
        <span className="text-title-md font-title-md text-tertiary">
          <AnimatedCoronas value={balance} />
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {salary.claimed_today ? (
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            Sueldo cobrado. Volvé mañana por{" "}
            <span className="text-tertiary">{formatCoronas(salary.next_amount)}</span>
          </p>
        ) : (
          <SalaryButton amount={salary.next_amount} />
        )}
        {salary.streak > 0 && (
          <span className="text-body-sm font-body-sm text-on-surface">
            🔥 Racha: {salary.streak} {salary.streak === 1 ? "día" : "días"}
          </span>
        )}
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
