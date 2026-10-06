// Bundled canonical farming content; no filesystem reads in client code.
import { type Enemy, EnemySchema, type Stage, StageSchema } from "@bfr/data";
import enemy0 from "@bfr/data/content/enemies/dg-cinder-alembic.json";
import enemy1 from "@bfr/data/content/enemies/dg-cinder-athanor.json";
import enemy2 from "@bfr/data/content/enemies/dg-cinder-cairn.json";
import enemy3 from "@bfr/data/content/enemies/dg-cinder-colossus.json";
import enemy4 from "@bfr/data/content/enemies/dg-cinder-effigy.json";
import enemy5 from "@bfr/data/content/enemies/dg-cinder-flask.json";
import enemy6 from "@bfr/data/content/enemies/dg-cinder-grail.json";
import enemy7 from "@bfr/data/content/enemies/dg-cinder-mote.json";
import enemy8 from "@bfr/data/content/enemies/dg-cinder-sprite.json";
import enemy9 from "@bfr/data/content/enemies/dg-dusk-alembic.json";
import enemy10 from "@bfr/data/content/enemies/dg-dusk-athanor.json";
import enemy11 from "@bfr/data/content/enemies/dg-dusk-cairn.json";
import enemy12 from "@bfr/data/content/enemies/dg-dusk-colossus.json";
import enemy13 from "@bfr/data/content/enemies/dg-dusk-effigy.json";
import enemy14 from "@bfr/data/content/enemies/dg-dusk-flask.json";
import enemy15 from "@bfr/data/content/enemies/dg-dusk-grail.json";
import enemy16 from "@bfr/data/content/enemies/dg-dusk-mote.json";
import enemy17 from "@bfr/data/content/enemies/dg-dusk-sprite.json";
import enemy18 from "@bfr/data/content/enemies/dg-dusk-urn.json";
import enemy19 from "@bfr/data/content/enemies/dg-glint-alembic.json";
import enemy20 from "@bfr/data/content/enemies/dg-glint-athanor.json";
import enemy21 from "@bfr/data/content/enemies/dg-glint-cairn.json";
import enemy22 from "@bfr/data/content/enemies/dg-glint-colossus.json";
import enemy23 from "@bfr/data/content/enemies/dg-glint-effigy.json";
import enemy24 from "@bfr/data/content/enemies/dg-glint-flask.json";
import enemy25 from "@bfr/data/content/enemies/dg-glint-grail.json";
import enemy26 from "@bfr/data/content/enemies/dg-glint-mote.json";
import enemy27 from "@bfr/data/content/enemies/dg-glint-sprite.json";
import enemy28 from "@bfr/data/content/enemies/dg-glint-urn.json";
import enemy29 from "@bfr/data/content/enemies/dg-grand-hob.json";
import enemy30 from "@bfr/data/content/enemies/dg-item-bitterleaf.json";
import enemy31 from "@bfr/data/content/enemies/dg-item-bright-tonic.json";
import enemy32 from "@bfr/data/content/enemies/dg-item-dew-tonic.json";
import enemy33 from "@bfr/data/content/enemies/dg-item-grand-tonic.json";
import enemy34 from "@bfr/data/content/enemies/dg-item-rekindle-ash.json";
import enemy35 from "@bfr/data/content/enemies/dg-item-valor-draught.json";
import enemy36 from "@bfr/data/content/enemies/dg-lantern-toad.json";
import enemy37 from "@bfr/data/content/enemies/dg-matriarch-toad.json";
import enemy38 from "@bfr/data/content/enemies/dg-mend-hob.json";
import enemy39 from "@bfr/data/content/enemies/dg-might-hob.json";
import enemy40 from "@bfr/data/content/enemies/dg-moss-alembic.json";
import enemy41 from "@bfr/data/content/enemies/dg-moss-athanor.json";
import enemy42 from "@bfr/data/content/enemies/dg-moss-cairn.json";
import enemy43 from "@bfr/data/content/enemies/dg-moss-colossus.json";
import enemy44 from "@bfr/data/content/enemies/dg-moss-effigy.json";
import enemy45 from "@bfr/data/content/enemies/dg-moss-flask.json";
import enemy46 from "@bfr/data/content/enemies/dg-moss-grail.json";
import enemy47 from "@bfr/data/content/enemies/dg-moss-mote.json";
import enemy48 from "@bfr/data/content/enemies/dg-moss-sprite.json";
import enemy49 from "@bfr/data/content/enemies/dg-prism-cairn.json";
import enemy50 from "@bfr/data/content/enemies/dg-regent-toad.json";
import enemy51 from "@bfr/data/content/enemies/dg-rill-alembic.json";
import enemy52 from "@bfr/data/content/enemies/dg-rill-athanor.json";
import enemy53 from "@bfr/data/content/enemies/dg-rill-cairn.json";
import enemy54 from "@bfr/data/content/enemies/dg-rill-colossus.json";
import enemy55 from "@bfr/data/content/enemies/dg-rill-effigy.json";
import enemy56 from "@bfr/data/content/enemies/dg-rill-flask.json";
import enemy57 from "@bfr/data/content/enemies/dg-rill-grail.json";
import enemy58 from "@bfr/data/content/enemies/dg-rill-mote.json";
import enemy59 from "@bfr/data/content/enemies/dg-rill-sprite.json";
import enemy60 from "@bfr/data/content/enemies/dg-vital-hob.json";
import enemy61 from "@bfr/data/content/enemies/dg-volt-alembic.json";
import enemy62 from "@bfr/data/content/enemies/dg-volt-athanor.json";
import enemy63 from "@bfr/data/content/enemies/dg-volt-cairn.json";
import enemy64 from "@bfr/data/content/enemies/dg-volt-colossus.json";
import enemy65 from "@bfr/data/content/enemies/dg-volt-effigy.json";
import enemy66 from "@bfr/data/content/enemies/dg-volt-flask.json";
import enemy67 from "@bfr/data/content/enemies/dg-volt-grail.json";
import enemy68 from "@bfr/data/content/enemies/dg-volt-mote.json";
import enemy69 from "@bfr/data/content/enemies/dg-volt-sprite.json";
import enemy70 from "@bfr/data/content/enemies/dg-ward-hob.json";
import enemy71 from "@bfr/data/content/enemies/dg-wyrm-coffer.json";
import enemy72 from "@bfr/data/content/enemies/dg1-drip-newt.json";
import enemy73 from "@bfr/data/content/enemies/dg1-ember-mite.json";
import enemy74 from "@bfr/data/content/enemies/dg1-gleam-crab.json";
import enemy75 from "@bfr/data/content/enemies/dg1-gloom-bat.json";
import enemy76 from "@bfr/data/content/enemies/dg1-root-crawler.json";
import enemy77 from "@bfr/data/content/enemies/dg1-static-eel.json";
import enemy78 from "@bfr/data/content/enemies/dg2-brine-urchin.json";
import enemy79 from "@bfr/data/content/enemies/dg2-glass-jelly.json";
import enemy80 from "@bfr/data/content/enemies/dg2-vent-shrimp.json";
import stage0 from "@bfr/data/content/stages/dungeon-cinder-alembic.json";
import stage1 from "@bfr/data/content/stages/dungeon-cinder-athanor.json";
import stage2 from "@bfr/data/content/stages/dungeon-cinder-cairn.json";
import stage3 from "@bfr/data/content/stages/dungeon-cinder-colossus.json";
import stage4 from "@bfr/data/content/stages/dungeon-cinder-effigy.json";
import stage5 from "@bfr/data/content/stages/dungeon-cinder-flask.json";
import stage6 from "@bfr/data/content/stages/dungeon-cinder-grail.json";
import stage7 from "@bfr/data/content/stages/dungeon-cinder-mote.json";
import stage8 from "@bfr/data/content/stages/dungeon-cinder-sprite.json";
import stage9 from "@bfr/data/content/stages/dungeon-crown-shard.json";
import stage10 from "@bfr/data/content/stages/dungeon-dusk-alembic.json";
import stage11 from "@bfr/data/content/stages/dungeon-dusk-athanor.json";
import stage12 from "@bfr/data/content/stages/dungeon-dusk-cairn.json";
import stage13 from "@bfr/data/content/stages/dungeon-dusk-colossus.json";
import stage14 from "@bfr/data/content/stages/dungeon-dusk-effigy.json";
import stage15 from "@bfr/data/content/stages/dungeon-dusk-flask.json";
import stage16 from "@bfr/data/content/stages/dungeon-dusk-grail.json";
import stage17 from "@bfr/data/content/stages/dungeon-dusk-mote.json";
import stage18 from "@bfr/data/content/stages/dungeon-dusk-sprite.json";
import stage19 from "@bfr/data/content/stages/dungeon-dusk-urn.json";
import stage20 from "@bfr/data/content/stages/dungeon-glint-alembic.json";
import stage21 from "@bfr/data/content/stages/dungeon-glint-athanor.json";
import stage22 from "@bfr/data/content/stages/dungeon-glint-cairn.json";
import stage23 from "@bfr/data/content/stages/dungeon-glint-colossus.json";
import stage24 from "@bfr/data/content/stages/dungeon-glint-effigy.json";
import stage25 from "@bfr/data/content/stages/dungeon-glint-flask.json";
import stage26 from "@bfr/data/content/stages/dungeon-glint-grail.json";
import stage27 from "@bfr/data/content/stages/dungeon-glint-mote.json";
import stage28 from "@bfr/data/content/stages/dungeon-glint-sprite.json";
import stage29 from "@bfr/data/content/stages/dungeon-glint-urn.json";
import stage30 from "@bfr/data/content/stages/dungeon-item-bitterleaf.json";
import stage31 from "@bfr/data/content/stages/dungeon-item-bright-tonic.json";
import stage32 from "@bfr/data/content/stages/dungeon-item-dew-tonic.json";
import stage33 from "@bfr/data/content/stages/dungeon-item-grand-tonic.json";
import stage34 from "@bfr/data/content/stages/dungeon-item-rekindle-ash.json";
import stage35 from "@bfr/data/content/stages/dungeon-item-valor-draught.json";
import stage36 from "@bfr/data/content/stages/dungeon-lantern-toad.json";
import stage37 from "@bfr/data/content/stages/dungeon-mend-hob.json";
import stage38 from "@bfr/data/content/stages/dungeon-might-hob.json";
import stage39 from "@bfr/data/content/stages/dungeon-moss-alembic.json";
import stage40 from "@bfr/data/content/stages/dungeon-moss-athanor.json";
import stage41 from "@bfr/data/content/stages/dungeon-moss-cairn.json";
import stage42 from "@bfr/data/content/stages/dungeon-moss-colossus.json";
import stage43 from "@bfr/data/content/stages/dungeon-moss-effigy.json";
import stage44 from "@bfr/data/content/stages/dungeon-moss-flask.json";
import stage45 from "@bfr/data/content/stages/dungeon-moss-grail.json";
import stage46 from "@bfr/data/content/stages/dungeon-moss-mote.json";
import stage47 from "@bfr/data/content/stages/dungeon-moss-sprite.json";
import stage48 from "@bfr/data/content/stages/dungeon-prism-cairn.json";
import stage49 from "@bfr/data/content/stages/dungeon-rill-alembic.json";
import stage50 from "@bfr/data/content/stages/dungeon-rill-athanor.json";
import stage51 from "@bfr/data/content/stages/dungeon-rill-cairn.json";
import stage52 from "@bfr/data/content/stages/dungeon-rill-colossus.json";
import stage53 from "@bfr/data/content/stages/dungeon-rill-effigy.json";
import stage54 from "@bfr/data/content/stages/dungeon-rill-flask.json";
import stage55 from "@bfr/data/content/stages/dungeon-rill-grail.json";
import stage56 from "@bfr/data/content/stages/dungeon-rill-mote.json";
import stage57 from "@bfr/data/content/stages/dungeon-rill-sprite.json";
import stage58 from "@bfr/data/content/stages/dungeon-vital-hob.json";
import stage59 from "@bfr/data/content/stages/dungeon-volt-alembic.json";
import stage60 from "@bfr/data/content/stages/dungeon-volt-athanor.json";
import stage61 from "@bfr/data/content/stages/dungeon-volt-cairn.json";
import stage62 from "@bfr/data/content/stages/dungeon-volt-colossus.json";
import stage63 from "@bfr/data/content/stages/dungeon-volt-effigy.json";
import stage64 from "@bfr/data/content/stages/dungeon-volt-flask.json";
import stage65 from "@bfr/data/content/stages/dungeon-volt-grail.json";
import stage66 from "@bfr/data/content/stages/dungeon-volt-mote.json";
import stage67 from "@bfr/data/content/stages/dungeon-volt-sprite.json";
import stage68 from "@bfr/data/content/stages/dungeon-ward-hob.json";
import stage69 from "@bfr/data/content/stages/dungeon-wyrm-coffer.json";
import stage70 from "@bfr/data/content/stages/dungeon-zenith-core.json";

export const DUNGEON_STAGES: readonly Stage[] = [
  stage0,
  stage1,
  stage2,
  stage3,
  stage4,
  stage5,
  stage6,
  stage7,
  stage8,
  stage9,
  stage10,
  stage11,
  stage12,
  stage13,
  stage14,
  stage15,
  stage16,
  stage17,
  stage18,
  stage19,
  stage20,
  stage21,
  stage22,
  stage23,
  stage24,
  stage25,
  stage26,
  stage27,
  stage28,
  stage29,
  stage30,
  stage31,
  stage32,
  stage33,
  stage34,
  stage35,
  stage36,
  stage37,
  stage38,
  stage39,
  stage40,
  stage41,
  stage42,
  stage43,
  stage44,
  stage45,
  stage46,
  stage47,
  stage48,
  stage49,
  stage50,
  stage51,
  stage52,
  stage53,
  stage54,
  stage55,
  stage56,
  stage57,
  stage58,
  stage59,
  stage60,
  stage61,
  stage62,
  stage63,
  stage64,
  stage65,
  stage66,
  stage67,
  stage68,
  stage69,
  stage70,
].map((json) => StageSchema.parse(json));

export const DUNGEON_ENEMIES: readonly Enemy[] = [
  enemy0,
  enemy1,
  enemy2,
  enemy3,
  enemy4,
  enemy5,
  enemy6,
  enemy7,
  enemy8,
  enemy9,
  enemy10,
  enemy11,
  enemy12,
  enemy13,
  enemy14,
  enemy15,
  enemy16,
  enemy17,
  enemy18,
  enemy19,
  enemy20,
  enemy21,
  enemy22,
  enemy23,
  enemy24,
  enemy25,
  enemy26,
  enemy27,
  enemy28,
  enemy29,
  enemy30,
  enemy31,
  enemy32,
  enemy33,
  enemy34,
  enemy35,
  enemy36,
  enemy37,
  enemy38,
  enemy39,
  enemy40,
  enemy41,
  enemy42,
  enemy43,
  enemy44,
  enemy45,
  enemy46,
  enemy47,
  enemy48,
  enemy49,
  enemy50,
  enemy51,
  enemy52,
  enemy53,
  enemy54,
  enemy55,
  enemy56,
  enemy57,
  enemy58,
  enemy59,
  enemy60,
  enemy61,
  enemy62,
  enemy63,
  enemy64,
  enemy65,
  enemy66,
  enemy67,
  enemy68,
  enemy69,
  enemy70,
  enemy71,
  enemy72,
  enemy73,
  enemy74,
  enemy75,
  enemy76,
  enemy77,
  enemy78,
  enemy79,
  enemy80,
].map((json) => EnemySchema.parse(json));
