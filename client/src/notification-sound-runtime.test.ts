import { describe, expect, it, vi } from "vitest";
import { createNotificationAudioController } from "./notification-audio-controller";

class FakeAudio {
  preload = "";
  volume = 1;
  currentTime = 0;
  paused = false;
  ended = false;
  pause = vi.fn(() => { this.paused = true; });
  play = vi.fn<() => Promise<void>>();
  listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
    const callback = typeof listener === "function" ? listener : () => listener.handleEvent(new Event(type));
    const list = this.listeners.get(type) || [];
    list.push(callback);
    this.listeners.set(type, list);
    if (options && typeof options === "object" && options.once) {
      // The fake emits each registered one-shot event at most once.
    }
  }

  emit(type: string) {
    const callbacks = this.listeners.get(type) || [];
    this.listeners.delete(type);
    callbacks.forEach(callback => callback());
  }
}

function setup() {
  const audios: FakeAudio[] = [];
  const intervals = new Map<number, () => void>();
  const clearInterval = vi.fn((id: number) => { intervals.delete(id); });
  const onBlocked = vi.fn();
  let nextTimer = 1;
  const controller = createNotificationAudioController({
    createAudio: () => {
      const audio = new FakeAudio();
      audio.play.mockResolvedValue();
      audios.push(audio);
      return audio as unknown as HTMLAudioElement;
    },
    onBlocked,
    setInterval: (callback) => {
      const id = nextTimer++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval,
  });
  return { controller, audios, intervals, clearInterval, onBlocked };
}

describe("notification audio runtime controller", () => {
  it("replaces the previous cue and clears the active cue after playback ends", () => {
    const { controller, audios } = setup();
    controller.play("/one.wav", 0.6);
    controller.play("/two.wav", 0.8);

    expect(audios).toHaveLength(2);
    expect(audios[0].pause).toHaveBeenCalledOnce();
    expect(audios[0].currentTime).toBe(0);
    audios[1].ended = true;
    audios[1].emit("ended");
    controller.stopActive();
    expect(audios[1].pause).not.toHaveBeenCalled();
  });

  it("does not overlap loop cues and starts the next cue after the active cue ends", () => {
    const { controller, audios, intervals } = setup();
    controller.play("/opportunity.wav", 1, true);
    const tick = [...intervals.values()][0];

    tick();
    expect(audios).toHaveLength(1);
    audios[0].ended = true;
    audios[0].emit("ended");
    tick();
    expect(audios).toHaveLength(2);
    expect(audios[1].play).toHaveBeenCalledOnce();
  });

  it("stops the loop and reports a rejected browser playback promise once", async () => {
    const { controller, audios, intervals, clearInterval, onBlocked } = setup();
    controller.play("/opportunity.wav", 1, true, { kind: "opportunity", presetId: "sound-01" });
    audios[0].play.mockRejectedValueOnce(new Error("autoplay blocked"));
    // Trigger a second cue through the loop to exercise a rejected repeat.
    const tick = [...intervals.values()][0];
    audios[0].ended = true;
    audios[0].emit("ended");
    tick();
    await Promise.resolve();

    expect(onBlocked).toHaveBeenCalledOnce();
    expect(onBlocked).toHaveBeenCalledWith({ kind: "opportunity", presetId: "sound-01" });
    expect(clearInterval).toHaveBeenCalledOnce();
    expect(intervals.size).toBe(0);
  });

  it("handles synchronous audio construction failures without throwing", () => {
    const onBlocked = vi.fn();
    const controller = createNotificationAudioController({
      createAudio: () => { throw new Error("audio unavailable"); },
      onBlocked,
      setInterval: () => 1,
      clearInterval: vi.fn(),
    });

    expect(() => controller.play("/missing.wav", 1, false, { kind: "deposit", presetId: "sound-02" })).not.toThrow();
    expect(onBlocked).toHaveBeenCalledWith({ kind: "deposit", presetId: "sound-02" });
  });

  it("reports media element errors once and allows explicit stop to clear timers and audio", () => {
    const { controller, audios, intervals, clearInterval, onBlocked } = setup();
    controller.play("/opportunity.wav", 1, true, { kind: "opportunity", presetId: "sound-03" });
    audios[0].emit("error");
    expect(onBlocked).toHaveBeenCalledOnce();
    expect(intervals.size).toBe(0);

    controller.play("/next.wav", 1, true);
    controller.stop();
    expect(clearInterval).toHaveBeenCalled();
    expect(intervals.size).toBe(0);
    expect(audios[1].pause).toHaveBeenCalledOnce();
  });
});
