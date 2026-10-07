/** Data for the original's shared sub-screen kit (M8-01, RESOLVED-98); see OriginalKit.tsx. */
import type { OriginalAsset } from "../../lib/original/original-assets.ts";

/** Button bases in `common/button/`: `<size>1.png` normal, `<size>2.png` pressed. */
export type OriginalButtonSize =
  | "main_l_btn"
  | "main_s_btn"
  | "sub_L_btn"
  | "sub_m_btn"
  | "sub_mm_btn"
  | "sub_s_btn"
  | "sub_ss_btn"
  | "sub_sss_btn"
  | "sub_wide_btn"
  | "sub_m_r_btn"
  | "sub_m_green_btn"
  | "sub_s_r_btn";

/** Label size (logical px) per base, from the original's captions. */
export const LABEL_SIZE: Record<OriginalButtonSize, number> = {
  main_l_btn: 36,
  main_s_btn: 32,
  sub_L_btn: 30,
  sub_m_btn: 30,
  sub_mm_btn: 28,
  sub_s_btn: 28,
  sub_ss_btn: 26,
  sub_sss_btn: 22,
  sub_wide_btn: 30,
  sub_m_r_btn: 30,
  sub_m_green_btn: 30,
  sub_s_r_btn: 23,
};

export type Frame = {
  corner: number;
  parts: Record<
    "base" | "lt" | "rt" | "lb" | "rb" | "top" | "bottom" | "left" | "right",
    OriginalAsset
  >;
};

/** Nine-slice frames: `wide` is the thin gold list frame, `system` the dialog window. */
export const FRAMES: Record<"wide" | "system", Frame> = {
  wide: {
    corner: 25,
    parts: {
      base: "wide_use/wide_use_frame_base.png",
      lt: "wide_use/wide_use_frame_corner_lt.png",
      rt: "wide_use/wide_use_frame_corner_rt.png",
      lb: "wide_use/wide_use_frame_corner_lb.png",
      rb: "wide_use/wide_use_frame_corner_rb.png",
      top: "wide_use/wide_use_frame_line_top.png",
      bottom: "wide_use/wide_use_frame_line_bottom.png",
      left: "wide_use/wide_use_frame_line_left.png",
      right: "wide_use/wide_use_frame_line_right.png",
    },
  },
  system: {
    corner: 18,
    parts: {
      base: "system/sys_win_base.png",
      lt: "system/sys_win_corner_lt.png",
      rt: "system/sys_win_corner_rt.png",
      lb: "system/sys_win_corner_lb.png",
      rb: "system/sys_win_corner_rb.png",
      top: "system/sys_win_line_top.png",
      bottom: "system/sys_win_line_bottom.png",
      left: "system/sys_win_line_left.png",
      right: "system/sys_win_line_right.png",
    },
  },
};
