import type { ZoomRegion } from "../types";
import { smoothStep } from "./mathUtils";
import { TRANSITION_WINDOW_MS } from "./constants";

export function computeRegionStrength(region: ZoomRegion, timeMs: number) {
  const leadInStart = region.startMs - TRANSITION_WINDOW_MS;
  const leadOutEnd = region.endMs + TRANSITION_WINDOW_MS;

  if (timeMs < leadInStart || timeMs > leadOutEnd) {
    return 0;
  }

  const fadeIn = smoothStep((timeMs - leadInStart) / TRANSITION_WINDOW_MS);
  const fadeOut = smoothStep((leadOutEnd - timeMs) / TRANSITION_WINDOW_MS);
  return Math.min(fadeIn, fadeOut);
}

export function findDominantRegion(regions: ZoomRegion[], timeMs: number) {
  let bestRegion: ZoomRegion | null = null;
  let bestStrength = 0;

  for (const region of regions) {
    const strength = computeRegionStrength(region, timeMs);
    if (strength > bestStrength) {
      bestStrength = strength;
      bestRegion = region;
    }
  }

  // Debug logging (only log when a region is found to avoid spam)
  if (bestRegion && bestStrength > 0) {
    // Only log occasionally to avoid console spam
    if (Math.random() < 0.01) { // Log ~1% of the time
      console.log('🔵 findDominantRegion: Found active zoom at', timeMs, 'ms:', {
        id: bestRegion.id,
        strength: bestStrength.toFixed(3),
        startMs: bestRegion.startMs,
        endMs: bestRegion.endMs,
        focus: bestRegion.focus,
        totalRegions: regions.length
      });
    }
  }

  return { region: bestRegion, strength: bestStrength };
}
