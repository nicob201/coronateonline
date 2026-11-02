"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { proponerTitulo } from "@/actions/proposals";
import { formatCoronas } from "@/lib/format";
import { TITLE_PROPOSAL_COST } from "@/lib/titles";

const FIELD =
  "w-full px-4 py-3 rounded-lg bg-surface-container-high border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors";
const LABEL = "text-label-caps font-label-caps text-on-surface-variant";

// Emoji, name and description form that spends Coronas on a title proposal; blocks double-submit and shows what is missing.
export function ProposeTitleForm({ balance }: { balance: number }) {
  const [state, action, pending] = useActionState(proponerTitulo, null);
  const missing = TITLE_PROPOSAL_COST - balance;

  // Dispatching by hand keeps what the user typed when the server says no (a form action resets the form).
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form onSubmit={submit} className="glass-panel rounded-xl p-6 flex flex-col gap-5">
      <div className="flex gap-4">
        <div className="flex flex-col gap-1.5 w-20 shrink-0">
          <label htmlFor="emoji" className={LABEL}>
            EMOJI
          </label>
          <input id="emoji" name="emoji" required placeholder="👑" className={`${FIELD} text-center text-2xl px-2`} />
        </div>
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <label htmlFor="name" className={LABEL}>
            NOMBRE DEL TÍTULO
          </label>
          <input
            id="name"
            name="name"
            required
            minLength={3}
            maxLength={40}
            placeholder="Rey del Fernet"
            className={`${FIELD} text-lg`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={LABEL}>
          DESCRIPCIÓN
        </label>
        <textarea
          id="description"
          name="description"
          required
          minLength={3}
          maxLength={140}
          rows={3}
          placeholder="Para quien prepara el mejor fernet del grupo."
          className={`${FIELD} resize-none`}
        />
        <span className={LABEL}>Máx. 140 caracteres</span>
      </div>

      <p className="text-body-sm font-body-sm text-on-surface-variant">
        Cuesta <span className="text-tertiary">{formatCoronas(TITLE_PROPOSAL_COST)}</span> · Tu saldo:{" "}
        <span className="text-tertiary">{formatCoronas(balance)}</span>
      </p>

      {state?.success === false && (
        <p role="alert" className="text-body-sm font-body-sm text-error">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || missing > 0}
        className="btn-gradient px-8 py-4 rounded-xl text-label-caps font-label-caps text-on-primary-fixed font-bold tracking-widest disabled:opacity-50"
      >
        {missing > 0
          ? `TE FALTAN ${formatCoronas(missing)}`
          : pending
            ? "ENVIANDO..."
            : `PROPONER POR ${formatCoronas(TITLE_PROPOSAL_COST)}`}
      </button>
    </form>
  );
}
