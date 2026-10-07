import type { Element } from "../schemas/common.ts";
import type { Ailment, Effect, EffectTarget, PassiveStat } from "../schemas/effect.ts";
import type { SourceDamageFrames, SourceEffect } from "./source.ts";

/** Something the importer could not convert; any issue fails the import (UNIT_ROADMAP). */
export interface ImportIssue {
  where: string;
  message: string;
}

/** What a converter knows besides the effect's own params. */
export interface ConvertContext {
  /** The unit's element (proc 97 targets the element it beats). */
  element: Element;
}

/**
 * One source effect's params. Converters read fields with `num`/`str`/`raw`/`opt` and acknowledge
 * fields BFR does not model with `drop`; any field left unread fails the conversion, so new source
 * detail is never lost silently.
 */
class Params {
  private readonly used = new Set<string>([
    "proc id",
    "passive id",
    "effect delay time(ms)/frame",
    "target area",
    "target type",
    "passive target",
    "conditions",
  ]);
  readonly fields: SourceEffect;
  constructor(fields: SourceEffect) {
    this.fields = fields;
  }

  has(key: string): boolean {
    return key in this.fields;
  }
  raw(key: string): unknown {
    this.used.add(key);
    if (!(key in this.fields)) throw new Error(`missing field "${key}"`);
    return this.fields[key];
  }
  num(key: string): number {
    const value = Number(this.raw(key));
    if (!Number.isFinite(value)) throw new Error(`field "${key}" is not a number`);
    return value;
  }
  str(key: string): string {
    return String(this.raw(key));
  }
  /** The field's number when present (marking it read), else `undefined`. */
  opt(key: string): number | undefined {
    return this.has(key) ? this.num(key) : undefined;
  }
  drop(...keys: string[]): void {
    for (const key of keys) this.used.add(key);
  }
  unread(): string[] {
    return Object.keys(this.fields).filter((key) => !this.used.has(key));
  }
}

type Converter = (p: Params, target: EffectTarget, ctx: ConvertContext) => Effect[];

const ELEMENT_ORDER: readonly Element[] = ["fire", "water", "earth", "thunder", "light", "dark"];
/** The element each element is strong against (GAME_DESIGN §1). */
const BEATS: Readonly<Record<Element, Element>> = {
  fire: "earth",
  earth: "thunder",
  thunder: "water",
  water: "fire",
  light: "dark",
  dark: "light",
};
/** Source ailment keys in `ailment.inflict.*` order. */
const AILMENT_KEYS: ReadonlyArray<readonly [string, Ailment]> = [
  ["poison%", "poison"],
  ["weaken%", "weak"],
  ["sick%", "sick"],
  ["injury%", "injury"],
  ["curse%", "curse"],
  ["paralysis%", "paralysis"],
];
const STAT_KEYS: ReadonlyArray<readonly [string, PassiveStat]> = [
  ["hp% buff", "hp"],
  ["atk% buff", "atk"],
  ["def% buff", "def"],
  ["rec% buff", "rec"],
];

/** Percent → fraction, rounded to 6 places (350 → 3.5). */
const pct = (x: number): number => Math.round(x * 10_000) / 1_000_000;

/** A chance field: omitted at 100% or more. */
function chance(value: number | undefined): { chance?: number } {
  return value === undefined || value >= 100 ? {} : { chance: value };
}

/** A low/high pair: one `value` when equal, else `value: 0` with `min`/`max`. */
function range(lo: number, hi: number): { value: number; min?: number; max?: number } {
  return lo === hi ? { value: lo } : { value: 0, min: lo, max: hi };
}

function elementOf(value: string): Element {
  if (!(ELEMENT_ORDER as readonly string[]).includes(value)) {
    throw new Error(`unknown element ${JSON.stringify(value)}`);
  }
  return value as Element;
}

/** Attack-shape fields shared by procs 1, 47, and 97. */
function attackExtras(p: Params): Pick<Effect, "flatAtk" | "bcDrop" | "critRate"> {
  const extras: Pick<Effect, "flatAtk" | "bcDrop" | "critRate"> = {};
  const flat = p.opt("bb flat atk");
  if (flat) extras.flatAtk = flat;
  const bc = p.opt("bb bc%");
  if (bc) extras.bcDrop = bc;
  const crit = p.opt("bb crit%");
  if (crit) extras.critRate = crit;
  if (p.opt("bb hc%")) throw new Error(`"bb hc%" has no BFR field`);
  if (p.opt("bb dmg%")) throw new Error(`"bb dmg%" has no BFR field`);
  return extras;
}

const SHAPES: Readonly<Record<string, "attack.aoe" | "attack.st" | "attack.random">> = {
  aoe: "attack.aoe",
  single: "attack.st",
  random: "attack.random",
};

/** Burst procs that are frame-timed attacks; each takes its own `damage frames` entry. */
const ATTACK_PROCS: Readonly<Record<string, Converter>> = {
  "1": (p, target) => {
    const shape = SHAPES[String(p.fields["target area"])];
    if (!shape) throw new Error(`unknown target area ${JSON.stringify(p.fields["target area"])}`);
    return [{ id: shape, value: pct(p.num("bb atk%")), target, ...attackExtras(p) }];
  },
  "47": (p, target) => {
    if (p.str("bb added atk% proportional to hp") !== "remaining") {
      throw new Error("only HP-remaining scaling is modelled");
    }
    return [
      {
        id: "attack.hp_scaled",
        value: pct(p.num("bb base atk%")),
        hpScaling: pct(p.num("bb added atk% based on hp")),
        target,
        ...attackExtras(p),
      },
    ];
  },
  "97": (p, target, ctx) => {
    // The source does not name the target element; BFR reads it as the one the unit's element
    // beats, which every checked description confirms (UNIT_ROADMAP → Data sources).
    if (p.str("additional element used for attack check") !== "self only") {
      throw new Error("only self-only element targets are modelled");
    }
    return [
      {
        id: "attack.element_target",
        value: pct(p.num("bb atk%")),
        element: BEATS[ctx.element],
        target,
        ...attackExtras(p),
      },
    ];
  },
};

/** Other burst procs (GAME_DESIGN §4), by `proc id`. */
const PROCS: Readonly<Record<string, Converter>> = {
  "3": (p, target) => [
    {
      id: "heal.over_time",
      value: 0,
      min: p.num("gradual heal low"),
      max: p.num("gradual heal high"),
      recBonus: pct(p.num("rec added% (from target)")),
      turns: p.num("gradual heal turns (8)"),
      target,
    },
  ],
  "4": (p, target) => [{ id: "bb.fill_instant", value: p.num("bb bc fill"), target }],
  "31": (p, target) => [{ id: "bb.fill_instant", value: p.num("increase bb gauge"), target }],
  "5": (p, target) => {
    if (p.str("element buffed") !== "all")
      throw new Error("element-limited buffs are not modelled");
    const out: Effect[] = [];
    for (const [key, id] of [
      ["atk% buff (1)", "buff.atk"],
      ["def% buff (3)", "buff.def"],
      ["rec% buff (5)", "buff.rec"],
      ["crit% buff (7)", "buff.crit_rate"],
    ] as const) {
      const value = p.opt(key);
      if (value !== undefined) {
        out.push({ id, value: pct(value), turns: p.num("buff turns"), target });
      }
    }
    return out;
  },
  "6": (p, target) => {
    const out: Effect[] = [];
    for (const [key, id] of [
      ["bc drop rate% buff (10)", "drop.bc"],
      ["hc drop rate% buff (9)", "drop.hc"],
      ["item drop rate% buff (11)", "drop.item"],
    ] as const) {
      const value = p.opt(key);
      if (value !== undefined) {
        out.push({ id, value, turns: p.num("drop rate buff turns"), target });
      }
    }
    return out;
  },
  "9": (p, target) => {
    if (p.has("element buffed") && p.str("element buffed") !== "all") {
      throw new Error("element-limited debuffs are not modelled");
    }
    const out: Effect[] = [];
    const turns = p.num("buff turns");
    const buffs = Object.keys(p.fields)
      .filter((key) => key.startsWith("buff #"))
      .sort();
    for (const key of buffs) {
      const buff = p.raw(key) as Record<string, number>;
      for (const [field, id] of [
        ["atk% buff (2)", "debuff.atk_down"],
        ["def% buff (4)", "debuff.def_down"],
      ] as const) {
        const value = buff[field];
        if (value !== undefined) {
          out.push({ id, value: pct(-value), turns, target, ...chance(buff["proc chance%"]) });
        }
      }
      const extra = Object.keys(buff).filter(
        (field) => !["atk% buff (2)", "def% buff (4)", "proc chance%"].includes(field),
      );
      if (extra.length > 0) throw new Error(`${key}: unhandled ${extra.join(", ")}`);
    }
    return out;
  },
  "11": (p, target) =>
    AILMENT_KEYS.filter(([key]) => p.has(key)).map(([key, ailment]) => ({
      id: `ailment.inflict.${ailment}` as const,
      value: p.num(key),
      target,
    })),
  "40": (p, target) =>
    AILMENT_KEYS.filter(([key]) => p.has(key.replace("%", "% buff"))).map(([key, ailment]) => ({
      id: "buff.add_ailment" as const,
      value: p.num(key.replace("%", "% buff")),
      ailment,
      turns: p.num("buff turns"),
      target,
    })),
  "18": (p, target) => [
    {
      id: "mitigation",
      value: pct(p.num("dmg% reduction")),
      turns: p.num("dmg% reduction turns (36)"),
      target,
    },
  ],
  "19": (p, target) => [
    {
      id: "bb.fill_per_turn",
      value: p.num("increase bb gauge gradual"),
      turns: p.num("increase bb gauge gradual turns (37)"),
      target,
    },
  ],
  "20": (p, target) => {
    if (p.num("bc fill when attacked%") < 100) {
      throw new Error("a fill chance below 100% is not modelled");
    }
    return [
      {
        id: "bb.fill_on_hit",
        ...range(p.num("bc fill when attacked low"), p.num("bc fill when attacked high")),
        turns: p.num("bc fill when attacked turns (38)"),
        target,
      },
    ];
  },
  "23": (p, target) => [
    {
      id: "buff.spark_dmg",
      value: pct(p.num("spark dmg% buff (40)")),
      turns: p.num("buff turns"),
      target,
    },
  ],
  "24": (p, target) => {
    if (p.str("converted attribute") !== "defense") throw new Error("only DEF → ATK is modelled");
    return [
      {
        id: "buff.atk_from_def",
        value: pct(p.num("atk% buff (46)")),
        turns: p.num("% converted turns"),
        target,
      },
    ];
  },
  "26": (p, target) => [
    {
      id: "hits.add_normal",
      value: p.num("hit increase/hit"),
      damageBonus: pct(p.num("extra hits dmg%")),
      turns: p.num("hit increase buff turns (50)"),
      target,
    },
  ],
  "30": (p, target) =>
    (p.raw("elements added") as string[]).map((name) => ({
      id: "buff.add_element" as const,
      value: ELEMENT_ORDER.indexOf(elementOf(name)),
      turns: p.num("elements added turns"),
      target,
    })),
  "38": (p, target) => {
    p.drop("ailments cured"); // BFR's cure removes every ailment (GAME_DESIGN §4)
    return [{ id: "ailment.cure", value: 0, target }];
  },
  "44": (p, target) => {
    p.drop("dot element affected", "dot unit index");
    return [
      {
        id: "debuff.dot",
        value: pct(p.num("dot atk%")),
        flatAtk: p.num("dot flat atk"),
        turns: p.num("dot turns (71)"),
        target,
      },
    ];
  },
  "45": (p, target) => {
    const bb = p.num("bb atk% buff");
    if (p.num("sbb atk% buff") !== bb || p.num("ubb atk% buff") !== bb) {
      throw new Error("different BB, SBB, and UBB ATK buffs are not modelled");
    }
    return [{ id: "buff.bb_atk", value: pct(bb), turns: p.num("buff turns (72)"), target }];
  },
  "52": (p, target) => [
    {
      id: "bb.fill_rate",
      value: pct(p.num("bb gauge fill rate% buff")),
      turns: p.num("buff turns (77)"),
      target,
    },
  ],
  "55": (p, target) => {
    const flagged = ELEMENT_ORDER.filter((el) => {
      const key = `${el} units do extra elemental weakness dmg`;
      return p.has(key) && Boolean(p.raw(key));
    });
    const effect: Effect = {
      id: "buff.elem_weak_dmg",
      value: pct(p.num("elemental weakness multiplier%")),
      turns: p.num("elemental weakness buff turns"),
      target,
    };
    if (flagged.length === 1) effect.element = flagged[0];
    else if (flagged.length !== ELEMENT_ORDER.length) {
      throw new Error(`${flagged.length} flagged elements are not modelled (one or all)`);
    }
    return [effect];
  },
  "58": (p, target) => [
    {
      id: "debuff.spark_vuln",
      value: pct(p.num("spark dmg% received")),
      turns: p.num("spark dmg received debuff turns (94)"),
      target,
      ...chance(p.opt("spark dmg received apply%")),
    },
  ],
  "62": (p, target) => {
    if (p.num("elemental barrier absorb dmg%") !== 100 || p.num("elemental barrier def") !== 0) {
      throw new Error("only a full-absorb, 0-DEF barrier is modelled");
    }
    return [
      {
        id: "barrier",
        value: p.num("elemental barrier hp"),
        element: elementOf(p.str("elemental barrier element")),
        target,
      },
    ];
  },
  "68": (p, target) => [
    {
      id: "guard_mitigation",
      value: pct(p.num("guard increase mitigation%")),
      turns: p.num("guard increase mitigation buff turns (113)"),
      target,
    },
  ],
  "73": (p, target) => {
    for (const key of Object.keys(p.fields).filter((field) => field.includes("resist%"))) {
      if (p.num(key) !== 100) throw new Error(`"${key}" below 100% is not modelled`);
    }
    return [{ id: "debuff.null", value: 0, turns: p.num("stat down immunity buff turns"), target }];
  },
  "83": (p, target) => [
    {
      id: "buff.spark_crit",
      value: pct(p.num("spark dmg inc% buff")),
      chance: p.num("spark dmg inc chance%"),
      turns: p.num("spark dmg inc buff turns (131)"),
      target,
    },
  ],
  "84": (p, target) => [
    {
      id: "od.fill_rate",
      value: pct(p.num("od fill rate% buff")),
      turns: p.num("od fill rate buff turns (132)"),
      target,
    },
  ],
  "85": (p, target) => [
    {
      id: "damage_to_heal",
      ...range(pct(p.num("hp recover from dmg% low")), pct(p.num("hp recover from dmg% high"))),
      turns: p.num("hp recover from dmg buff turns (133)"),
      target,
      ...chance(p.opt("hp recover from dmg chance")),
    },
  ],
  "86": (p, target) => [
    {
      id: "hp_drain",
      ...range(pct(p.num("hp drain% low")), pct(p.num("hp drain% high"))),
      turns: p.num("hp drain buff turns (134)"),
      target,
      ...chance(p.opt("hp drain chance%")),
    },
  ],
};

/** `passive.stat_pct` per stat key present, in HP, ATK, DEF, REC order. */
function statPcts(p: Params, target: EffectTarget, element?: Element): Effect[] {
  return STAT_KEYS.filter(([key]) => p.has(key)).map(([key, stat]) => {
    const effect: Effect = { id: "passive.stat_pct", stat, value: pct(p.num(key)), target };
    if (element) effect.element = element;
    return effect;
  });
}

/** Leader and extra skill passives (GAME_DESIGN §4), by `passive id`. */
const PASSIVES: Readonly<Record<string, Converter>> = {
  "1": (p, target) => statPcts(p, target),
  "2": (p, target) =>
    (p.raw("elements buffed") as string[]).flatMap((el) => statPcts(p, target, elementOf(el))),
  "9": (p, target) => [{ id: "passive.bc_per_turn", value: p.num("bc fill per turn"), target }],
  "11": (p, target) => [
    {
      id: "cond.hp_above",
      value: pct(p.num("hp above % buff requirement")),
      target,
      effects: statPcts(p, target),
    },
  ],
  "30": (p, target) => [
    {
      id: "cond.bb_above",
      value: pct(p.num("bb gauge above % buff requirement")),
      target,
      effects: statPcts(p, target),
    },
  ],
  "14": (p, target) => [
    {
      id: "chance_mitigation",
      value: pct(p.num("dmg reduction%")),
      chance: p.num("dmg reduction chance%"),
      target,
    },
  ],
  "20": (p, target) =>
    AILMENT_KEYS.filter(([key]) => p.has(key)).map(([key, ailment]) => ({
      id: "buff.add_ailment" as const,
      value: p.num(key),
      ailment,
      target,
    })),
  "26": (p, target) => [
    {
      id: "damage_reflect",
      ...range(pct(p.num("dmg% reflect low")), pct(p.num("dmg% reflect high"))),
      chance: p.num("dmg% reflect chance%"),
      target,
    },
  ],
  "29": (p, target) => [{ id: "attack.def_ignore", value: p.num("ignore def%"), target }],
  "31": (p, target) => [{ id: "buff.spark_dmg", value: pct(p.num("damage% for spark")), target }],
  "32": (p, target) => [{ id: "bb.fill_rate", value: pct(p.num("bb gauge fill rate%")), target }],
  "33": (p, target) => [
    {
      id: "heal.over_time",
      value: 0,
      min: p.num("turn heal low"),
      max: p.num("turn heal high"),
      recBonus: pct(p.num("rec% added (turn heal)")),
      target,
    },
  ],
  "34": (p, target) => [{ id: "buff.crit_dmg", value: pct(p.num("crit multiplier%")), target }],
  "46": (p, target) => {
    if (p.has("buff proportional to hp") && p.str("buff proportional to hp") !== "remaining") {
      throw new Error("only HP-remaining scaling is modelled");
    }
    return [
      {
        id: "passive.atk_hp_scaled",
        value: pct(p.num("atk% base buff")),
        hpScaling: pct(p.num("atk% extra buff based on hp")),
        target,
      },
    ];
  },
  "47": (p, target) => {
    if (p.num("bc fill on spark%") < 100) {
      throw new Error("a fill chance below 100% is not modelled");
    }
    return [
      {
        id: "bb.fill_on_spark",
        value: 0,
        min: p.num("bc fill on spark low"),
        max: p.num("bc fill on spark high"),
        target,
      },
    ];
  },
  "48": (p, target) => [
    { id: "bb.cost_reduction", value: pct(p.num("reduced bb bc cost%")), target },
  ],
  "49": (p, target) => {
    if (p.num("reduced bb bc use chance%") < 100) {
      throw new Error("a reduction chance below 100% is not modelled");
    }
    return [
      {
        id: "bb.consumption_reduction",
        ...range(pct(p.num("reduced bb bc use% low")), pct(p.num("reduced bb bc use% high"))),
        target,
      },
    ];
  },
  "50": (p, target) => {
    // A self extra skill: the source flags the unit's own element, which BFR leaves implicit.
    for (const el of ELEMENT_ORDER) p.drop(`${el} units do extra elemental weakness dmg`);
    return [
      { id: "buff.elem_weak_dmg", value: pct(p.num("elemental weakness multiplier%")), target },
    ];
  },
  "53": (p, target) => {
    const out: Effect[] = [];
    const crit = p.opt("crit chance base resist%");
    if (crit !== undefined) out.push({ id: "crit_resist", value: pct(crit), target });
    const weak = p.opt("strong base element damage resist%");
    if (weak !== undefined) out.push({ id: "elem_weak_resist", value: pct(weak), target });
    // The "buffed" twins and crit-damage resist are not modelled; BFR needs them at 100%.
    for (const key of p.unread().filter((field) => field.includes("resist%"))) {
      if (p.num(key) !== 100) throw new Error(`"${key}" below 100% is not modelled`);
    }
    return out;
  },
  "55": (p, target) => {
    const buff = p.raw("buff") as Record<string, unknown>;
    if (!("angel idol buff (12)" in buff)) {
      throw new Error("only the angel idol trigger is modelled");
    }
    // The HP trigger is dropped: conditions cannot nest (ROSTER → Kit Notes → Maren).
    p.drop("hp below % buff activation", "trigger on");
    return [{ id: "angel_idol", value: pct(Number(buff["angel idol recover hp%"])), target }];
  },
  "64": (p, target) => {
    const bb = p.num("bb atk% buff");
    if (p.num("sbb atk% buff") !== bb || p.num("ubb atk% buff") !== bb) {
      throw new Error("different BB, SBB, and UBB ATK buffs are not modelled");
    }
    return [{ id: "buff.bb_atk", value: pct(bb), target }];
  },
  "78": (p, target) => {
    const buff = p.raw("buff") as Record<string, unknown>;
    return [
      {
        id: "mitigation_after_damage",
        value: pct(Number(buff["dmg reduction% buff"])),
        threshold: p.num("damage threshold buff activation"),
        turns: Math.trunc(Number(buff["buff turns (36)"])),
        target,
      },
    ];
  },
  "79": (p, target) => [
    {
      id: "bb.fill_on_damage_taken",
      value: p.num("increase bb gauge"),
      threshold: p.num("damage threshold activation"),
      target,
    },
  ],
  "81": (p, target) => [
    {
      id: "bb.fill_on_damage_dealt",
      value: p.num("increase bb gauge"),
      threshold: p.num("damage dealt threshold activation"),
      target,
    },
  ],
};

function idOf(effect: SourceEffect): { kind: "proc" | "passive"; id: string } | undefined {
  for (const [key, kind] of [
    ["proc id", "proc"],
    ["passive id", "passive"],
  ] as const) {
    const id = effect[key];
    if (typeof id === "string" || typeof id === "number") return { kind, id: String(id) };
  }
  return undefined;
}

function unknownMessage(effect: SourceEffect): string {
  for (const key of ["unknown proc id", "unknown passive id", "unknown buff id"]) {
    if (key in effect) return `${key} ${JSON.stringify(effect[key])} (not parsed by the export)`;
  }
  return `no proc or passive ID in ${JSON.stringify(effect)}`;
}

/** The effect's target: `target type`/`target area` on procs, `passive target` on passives. */
function targetOf(effect: SourceEffect, isSkill: boolean): EffectTarget {
  if (isSkill) {
    const target = effect["passive target"] ?? "party";
    if (target === "self" || target === "party") return target;
    throw new Error(`unknown passive target ${JSON.stringify(target)}`);
  }
  const type = effect["target type"];
  const area = effect["target area"];
  if (type === "enemy") return area === "single" ? "enemy" : "enemies";
  if (type === "party") return area === "aoe" ? "party" : "ally";
  if (type === "self") return "self";
  throw new Error(`unknown target ${JSON.stringify(type)}/${JSON.stringify(area)}`);
}

function convert(
  table: Readonly<Record<string, Converter>>,
  kind: string,
  id: string,
  effect: SourceEffect,
  isSkill: boolean,
  ctx: ConvertContext,
  where: string,
  issues: ImportIssue[],
): Effect[] {
  const converter = table[id];
  if (!converter) {
    issues.push({ where, message: `${kind} ${id} has no BFR conversion yet` });
    return [];
  }
  try {
    const params = new Params(effect);
    const out = converter(params, targetOf(effect, isSkill), ctx);
    const unread = params.unread();
    if (unread.length > 0) throw new Error(`unhandled field(s) ${unread.join(", ")}`);
    return out;
  } catch (error) {
    issues.push({ where, message: `${kind} ${id}: ${(error as Error).message}` });
    return [];
  }
}

/**
 * Converts one burst level's effects. Attack procs pair with the `damage frames` entry at the same
 * index (the export lists one entry per effect, in order) and become the burst's attacks.
 */
export function burstEffects(
  effects: readonly SourceEffect[],
  damageFrames: readonly SourceDamageFrames[],
  ctx: ConvertContext,
  where: string,
  issues: ImportIssue[],
): { attacks: SourceDamageFrames[]; effects: Effect[] } {
  const attacks: SourceDamageFrames[] = [];
  const out: Effect[] = [];
  effects.forEach((effect, i) => {
    const at = `${where} effects[${i}]`;
    const ref = idOf(effect);
    if (!ref) {
      issues.push({ where: at, message: unknownMessage(effect) });
      return;
    }
    if (ref.kind === "proc" && ATTACK_PROCS[ref.id]) {
      const frames = damageFrames[i];
      if (!frames || String(frames["proc id"]) !== ref.id) {
        issues.push({ where: at, message: `proc ${ref.id}: no matching damage frames entry` });
        return;
      }
      attacks.push(frames);
      out.push(...convert(ATTACK_PROCS, "proc", ref.id, effect, false, ctx, at, issues));
      return;
    }
    out.push(...convert(PROCS, "proc", ref.id, effect, false, ctx, at, issues));
  });
  return { attacks, effects: out };
}

/**
 * Converts a leader or extra skill's passives. Passives gated on an item (the unit's signature
 * sphere) are collected, in order, into one `cond.signature_sphere` after the ungated effects.
 */
export function skillEffects(
  effects: readonly SourceEffect[],
  ctx: ConvertContext,
  where: string,
  issues: ImportIssue[],
): Effect[] {
  const plain: Effect[] = [];
  const gated: Effect[] = [];
  effects.forEach((effect, i) => {
    const at = `${where} effects[${i}]`;
    const ref = idOf(effect);
    if (ref?.kind !== "passive") {
      issues.push({
        where: at,
        message: ref ? `proc ${ref.id} in a skill` : unknownMessage(effect),
      });
      return;
    }
    const conditions = (effect.conditions ?? []) as Array<Record<string, unknown>>;
    const signature =
      conditions.length === 1 && Object.keys(conditions[0] ?? {}).join() === "item required";
    if (conditions.length > 0 && !signature) {
      issues.push({ where: at, message: `condition ${JSON.stringify(conditions)} not modelled` });
      return;
    }
    const converted = convert(PASSIVES, "passive", ref.id, effect, true, ctx, at, issues);
    (signature ? gated : plain).push(...converted);
  });
  if (gated.some((effect) => effect.id.startsWith("cond."))) {
    issues.push({ where, message: "a condition inside the signature-sphere gate cannot nest" });
  } else if (gated.length > 0) {
    plain.push({ id: "cond.signature_sphere", value: 0, target: "self", effects: gated });
  }
  return plain;
}
