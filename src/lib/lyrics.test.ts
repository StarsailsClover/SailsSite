import assert from "node:assert/strict";
import test from "node:test";
import {
  activeLyricIndex,
  mergeLyrics,
  parseLrc,
} from "./lyrics.ts";

test("LRC parser supports offsets and fractions", () => {
  const lines = parseLrc(
    "[offset:500]\n[00:01.2]one\n[00:02.34]two\n[ar:Artist]",
  );
  assert.deepEqual(lines, [
    { time: 1.7, text: "one" },
    { time: 2.84, text: "two" },
  ]);
});

test("translation metadata is ignored for plain line pairing", () => {
  const lines = mergeLyrics("[00:01.00]Hello", "[by:someone]\n你好");
  assert.equal(lines[0].translation, "你好");
});

test("duplicate timestamps keep translation occurrence order", () => {
  const lines = mergeLyrics(
    "[00:01.00]First\n[00:01.00]Second",
    "[00:01.00]译一\n[00:01.00]译二",
  );
  assert.deepEqual(
    lines.map((line) => line.translation),
    ["译一", "译二"],
  );
});

test("active lyric follows the latest timestamp not in the future", () => {
  const lines = mergeLyrics(
    "[00:00.00]zero\n[00:01.00]one\n[00:02.00]two",
  );
  assert.equal(activeLyricIndex(lines, 0), 0);
  assert.equal(activeLyricIndex(lines, 1.4), 1);
  assert.equal(activeLyricIndex(lines, 2), 2);
});
