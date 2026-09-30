import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import menu from "../../../../components/menu/menu.module.css";
import { textBoxStyle } from "../../../../components/menu/text-box.ts";
import { UiImage } from "../../../../components/menu/UiImage.tsx";
import type { UnitDetailView } from "../../../../lib/units/owned-units.ts";
import { SplitButton } from "../stack/[stackId]/SplitButton.tsx";
import styles from "../units.module.css";

const SKILL_ROWS = [
  { key: "leader", label: "Leader Skill", tag: "skill-tag-red" },
  { key: "extra", label: "Extra Skill", tag: "skill-tag-violet" },
  { key: "burst", label: "Brave Burst", tag: "skill-tag-blue" },
] as const;

/**
 * One owned unit as the original's Unit Info (M3-03G, ART_GUIDE → UI → Units, Squad, and Unit
 * detail screens): the title plate with orb, stars, and names; the splash over element-tinted
 * `bg-olive`; the stat plate column; Enhance / Evolve; and the skill rows. Presentational only;
 * `page.tsx` reads the row. A stack (M4-05C) shows its copy count and Split in place of Enhance /
 * Evolve, since a stacked copy must be split out before it can be levelled or fielded.
 */
export function UnitDetail({
  unit,
  evolveLabel,
  stack,
}: {
  unit: UnitDetailView;
  /** "Evolve" or "Omni Evolve" when the form has a next form to evolve into; otherwise null. */
  evolveLabel: string | null;
  /** Set when this is a stack of untouched copies: its `owned_unit_stacks` id and count. */
  stack?: { id: string; count: number };
}): ReactNode {
  const stats = unit.currentStats;
  const statRows: readonly [string, string][] = [
    ["HP", stats ? stats.hp.toLocaleString("en-US") : "–"],
    ["ATK", stats ? stats.atk.toLocaleString("en-US") : "–"],
    ["DEF", stats ? stats.def.toLocaleString("en-US") : "–"],
    ["REC", stats ? stats.rec.toLocaleString("en-US") : "–"],
  ];
  const atCap = unit.maxLevel !== null && unit.level >= unit.maxLevel;
  return (
    <div className={styles.detailPage} data-element={unit.element ?? undefined}>
      <header className={styles.titleBar}>
        <Link href="/units" className={`${styles.pill} ${styles.backButton}`}>
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

      <div className={styles.detailBody}>
        <section className={styles.hero}>
          {unit.illustration ? (
            <Image
              src={unit.illustration}
              alt={`${unit.name}, ${unit.rarityLabel} form`}
              width={1024}
              height={1024}
              sizes="(max-width: 640px) 90vw, 560px"
              className={styles.detailSplash}
              priority
            />
          ) : (
            <span className={styles.detailNoArt}>{unit.name.charAt(0)}</span>
          )}

          <dl className={styles.statColumn}>
            {stack ? <StatPlate label="Copies" value={`×${stack.count}`} /> : null}
            <StatPlate label="Type" value={unit.typeLabel} />
            <StatPlate
              label="Lv."
              value={unit.maxLevel ? `${unit.level}/${unit.maxLevel}` : String(unit.level)}
            />
            <StatPlate
              label="Next Lv."
              value={
                unit.expToNext !== null
                  ? unit.expToNext.toLocaleString("en-US")
                  : atCap
                    ? "MAX"
                    : "–"
              }
            />
            <div className={styles.expBar} aria-hidden>
              <span style={{ width: `${unit.expProgress * 100}%` }} />
            </div>
            {statRows.map(([label, value]) => (
              <StatPlate key={label} label={label} value={value} />
            ))}
          </dl>

          {stack ? (
            <SplitButton stackId={stack.id} />
          ) : (
            <div className={styles.actions}>
              <Link
                href={`/fusion?target=${unit.id}`}
                className={`${styles.actionButton} ${styles.enhanceButton}`}
              >
                <span className={styles.outline}>Enhance</span>
              </Link>
              {evolveLabel ? (
                <Link href={`/units/${unit.id}/evolve`} className={styles.actionButton}>
                  <span className={styles.outline}>{evolveLabel}</span>
                </Link>
              ) : null}
            </div>
          )}
        </section>

        <section className={styles.skills} aria-label="Skills">
          {SKILL_ROWS.map(({ key, label, tag }) => {
            const name = unit.skills[key];
            if (!name) return null;
            return (
              <div key={key} className={styles.skillRow}>
                <span className={styles.skillTag} data-tag={tag}>
                  <UiImage name={tag} className={styles.titlePlateArt} />
                  <span
                    className={`${styles.skillTagText} ${styles.outline}`}
                    style={textBoxStyle(tag)}
                  >
                    {label}
                  </span>
                </span>
                <span className={styles.skillName}>{name}</span>
              </div>
            );
          })}
        </section>

        {stats ? null : (
          <p className={styles.detailNote}>
            This unit's level is outside its form's range, so its current stats are not shown.
          </p>
        )}
      </div>

      <p className={menu.ticker}>
        {stack
          ? "Split a copy out of the stack to level, equip, or field it."
          : "Enhance a unit through fusion, or evolve it at its level cap."}
      </p>
    </div>
  );
}

function StatPlate({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className={styles.statPlate}>
      <dt className={`${styles.statLabel} ${styles.outline}`}>{label}</dt>
      <dd className={`${styles.statValue} ${styles.outline}`}>{value}</dd>
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
