const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');

// Load TimerEngine into global scope (it's a browser global, no module.exports)
const code = fs.readFileSync('public/js/timer-engine.js', 'utf8');
vm.runInThisContext(code);

// --- Test helpers ---

let fakeTime = 10000;

function mockPerformance() {
  fakeTime = 10000;
  mock.method(performance, 'now', () => fakeTime);
}

function restorePerformance() {
  mock.restoreAll();
}

function createEngine() {
  const engine = new TimerEngine();
  // Prevent real setInterval timers from running
  engine._startTicking = () => {};
  if (engine.tickInterval) {
    clearInterval(engine.tickInterval);
    engine.tickInterval = null;
  }
  return engine;
}

function advanceTime(engine, ms) {
  fakeTime += ms;
  engine._tick();
}

// Collect beep callbacks
function trackBeeps(engine) {
  const beeps = [];
  engine.onBeep = (type) => beeps.push(type);
  return beeps;
}

// Collect update callbacks
function trackUpdates(engine) {
  const updates = [];
  engine.onUpdate = (display) => updates.push({ ...display });
  return updates;
}


// ============================================================
// formatTime
// ============================================================
describe('formatTime', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('formats seconds to M:SS', () => {
    assert.equal(engine.formatTime(0), '0:00');
    assert.equal(engine.formatTime(5), '0:05');
    assert.equal(engine.formatTime(65), '1:05');
    assert.equal(engine.formatTime(600), '10:00');
  });

  it('formats with hours when >= 3600', () => {
    assert.equal(engine.formatTime(3600), '1:00:00');
    assert.equal(engine.formatTime(3661), '1:01:01');
  });

  it('forces hours display when requested', () => {
    assert.equal(engine.formatTime(65, true), '0:01:05');
  });

  it('handles negative values', () => {
    assert.equal(engine.formatTime(-65), '-1:05');
  });

  it('no leading zero on minutes', () => {
    assert.equal(engine.formatTime(185), '3:05');
  });
});


// ============================================================
// formatTimeMs
// ============================================================
describe('formatTimeMs', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('formats milliseconds with hundredths', () => {
    assert.equal(engine.formatTimeMs(0), '0:00.00');
    assert.equal(engine.formatTimeMs(1500), '0:01.50');
    assert.equal(engine.formatTimeMs(65120), '1:05.12');
  });

  it('includes hours when >= 3600s', () => {
    assert.equal(engine.formatTimeMs(3600000), '1:00:00.00');
  });
});


// ============================================================
// startMode initialization
// ============================================================
describe('startMode initialization', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('clock starts running in idle phase', () => {
    engine.startMode('clock');
    assert.equal(engine.status, 'running');
    assert.equal(engine.phase, 'idle');
  });

  it('stopwatch starts stopped in idle', () => {
    engine.startMode('stopwatch');
    assert.equal(engine.status, 'stopped');
    assert.equal(engine.phase, 'idle');
  });

  it('emom defaults to 99 rounds of 60s work', () => {
    engine.startMode('emom');
    assert.equal(engine.totalRounds, 99);
    assert.equal(engine.workTime, 60);
    assert.equal(engine.restTime, 0);
  });

  it('fgb is 3 rounds of 5min work / 1min rest', () => {
    engine.startMode('fgb');
    assert.equal(engine.totalRounds, 3);
    assert.equal(engine.workTime, 300);
    assert.equal(engine.restTime, 60);
  });

  it('interval uses config values', () => {
    engine.startMode('interval', { workTime: 30, restTime: 15, rounds: 5 });
    assert.equal(engine.workTime, 30);
    assert.equal(engine.restTime, 15);
    assert.equal(engine.totalRounds, 5);
  });

  it('interval with workTimes array sets rounds to array length', () => {
    engine.startMode('interval', { workTimes: [30, 45, 60], restTime: 10 });
    assert.deepEqual(engine.workTimes, [30, 45, 60]);
    assert.equal(engine.totalRounds, 3);
  });

  it('countdown uses config duration', () => {
    engine.startMode('countdown', { duration: 120 });
    assert.equal(engine.totalDurationMs, 120000);
  });

  it('countup with no duration has 0 totalDurationMs', () => {
    engine.startMode('countup');
    assert.equal(engine.totalDurationMs, 0);
  });

  it('tabata defaults to 20s/10s for 8 rounds', () => {
    engine.startMode('tabata');
    assert.equal(engine.workTime, 20);
    assert.equal(engine.restTime, 10);
    assert.equal(engine.totalRounds, 8);
  });

  it('warmup uses config duration', () => {
    engine.startMode('warmup', { duration: 300 });
    assert.equal(engine.totalDurationMs, 300000);
  });

  it('all non-clock modes start stopped', () => {
    const modes = ['stopwatch', 'emom', 'fgb', 'interval', 'countdown', 'countup', 'tabata', 'warmup'];
    for (const mode of modes) {
      engine.startMode(mode);
      assert.equal(engine.status, 'stopped', `${mode} should start stopped`);
      assert.equal(engine.phase, 'idle', `${mode} should start idle`);
    }
  });
});


// ============================================================
// play / pause / stop / reset lifecycle
// ============================================================
describe('play/pause/stop/reset lifecycle', () => {
  let engine;
  beforeEach(() => {
    mockPerformance();
    engine = createEngine();
  });
  afterEach(() => restorePerformance());

  it('play sets status to running', () => {
    engine.startMode('countdown', { duration: 60 });
    engine.play();
    assert.equal(engine.status, 'running');
  });

  it('play on clock is a no-op', () => {
    engine.startMode('clock');
    engine.status = 'stopped'; // force stopped
    engine.play();
    assert.equal(engine.status, 'stopped');
  });

  it('play enters prep phase when prepCountdown is true', () => {
    engine.startMode('countdown', { duration: 60 });
    engine.prepCountdown = true;
    engine.play();
    assert.equal(engine.phase, 'prep');
    assert.equal(engine.phaseDurationMs, 10000);
  });

  it('play skips prep when prepCountdown is false', () => {
    engine.startMode('countdown', { duration: 60 });
    engine.prepCountdown = false;
    engine.play();
    assert.equal(engine.phase, 'work');
  });

  it('play never enters prep for stopwatch', () => {
    engine.startMode('stopwatch');
    engine.prepCountdown = true;
    engine.play();
    assert.equal(engine.phase, 'work');
  });

  it('pause sets status to paused', () => {
    engine.startMode('countdown', { duration: 60 });
    engine.play();
    engine.pause();
    assert.equal(engine.status, 'paused');
  });

  it('stop sets status to stopped', () => {
    engine.startMode('countdown', { duration: 60 });
    engine.play();
    engine.stop();
    assert.equal(engine.status, 'stopped');
  });

  it('reset restores to idle', () => {
    engine.startMode('countdown', { duration: 60 });
    engine.play();
    advanceTime(engine, 5000);
    engine.reset();
    assert.equal(engine.status, 'stopped');
    assert.equal(engine.phase, 'idle');
    assert.equal(engine.elapsedMs, 0);
    assert.equal(engine.phaseElapsedMs, 0);
    assert.equal(engine.currentRound, 0);
  });
});


// ============================================================
// Pause/resume preserves elapsed time
// ============================================================
describe('pause/resume preserves elapsed time', () => {
  let engine;
  beforeEach(() => {
    mockPerformance();
    engine = createEngine();
  });
  afterEach(() => restorePerformance());

  it('elapsed time is preserved across pause/resume', () => {
    engine.startMode('stopwatch');
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 5000);
    const elapsedBeforePause = engine.elapsedMs;
    assert.ok(elapsedBeforePause >= 4900 && elapsedBeforePause <= 5100,
      `Expected ~5000ms, got ${elapsedBeforePause}`);

    engine.pause();

    // Time passes while paused — should not affect elapsed
    fakeTime += 10000;

    engine.play(); // resume
    advanceTime(engine, 3000);

    const totalElapsed = engine.elapsedMs;
    assert.ok(totalElapsed >= 7900 && totalElapsed <= 8100,
      `Expected ~8000ms, got ${totalElapsed}`);
  });

  it('phase elapsed is also preserved across pause/resume', () => {
    engine.startMode('interval', { workTime: 60, restTime: 30, rounds: 3 });
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 5000);
    const phaseBeforePause = engine.phaseElapsedMs;

    engine.pause();
    fakeTime += 10000; // paused time
    engine.play();

    advanceTime(engine, 3000);
    assert.ok(engine.phaseElapsedMs >= 7900 && engine.phaseElapsedMs <= 8100,
      `Expected ~8000ms phase elapsed, got ${engine.phaseElapsedMs}`);
  });
});


// ============================================================
// Phase transitions
// ============================================================
describe('phase transitions', () => {
  let engine;
  beforeEach(() => {
    mockPerformance();
    engine = createEngine();
  });
  afterEach(() => restorePerformance());

  it('prep -> work transition', () => {
    engine.startMode('interval', { workTime: 30, restTime: 10, rounds: 3 });
    engine.prepCountdown = true;
    engine.play();
    assert.equal(engine.phase, 'prep');

    // Advance past 10s prep
    advanceTime(engine, 10001);
    assert.equal(engine.phase, 'work');
    assert.equal(engine.currentRound, 1);
  });

  it('work -> rest -> work (next round)', () => {
    engine.startMode('interval', { workTime: 5, restTime: 3, rounds: 3 });
    engine.prepCountdown = false;
    engine.play();
    assert.equal(engine.phase, 'work');
    assert.equal(engine.currentRound, 1);

    // Finish work phase
    advanceTime(engine, 5001);
    assert.equal(engine.phase, 'rest');

    // Finish rest phase
    advanceTime(engine, 3001);
    assert.equal(engine.phase, 'work');
    assert.equal(engine.currentRound, 2);
  });

  it('last round work -> complete (no rest after final round)', () => {
    engine.startMode('interval', { workTime: 5, restTime: 3, rounds: 2 });
    engine.prepCountdown = false;
    engine.play();

    // Round 1 work + rest
    advanceTime(engine, 5001);
    advanceTime(engine, 3001);
    assert.equal(engine.currentRound, 2);

    // Round 2 work -> complete
    advanceTime(engine, 5001);
    assert.equal(engine.phase, 'complete');
    assert.equal(engine.status, 'stopped');
  });

  it('no rest transitions work -> work directly', () => {
    engine.startMode('emom', { rounds: 3 }); // EMOM has restTime=0
    engine.prepCountdown = false;
    engine.play();

    assert.equal(engine.phase, 'work');
    assert.equal(engine.currentRound, 1);

    // Finish 60s work, should go to next round directly
    advanceTime(engine, 60001);
    assert.equal(engine.phase, 'work');
    assert.equal(engine.currentRound, 2);
  });

  it('variable intervals use correct work time per round', () => {
    engine.startMode('interval', { workTimes: [5, 10, 15], restTime: 2 });
    engine.prepCountdown = false;
    engine.play();

    // Round 1: 5s work
    assert.equal(engine.phaseDurationMs, 5000);
    advanceTime(engine, 5001);
    assert.equal(engine.phase, 'rest');

    // Rest
    advanceTime(engine, 2001);
    assert.equal(engine.currentRound, 2);

    // Round 2: 10s work
    assert.equal(engine.phaseDurationMs, 10000);
    advanceTime(engine, 10001);
    assert.equal(engine.phase, 'rest');

    // Rest
    advanceTime(engine, 2001);
    assert.equal(engine.currentRound, 3);

    // Round 3: 15s work
    assert.equal(engine.phaseDurationMs, 15000);
  });
});


// ============================================================
// Beep callbacks
// ============================================================
describe('beep callbacks', () => {
  let engine, beeps;
  beforeEach(() => {
    mockPerformance();
    engine = createEngine();
    beeps = trackBeeps(engine);
  });
  afterEach(() => restorePerformance());

  it('3-2-1 tick beeps fire during prep countdown', () => {
    engine.startMode('countdown', { duration: 60 });
    engine.play();

    // Advance to 7s into prep (3s remaining)
    advanceTime(engine, 7001);
    advanceTime(engine, 1000); // 2s remaining
    advanceTime(engine, 1000); // 1s remaining

    const ticks = beeps.filter(b => b === 'tick');
    assert.equal(ticks.length, 3);
  });

  it('go beep fires at prep -> work transition', () => {
    engine.startMode('countdown', { duration: 60 });
    engine.play();

    advanceTime(engine, 10001);
    assert.ok(beeps.includes('go'));
  });

  it('rest beep fires at work -> rest transition', () => {
    engine.startMode('interval', { workTime: 5, restTime: 3, rounds: 3 });
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 5001);
    assert.ok(beeps.includes('rest'));
  });

  it('go beep fires at rest -> work transition', () => {
    engine.startMode('interval', { workTime: 5, restTime: 3, rounds: 3 });
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 5001); // work -> rest
    advanceTime(engine, 3001); // rest -> work
    const goBeeps = beeps.filter(b => b === 'go');
    assert.ok(goBeeps.length >= 1);
  });

  it('complete beep fires when timer finishes', () => {
    engine.startMode('countdown', { duration: 5 });
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 5001);
    assert.ok(beeps.includes('complete'));
  });

  it('3-2-1 tick beeps fire before countdown expiration', () => {
    engine.startMode('countdown', { duration: 5 });
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 2001); // 3s remaining
    advanceTime(engine, 1000); // 2s remaining
    advanceTime(engine, 1000); // 1s remaining

    const ticks = beeps.filter(b => b === 'tick');
    assert.equal(ticks.length, 3);
  });

  it('3-2-1 beeps fire before interval phase expiration', () => {
    engine.startMode('interval', { workTime: 5, restTime: 3, rounds: 2 });
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 2001); // 3s remaining in work
    advanceTime(engine, 1000); // 2s
    advanceTime(engine, 1000); // 1s

    const ticks = beeps.filter(b => b === 'tick');
    assert.equal(ticks.length, 3);
  });

  it('fires all missed beeps when a single tick spans multiple second boundaries', () => {
    // Simulates a delayed/throttled tick jumping from 3.5s to 0.5s remaining in one step
    engine.startMode('countdown', { duration: 5 });
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 1500); // 3.5s remaining — no beeps yet
    advanceTime(engine, 3000); // jumps to 0.5s remaining — should fire 3s AND 2s AND 1s beeps

    const ticks = beeps.filter(b => b === 'tick');
    assert.equal(ticks.length, 3);
  });

  it('onComplete callback fires on completion', () => {
    let completed = false;
    engine.onComplete = () => { completed = true; };
    engine.startMode('countdown', { duration: 5 });
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 5001);
    assert.ok(completed);
  });
});


// ============================================================
// Countdown / warmup completion
// ============================================================
describe('countdown and warmup completion', () => {
  let engine;
  beforeEach(() => {
    mockPerformance();
    engine = createEngine();
  });
  afterEach(() => restorePerformance());

  it('countdown completes at duration', () => {
    engine.startMode('countdown', { duration: 10 });
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 10001);
    assert.equal(engine.phase, 'complete');
    assert.equal(engine.status, 'stopped');
  });

  it('warmup completes at duration', () => {
    engine.startMode('warmup', { duration: 10 });
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 10001);
    assert.equal(engine.phase, 'complete');
    assert.equal(engine.status, 'stopped');
  });
});


// ============================================================
// Count up
// ============================================================
describe('countup mode', () => {
  let engine;
  beforeEach(() => {
    mockPerformance();
    engine = createEngine();
  });
  afterEach(() => restorePerformance());

  it('countup with duration completes', () => {
    engine.startMode('countup', { duration: 10 });
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 10001);
    assert.equal(engine.phase, 'complete');
  });

  it('countup without duration runs indefinitely', () => {
    engine.startMode('countup');
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 600000); // 10 minutes
    assert.equal(engine.phase, 'work');
    assert.equal(engine.status, 'running');
  });
});


// ============================================================
// Clock mode optimization
// ============================================================
describe('clock mode optimization', () => {
  let engine;
  beforeEach(() => {
    mockPerformance();
    engine = createEngine();
  });
  afterEach(() => restorePerformance());

  it('only emits update when clock string changes', () => {
    engine.startMode('clock');
    const updates = trackUpdates(engine);

    // First tick should emit (new string)
    engine._tick();
    const firstCount = updates.length;
    assert.ok(firstCount >= 1);

    // Subsequent ticks within the same minute should not emit again
    engine._tick();
    engine._tick();
    engine._tick();
    assert.equal(updates.length, firstCount, 'Should not emit extra updates when clock string is unchanged');
  });
});


// ============================================================
// getDisplay output
// ============================================================
describe('getDisplay', () => {
  let engine;
  beforeEach(() => {
    mockPerformance();
    engine = createEngine();
  });
  afterEach(() => restorePerformance());

  it('stopwatch shows formatted elapsed time', () => {
    engine.startMode('stopwatch');
    engine.prepCountdown = false;
    engine.play();
    advanceTime(engine, 5500);

    const display = engine.getDisplay();
    assert.equal(display.mode, 'stopwatch');
    assert.match(display.time, /0:05\.\d{2}/);
  });

  it('countdown idle shows total duration', () => {
    engine.startMode('countdown', { duration: 120 });
    const display = engine.getDisplay();
    assert.equal(display.time, '2:00');
  });

  it('interval idle shows 0:00 and round count', () => {
    engine.startMode('interval', { workTime: 30, restTime: 10, rounds: 5 });
    const display = engine.getDisplay();
    assert.equal(display.time, '0:00');
    assert.equal(display.round, '0 / 5');
  });

  it('interval work phase shows remaining time and labels', () => {
    engine.startMode('interval', { workTime: 30, restTime: 10, rounds: 5 });
    engine.prepCountdown = false;
    engine.play();
    advanceTime(engine, 5000);

    const display = engine.getDisplay();
    assert.equal(display.phaseLabel, 'WORK');
    assert.equal(display.round, 'Round 1 / 5');
    assert.ok(display.progress > 0);
  });

  it('urgent is true when remaining <= 3000ms', () => {
    engine.startMode('countdown', { duration: 5 });
    engine.prepCountdown = false;
    engine.play();

    advanceTime(engine, 2500);
    assert.equal(engine.getDisplay().urgent, true);
  });

  it('complete phase shows DONE', () => {
    engine.startMode('countdown', { duration: 5 });
    engine.prepCountdown = false;
    engine.play();
    advanceTime(engine, 5001);

    const display = engine.getDisplay();
    assert.equal(display.phaseLabel, 'DONE');
    assert.equal(display.time, '0:00');
  });

  it('prep phase shows GET READY', () => {
    engine.startMode('interval', { workTime: 30, restTime: 10, rounds: 3 });
    engine.prepCountdown = true;
    engine.play();

    const display = engine.getDisplay();
    assert.equal(display.phaseLabel, 'GET READY');
  });

  it('warmup work phase shows WARM UP label', () => {
    engine.startMode('warmup', { duration: 60 });
    engine.prepCountdown = false;
    engine.play();
    advanceTime(engine, 1000);

    const display = engine.getDisplay();
    assert.equal(display.phaseLabel, 'WARM UP');
  });

  it('rest phase shows REST label', () => {
    engine.startMode('interval', { workTime: 5, restTime: 10, rounds: 3 });
    engine.prepCountdown = false;
    engine.play();
    advanceTime(engine, 5001);

    const display = engine.getDisplay();
    assert.equal(display.phaseLabel, 'REST');
  });
});


// ============================================================
// PRESETS
// ============================================================
describe('PRESETS', () => {
  it('has 20 presets', () => {
    assert.equal(PRESETS.length, 20);
  });

  it('all presets have unique ids', () => {
    const ids = PRESETS.map(p => p.id);
    assert.equal(new Set(ids).size, 20);
  });

  it('variable presets have matching rounds and workTimes length', () => {
    const variablePresets = PRESETS.filter(p => Array.isArray(p.work));
    for (const preset of variablePresets) {
      assert.equal(preset.work.length, preset.rounds,
        `Preset "${preset.name}" work array length should match rounds`);
    }
  });
});
