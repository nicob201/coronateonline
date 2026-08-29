import { formatARS } from "@/lib/format";
import type { Claim } from "@/types";

// Shows the fixed-alias transfer instructions for a user's pending dethrone claim.
export function PaymentInstructions({
  claim,
  alias,
}: {
  claim: Claim;
  alias: string;
}) {
  return (
    <div className="glass-panel rounded-xl p-6 flex flex-col gap-4 border-l-4 border-l-tertiary">
      <h2 className="text-title-md font-title-md text-on-surface">
        Solicitud pendiente
      </h2>
      <p className="text-body-sm font-body-sm text-on-surface-variant">
        Transferí el monto exacto al alias de abajo. Cuando confirmemos el pago,
        la corona es tuya.
      </p>

      <div className="flex justify-between items-center border-t border-outline-variant/20 pt-3">
        <span className="text-label-caps font-label-caps text-on-surface-variant">
          MONTO EXACTO
        </span>
        <span className="text-title-md font-title-md text-tertiary font-black">
          {formatARS(claim.amount)}
        </span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-label-caps font-label-caps text-on-surface-variant">
          ALIAS
        </span>
        <span className="text-body-lg font-body-lg font-bold text-on-surface">
          {alias}
        </span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-label-caps font-label-caps text-on-surface-variant">
          N.º DE SOLICITUD
        </span>
        <span className="text-body-sm font-body-sm text-on-surface-variant">
          {claim.id.slice(0, 8)}
        </span>
      </div>

      <p className="text-label-caps font-label-caps text-on-surface-variant border-t border-outline-variant/20 pt-3">
        Poné el n.º de solicitud en el detalle de la transferencia.
      </p>
    </div>
  );
}
