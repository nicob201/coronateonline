import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTitleBySlug } from "@/services/titles.server";
import { getBalance } from "@/services/wallet.server";
import { ReignHistory } from "@/components/reign-history";
import { PriceSparkline } from "@/components/price-sparkline";
import { LongestReigns } from "@/components/longest-reigns";
import { ShareButton } from "@/components/share-button";
import { BotBadge } from "@/components/bot-badge";
import { LiveRefresh } from "@/components/live-refresh";
import { DethroneForm } from "@/features/dethrone/components/dethrone-form";
import { formatCoronas, formatReignDuration } from "@/lib/format";
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
  const balance = user ? await getBalance(supabase, user.id) : 0;

  const isHeld = title.holder !== null;
  const iAmHolder = !!user && user.id === title.holderUserId;
  const currentPrice = title.price;
  const nextPrice = minClaimAmount(currentPrice);

  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[1280px] pt-12 pb-32 flex flex-col gap-12">
      <LiveRefresh titleId={title.id} />
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
          <div className="mt-4">
            <ShareButton
              path={`/t/${slug}`}
              title={`${title.name} — CoronaTeOnline`}
              text={isHeld ? `Rey/Reina: ${title.holderName}` : "Trono vacante"}
              label="Compartí este título"
            />
          </div>
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
                {isHeld ? (
                  <>
                    {title.holderName}
                    {title.holder?.is_bot && <BotBadge />}
                  </>
                ) : (
                  "Sin coronar"
                )}
              </span>
            </div>
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-2">
              <span className="text-label-caps font-label-caps text-on-surface-variant">
                VALOR ACTUAL
              </span>
              <span className="text-title-md font-title-md text-tertiary font-black">
                {formatCoronas(currentPrice ?? nextPrice)}
              </span>
            </div>
            {isHeld && title.holderPaid !== null && title.holderPaid !== currentPrice && (
              <div className="flex justify-between items-center border-b border-outline-variant/20 pb-2">
                <span className="text-label-caps font-label-caps text-on-surface-variant">
                  CORONADO POR
                </span>
                <span className="text-body-lg font-body-lg text-on-surface-variant">
                  {formatCoronas(title.holderPaid)}
                </span>
              </div>
            )}
            {isHeld && title.holder?.is_bot && (
              <p className="text-body-sm font-body-sm text-on-surface-variant border-b border-outline-variant/20 pb-2">
                🤖 Corona de bot: pierde la mitad de su valor cada 6 h
              </p>
            )}
            {isHeld && !title.holder?.is_bot && (
              <div className="flex justify-between items-center border-b border-outline-variant/20 pb-2">
                <span className="text-label-caps font-label-caps text-on-surface-variant">
                  PISO
                </span>
                <span className="text-body-lg font-body-lg text-on-surface-variant">
                  {formatCoronas(title.priceFloor)}
                </span>
              </div>
            )}
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
            {isHeld && title.holderMessage && (
              <p className="text-body-sm font-body-sm italic text-on-surface-variant mt-2">
                «{title.holderMessage}»
              </p>
            )}
          </div>

          {title.priceHistory.length >= 2 && (
            <div className="glass-panel rounded-xl p-6 flex flex-col gap-3 border-l-4 border-l-primary">
              <h2 className="text-title-md font-title-md text-on-surface mb-1">
                Historia de precio
              </h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant">
                Valió hasta {formatCoronas(title.pricePeak)}
              </p>
              <PriceSparkline prices={title.priceHistory} />
              {title.price !== null && title.price <= title.pricePeak * 0.35 && (
                <span className="inline-block self-start bg-tertiary/20 text-tertiary text-xs px-2 py-0.5 rounded-full font-bold">
                  🔻 mínimo histórico
                </span>
              )}
            </div>
          )}

          {iAmHolder ? (
            <div className="glass-panel rounded-xl p-6 flex flex-col gap-2 border-l-4 border-l-tertiary">
              <h2 className="text-title-md font-title-md text-on-surface">
                El trono es tuyo 👑
              </h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant">
                Lo mantenés hasta que alguien pague más. Compartí tu perfil para
                que sepan quién manda.
              </p>
            </div>
          ) : (
            <div className="glass-panel rounded-xl p-6 flex flex-col gap-4">
              <h2 className="text-title-md font-title-md text-on-surface">
                {isHeld ? "¿Querés destronarlo?" : "¿Lo querés para vos?"}
              </h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant">
                El trono tiene precio. Pagalo en Coronas y es tuyo.
              </p>
              <div className="flex justify-between items-center border-t border-outline-variant/20 pt-3">
                <span className="text-label-caps font-label-caps text-on-surface-variant">
                  PRECIO MÍNIMO
                </span>
                <span className="text-title-md font-title-md text-on-surface font-black">
                  {formatCoronas(nextPrice)}
                </span>
              </div>
              {user ? (
                <DethroneForm
                  titleId={title.id}
                  minAmount={nextPrice}
                  balance={balance}
                  isHeld={isHeld}
                />
              ) : (
                <Link
                  href={`/login?next=${encodeURIComponent(`/t/${slug}`)}`}
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

      <LongestReigns reigns={title.longestReigns} />
    </main>
  );
}
