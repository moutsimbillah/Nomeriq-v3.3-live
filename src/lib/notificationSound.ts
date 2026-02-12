let lastPlayAt = 0;

const MIN_PLAY_GAP_MS = 800;

const playOscillatorFallback = () => {
  try {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const audioCtx = new Ctx();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.22);
  } catch {
    // Ignore fallback sound errors.
  }
};

export const playNotificationSound = async () => {
  const now = Date.now();
  if (now - lastPlayAt < MIN_PLAY_GAP_MS) {
    return;
  }

  lastPlayAt = now;

  try {
    const audio = new Audio("/notification-sound.mp3");
    audio.preload = "auto";
    await audio.play();
  } catch {
    playOscillatorFallback();
  }
};
