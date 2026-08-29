import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getTitleBySlug } from "@/services/titles.server";
import { getPendingClaim } from "@/services/claims.server";
import { ReignHistory } from "@/components/reign-history";
import { DethroneForm } from "@/features/dethrone/components/dethrone-form";
import { PaymentInstructions } from "@/features/dethrone/components/payment-instructions";
import { formatARS, formatReignDuration } from "@/lib/format";
import { minClaimAmount, RARITY_LABELS } from "@/lib/titles";

export async function generateMetadata({
  params,
}: PageProps<"/t/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const title = await getTitleBySlug(supabase, slug);
  if (!title) return { title: "Título no encontrado - CoronaTeOnline" };
  return {
    title: `${title.name} - CoronaTeOnline`,
    description: title.description,
  };
}

// Title detail: current throne state, minimum claim price, and full reign history.
export default async function TitleDetailPage({ params }: PageProps<"/t/[slug]">) {
  const { slug } = await params;
  const supabase = await createClient();
  const title = await getTitleBySlug(supabase, slug);

  if (!title) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pendingClaim = user
    ? await getPendingClaim(supabase, user.id, title.id)
    : null;

  const isHeld = title.holder !== null;
  const currentPrice = title.price;
  const nextPrice = minClaimAmount(currentPrice);

  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[1280px] pt-12 pb-32 flex flex-col gap-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        <div className="lg:col-span-7 glass-panel rounded-xl p-8 legendary-glow relative flex flex-col items-center justify-center min-h-[320px] text-center">
          <span className="absolute top-4 left-4 text-label-caps font-label-caps text-tertiary border border-tertiary px-2 py-1 rounded">
            {RARITY_LABELS[title.rarity]}
          </span>
          <div className="text-8xl mb-6">{title.emoji}</div>
          <h1 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg text-gradient-primary uppercase tracking-tighter">
            {title.name}
          </h1>
          <p className="text-body-sm font-body-sm text-on-surface-variant mt-4 max-w-md">
            {title.description}
          </p>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-8">
          <div className="glass-panel rounded-xl p-6 flex flex-col gap-4 border-l-4 border-l-primary">
            <h2 className="text-title-md font-title-md text-on-surface mb-2">
              Estado del trono
            </h2>
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-2">
              <span className="text-label-caps font-label-caps text-on-surface-variant">
                DUEÑO ACTUAL
              </span>
              <span className="text-body-lg font-body-lg font-bold text-primary">
                {isHeld ? title.holderName : "Sin coronar"}
              </span>
            </div>
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-2">
              <span className="text-label-caps font-label-caps text-on-surface-variant">
                VALOR ACTUAL
              </span>
              <span className="text-title-md font-title-md text-tertiary font-black">
                {formatARS(currentPrice ?? nextPrice)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-label-caps font-label-caps text-on-surface-variant">
                TIEMPO DE REINADO
              </span>
              <span className="text-body-lg font-body-lg text-on-surface">
                {isHeld && title.reignStartedAt
                  ? formatReignDuration(title.reignStartedAt)
                  : "—"}
              </span>
            </div>
          </div>

          {pendingClaim ? (
            <PaymentInstructions claim={pendingClaim} alias={env.PAYMENT_ALIAS} />
          ) : (
            <div className="glass-panel rounded-xl p-6 flex flex-col gap-4">
              <h2 className="text-title-md font-title-md text-on-surface">
                {isHeld ? "¿Querés destronarlo?" : "¿Lo querés para vos?"}
              </h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant">
                El trono tiene precio. Poné la guita y es tuyo.
              </p>
              <div className="flex justify-between items-center border-t border-outline-variant/20 pt-3">
                <span className="text-label-caps font-label-caps text-on-surface-variant">
                  PRECIO MÍNIMO
                </span>
                <span className="text-title-md font-title-md text-on-surface font-black">
                  {formatARS(nextPrice)}
                </span>
              </div>
              {user ? (
                <DethroneForm
                  titleId={title.id}
                  slug={slug}
                  minAmount={nextPrice}
                  isHeld={isHeld}
                />
              ) : (
                <Link
                  href="/login"
                  className="self-stretch text-center btn-destronar text-on-surface px-8 py-3 rounded-lg text-label-caps font-label-caps font-bold tracking-widest border border-secondary-container/50"
                >
                  INICIAR SESIÓN PARA {isHeld ? "DESTRONAR" : "CORONARME"}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <ReignHistory pastReigns={title.pastReigns} />
    </main>
  );
}
