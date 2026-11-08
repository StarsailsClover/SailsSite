export type SceneQuality = "high" | "balanced" | "mobile";

export type SceneProfile = {
  quality: SceneQuality;
  isMobile: boolean;
  reducedMotion: boolean;
  dpr: [number, number];
  antialias: boolean;
  shadows: boolean;
  waterSegments: number;
  particleScale: number;
  starCount: number;
  fireflyCount: number;
  mistCount: number;
  rainCount: number;
  waterfallLayers: number;
};

let cachedProfile: SceneProfile | null = null;

function isMobileUserAgent(userAgent: string) {
  return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(userAgent);
}

export function getSceneProfile(): SceneProfile {
  if (cachedProfile) return cachedProfile;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
  };
  const touchMac =
    nav.platform === "MacIntel" && Number(nav.maxTouchPoints || 0) > 1;
  const isMobile =
    isMobileUserAgent(nav.userAgent) ||
    Boolean(nav.userAgentData?.mobile) ||
    touchMac ||
    window.matchMedia("(pointer: coarse)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const memory = Number(nav.deviceMemory ?? (isMobile ? 4 : 8));
  const cores = Number(nav.hardwareConcurrency ?? (isMobile ? 4 : 8));
  const compactViewport = Math.min(window.innerWidth, window.innerHeight) < 760;
  const highEndDesktop =
    !isMobile &&
    !compactViewport &&
    memory >= 8 &&
    cores >= 8 &&
    window.innerWidth >= 1180;

  if (isMobile || compactViewport || memory <= 4 || cores <= 4) {
    cachedProfile = {
      quality: "mobile",
      isMobile: true,
      reducedMotion,
      dpr: [0.8, 1],
      antialias: false,
      shadows: false,
      waterSegments: 18,
      particleScale: 0.32,
      starCount: 54,
      fireflyCount: 5,
      mistCount: 54,
      rainCount: 18,
      waterfallLayers: 1,
    };
  } else if (highEndDesktop) {
    cachedProfile = {
      quality: "high",
      isMobile: false,
      reducedMotion,
      dpr: [1, 1.75],
      antialias: true,
      shadows: true,
      waterSegments: 48,
      particleScale: 1,
      starCount: 180,
      fireflyCount: 16,
      mistCount: 210,
      rainCount: 54,
      waterfallLayers: 3,
    };
  } else {
    cachedProfile = {
      quality: "balanced",
      isMobile: false,
      reducedMotion,
      dpr: [1, 1.3],
      antialias: true,
      shadows: false,
      waterSegments: 30,
      particleScale: 0.68,
      starCount: 112,
      fireflyCount: 10,
      mistCount: 130,
      rainCount: 34,
      waterfallLayers: 2,
    };
  }
  return cachedProfile;
}
