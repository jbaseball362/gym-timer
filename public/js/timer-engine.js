/**
 * Gym Timer Engine
 * Handles all timer modes: clock, stopwatch, emom, fgb, interval, countdown, countup, tabata, warmup
 */

const PRESETS = [
  { id: 1,  name: '10s work / 20s rest',         work: 10, rest: 20, rounds: 99 },
  { id: 2,  name: '20s work / 10s rest',         work: 20, rest: 10, rounds: 99 },
  { id: 3,  name: '30s work / 10s rest',         work: 30, rest: 10, rounds: 99 },
  { id: 4,  name: '30s work / 60s rest',         work: 30, rest: 60, rounds: 99 },
  { id: 5,  name: '60s work / 30s rest',         work: 60, rest: 30, rounds: 99 },
  { id: 6,  name: '60s work / 0s rest',          work: 60, rest: 0,  rounds: 99 },
  { id: 7,  name: '90s work / 1min rest',        work: 90, rest: 60, rounds: 99 },
  { id: 8,  name: '2min work / 1min rest',       work: 120, rest: 60, rounds: 99 },
  { id: 9,  name: '3min work / 1min rest',       work: 180, rest: 60, rounds: 99 },
  { id: 10, name: '4min work / 1min rest',       work: 240, rest: 60, rounds: 99 },
  { id: 11, name: '5min work / 1min rest',       work: 300, rest: 60, rounds: 99 },
  { id: 12, name: '10min work / 1min rest',      work: 600, rest: 60, rounds: 99 },
  { id: 13, name: 'Variable: 90,75,60,45,30 / 60s rest', work: [90,75,60,45,30], rest: 60, rounds: 5 },
  { id: 14, name: 'Variable: 30,45,60,75,90,75,60,45,30 / 30s rest', work: [30,45,60,75,90,75,60,45,30], rest: 30, rounds: 9 },
  { id: 15, name: 'Variable min: 1,2,3,4,5,4,3,2,1 / 30s rest', work: [60,120,180,240,300,240,180,120,60], rest: 30, rounds: 9 },
  { id: 16, name: 'Variable min: 1,2,3,4,5,4,3,2,1 / 60s rest', work: [60,120,180,240,300,240,180,120,60], rest: 60, rounds: 9 },
  { id: 17, name: '5min countdown',              type: 'countdown', duration: 300 },
  { id: 18, name: '10min countdown',             type: 'countdown', duration: 600 },
  { id: 19, name: '24 second shot clock',        type: 'countdown', duration: 24 },
  { id: 20, name: 'Lap timer (count up)',        type: 'countup' },
];

class TimerEngine {
  constructor() {
    this.mode = 'clock';
    this.status = 'stopped';   // stopped, running, paused
    this.phase = 'idle';       // idle, prep, work, rest, complete

    this.elapsedMs = 0;
    this.totalDurationMs = 0;
    this.phaseDurationMs = 0;
    this.phaseElapsedMs = 0;

    this.currentRound = 0;
    this.totalRounds = 0;

    this.workTime = 0;    // seconds
    this.restTime = 0;    // seconds
    this.workTimes = null; // array for variable intervals

    this.prepCountdown = true;
    this.prepDuration = 10; // seconds

    this.use24hr = false;

    // Absolute timestamps to prevent floating-point drift
    this._absoluteStart = null;
    this._phaseStart = null;
    this._lastClockString = '';
    this.tickInterval = null;

    this.onUpdate = null;  // callback
    this.onBeep = null;
    this.onComplete = null;
  }

  // Format seconds to MM:SS or H:MM:SS
  formatTime(totalSeconds, forceHours = false) {
    const negative = totalSeconds < 0;
    totalSeconds = Math.abs(Math.ceil(totalSeconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n) => String(n).padStart(2, '0');

    let result;
    if (hours > 0 || forceHours) {
      result = `${hours}:${pad(minutes)}:${pad(seconds)}`;
    } else {
      result = `${minutes}:${pad(seconds)}`;
    }
    return negative ? `-${result}` : result;
  }

  // Format milliseconds to MM:SS.cc (with hundredths)
  formatTimeMs(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hundredths = Math.floor((ms % 1000) / 10);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n) => String(n).padStart(2, '0');

    let result;
    if (hours > 0) {
      result = `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(hundredths)}`;
    } else {
      result = `${minutes}:${pad(seconds)}.${pad(hundredths)}`;
    }
    return result;
  }

  // Get current clock time
  getClockTime() {
    const now = new Date();
    if (this.use24hr) {
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    const ampm = now.getHours() >= 12 ? 'pm' : 'am';
    let hours = now.getHours() % 12;
    if (hours === 0) hours = 12;
    return `${hours}:${String(now.getMinutes()).padStart(2, '0')}<span class="ampm">${ampm}</span>`;
  }

  // Start a mode
  startMode(mode, config = {}) {
    this.stop();
    this.mode = mode;
    this.elapsedMs = 0;
    this.phaseElapsedMs = 0;
    this.currentRound = 0;
    this.workTimes = null;
    this._absoluteStart = null;
    this._phaseStart = null;
    this._lastClockString = '';

    switch (mode) {
      case 'clock':
        this.status = 'running';
        this.phase = 'idle';
        break;

      case 'stopwatch':
        this.status = 'stopped';
        this.phase = 'idle';
        break;

      case 'emom':
        this.totalRounds = config.rounds || 99;
        this.workTime = 60;
        this.restTime = 0;
        this.status = 'stopped';
        this.phase = 'idle';
        break;

      case 'fgb':
        // Fight Gone Bad: 3 rounds of 5 minutes, 1 min rest between
        // Each 5-min round = 5 x 1-min work intervals
        this.totalRounds = 3;
        this.workTime = 300;  // 5 min work
        this.restTime = 60;   // 1 min rest
        this.status = 'stopped';
        this.phase = 'idle';
        break;

      case 'interval':
        this.workTime = config.workTime || 60;
        this.restTime = config.restTime || 30;
        this.totalRounds = config.rounds || 10;
        if (config.workTimes) {
          this.workTimes = config.workTimes;
          this.totalRounds = config.workTimes.length;
        }
        this.status = 'stopped';
        this.phase = 'idle';
        break;

      case 'countdown':
        this.totalDurationMs = (config.duration || 300) * 1000;
        this.status = 'stopped';
        this.phase = 'idle';
        break;

      case 'countup':
        this.totalDurationMs = config.duration ? config.duration * 1000 : 0;
        this.status = 'stopped';
        this.phase = 'idle';
        break;

      case 'tabata':
        this.workTime = config.workTime || 20;
        this.restTime = config.restTime || 10;
        this.totalRounds = config.rounds || 8;
        this.status = 'stopped';
        this.phase = 'idle';
        break;

      case 'warmup':
        this.totalDurationMs = (config.duration || 600) * 1000;
        this.status = 'stopped';
        this.phase = 'idle';
        break;
    }

    this._startTicking();
    this._emitUpdate();
  }

  // Play / resume
  play() {
    if (this.mode === 'clock') return;

    if (this.status === 'stopped') {
      // Fresh start
      if (this.prepCountdown && this.mode !== 'stopwatch') {
        this.phase = 'prep';
        this.phaseElapsedMs = 0;
        this.phaseDurationMs = this.prepDuration * 1000;
      } else {
        this._startFirstWorkPhase();
      }
      this.status = 'running';
      this._absoluteStart = performance.now();
      this._phaseStart = performance.now();
    } else if (this.status === 'paused') {
      this.status = 'running';
      // Adjust start times to preserve elapsed time across pause
      const now = performance.now();
      this._absoluteStart = now - this.elapsedMs;
      this._phaseStart = now - this.phaseElapsedMs;
    }

    this._emitUpdate();
  }

  pause() {
    if (this.status === 'running') {
      this.status = 'paused';
      this._emitUpdate();
    }
  }

  stop() {
    this.status = 'stopped';
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this._emitUpdate();
  }

  reset() {
    this.phase = 'idle';
    this.elapsedMs = 0;
    this.phaseElapsedMs = 0;
    this.currentRound = 0;
    this._absoluteStart = null;
    this._phaseStart = null;
    this.status = 'stopped';
    this._startTicking();
    this._emitUpdate();
  }

  _startFirstWorkPhase() {
    this.currentRound = 1;
    this.phase = 'work';
    this.phaseElapsedMs = 0;
    this._phaseStart = performance.now();
    this._setPhaseDuration();
  }

  _setPhaseDuration() {
    if (this.mode === 'countdown' || this.mode === 'warmup') {
      this.phaseDurationMs = this.totalDurationMs;
    } else if (this.mode === 'stopwatch' || this.mode === 'countup') {
      this.phaseDurationMs = this.totalDurationMs || Infinity;
    } else {
      // Interval-based modes
      if (this.phase === 'work') {
        const wt = this.workTimes
          ? this.workTimes[this.currentRound - 1]
          : this.workTime;
        this.phaseDurationMs = wt * 1000;
      } else if (this.phase === 'rest') {
        this.phaseDurationMs = this.restTime * 1000;
      }
    }
  }

  _startTicking() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = setInterval(() => this._tick(), 50);
  }

  // Check for 3-2-1 countdown beeps before phase expiration
  // Checks each threshold independently so a delayed tick can't skip a beep
  _checkCountdownBeep(remaining, prevRemaining) {
    if (!this.onBeep) return;
    for (const threshold of [3000, 2000, 1000]) {
      if (remaining <= threshold && prevRemaining > threshold && remaining > 0) {
        this.onBeep('tick');
      }
    }
  }

  _tick() {
    if (this.mode === 'clock') {
      // Only update display when clock string changes (once per minute)
      const clockString = this.getClockTime();
      if (clockString !== this._lastClockString) {
        this._lastClockString = clockString;
        this._emitUpdate();
      }
      return;
    }

    if (this.status !== 'running') return;

    const now = performance.now();
    const prevPhaseElapsedMs = this.phaseElapsedMs;

    // Compute elapsed from absolute start times (no floating-point drift)
    this.elapsedMs = now - this._absoluteStart;
    this.phaseElapsedMs = now - this._phaseStart;

    // Check phase completion
    if (this.phase === 'prep') {
      const remaining = this.phaseDurationMs - this.phaseElapsedMs;
      const prevRemaining = this.phaseDurationMs - prevPhaseElapsedMs;
      this._checkCountdownBeep(remaining, prevRemaining);
      if (this.phaseElapsedMs >= this.phaseDurationMs) {
        if (this.onBeep) this.onBeep('go');
        this._startFirstWorkPhase();
      }
    } else if (this.mode === 'stopwatch') {
      // Just counts up forever
    } else if (this.mode === 'countup') {
      if (this.totalDurationMs > 0) {
        const remaining = this.totalDurationMs - this.phaseElapsedMs;
        const prevRemaining = this.totalDurationMs - prevPhaseElapsedMs;
        this._checkCountdownBeep(remaining, prevRemaining);
        if (this.phaseElapsedMs >= this.totalDurationMs) {
          this._complete();
        }
      }
    } else if (this.mode === 'countdown' || this.mode === 'warmup') {
      const remaining = this.phaseDurationMs - this.phaseElapsedMs;
      const prevRemaining = this.phaseDurationMs - prevPhaseElapsedMs;
      this._checkCountdownBeep(remaining, prevRemaining);
      if (this.phaseElapsedMs >= this.phaseDurationMs) {
        this._complete();
      }
    } else {
      // Interval-based modes (emom, fgb, interval, tabata)
      const remaining = this.phaseDurationMs - this.phaseElapsedMs;
      const prevRemaining = this.phaseDurationMs - prevPhaseElapsedMs;
      this._checkCountdownBeep(remaining, prevRemaining);
      if (this.phaseElapsedMs >= this.phaseDurationMs) {
        this._nextPhase();
      }
    }

    this._emitUpdate();
  }

  _nextPhase() {
    if (this.phase === 'work') {
      if (this.restTime > 0 && this.currentRound < this.totalRounds) {
        // Move to rest
        this.phase = 'rest';
        this.phaseElapsedMs = 0;
        this._phaseStart = performance.now();
        this._setPhaseDuration();
        if (this.onBeep) this.onBeep('rest');
      } else if (this.currentRound >= this.totalRounds) {
        // All rounds done
        this._complete();
      } else {
        // No rest, go to next work round
        this.currentRound++;
        this.phaseElapsedMs = 0;
        this._phaseStart = performance.now();
        this._setPhaseDuration();
        if (this.onBeep) this.onBeep('go');
      }
    } else if (this.phase === 'rest') {
      if (this.currentRound >= this.totalRounds) {
        this._complete();
      } else {
        // Next work round
        this.currentRound++;
        this.phase = 'work';
        this.phaseElapsedMs = 0;
        this._phaseStart = performance.now();
        this._setPhaseDuration();
        if (this.onBeep) this.onBeep('go');
      }
    }
  }

  _complete() {
    this.status = 'stopped';
    this.phase = 'complete';
    if (this.onBeep) this.onBeep('complete');
    if (this.onComplete) this.onComplete();
    this._emitUpdate();
  }

  // Get the current display string and metadata
  getDisplay() {
    const result = {
      mode: this.mode,
      status: this.status,
      phase: this.phase,
      time: '',
      round: '',
      phaseLabel: '',
      progress: 0,
      urgent: false,
    };

    switch (this.mode) {
      case 'clock':
        result.time = this.getClockTime();
        break;

      case 'stopwatch':
        result.time = this.formatTimeMs(this.elapsedMs);
        break;

      case 'countup':
        if (this.phase === 'prep') {
          const remaining = Math.max(0, this.phaseDurationMs - this.phaseElapsedMs);
          result.time = Math.ceil(remaining / 1000).toString();
          result.phaseLabel = 'GET READY';
          result.progress = this.phaseElapsedMs / this.phaseDurationMs;
          result.urgent = remaining <= 3000;
        } else if (this.phase === 'complete') {
          result.time = this.formatTime(this.totalDurationMs / 1000);
          result.phaseLabel = 'DONE';
          result.progress = 1;
        } else {
          result.time = this.formatTime(this.phaseElapsedMs / 1000);
          if (this.totalDurationMs > 0) {
            const remaining = this.totalDurationMs - this.phaseElapsedMs;
            result.progress = Math.min(this.phaseElapsedMs / this.totalDurationMs, 1);
            result.urgent = remaining <= 3000;
          }
        }
        break;

      case 'countdown':
      case 'warmup': {
        if (this.phase === 'prep') {
          const remaining = Math.max(0, this.phaseDurationMs - this.phaseElapsedMs);
          result.time = Math.ceil(remaining / 1000).toString();
          result.phaseLabel = 'GET READY';
          result.progress = this.phaseElapsedMs / this.phaseDurationMs;
          result.urgent = remaining <= 3000;
        } else if (this.phase === 'idle') {
          result.time = this.formatTime(this.totalDurationMs / 1000 || 0);
        } else if (this.phase === 'complete') {
          result.time = '0:00';
          result.phaseLabel = 'DONE';
        } else {
          const remaining = Math.max(0, this.phaseDurationMs - this.phaseElapsedMs);
          result.time = this.formatTime(remaining / 1000);
          result.progress = this.phaseElapsedMs / this.phaseDurationMs;
          result.phaseLabel = this.mode === 'warmup' ? 'WARM UP' : '';
          result.urgent = remaining <= 3000;
        }
        break;
      }

      case 'emom':
      case 'fgb':
      case 'interval':
      case 'tabata': {
        if (this.phase === 'prep') {
          const remaining = Math.max(0, this.phaseDurationMs - this.phaseElapsedMs);
          result.time = Math.ceil(remaining / 1000).toString();
          result.phaseLabel = 'GET READY';
          result.progress = this.phaseElapsedMs / this.phaseDurationMs;
          result.urgent = remaining <= 3000;
        } else if (this.phase === 'idle') {
          result.time = this.formatTime(this.workTime);
          result.round = `0 / ${this.totalRounds}`;
        } else if (this.phase === 'complete') {
          result.time = '0:00';
          result.phaseLabel = 'DONE';
          result.round = `${this.totalRounds} / ${this.totalRounds}`;
        } else {
          const remaining = Math.max(0, this.phaseDurationMs - this.phaseElapsedMs);
          result.time = this.formatTime(remaining / 1000);
          result.phaseLabel = this.phase === 'work' ? 'WORK' : 'REST';
          result.round = `Round ${this.currentRound} / ${this.totalRounds}`;
          result.progress = this.phaseElapsedMs / this.phaseDurationMs;
          result.urgent = remaining <= 3000;
        }
        break;
      }
    }

    return result;
  }

  _emitUpdate() {
    if (this.onUpdate) {
      this.onUpdate(this.getDisplay());
    }
  }
}
