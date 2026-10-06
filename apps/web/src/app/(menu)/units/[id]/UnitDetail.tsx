import type { Stats } from "@bfr/data";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import menu from "../../../../components/menu/menu.module.css";
import { textBoxStyle } from "../../../../components/menu/text-box.ts";
import { UiImage } from "../../../../components/menu/UiImage.tsx";
import type { UiAsset } from "../../../../components/menu/ui-assets.ts";
import type { UnitDetailView } from "../../../../lib/units/owned-units.ts";
import type { SphereSocketView } from "../../../../lib/units/spheres.ts";
import { type SkillDisplay, unitSkillDisplays } from "../../../../lib/units/unit-skills.ts";
import { SplitButton } from "../stack/[stackId]/SplitButton.tsx";
import styles from "../units.module.css";
import { sphereIcon } from "./SphereSocketFace.tsx";
import { UnitInfoBody } from "./UnitInfoBody.tsx";

/**
 * One owned unit as the original's Unit Info (M3-03G, reworked 2026-10-06; ART_GUIDE → UI →
 * Units, Squad, and Unit detail screens): the title plate with orb, stars, and names; the splash
 * over `bg-unit-info`; the left column of stat pills (bonus plates for stat-hob gains), the EXP
 * track, and the sphere rows; the right column's Enhance / Evolve and Switch; then the
 * pinned Leader Skill and burst rows (`UnitInfoBody`). Presentational; `page.tsx` reads the row.
 * A stack (M4-05C) shows its copy count and Split in place of Enhance / Evolve, since a stacked
 * copy must be split out before it can be levelled or fielded.
 */
export function UnitDetail({
  unit,
  evolveLabel,
  stack,
  spheres,
}: {
  unit: UnitDetailView;
  /** "Evolve" or "Omni Evolve" when the form has a next form to evolve into; otherwise null. */
  evolveLabel: string | null;
  /** Set when this is a stack of untouched copies: its `owned_unit_stacks` id and count. */
  stack?: { id: string; count: number };
  /** The unit's sphere sockets (M4-06J); each row opens the Equip Sphere screen. Not for stacks. */
  spheres?: readonly SphereSocketView[];
}): ReactNode {
  const stats = unit.currentStats;
  const statRows: readonly [string, keyof Stats][] = [
    ["HP", "hp"],
    ["Atk", "atk"],
    ["Def", "def"],
    ["Rec", "rec"],
  ];
  const atCap = unit.maxLevel !== null && unit.level >= unit.maxLevel;
  const skills = unitSkillDisplays(unit);
  const find = (key: SkillDisplay["key"]) => skills.find((skill) => skill.key === key) ?? null;
  const bursts = skills.filter(
    (skill) => skill.key === "bb" || skill.key === "sbb" || skill.key === "ubb",
  );

  const hero = (
    <>
      {unit.illustration ? (
        <Image
          src={unit.illustration}
          alt={`${unit.name}, ${unit.rarityLabel} form`}
          width={1024}
          height={1024}
          sizes="(max-width: 640px) 120vw, 760px"
          className={styles.infoSplash}
          priority
        />
      ) : (
        <span className={styles.detailNoArt}>{unit.name.charAt(0)}</span>
      )}

      <div className={styles.infoLeft}>
        <dl className={styles.infoStats}>
          {stack ? <StatPill label="Copies" value={`×${stack.count}`} size="type" /> : null}
          <StatPill label="Type" value={unit.typeLabel} size="type" accent />
          <StatPill
            label="Lv."
            value={unit.maxLevel ? `${unit.level}/${unit.maxLevel}` : String(unit.level)}
            size="wide"
          />
          <StatPill
            label="Next Lv."
            value={
              unit.expToNext !== null
                ? unit.expToNext.toLocaleString("en-US")
                : atCap
                  ? "----"
                  : "–"
            }
            size="wide"
          />
          <div className={styles.infoExp} aria-hidden>
            {/* The channel spans 85.4% of the track; the crystal tip fills the rest. */}
            <span style={{ width: `${unit.expProgress * 85.4}%` }} />
          </div>
          {statRows.map(([label, key]) => (
            <div key={key} className={styles.infoStatRow}>
              <StatPill
                label={label}
                value={stats ? stats[key].toLocaleString("en-US") : "–"}
                size="stat"
              />
              {unit.imps && unit.imps[key] > 0 ? (
                <span className={styles.infoBonus} title={`${label} bonus from stat hobs`}>
                  {unit.imps[key].toLocaleString("en-US")}
                </span>
              ) : null}
            </div>
          ))}
        </dl>

        {spheres && !stack ? (
          <nav className={styles.infoSpheres} aria-label="Spheres">
            {spheres.map((socket) => (
              <Link
                key={socket.slot}
                href={`/units/${unit.id}/spheres`}
                className={styles.infoSphere}
                data-locked={!socket.unlocked || undefined}
                title={socket.sphere?.summary}
              >
                <span className={styles.infoSphereIcon} aria-hidden>
                  {socket.sphere && sphereIcon(socket.sphere.sphereId) ? (
                    <UiImage name={sphereIcon(socket.sphere.sphereId) as UiAsset} />
                  ) : socket.sphere ? (
                    <span className={styles.outline}>{socket.sphere.name.charAt(0)}</span>
                  ) : null}
                </span>
                <span className={`${styles.infoSphereName} ${styles.outline}`}>
                  {socket.sphere ? socket.sphere.name : socket.unlocked ? "Empty" : "Locked"}
                </span>
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {stats ? null : (
        <p className={styles.infoNote}>
          This unit's level is outside its form's range, so its current stats are not shown.
        </p>
      )}
    </>
  );

  const actions = (
    <>
      {stack ? (
        <SplitButton stackId={stack.id} />
      ) : (
        <>
          <Link href={`/fusion?target=${unit.id}`} className={styles.infoButton}>
            <span className={styles.outline}>Enhance</span>
          </Link>
          {evolveLabel ? (
            <Link href={`/units/${unit.id}/evolve`} className={styles.infoButton}>
              <span className={styles.outline}>{evolveLabel}</span>
            </Link>
          ) : null}
        </>
      )}
    </>
  );

  return (
    <div className={styles.detailPage} data-element={unit.element ?? undefined}>
      <UnitTitleBar unit={unit} backHref="/units/list" />
      <UnitInfoBody
        hero={hero}
        actions={actions}
        leader={find("leader")}
        extra={find("extra")}
        bursts={bursts}
      />
      {stack ? (
        <p className={menu.ticker}>Split a copy out of the stack to level, equip, or field it.</p>
      ) : null}
    </div>
  );
}

/**
 * The detail's title bar: Back and the title plate with the element orb, rarity stars, form name,
 * and unit name. Shared with the Equip Sphere screen (M4-06J).
 */
export function UnitTitleBar({
  unit,
  backHref,
}: {
  unit: Pick<UnitDetailView, "element" | "rarity" | "rarityLabel" | "formName" | "name">;
  backHref: string;
}): ReactNode {
  return (
    <header className={styles.titleBar}>
      <Link href={backHref} className={`${styles.pill} ${styles.backButton}`}>
        <span className={styles.outline}>Back</span>
      </Link>
      <div className={styles.detailPlate}>
        <UiImage name="title-plate" className={styles.titlePlateArt} />
        <div className={styles.detailPlateText} style={textBoxStyle("title-plate")}>
          {unit.element ? (
            <UiImage name={`orb-${unit.element}`} className={styles.detailOrb} />
          ) : null}
          <div className={styles.detailNames}>
            <Stars rarity={unit.rarity} label={unit.rarityLabel} />
            <h1 className={styles.outline}>
              {unit.formName ? <span className={styles.detailForm}>{unit.formName}</span> : null}
              {unit.name}
            </h1>
          </div>
        </div>
      </div>
    </header>
  );
}

/** One stat pill: beige label, white value (the Type value in amber), sized by its row. */
function StatPill({
  label,
  value,
  size,
  accent = false,
}: {
  label: string;
  value: string;
  size: "type" | "wide" | "stat";
  accent?: boolean;
}): ReactNode {
  return (
    <div className={styles.infoPill} data-size={size}>
      <dt className={`${styles.infoPillLabel} ${styles.outline}`}>{label}</dt>
      <dd className={`${styles.infoPillValue} ${styles.outline}`} data-accent={accent || undefined}>
        {value}
      </dd>
    </div>
  );
}

/** The form's rarity as gold stars (seven brighter stars for Omni). */
function Stars({ rarity, label }: { rarity: UnitDetailView["rarity"]; label: string }): ReactNode {
  if (rarity === null) return null;
  const count = rarity === "omni" ? 7 : rarity;
  return (
    <span
      className={`${styles.stars} ${styles.outline}`}
      data-omni={rarity === "omni" || undefined}
      role="img"
      aria-label={label}
    >
      {"★".repeat(count)}
    </span>
  );
}
