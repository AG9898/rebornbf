import type { Stats } from "@bfr/data";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { OriginalImage } from "../../../../components/menu/OriginalImage.tsx";
import { OriginalButton, OriginalTitleBar } from "../../../../components/menu/OriginalKit.tsx";
import { UiImage } from "../../../../components/menu/UiImage.tsx";
import type { UnitDetailView } from "../../../../lib/units/owned-units.ts";
import type { SphereSocketView } from "../../../../lib/units/spheres.ts";
import { UNIT_INFO_ASSETS as A } from "../../../../lib/units/unit-info-screen.ts";
import { type SkillDisplay, unitSkillDisplays } from "../../../../lib/units/unit-skills.ts";
import { SplitButton } from "../stack/[stackId]/SplitButton.tsx";
import { sphereIcon } from "./SphereSocketFace.tsx";
import { UnitInfoBody } from "./UnitInfoBody.tsx";
import styles from "./unit-info.module.css";

/** Original Unit Info chrome (M8-05) around BFR splash, owned stats and engine-scaled skills. */
export function UnitDetail({
  unit,
  evolveLabel,
  stack,
  spheres,
}: {
  unit: UnitDetailView;
  evolveLabel: string | null;
  stack?: { id: string; count: number };
  spheres?: readonly SphereSocketView[];
}): ReactNode {
  const statRows: readonly [string, keyof Stats][] = [
    ["HP", "hp"],
    ["Atk", "atk"],
    ["Def", "def"],
    ["Rec", "rec"],
  ];
  const skills = unitSkillDisplays(unit);
  const find = (key: SkillDisplay["key"]) => skills.find((skill) => skill.key === key) ?? null;
  const bursts = skills.filter(
    (skill) => skill.key === "bb" || skill.key === "sbb" || skill.key === "ubb",
  );
  const atCap = unit.maxLevel !== null && unit.level >= unit.maxLevel;
  const hero = (
    <>
      {unit.illustration ? (
        <Image
          src={unit.illustration}
          alt={`${unit.name}, ${unit.rarityLabel} form`}
          width={1024}
          height={1024}
          sizes="(max-width: 640px) 120vw, 760px"
          className={styles.splash}
          priority
        />
      ) : (
        <span className={styles.noArt}>{unit.name.charAt(0)}</span>
      )}
      <div className={styles.left}>
        <dl className={styles.stats}>
          <StatPill label="Type" art="type" value={unit.typeLabel} accent fit />
          <StatPill
            label="Lv."
            art="lv"
            value={unit.maxLevel ? `${unit.level}/${unit.maxLevel}` : String(unit.level)}
          />
          <StatPill
            label="Next Lv."
            art="next"
            value={
              unit.expToNext !== null
                ? unit.expToNext.toLocaleString("en-US")
                : atCap
                  ? "----"
                  : "–"
            }
          />
          <div className={styles.exp} aria-hidden>
            <OriginalImage asset={A.expBase} />
            <span className={styles.expFill} style={{ width: `${unit.expProgress * 100}%` }}>
              <OriginalImage asset={A.expFill} />
            </span>
          </div>
          {statRows.map(([label, key]) => (
            <div key={key} className={styles.statRow}>
              <StatPill
                label={label}
                art={key}
                value={unit.currentStats ? unit.currentStats[key].toLocaleString("en-US") : "–"}
              />
              {unit.imps && unit.imps[key] > 0 ? (
                <span
                  className={`${styles.pill} ${styles.bonus}`}
                  title={`${label} bonus from stat hobs`}
                >
                  <StatusFrame bonus />
                  <span className={`${styles.value} ${styles.text}`}>
                    {unit.imps[key].toLocaleString("en-US")}
                  </span>
                </span>
              ) : null}
            </div>
          ))}
        </dl>
      </div>
      {spheres && !stack ? (
        <nav className={styles.spheres} aria-label="Spheres">
          {spheres
            .filter((socket) => socket.unlocked)
            .map((socket) => {
              const icon = socket.sphere ? sphereIcon(socket.sphere.sphereId) : null;
              return (
                <Link
                  key={socket.slot}
                  href={`/units/${unit.id}/spheres`}
                  className={styles.sphere}
                  title={socket.sphere?.summary}
                >
                  <span className={styles.socket} aria-hidden>
                    <OriginalImage asset={A.socketBase} />
                    <OriginalImage asset={A.socket} />
                    {icon ? (
                      <UiImage name={icon} className={styles.sphereIcon} />
                    ) : socket.sphere ? (
                      <span className={styles.initial}>{socket.sphere.name.charAt(0)}</span>
                    ) : (
                      <OriginalImage asset={A.emptySphere} className={styles.emptySphere} />
                    )}
                  </span>
                  <span className={`${styles.pill} ${styles.sphereName}`}>
                    <StatusFrame />
                    <span className={`${styles.value} ${styles.text}`}>
                      {socket.sphere?.name ?? "Empty"}
                    </span>
                  </span>
                </Link>
              );
            })}
        </nav>
      ) : null}
      {unit.currentStats ? null : (
        <p className={styles.note}>
          This unit's level is outside its form's range, so its current stats are not shown.
        </p>
      )}
    </>
  );
  const actions = stack ? (
    <SplitButton stackId={stack.id} original />
  ) : (
    <>
      <OriginalButton
        size="sub_m_green_btn"
        href={`/fusion?target=${unit.id}`}
        className={styles.action}
      >
        <span className={styles.actionLabel}>Enhance</span>
      </OriginalButton>
      {evolveLabel ? (
        <OriginalButton
          size="sub_m_green_btn"
          href={`/units/${unit.id}/evolve`}
          className={styles.action}
        >
          <span className={styles.actionLabel}>{evolveLabel}</span>
        </OriginalButton>
      ) : null}
    </>
  );
  return (
    <div className={styles.page}>
      <UnitTitleBar unit={unit} backHref="/units/list" />
      <UnitInfoBody
        hero={hero}
        actions={actions}
        leader={find("leader")}
        extra={find("extra")}
        bursts={bursts}
      />
      {stack ? (
        <p className={styles.stackNote}>
          ×{stack.count} copies. Split a copy out of the stack to level, equip, or field it.
        </p>
      ) : null}
    </div>
  );
}

/** Unit Info's title bar; the screen kit supplies the one Back button and title plate. */
export function UnitTitleBar({
  unit,
  backHref,
}: {
  unit: Pick<UnitDetailView, "element" | "rarity" | "rarityLabel" | "formName" | "name">;
  backHref: string;
}): ReactNode {
  return (
    <OriginalTitleBar
      title={
        <span className={styles.titleRow}>
          {unit.element ? (
            <OriginalImage
              asset={`common/attribute_mark_M/${unit.element}.png`}
              className={styles.orb}
            />
          ) : null}
          <span className={styles.titleName}>{unit.name}</span>
          {unit.rarity !== null ? (
            <RarityMark rarity={unit.rarity} label={unit.rarityLabel} />
          ) : null}
        </span>
      }
      subtitle={unit.formName ?? "Unit Info"}
      backHref={backHref}
    />
  );
}

/** Original rarity: one `star_rare` per star (1–7), or the rainbow Omni mark. */
function RarityMark({
  rarity,
  label,
}: {
  rarity: NonNullable<UnitDetailView["rarity"]>;
  label: string;
}): ReactNode {
  if (rarity === "omni") {
    return <OriginalImage asset={A.omni} alt={label} className={styles.omni} />;
  }
  return (
    <span className={styles.stars} role="img" aria-label={label}>
      {Array.from({ length: rarity }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical stars, fixed order.
        <OriginalImage key={index} asset={A.star} className={styles.star} />
      ))}
    </span>
  );
}

function StatusFrame({ bonus = false }: { bonus?: boolean }): ReactNode {
  const parts = bonus ? A.bonus : A.frame;
  return (
    <span className={styles.frame} aria-hidden>
      <OriginalImage asset={parts[1]} className={styles.frameCenter} />
      <OriginalImage asset={parts[0]} className={styles.frameLeft} />
      <OriginalImage asset={parts[2]} className={styles.frameRight} />
    </span>
  );
}

function StatPill({
  label,
  art,
  value,
  accent = false,
  fit = false,
}: {
  label: string;
  art: keyof typeof A.labels;
  value: string;
  accent?: boolean;
  /** Size the frame to the caption and value instead of the 180 px column. */
  fit?: boolean;
}): ReactNode {
  return (
    <div className={styles.pill} data-fit={fit || undefined}>
      <StatusFrame />
      <dt className={styles.label}>
        <OriginalImage asset={A.labels[art]} alt={label} className={styles.labelArt} />
      </dt>
      <dd className={`${styles.value} ${styles.text}`} data-accent={accent || undefined}>
        {value}
      </dd>
    </div>
  );
}
