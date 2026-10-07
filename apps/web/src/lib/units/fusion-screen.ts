import type { OriginalAsset } from "../original/original-assets.ts";

/** Original Fusion preparation/result pieces, laid out in layouts/fusion*.json. */
export const FUSION_ASSETS = {
  squareNormal: "common/button/sub_square2_btn1.png",
  squarePressed: "common/button/sub_square2_btn2.png",
  wideNormal: "common/button/sub_m_btn1.png",
  widePressed: "common/button/sub_m_btn2.png",
  baseNormal: "unit_mix/base_change_btn_label1.png",
  basePressed: "unit_mix/base_change_btn_label2.png",
  statusNormal: "unit_mix/status_display_btn_label1.png",
  statusPressed: "unit_mix/status_display_btn_label2.png",
  fuseNormal: "unit_mix/unit_mix_btn_label1.png",
  fusePressed: "unit_mix/unit_mix_btn_label2.png",
  skipNormal: "common/button/skip_btn_label1.png",
  skipPressed: "common/button/skip_btn_label2.png",
  table: "party_edit/unit_table.png",
  plate: "unit_mix/unit_mix_plate.png",
  gaugeBase: "unit_mix/unit_mix_bar_base.png",
  gauge: "unit_mix/unit_mix_bar_gauge.png",
  resultWindow: "unit_mix/status_window.png",
} as const satisfies Record<string, OriginalAsset>;
