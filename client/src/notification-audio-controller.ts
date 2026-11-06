export type NotificationAudioControllerOptions = {
  createAudio: (src: string) => HTMLAudioElement;
  onBlocked: (context?: { kind?: string; presetId?: string }) => void;
  setInterval: (callback: () => void, delayMs: number) => number;
  clearInterval: (timer: number) => void;
};

export function createNotificationAudioController(options: NotificationAudioControllerOptions) {
  let activeAudio: HTMLAudioElement | null = null;
  let loopTimer: number | null = null;

  const stopActive = () => {
    const audio = activeAudio;
    activeAudio = null;
    if (!audio) return;
    audio.pause();
    try { audio.currentTime = 0; } catch { /* Some browser media implementations reject seeking. */ }
  };

  const stopLoop = () => {
    if (loopTimer !== null) options.clearInterval(loopTimer);
    loopTimer = null;
  };

  const stop = () => {
    stopLoop();
    stopActive();
  };

  const play = (src: string, volume: number, loop = false, context?: { kind?: string; presetId?: string }) => {
    stopLoop();
    let blockedReported = false;
    const reportBlocked = () => {
      if (blockedReported) return;
      blockedReported = true;
      stopLoop();
      options.onBlocked(context);
    };

    const playCue = (skipWhenBusy = false) => {
      if (skipWhenBusy && activeAudio && !activeAudio.paused && !activeAudio.ended) return;
      stopActive();
      let audio: HTMLAudioElement;
      try {
        audio = options.createAudio(src);
        audio.preload = "auto";
        audio.volume = volume;
        activeAudio = audio;
      } catch {
        reportBlocked();
        return;
      }

      const clearActive = () => {
        if (activeAudio === audio) activeAudio = null;
      };
      audio.addEventListener("ended", clearActive, { once: true });
      audio.addEventListener("error", () => {
        clearActive();
        reportBlocked();
      }, { once: true });

      try {
        void audio.play().catch(() => {
          clearActive();
          reportBlocked();
        });
      } catch {
        clearActive();
        reportBlocked();
      }
    };

    playCue();
    if (loop && loopTimer === null) {
      loopTimer = options.setInterval(() => playCue(true), 1500);
    }
  };

  return { play, stop, stopActive };
}
