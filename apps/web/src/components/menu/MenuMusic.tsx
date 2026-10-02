"use client";

import { useEffect } from "react";
import { gameAudio } from "../../game/audio/index.ts";

/** Loops the menu theme while a menu screen is open (ART_GUIDE.md → Audio). Renders nothing. */
export function MenuMusic(): null {
  useEffect(() => {
    gameAudio().playMusic("menu");
    return () => gameAudio().stopMusic();
  }, []);
  return null;
}
