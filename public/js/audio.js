/**
 * Audio system — generates beep sounds using Web Audio API
 * No external audio files needed
 */

class AudioManager {
  constructor() {
    this.ctx = null;
    this.volume = 1.0;  // 0-1
    this.enabled = true;
    this.unlocked = false;
  }

  // Must be called from a user gesture (click/tap) to unlock audio
  unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    // Play a silent buffer to fully unlock on iOS/Safari
    const buffer = this.ctx.createBuffer(1, 1, 22050);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.start(0);
    this.unlocked = true;
    // Keep AudioContext alive — prevent browser from suspending it
    this._keepAlive = setInterval(() => {
      if (this.ctx && this.ctx.state === 'running') {
        const buf = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.start(0);
      }
    }, 20000);
  }

  // Alias for backward compat
  _ensureContext() {
    this.unlock();
  }

  setVolume(level) {
    // level 0-5
    this.volume = level / 5;
    this.enabled = level > 0;
  }

  _playTone(freq, duration, type = 'square') {
    if (!this.enabled || !this.ctx || !this.unlocked) {
      return;
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    // Use full volume — the volume property controls the level
    const vol = this.volume * 0.8;
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    // Hold for most of the duration, then fade out
    gain.gain.setValueAtTime(vol, this.ctx.currentTime + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // Short tick for countdown 3-2-1
  tick() {
    this._playTone(880, 0.3, 'square');
  }

  // GO beep — higher, longer, two-tone
  go() {
    this._playTone(1000, 0.15, 'square');
    setTimeout(() => this._playTone(1400, 0.5, 'square'), 150);
  }

  // Rest beep — lower tone
  rest() {
    this._playTone(440, 0.5, 'sine');
  }

  // Workout complete — ascending triple beep followed by "TIME!" voice
  complete() {
    this._playTone(800, 0.2, 'square');
    setTimeout(() => this._playTone(1000, 0.2, 'square'), 250);
    setTimeout(() => this._playTone(1200, 0.6, 'square'), 500);
    this._sayTime();
  }

  _sayTime() {
    if (!this.enabled || !window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance('Time!');
    utter.volume = 1.0;
    utter.rate = 0.9;
    speechSynthesis.speak(utter);
  }

  // Play a beep by name
  play(name) {
    switch (name) {
      case 'tick': this.tick(); break;
      case 'go': this.go(); break;
      case 'rest': this.rest(); break;
      case 'complete': this.complete(); break;
    }
  }
}
