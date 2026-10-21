import { describe, expect, it } from "vitest";
import { normalizeNotificationVolume, notificationAudioVolume } from "./notification-sound-volume";

describe("notification sound volume", () => {
  it("defaults missing or malformed persisted values safely", () => {
    expect(normalizeNotificationVolume(undefined)).toBe(80);
    expect(normalizeNotificationVolume(Number.NaN)).toBe(80);
    expect(normalizeNotificationVolume("45")).toBe(80);
  });

  it("clamps and rounds percentages to the supported range", () => {
    expect(normalizeNotificationVolume(-5)).toBe(0);
    expect(normalizeNotificationVolume(42.6)).toBe(43);
    expect(normalizeNotificationVolume(150)).toBe(100);
  });

  it("maps volume to audio range and attenuates debit/failure cues", () => {
    expect(notificationAudioVolume(80)).toBeCloseTo(0.8);
    expect(notificationAudioVolume(80, 0.9)).toBeCloseTo(0.72);
    expect(notificationAudioVolume(0)).toBe(0);
    expect(notificationAudioVolume(100, 4)).toBe(1);
    expect(notificationAudioVolume(50, Number.NaN)).toBe(0.5);
  });
});
