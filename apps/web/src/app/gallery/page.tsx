import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { type ArtForm, UnitArt } from "./UnitArt.tsx";

type UnitPreview = {
  id: string;
  name: string;
  title: string;
  tagline: string;
  element: string;
  role: string;
  illustrationAlt: string;
  /** Omitted until the unit has a battle-idle draft. */
  spriteAlt?: string;
  stageBackground: string;
  accentText: string;
  chip: string;
  /** Forms exported by `art/tools/bfr_art.py` as `illustration-<file>.png`. */
  forms?: ArtForm[];
  /** Each form also has `battle-idle-<file>.png`. */
  tierSprites?: boolean;
};

export const metadata: Metadata = { title: "Gallery · BFR" };

const STAR_FORMS: UnitPreview["forms"] = [
  { label: "3★", file: "3star" },
  { label: "4★", file: "4star" },
  { label: "5★", file: "5star" },
  { label: "6★", file: "6star" },
  { label: "7★", file: "7star" },
  { label: "Omni", file: "omni" },
];

const UNITS: UnitPreview[] = [
  {
    id: "brand",
    name: "Brand",
    title: "The Ember Knight",
    tagline: "An original Fire attacker who leads the charge with a blazing censer.",
    element: "Fire",
    role: "Attacker",
    illustrationAlt: "Brand, the Ember Knight, swinging a glowing fire censer",
    spriteAlt: "Pixel-art battle sprite of Brand holding a fire censer",
    stageBackground: "bg-[radial-gradient(circle_at_50%_55%,#71331c_0%,#322129_45%,#151725_78%)]",
    accentText: "text-orange-300",
    chip: "bg-orange-500/15 text-orange-200",
    forms: STAR_FORMS,
    tierSprites: true,
  },
  {
    id: "maren",
    name: "Maren",
    title: "The Frost Warden",
    tagline: "An original Water healer who guides her allies through the storm.",
    element: "Water",
    role: "Healer",
    illustrationAlt:
      "Maren, the Frost Warden, raising a ring of healing water beside her chime-bell crook",
    spriteAlt: "Pixel-art battle sprite of Maren holding a crook hung with ice bells",
    stageBackground: "bg-[radial-gradient(circle_at_50%_55%,#1b4f6b_0%,#1d2a3f_45%,#141827_78%)]",
    accentText: "text-cyan-300",
    chip: "bg-cyan-500/15 text-cyan-200",
    forms: STAR_FORMS,
    tierSprites: true,
  },
  {
    id: "rook",
    name: "Rook",
    title: "The Stormcaller",
    tagline: "An original Thunder attacker who turns every spark into a storm.",
    element: "Thunder",
    role: "Spark specialist",
    illustrationAlt:
      "Rook, the Stormcaller, leaping with a lightning-charged copper tuning-fork polearm",
    spriteAlt: "Pixel-art battle sprite of Rook shouldering a crackling copper tuning fork",
    stageBackground: "bg-[radial-gradient(circle_at_50%_55%,#5c4a14_0%,#2a2238_45%,#151725_78%)]",
    accentText: "text-yellow-300",
    chip: "bg-yellow-500/15 text-yellow-200",
    forms: STAR_FORMS,
    tierSprites: true,
  },
  {
    id: "garrick",
    name: "Garrick",
    title: "The Stonewall",
    tagline: "An original Earth tank who plants his shield and holds the line.",
    element: "Earth",
    role: "Tank",
    illustrationAlt:
      "Garrick, the Stonewall, slamming a granite tower shield into the ground with his mallet raised",
    spriteAlt: "Pixel-art battle sprite of Garrick resting a hand on a granite tower shield",
    stageBackground: "bg-[radial-gradient(circle_at_50%_55%,#2f5a2a_0%,#262a24_45%,#151725_78%)]",
    accentText: "text-emerald-300",
    chip: "bg-emerald-500/15 text-emerald-200",
    forms: STAR_FORMS,
    tierSprites: true,
  },
  {
    id: "solen",
    name: "Solen",
    title: "The Dawnbearer",
    tagline: "An original Light support who reckons the dawn and lifts every ally.",
    element: "Light",
    role: "Support",
    illustrationAlt:
      "Solen, the Dawnbearer, holding out a spinning brass armillary sundial while tracing a glowing star",
    spriteAlt:
      "Pixel-art battle sprite of Solen with a brass armillary sundial floating above his palm",
    stageBackground: "bg-[radial-gradient(circle_at_50%_55%,#5a4a1e_0%,#252640_45%,#151725_78%)]",
    accentText: "text-amber-200",
    chip: "bg-amber-300/15 text-amber-100",
    forms: STAR_FORMS,
    tierSprites: true,
  },
  {
    id: "morrick",
    name: "Morrick",
    title: "The Dusk Ferryman",
    tagline: "An original Dark mitigator, a shade who ferries every ally safely across.",
    element: "Dark",
    role: "Mitigator",
    illustrationAlt:
      "Morrick, the Dusk Ferryman, a hooded shade spirit driving a glowing violet-glass oar into dark water",
    spriteAlt: "Pixel-art battle sprite of Morrick, a hooded shade spirit holding a tall ferry oar",
    stageBackground: "bg-[radial-gradient(circle_at_50%_55%,#3f2a66_0%,#221d38_45%,#151725_78%)]",
    accentText: "text-violet-300",
    chip: "bg-violet-500/15 text-violet-200",
    forms: STAR_FORMS,
    tierSprites: true,
  },
  {
    id: "aurelle",
    name: "Aurelle",
    title: "The Haloblade",
    tagline: "An original Light blade dancer who conducts a storm of crystal blades.",
    element: "Light",
    role: "Blade nuker",
    illustrationAlt:
      "Aurelle, the Haloblade, spinning on one boot inside a whirling ring of glowing cyan crystal blades",
    spriteAlt:
      "Pixel-art battle sprite of Aurelle with a dagger drawn and an arc of crystal blades behind her",
    stageBackground: "bg-[radial-gradient(circle_at_50%_55%,#1f5a6b_0%,#252a44_45%,#151725_78%)]",
    accentText: "text-sky-200",
    chip: "bg-sky-400/15 text-sky-100",
    forms: STAR_FORMS,
    tierSprites: true,
  },
  {
    id: "vespera",
    name: "Vespera",
    title: "The Gravebloom",
    tagline: "An original Dark idol dancer who stitches her foes with scarlet pins.",
    element: "Dark",
    role: "DoT/ailment nuker",
    illustrationAlt:
      "Vespera, the Gravebloom, twirling on one sandal inside a ring of floating crimson hairpins and red threads",
    spriteAlt:
      "Pixel-art battle sprite of Vespera holding a hairpin, with an arc of crimson pins behind her",
    stageBackground: "bg-[radial-gradient(circle_at_50%_55%,#5a1d33_0%,#2a1a33_45%,#151725_78%)]",
    accentText: "text-rose-300",
    chip: "bg-rose-500/15 text-rose-200",
    forms: STAR_FORMS,
    tierSprites: true,
  },
];

/** Summon filler units (RESOLVED-14): one form each, exported as `<file>` art like the main units. */
type SingleFormUnit = { id: string; name: string; element: string; file: string; label: string };

const FILLERS: SingleFormUnit[] = [
  { id: "cinder-sprite", name: "Cinder Sprite", element: "Fire", file: "2star", label: "2★" },
  { id: "rill-sprite", name: "Rill Sprite", element: "Water", file: "2star", label: "2★" },
  { id: "moss-sprite", name: "Moss Sprite", element: "Earth", file: "2star", label: "2★" },
  { id: "volt-sprite", name: "Volt Sprite", element: "Thunder", file: "2star", label: "2★" },
  { id: "glint-sprite", name: "Glint Sprite", element: "Light", file: "2star", label: "2★" },
  { id: "dusk-sprite", name: "Dusk Sprite", element: "Dark", file: "2star", label: "2★" },
  { id: "brass-crucible", name: "Brass Crucible", element: "Earth", file: "2star", label: "2★" },
  { id: "silver-crucible", name: "Silver Crucible", element: "Light", file: "3star", label: "3★" },
];

const VESSEL_ELEMENTS = [
  ["cinder", "Cinder", "Fire"],
  ["rill", "Rill", "Water"],
  ["moss", "Moss", "Earth"],
  ["volt", "Volt", "Thunder"],
  ["glint", "Glint", "Light"],
  ["dusk", "Dusk", "Dark"],
] as const;

const VESSEL_TIERS = [
  ["flask", "Flask", 3],
  ["alembic", "Alembic", 4],
  ["athanor", "Athanor", 5],
  ["grail", "Grail", 5],
] as const;

/** Growth fodder (RESOLVED-55) with a locked splash and sprite. */
const GROWTH_FODDER: SingleFormUnit[] = [
  ...VESSEL_TIERS.flatMap(([tier, tierName, stars]) =>
    VESSEL_ELEMENTS.map(([prefix, prefixName, element]) => ({
      id: `${prefix}-${tier}`,
      name: `${prefixName} ${tierName}`,
      element,
      file: `${stars}star`,
      label: `${stars}★`,
    })),
  ),
  { id: "lantern-toad", name: "Lantern Toad", element: "Fire", file: "3star", label: "3★" },
  { id: "regent-toad", name: "Regent Toad", element: "Fire", file: "4star", label: "4★" },
  { id: "matriarch-toad", name: "Matriarch Toad", element: "Light", file: "4star", label: "4★" },
  { id: "star-toad", name: "Star Toad", element: "Light", file: "4star", label: "4★" },
  { id: "satchel-toad", name: "Satchel Toad", element: "Water", file: "3star", label: "3★" },
  { id: "vital-hob", name: "Vital Hob", element: "Fire", file: "3star", label: "3★" },
  { id: "might-hob", name: "Might Hob", element: "Thunder", file: "3star", label: "3★" },
  { id: "ward-hob", name: "Ward Hob", element: "Water", file: "3star", label: "3★" },
  { id: "mend-hob", name: "Mend Hob", element: "Earth", file: "3star", label: "3★" },
  { id: "grand-hob", name: "Grand Hob", element: "Light", file: "3star", label: "3★" },
];

const MATERIAL_FAMILIES = [
  ["effigy", "Effigy", 3],
  ["cairn", "Cairn", 4],
  ["colossus", "Colossus", 5],
] as const;

/** Evolution materials (RESOLVED-67) with a locked splash and sprite. */
const EVOLUTION_MATERIALS: SingleFormUnit[] = [
  ...VESSEL_ELEMENTS.map(([prefix, prefixName, element]) => ({
    id: `${prefix}-mote`,
    name: `${prefixName} Mote`,
    element,
    file: "1star",
    label: "1★",
  })),
  ...MATERIAL_FAMILIES.flatMap(([family, familyName, stars]) =>
    VESSEL_ELEMENTS.map(([prefix, prefixName, element]) => ({
      id: `${prefix}-${family}`,
      name: `${prefixName} ${familyName}`,
      element,
      file: `${stars}star`,
      label: `${stars}★`,
    })),
  ),
  { id: "prism-cairn", name: "Prism Cairn", element: "Light", file: "5star", label: "5★" },
  { id: "glint-urn", name: "Glint Urn", element: "Light", file: "3star", label: "3★" },
  { id: "dusk-urn", name: "Dusk Urn", element: "Dark", file: "3star", label: "3★" },
  { id: "wyrm-coffer", name: "Wyrm Coffer", element: "Dark", file: "5star", label: "5★" },
];

function SingleFormSection({
  eyebrow,
  title,
  intro,
  units,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  units: SingleFormUnit[];
}): ReactNode {
  return (
    <section className="mt-10 rounded-3xl border border-amber-500/20 bg-[#181723] px-6 py-5">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">{eyebrow}</p>
      <h2 className="mt-2 text-lg font-semibold text-amber-50">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-300">{intro}</p>
      <ol className="mt-4 grid grid-cols-2 gap-3">
        {units.map((unit) => (
          <li
            key={unit.id}
            className="flex flex-col items-center rounded-2xl bg-[#10131d] px-2 py-3"
          >
            <Image
              src={`/assets/units/${unit.id}/illustration-${unit.file}.png`}
              alt={`${unit.name}, an original ${unit.element} ${eyebrow.toLowerCase()} unit`}
              width={1024}
              height={1024}
              className="h-32 w-32"
            />
            <Image
              src={`/assets/units/${unit.id}/battle-idle-${unit.file}.png`}
              alt={`Pixel-art battle sprite of ${unit.name}`}
              width={128}
              height={128}
              className="h-24 w-24 [image-rendering:pixelated]"
            />
            <span className="text-xs font-semibold text-amber-100/80">
              {unit.name} · {unit.label}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function GalleryPage(): ReactNode {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/home" className="text-2xl font-black tracking-[0.18em] text-amber-100">
          BFR
        </Link>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-amber-500/30 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-200">
            Art preview
          </span>
          <Link href="/account" className="text-xs font-semibold text-amber-200 hover:underline">
            Account
          </Link>
        </div>
      </header>

      <Link
        href="/battle"
        className="mb-10 block rounded-3xl border border-amber-400/40 bg-[radial-gradient(circle_at_30%_20%,#71331c_0%,#2a1f2c_55%,#171620_100%)] px-6 py-6 transition hover:border-amber-300"
      >
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-300">
          Demo battle · no sign-in
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-amber-50">Ashen Pass</h2>
        <p className="mt-2 text-sm leading-6 text-stone-300">
          Lead the six starters at Omni through two waves and the Ashen Warden. Tap to attack, swipe
          up to burst.
        </p>
        <span className="mt-4 inline-block rounded-full bg-amber-400 px-4 py-2 text-sm font-bold text-[#171620]">
          Play the demo
        </span>
      </Link>

      {UNITS.map((unit, index) => (
        <article key={unit.id} className={index > 0 ? "mt-10" : undefined}>
          <UnitArt
            id={unit.id}
            name={unit.name}
            illustrationAlt={unit.illustrationAlt}
            stageBackground={unit.stageBackground}
            accentText={unit.accentText}
            forms={unit.forms}
            priority={index === 0}
          >
            <div className="border-t border-amber-500/20 bg-[#171620] px-6 py-6">
              <p
                className={`mb-2 text-xs font-bold uppercase tracking-[0.24em] ${unit.accentText}`}
              >
                {unit.element} · {unit.role}
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-amber-50">{unit.name}</h2>
              <p className="mt-1 text-sm text-amber-100/70">{unit.title}</p>
              <p className="mt-5 text-sm leading-6 text-stone-300">{unit.tagline}</p>
            </div>
          </UnitArt>

          {unit.spriteAlt ? (
            <section className="mt-5 rounded-3xl border border-amber-500/20 bg-[#181723] px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-[0.2em] ${unit.accentText}`}>
                    Battle sprite
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-amber-50">Idle pose draft</h3>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs ${unit.chip}`}>{unit.element}</span>
              </div>
              <div className="mt-4 flex justify-center rounded-2xl bg-[#10131d] py-4">
                <Image
                  src={`/assets/units/${unit.id}/battle-idle-6star.png`}
                  alt={unit.spriteAlt}
                  width={128}
                  height={128}
                  className="h-64 w-64 [image-rendering:pixelated]"
                />
              </div>
              {unit.tierSprites && unit.forms ? (
                <ol className="mt-4 grid grid-cols-2 gap-3">
                  {unit.forms.map((form) => (
                    <li
                      key={form.label}
                      className="flex flex-col items-center rounded-2xl bg-[#10131d] py-2"
                    >
                      <Image
                        src={`/assets/units/${unit.id}/battle-idle-${form.file}.png`}
                        alt={`Pixel-art battle sprite of ${unit.name}, ${form.label} form`}
                        width={128}
                        height={128}
                        className="h-32 w-32 [image-rendering:pixelated]"
                      />
                      <span className="text-xs font-semibold text-amber-100/80">{form.label}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          ) : null}
        </article>
      ))}

      <SingleFormSection
        eyebrow="Summon filler"
        title="Sprites and Crucibles"
        intro="Evolution-material Sprites and EXP-fodder Crucibles from the launch Rare Summon."
        units={FILLERS}
      />

      <SingleFormSection
        eyebrow="Growth fodder"
        title="Vessels, toads, and hobs"
        intro="EXP vessels in four tiers per element, the lantern toads, and the stat hobs."
        units={GROWTH_FODDER}
      />

      <SingleFormSection
        eyebrow="Evolution materials"
        title="Effigies, Cairns, Colossi, and rare treasures"
        intro="The Sprite line's evolution materials in three tiers per element, the Prism Cairn, the Urns, and the Wyrm Coffer."
        units={EVOLUTION_MATERIALS}
      />

      <p className="mt-8 text-center text-xs leading-5 text-stone-500">
        A free, non-commercial fan tribute.
      </p>
    </main>
  );
}
