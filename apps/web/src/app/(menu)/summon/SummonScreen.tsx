"use client";

import Link from "next/link";
import { type ReactNode, useState, useTransition } from "react";
import { textBoxStyle } from "../../../components/menu/text-box.ts";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import { useSetWalletGems } from "../../../components/menu/WalletGems.tsx";
import { SUMMON_COSTS, type SummonCount, summonProblem } from "../../../lib/summon/constants.ts";
import type { SummonBannerView, SummonPullView } from "../../../lib/summon/summon.ts";
import { summonUnits } from "./actions.ts";
import { SummonSequence } from "./SummonSequence.tsx";
import styles from "./summon.module.css";

/**
 * The summon screen (ART_GUIDE → Summon screen, gate, and reveal): the banner carousel, its info
 * panel with costs, pity, and rates, and the two Summon buttons. A summon calls the server action,
 * then plays `SummonSequence` over the whole column.
 */
export function SummonScreen({
  banners,
  gems: initialGems,
  pityPulls,
}: {
  banners: SummonBannerView[];
  gems: number | null;
  pityPulls: Readonly<Record<string, number>> | null;
}): ReactNode {
  const [index, setIndex] = useState(0);
  const [gems, setGemsLocal] = useState(initialGems);
  const [pity, setPity] = useState(pityPulls);
  const [message, setMessage] = useState<string | null>(null);
  const [showRates, setShowRates] = useState(false);
  const [pulls, setPulls] = useState<SummonPullView[] | null>(null);
  const [pending, startTransition] = useTransition();
  const setWalletGems = useSetWalletGems();
  const banner = banners[index];
  if (!banner) return <p role="alert">No summon is open right now.</p>;

  function summon(count: SummonCount): void {
    if (!banner) return;
    const problem = summonProblem(gems, count);
    if (problem) {
      setMessage(problem);
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await summonUnits(banner.id, count);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setGemsLocal(result.outcome.gems);
      setWalletGems(result.outcome.gems);
      setPity((p) => ({ ...(p ?? {}), [banner.id]: result.outcome.pityAfter }));
      setPulls(result.outcome.pulls);
    });
  }

  const step = (delta: number) => setIndex((i) => (i + delta + banners.length) % banners.length);
  const pityNow = pity?.[banner.id] ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.titleBar}>
        <Link href="/home" className={`${styles.pill} ${styles.backButton}`}>
          <span className={styles.outline}>Back</span>
        </Link>
        <div className={styles.titlePlate}>
          <UiImage name="title-plate" className={styles.fill} />
          <div className={styles.titleText} style={textBoxStyle("title-plate")}>
            <h1 className={styles.outline}>Summon</h1>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <section className={styles.banner} aria-label={banner.name}>
          {banner.art ? <UiImage name={banner.art} className={styles.bannerArt} priority /> : null}
          <h2 className={styles.bannerTitle}>{banner.name}</h2>
          {banners.length > 1 ? (
            <>
              <button
                type="button"
                className={styles.arrowLeft}
                onClick={() => step(-1)}
                aria-label="Previous summon"
              >
                <UiImage name="banner-arrow" />
              </button>
              <button
                type="button"
                className={styles.arrowRight}
                onClick={() => step(1)}
                aria-label="Next summon"
              >
                <UiImage name="banner-arrow" />
              </button>
            </>
          ) : null}
        </section>

        <section className={styles.panel}>
          <p className={styles.panelTitle}>Rare Summon</p>
          <p>
            <span className={styles.featured}>{banner.featured.join(" and ")}</span> join at 5★
            through the Summon Gate. Summon now!
          </p>
          <p className={styles.small}>
            Pity: {pityNow} / {banner.pityLimit} pulls without a featured unit; pull{" "}
            {banner.pityLimit} guarantees one.
          </p>
          <p className={styles.gemLine}>
            Gems: <strong>{gems ?? "–"}</strong>
          </p>
          <div className={styles.buttons}>
            {([1, 11] as const).map((count) => (
              <button
                key={count}
                type="button"
                className={styles.summonButton}
                disabled={pending || summonProblem(gems, count) !== null}
                onClick={() => summon(count)}
              >
                <span className={styles.outline}>{count === 1 ? "Summon" : "Summon 10+1"}</span>
                <span className={`${styles.cost} ${styles.outline}`}>
                  <UiImage name="icon-gem" className={styles.gemIcon} />
                  {SUMMON_COSTS[count]}
                </span>
              </button>
            ))}
          </div>
          {message ? (
            <p role="alert" className={styles.alert}>
              {message}
            </p>
          ) : null}
          <button type="button" className={styles.ratesLink} onClick={() => setShowRates(true)}>
            Summon rates
          </button>
        </section>
      </div>

      {pending ? (
        <div className={styles.connecting} role="status">
          <span className={styles.outline}>Connecting…</span>
        </div>
      ) : null}

      {showRates ? (
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Summon rates">
          <div className={styles.ratesPanel}>
            <h2 className={styles.panelTitle}>{banner.name}: rates</h2>
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
                  <tr key={r.unitId} className={r.featured ? styles.featured : undefined}>
                    <td>{r.name}</td>
                    <td>{r.rarityLabel}</td>
                    <td>{r.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.small}>
              Rates are per pull and add up to 100%. Pull {banner.pityLimit} without a featured unit
              guarantees one of them.
            </p>
            <button
              type="button"
              className={`${styles.pill} ${styles.closeButton}`}
              onClick={() => setShowRates(false)}
            >
              <span className={styles.outline}>Close</span>
            </button>
          </div>
        </div>
      ) : null}

      {pulls ? <SummonSequence pulls={pulls} onDone={() => setPulls(null)} /> : null}
    </div>
  );
}
