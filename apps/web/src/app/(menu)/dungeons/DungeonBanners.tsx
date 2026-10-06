import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { textBoxStyle } from "../../../components/menu/text-box.ts";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import bannerArt from "../../../lib/quests/dungeon-banner-art.json";
import type { DungeonSeriesView } from "../../../lib/quests/dungeons.ts";
import { DUNGEON_CATEGORIES } from "../../../lib/quests/dungeons.ts";
import { SIGN_IN_PATH } from "../../../lib/supabase/routes.ts";
import styles from "./dungeons.module.css";

type Banner = {
  id: string;
  title: string;
  type: string;
  href: string;
  sprite: string;
  locked: boolean;
  gateText: string;
  leftToday?: number;
};

export function DungeonNotice({
  signedIn,
  failed,
  path,
}: {
  signedIn: boolean;
  failed: boolean;
  path: string;
}): ReactNode {
  return !signedIn ? (
    <p className={styles.notice}>
      <Link href={`${SIGN_IN_PATH}?next=${encodeURIComponent(path)}`}>Sign in</Link> to begin a
      dungeon and track your progress.
    </p>
  ) : failed ? (
    <p className={styles.notice} role="alert">
      Your dungeon progress could not be loaded. Try again shortly.
    </p>
  ) : null;
}

/** Five categories at the root; multi-series categories open their own banner list. */
export function DungeonBanners({
  series,
  categoryId,
  signedIn,
  failed,
}: {
  series: readonly DungeonSeriesView[];
  categoryId?: string;
  signedIn: boolean;
  failed: boolean;
}): ReactNode {
  const category = DUNGEON_CATEGORIES.find((entry) => entry.id === categoryId);
  const banners: Banner[] = category
    ? series
        .filter((entry) => entry.category.id === category.id)
        .map((entry) => ({
          ...entry,
          id: `series-${entry.id}`,
          type: entry.category.type,
          href: `/dungeons/${entry.id}`,
        }))
    : DUNGEON_CATEGORIES.map((entry) => {
        const members = series.filter((member) => member.category.id === entry.id);
        const first = members[0];
        return {
          id: entry.id,
          title: entry.title,
          type: entry.type,
          href:
            entry.series.length === 1
              ? `/dungeons/${entry.series[0]}`
              : `/dungeons/category/${entry.id}`,
          sprite: first?.sprite ?? "/assets/ui/item-zenith-core.webp",
          locked: members.every((member) => member.locked),
          gateText: first?.gateText ?? "",
          ...(members.length === 1 && first?.leftToday !== undefined
            ? { leftToday: first.leftToday }
            : {}),
        };
      });
  const art: Readonly<Record<string, string>> = bannerArt;
  const path = category ? `/dungeons/category/${category.id}` : "/dungeons";
  return (
    <div className={styles.page} data-backdrop="vortex">
      <header className={styles.header}>
        <Link className={styles.pill} href={category ? "/dungeons" : "/home"}>
          Back
        </Link>
        <h1>{category?.title ?? "Dungeons"}</h1>
        <Link className={styles.pill} href="/home">
          Home
        </Link>
      </header>
      <DungeonNotice signedIn={signedIn} failed={failed} path={path} />
      <ul className={styles.list}>
        {banners.map((banner) => (
          <li key={banner.id} data-locked={banner.locked}>
            <Link href={banner.href} className={styles.banner} aria-label={banner.title}>
              <div className={styles.window}>
                <Image
                  src={art[banner.id] ?? banner.sprite}
                  alt=""
                  width={1280}
                  height={418}
                  unoptimized
                  className={art[banner.id] ? styles.keyArt : styles.standin}
                />
              </div>
              <UiImage name="dungeon-banner-frame" className={styles.frame} />
              <strong className={styles.title}>{banner.title}</strong>
              <span className={`${styles.plate} ${styles.type}`}>
                <UiImage name="dungeon-type-plate" className={styles.frame} />
                <span style={textBoxStyle("dungeon-type-plate")}>{banner.type}</span>
              </span>
              {signedIn && !failed && banner.leftToday !== undefined ? (
                <span className={`${styles.plate} ${styles.daily}`}>
                  <UiImage name="dungeon-type-plate" className={styles.frame} />
                  <span style={textBoxStyle("dungeon-type-plate")}>
                    Left {banner.leftToday} today
                  </span>
                </span>
              ) : null}
            </Link>
            {banner.locked ? <p className={styles.gate}>{banner.gateText}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
