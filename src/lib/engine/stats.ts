// numbers for the pen diagnostics. the input counts them as it goes, the overlay
// reads them a few times a second. nothing is counted while it is off
export const penStats = {
  on: false,
  kind: '',
  // pointerrawupdate is there, and the last stroke got its samples from it
  rawThere: false,
  rawUsed: false,
  // the low latency canvas and the system ink trail
  desynchronized: false,
  trailReady: false,
  // the stroke going on or the last one: event times in ms, events with samples,
  // samples, pointermoves and their guessed points, pressure, live draw time
  first: 0,
  last: 0,
  events: 0,
  samples: 0,
  moves: 0,
  predicted: 0,
  pMin: 1,
  pMax: 0,
  drawMs: 0,
  draws: 0
};

export function statsDown(kind: string, time: number, pressure: number) {
  const s = penStats;
  s.kind = kind;
  s.rawUsed = false;
  s.first = s.last = time;
  s.events = s.samples = 1;
  s.moves = s.predicted = s.draws = 0;
  s.drawMs = 0;
  s.pMin = s.pMax = pressure;
}

export function statsSample(time: number, pressure: number) {
  const s = penStats;
  s.samples++;
  s.last = time;
  if (pressure < s.pMin) s.pMin = pressure;
  if (pressure > s.pMax) s.pMax = pressure;
}
