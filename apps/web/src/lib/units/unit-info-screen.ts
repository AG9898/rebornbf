/** Original Unit Info pieces (M8-05); art/original/layouts/unit_info.json owns the positions. */
import type { OriginalAsset } from "../original/original-assets.ts";
import type { SkillDisplay } from "./unit-skills.ts";

export const UNIT_INFO_ASSETS = {
  frame: [
    "common/status_frame/status_frame_m_l.png",
    "common/status_frame/status_frame_m_c.png",
    "common/status_frame/status_frame_m_r.png",
  ],
  bonus: [
    "common/status_frame/status_frame_up_l.png",
    "common/status_frame/status_frame_up_c.png",
    "common/status_frame/status_frame_up_r.png",
  ],
  labels: {
    type: "common/status_frame/status_char/type.png",
    lv: "common/status_frame/status_char/lv.png",
    next: "common/status_frame/status_char/next.png",
    hp: "common/status_frame/status_char/hp.png",
    atk: "common/status_frame/status_char/atk.png",
    def: "common/status_frame/status_char/def.png",
    rec: "common/status_frame/status_char/rec.png",
  },
  leader: "common/leader_burst_label/leader.png",
  bb: "common/leader_burst_label/bb.png",
  extra: "common/leader_burst_label/extra.png",
  sbb: "common/leader_burst_label/sbb.png",
  ubb: "common/leader_burst_label/ubb.png",
  panel: "common/skill_plate1/panel.png",
  socket: "common/skill_frame_0.png",
  socketBase: "common/skill_frame_bg.png",
  emptySphere: "common/sphere_icon_off.png",
  expBase: "unit_mix/unit_mix_bar_base.png",
  expFill: "unit_mix/unit_mix_bar_gauge.png",
} as const satisfies Record<
  string,
  OriginalAsset | readonly OriginalAsset[] | Record<string, OriginalAsset>
>;

export function unitInfoSkillLabel(key: SkillDisplay["key"]): OriginalAsset | null {
  return key === "extra" || key === "sbb" || key === "ubb" ? UNIT_INFO_ASSETS[key] : null;
}
