import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("notification audio unlock", () => {
  it("uses a shipped muted audio asset instead of a synthetic oscillator", () => {
    const start = app.indexOf("function unlockNotificationAudio()");
    const end = app.indexOf("function soundEffectsEnabled", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const implementation = app.slice(start, end);
    expect(implementation).toContain("new Audio(SOUND_PRESETS[0].src)");
    expect(implementation).toContain("audio.muted=true");
    expect(implementation).toContain("audio.play()");
    expect(implementation).not.toContain("OscillatorNode");
    expect(implementation).not.toContain("createOscillator");
  });

  it("does not repeatedly create unlock attempts while one is in flight", () => {
    const start = app.indexOf("function unlockNotificationAudio()");
    const end = app.indexOf("function soundEffectsEnabled", start);
    const implementation = app.slice(start, end);
    expect(implementation).toContain("notificationAudioUnlockInFlight");
    expect(implementation).toContain("if(notificationAudioUnlocked||notificationAudioUnlockInFlight)return notificationAudioUnlockInFlight;");
  });
});
