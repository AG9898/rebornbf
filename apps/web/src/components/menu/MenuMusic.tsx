"use client";

import { useEffect } from "react";
import { type AudioVolume, gameAudio } from "../../game/audio/index.ts";

/**
 * Loops the menu theme while a menu screen is open (ART_GUIDE.md → Audio), at the player's saved
 * music and SFX levels when given (M7-01_4). Renders nothing.
 */
export function MenuMusic({ volume }: { volume: AudioVolume | null }): null {
  const music = volume?.music;
  const sfx = volume?.sfx;
  useEffect(() => {
    if (music !== undefined && sfx !== undefined) gameAudio().setVolume({ music, sfx });
  }, [music, sfx]);
  useEffect(() => {
    gameAudio().playMusic("menu");
    return () => gameAudio().stopMusic();
  }, []);
  return null;
}
