"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { LoadingGlyph } from "../../../components/loading/LoadingGlyph.tsx";
import kit from "../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../components/menu/OriginalImage.tsx";
import {
  OriginalButton,
  OriginalTicker,
  OriginalTitleBar,
  OriginalWindow,
} from "../../../components/menu/OriginalKit.tsx";
import { useSetWalletGems } from "../../../components/menu/WalletGems.tsx";
import type { OriginalAsset } from "../../../lib/original/original-assets.ts";
import {
  SUMMON_COSTS,
  type SummonCount,
  summonProblem,
  TICKET_PULLS,
  ticketOffered,
} from "../../../lib/summon/constants.ts";
import type { SummonBannerView, SummonPullView } from "../../../lib/summon/summon.ts";
import {
  SUMMON_BUTTONS,
  SUMMON_CONFIRM_PATH,
  SUMMON_PAGE_ARROWS,
  SUMMON_PATH,
  SUMMON_TICKET_ART,
  SUMMON_WINDOW_DECO,
  summonsAffordable,
} from "../../../lib/summon/summon-screen.ts";
import { type SummonActionResult, summonUnits, summonWithTicket } from "./actions.ts";
import { SummonSequence } from "./SummonSequence.tsx";
import styles from "./summon.module.css";

/**
 * The Summon screen rebuilt from the original's pieces (M8-11, RESOLVED-98; ART_GUIDE -> UI ->
 * Summon). The banner page (layouts/summon.json) shows the banner art, the page counter, the
 * gold Summon button, and the description frame; Summon opens the confirm window
 * (`?step=confirm`, layouts/summon_confirm.json) over the banner's door, with Summon (1 pull),
 * Multi Summon (10+1), and the free 10-pull ticket while one is held. A summon calls the server
 * action, then plays BFR's `SummonSequence` (the original's gate SAM animations wait for M8-21)
 * over the whole column, and returns to the banner page.
 */
export function SummonScreen({
  banners,
  confirming,
  gems: initialGems,
  pityPulls,
  tickets: initialTickets,
}: {
  banners: SummonBannerView[];
  confirming: boolean;
  gems: number | null;
  pityPulls: Readonly<Record<string, number>> | null;
  tickets: number | null;
}): ReactNode {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [gems, setGemsLocal] = useState(initialGems);
  const [pity, setPity] = useState(pityPulls);
  const [tickets, setTickets] = useState(initialTickets);
  const [message, setMessage] = useState<string | null>(null);
  const [showRates, setShowRates] = useState(false);
  const [pulls, setPulls] = useState<SummonPullView[] | null>(null);
  const [pending, startTransition] = useTransition();
  const setWalletGems = useSetWalletGems();
  const banner = banners[index];
  if (!banner) return <p role="alert">No summon is open right now.</p>;

  function play(run: (bannerId: string) => Promise<SummonActionResult>): void {
    if (!banner) return;
    setMessage(null);
    startTransition(async () => {
      const result = await run(banner.id);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      const { gems: gemsAfter, pityAfter, ticketsAfter, pulls: pulled } = result.outcome;
      setGemsLocal(gemsAfter);
      setWalletGems(gemsAfter);
      if (ticketsAfter !== null) setTickets(ticketsAfter);
      setPity((p) => ({ ...(p ?? {}), [banner.id]: pityAfter }));
      setPulls(pulled);
    });
  }

  function summon(count: SummonCount): void {
    const problem = summonProblem(gems, count);
    if (problem) {
      setMessage(problem);
      return;
    }
    play((bannerId) => summonUnits(bannerId, count));
  }

  const step = (delta: number) => setIndex((i) => (i + delta + banners.length) % banners.length);
  const pityNow = pity?.[banner.id] ?? 0;
  const featured = banner.featured.join(" and ");
  const ticker = message ? (
    <span role="alert">{message}</span>
  ) : confirming ? (
    "Tap the Summon button to Summon a Unit."
  ) : banners.length > 1 ? (
    "Swipe left or right to select the type of Summon."
  ) : (
    "Tap Summon to open the Summon Gate."
  );

  return (
    <div className={styles.shell}>
      <div className={kit.page}>
        {!confirming && banner.art ? (
          <OriginalImage asset={banner.art.banner} className={styles.bannerArt} priority />
        ) : null}
        <OriginalTitleBar
          title="Summon"
          backHref={confirming ? SUMMON_PATH : "/home"}
          action={
            <OriginalButton size="sub_s_btn" onClick={() => setShowRates(true)}>
              Rates
            </OriginalButton>
          }
        />
        <div className={`${kit.body} ${styles.body}`}>
          {confirming ? (
            <>
              {banner.art ? (
                <OriginalImage asset={banner.art.door} className={styles.door} />
              ) : null}
              <DecoratedWindow className={styles.confirmWindow}>
                <h2 className={`${kit.text} ${styles.confirmTitle}`}>{banner.name}</h2>
                <p className={`${kit.text} ${styles.confirmIntro}`}>
                  <span className={styles.gold}>{featured}</span> join at 5★ through the Summon
                  Gate! Pull {banner.pityLimit} without them guarantees one ({pityNow} so far).
                </p>
                <p className={`${kit.text} ${styles.confirmCost}`}>
                  <span className={styles.mint}>Summon once for {SUMMON_COSTS[1]} Gem(s).</span>
                  <br />
                  <span className={styles.mint}>
                    Multi Summon: 11 units for {SUMMON_COSTS[11]} Gem(s).
                  </span>
                  <br />
                  Available: <span className={styles.yellow}>{gems ?? "–"}</span> Gem(s)
                </p>
                {ticketOffered(banner.id, tickets) ? (
                  <button
                    type="button"
                    className={`${kit.button} ${styles.ticket}`}
                    disabled={pending}
                    onClick={() => play(summonWithTicket)}
                    aria-label={`Use a Summon Ticket: ${TICKET_PULLS} free summons (${tickets} held)`}
                  >
                    <OriginalImage asset={SUMMON_TICKET_ART} className={styles.ticketArt} />
                    <span className={`${kit.text} ${styles.ticketText}`}>
                      Use a Summon Ticket ×{tickets}
                      <br />
                      <span className={styles.yellow}>{TICKET_PULLS} free summons</span>
                    </span>
                  </button>
                ) : (
                  <p className={`${kit.text} ${styles.confirmCount}`}>
                    You can summon{" "}
                    <span className={styles.yellow}>
                      {summonsAffordable(gems, SUMMON_COSTS[1])}
                    </span>{" "}
                    time(s).
                  </p>
                )}
                <SummonArtButton
                  art={SUMMON_BUTTONS.single}
                  label={`Summon: 1 unit for ${SUMMON_COSTS[1]} gems`}
                  className={styles.confirmSingle}
                  disabled={pending || summonProblem(gems, 1) !== null}
                  onClick={() => summon(1)}
                />
                <SummonArtButton
                  art={SUMMON_BUTTONS.multi}
                  label={`Multi Summon: 11 units for ${SUMMON_COSTS[11]} gems`}
                  className={styles.confirmMulti}
                  disabled={pending || summonProblem(gems, 11) !== null}
                  onClick={() => summon(11)}
                />
              </DecoratedWindow>
            </>
          ) : (
            <section aria-label={banner.name} className={styles.bannerPage}>
              <p className={`${kit.text} ${styles.pageCounter}`}>
                {index + 1}/{banners.length}
              </p>
              {banners.length > 1 ? (
                <>
                  <button
                    type="button"
                    className={`${styles.arrow} ${styles.arrowLeft}`}
                    onClick={() => step(-1)}
                    aria-label="Previous summon"
                  >
                    <OriginalImage asset={SUMMON_PAGE_ARROWS[0]} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.arrow} ${styles.arrowRight}`}
                    onClick={() => step(1)}
                    aria-label="Next summon"
                  >
                    <OriginalImage asset={SUMMON_PAGE_ARROWS[1]} />
                  </button>
                </>
              ) : null}
              <Link
                href={SUMMON_CONFIRM_PATH}
                className={`${kit.button} ${styles.bannerSummon}`}
                aria-label="Summon"
                onClick={() => setMessage(null)}
              >
                <OriginalImage
                  asset={`${SUMMON_BUTTONS.single}1.png` as OriginalAsset}
                  className={kit.normal}
                />
                <OriginalImage
                  asset={`${SUMMON_BUTTONS.single}2.png` as OriginalAsset}
                  className={kit.pressed}
                />
              </Link>
              <DecoratedWindow className={styles.descWindow}>
                <p className={`${kit.text} ${styles.descText}`}>
                  <span className={styles.gold}>{featured}</span> join at{" "}
                  <span className={styles.yellow}>5★</span> through the Summon Gate! A{" "}
                  <span className={styles.mint}>featured unit</span> is guaranteed by pull{" "}
                  {banner.pityLimit} ({pityNow} without one so far).
                </p>
              </DecoratedWindow>
            </section>
          )}
        </div>
        <OriginalTicker>{ticker}</OriginalTicker>
      </div>

      {pending ? <LoadingGlyph variant="screen" /> : null}

      {showRates ? (
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Summon rates">
          <OriginalWindow variant="system" className={styles.ratesWindow}>
            <h2 className={`${kit.text} ${styles.ratesTitle}`}>{banner.name}: rates</h2>
            <table className={styles.rates}>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Rarity</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {banner.rates.map((r) => (
                  <tr key={r.unitId} className={r.featured ? styles.gold : undefined}>
                    <td>{r.name}</td>
                    <td>{r.rarityLabel}</td>
                    <td>{r.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.ratesNote}>
              Rates are per pull and add up to 100%. Pull {banner.pityLimit} without a featured unit
              guarantees one of them.
            </p>
            <OriginalButton
              size="sub_s_btn"
              className={styles.ratesClose}
              onClick={() => setShowRates(false)}
            >
              Close
            </OriginalButton>
          </OriginalWindow>
        </div>
      ) : null}

      {pulls ? (
        <SummonSequence
          pulls={pulls}
          onDone={() => {
            setPulls(null);
            router.push(SUMMON_PATH);
          }}
        />
      ) : null}
    </div>
  );
}

/** The kit's system window with the original's gold flourishes on two corners. */
function DecoratedWindow({
  className,
  children,
}: {
  className: string | undefined;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={className}>
      <OriginalWindow variant="system" className={styles.decoratedFill} />
      <OriginalImage asset={SUMMON_WINDOW_DECO[0]} className={styles.decoTopLeft} />
      <OriginalImage asset={SUMMON_WINDOW_DECO[1]} className={styles.decoBottomRight} />
      {children}
    </div>
  );
}

/** A summon button whose caption is baked into its art; pressed art shows while held. */
function SummonArtButton({
  art,
  label,
  className,
  disabled,
  onClick,
}: {
  art: string;
  label: string;
  className: string | undefined;
  disabled: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className={`${kit.button} ${className}`}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      <OriginalImage asset={`${art}1.png` as OriginalAsset} className={kit.normal} />
      <OriginalImage asset={`${art}2.png` as OriginalAsset} className={kit.pressed} />
    </button>
  );
}
