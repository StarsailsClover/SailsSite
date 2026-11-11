export type LyricLine = {
  time: number | null;
  text: string;
  translation: string;
};

const TIMESTAMP_PATTERN = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

function fractionToSeconds(value: string | undefined) {
  if (!value) return 0;
  if (value.length === 1) return Number(value) / 10;
  if (value.length === 2) return Number(value) / 100;
  return Number(value.padEnd(3, "0").slice(0, 3)) / 1000;
}

function parseOffset(raw: string) {
  const match = /^\[offset:([+-]?\d+)\]$/im.exec(raw);
  return match ? Number(match[1]) / 1000 : 0;
}

export function parseLrc(raw: string): Array<{ time: number; text: string }> {
  const offset = parseOffset(raw);
  const lines: Array<{ time: number; text: string; order: number }> = [];
  let order = 0;

  for (const sourceLine of String(raw || "").split(/\r?\n/)) {
    const stamps = [...sourceLine.matchAll(TIMESTAMP_PATTERN)];
    if (stamps.length === 0) {
      const metadata = /^\s*\[(?:ar|ti|al|by|re|ve|offset):[^\]]*\]\s*$/i.test(
        sourceLine,
      );
      if (!metadata && sourceLine.trim()) {
        lines.push({ time: Number.NaN, text: sourceLine.trim(), order: order++ });
      }
      continue;
    }

    const text = sourceLine.replace(TIMESTAMP_PATTERN, "").trim();
    if (!text) continue;
    for (const stamp of stamps) {
      const minutes = Number(stamp[1]);
      const seconds = Number(stamp[2]);
      const time =
        Math.max(0, minutes * 60 + seconds + fractionToSeconds(stamp[3]) + offset);
      lines.push({ time, text, order: order++ });
    }
  }

  return lines
    .filter((line) => Number.isFinite(line.time))
    .sort((left, right) => left.time - right.time || left.order - right.order)
    .map(({ time, text }) => ({ time, text }));
}

function plainLines(raw: string) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        Boolean(line) &&
        !/^\[(?:ar|ti|al|by|re|ve|offset):[^\]]*\]$/i.test(line),
    );
}

export function hasTimedLyrics(raw: string) {
  return parseLrc(raw).length > 0;
}

export function mergeLyrics(raw: string, translatedRaw = ""): LyricLine[] {
  const original = parseLrc(raw);
  const translationTimed = parseLrc(translatedRaw);
  const translationPlain = plainLines(translatedRaw);

  if (original.length === 0) {
    const base = plainLines(raw);
    return base.map((text, index) => ({
      time: null,
      text,
      translation: translationPlain[index] || "",
    }));
  }

  const timedByTime = new Map<number, string[]>();
  for (const line of translationTimed) {
    const key = Math.round(line.time * 1000);
    const queue = timedByTime.get(key) || [];
    queue.push(line.text);
    timedByTime.set(key, queue);
  }

  return original.map((line, index) => {
    const key = Math.round(line.time * 1000);
    const queue = timedByTime.get(key) || [];
    return {
      time: line.time,
      text: line.text,
      translation:
        queue.shift() ||
        (translationTimed.length === 0 ? translationPlain[index] || "" : ""),
    };
  });
}

export function activeLyricIndex(lines: LyricLine[], currentTime: number) {
  let active = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const time = lines[index].time;
    if (time === null || time > currentTime + 0.04) break;
    active = index;
  }
  return active;
}

export function formatTrackDuration(seconds: number) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
