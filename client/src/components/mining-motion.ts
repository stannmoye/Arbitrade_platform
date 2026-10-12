export type NodeMode = "SURGE" | "NOMINAL" | "THROTTLE" | "COOLING" | "HIBERNATING" | "HANDOFF";

export type MotionNodeSnapshot = {
  mode: NodeMode;
  power: number;
  queue: number;
  heat: number;
  progress: number;
  chaos: number;
  angle: number;
  handoffPulse: number;
};

export type MotionPacketSnapshot = { progress: number; direction: 1 | -1; alpha: number; size: number };
export type MotionStreamSnapshot = { intensity: number; packets: MotionPacketSnapshot[] };

export type MiningMotionSnapshot = {
  nodes: MotionNodeSnapshot[];
  queueLanes: Array<{ fill: number; progress: number; glow: number }>;
  settlement: Array<{ progress: number; intensity: number; holding: boolean }>;
  streams: MotionStreamSnapshot[];
  powerPackets: number[][];
  power: {
    wind: number;
    regulator: number;
    asic: number;
    turbineRpm: number;
    turbineAngle: number;
    fanRpm: number[];
    fanAngles: number[];
  };
  mix: { progress: number; angle: number; scan: number; nonce: number; bars: number[]; entropy: number };
  vaultAngle: number;
};

type NodeState = MotionNodeSnapshot & {
  age: number;
  dwell: number;
  workDuration: number;
  noise: number;
  fanRpm: number;
  completed: number;
};
type StreamPacket = MotionPacketSnapshot & { speed: number; hold: number };
type StreamState = { from: number; to: number; pulse: number; intensity: number; packets: StreamPacket[] };
type LaneState = { fill: number; progress: number; speed: number; noise: number };
type SettlementState = { progress: number; intensity: number; hold: number; noise: number };
type PowerPacket = { progress: number; speed: number; hold: number };

const NODE_COUNT = 4;
const FIXED_STEP_MS = 50;
const STREAM_COUNT = 28;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const wrap = (value: number) => ((value % 1) + 1) % 1;
const relax = (value: number, target: number, dt: number, tau: number) => value + (target - value) * (1 - Math.exp(-dt / Math.max(.001, tau)));

/** Non-cryptographic seeded stream: reproducible for tests, independently seeded per browser scene. */
class RandomStream {
  private state: number;
  constructor(seed: number) { this.state = (seed >>> 0) || 0x9e3779b9; }
  next() {
    let value = this.state += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  normal() {
    const u = Math.max(1e-8, this.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }
  between(min: number, max: number) { return min + (max - min) * this.next(); }
}

export function createMiningMotionSeed() {
  try {
    const words = new Uint32Array(1);
    if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(words)[0] || 1;
  } catch { /* fall through for restricted contexts */ }
  return ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 1;
}

const MODE_POWER: Record<NodeMode, number> = {
  SURGE: 1,
  NOMINAL: .79,
  THROTTLE: .46,
  COOLING: .31,
  HIBERNATING: .035,
  HANDOFF: .24,
};
const MODE_WORK: Record<NodeMode, number> = {
  SURGE: 1.48,
  NOMINAL: .92,
  THROTTLE: .52,
  COOLING: .23,
  HIBERNATING: .025,
  HANDOFF: 0,
};
const MODE_DWELL: Record<NodeMode, { mean: number; min: number; max: number }> = {
  SURGE: { mean: 3_200, min: 1_250, max: 7_500 },
  NOMINAL: { mean: 6_200, min: 2_600, max: 13_000 },
  THROTTLE: { mean: 4_100, min: 1_700, max: 9_000 },
  COOLING: { mean: 2_800, min: 1_100, max: 7_000 },
  HIBERNATING: { mean: 2_300, min: 700, max: 6_500 },
  HANDOFF: { mean: 780, min: 260, max: 1_900 },
};

// Routing probabilities adapt to queue pressure, heat, power reserve, and a coupled chaotic field.
const ROUTE_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, 2], [0, 3], [1, 0], [1, 2], [1, 3], [2, 0], [2, 1], [2, 3], [3, 0], [3, 1], [3, 2],
];
const STREAM_ENDPOINTS = Array.from({ length: STREAM_COUNT }, (_, index) => ROUTE_EDGES[index % ROUTE_EDGES.length]);
// Visible trace order in the canvas: A4A7, 12C2, 38D1, 71F9.
const NODE_TRACE_STREAMS = [14, 16, 15, 17] as const;
const logistic = (value: number, r: number) => r * value * (1 - value);

/**
 * Visual-only engine dynamics. A fixed-step semi-Markov state machine is coupled to
 * Ornstein-Uhlenbeck colored noise, weakly coupled logistic maps, queue backpressure,
 * and a constrained power budget. It never reads or writes reward/wallet records.
 */
export class MiningMotionModel {
  private readonly rng: RandomStream;
  private accumulator = 0;
  private elapsed = 0;
  private nodes: NodeState[];
  private lanes: LaneState[];
  private settlement: SettlementState[];
  private streams: StreamState[];
  private powerPackets: PowerPacket[][];
  private fanRpm: number[];
  private fanAngles: number[];
  private demand = .52;
  private demandNoise = 0;
  private globalChaos: number;
  private wind = .64;
  private windGoal = .64;
  private regulator = .59;
  private nextWindChange = 0;
  private nextArrival = 600;
  private turbineRpm = 44;
  private turbineAngle = 0;
  private mixProgress = .18;
  private mixAngle = 0;
  private scan = .16;
  private nonce = 0xA4A7;
  private vaultAngle = 0;
  private asicLoad = .3;
  private windBudget = .6;
  private boosted = false;
  private capacity = 1;

  constructor(seed: number) {
    this.rng = new RandomStream(seed);
    this.globalChaos = .1 + this.rng.next() * .8;
    this.windGoal = this.rng.between(.28, .92);
    this.wind = this.windGoal;
    this.regulator = this.wind * .94;
    this.nodes = Array.from({ length: NODE_COUNT }, () => ({
      mode: "NOMINAL", power: .1, queue: this.rng.between(.12, .58), heat: this.rng.between(.22, .52),
      progress: this.rng.between(.04, .82), chaos: this.rng.between(.08, .92), angle: this.rng.between(0, Math.PI * 2),
      handoffPulse: 0, age: 0, dwell: 0, workDuration: this.rng.between(3.2, 8.2), noise: this.rng.between(-.4, .4), fanRpm: 1_300, completed: 0,
    }));
    this.nodes.forEach((node, index) => {
      node.mode = this.chooseMode(node, index, false);
      node.dwell = this.sampleDwell(node.mode);
    });
    this.lanes = Array.from({ length: 6 }, () => ({ fill: this.rng.between(.1, .72), progress: this.rng.next(), speed: this.rng.between(.05, .28), noise: this.rng.between(-.4, .4) }));
    this.settlement = Array.from({ length: 4 }, () => ({ progress: this.rng.next(), intensity: this.rng.between(.2, .8), hold: 0, noise: this.rng.between(-.5, .5) }));
    this.streams = STREAM_ENDPOINTS.map(([from, to]) => ({
      from, to, pulse: 0, intensity: this.rng.between(.15, .7),
      packets: Array.from({ length: 1 + Math.floor(this.rng.next() * 3) }, () => ({
        progress: this.rng.next(), direction: this.rng.next() < .86 ? 1 : -1,
        alpha: this.rng.between(.5, 1), size: this.rng.between(1.5, 2.8), speed: this.rng.between(.04, .3), hold: this.rng.between(0, 500),
      })),
    }));
    this.powerPackets = Array.from({ length: 2 }, () => Array.from({ length: 3 }, () => ({
      progress: this.rng.next(), speed: this.rng.between(.1, .48), hold: this.rng.between(0, 450),
    })));
    this.fanRpm = Array.from({ length: 7 }, (_, index) => 850 + index * 80 + this.rng.next() * 500);
    this.fanAngles = Array.from({ length: 7 }, () => this.rng.between(0, Math.PI * 2));
  }

  randomBetween(min: number, max: number) { return this.rng.between(min, max); }

  advance(deltaMs: number, boosted: boolean, hashPowerThs: number): MiningMotionSnapshot {
    // Cap catch-up after tab suspension; pausing the canvas never causes a simulation jump.
    this.accumulator += clamp(Number.isFinite(deltaMs) ? deltaMs : 0, 0, 250);
    this.boosted = boosted;
    const safeHash = Number.isFinite(hashPowerThs) ? Math.max(0, hashPowerThs) : 0;
    this.capacity = clamp(.38 + .62 * (1 - Math.exp(-safeHash * 1.15)), .38, 1);
    while (this.accumulator >= FIXED_STEP_MS) {
      this.tick(FIXED_STEP_MS / 1_000);
      this.accumulator -= FIXED_STEP_MS;
    }
    return this.snapshot();
  }

  snapshot(): MiningMotionSnapshot {
    return {
      nodes: this.nodes.map(({ mode, power, queue, heat, progress, chaos, angle, handoffPulse }) => ({ mode, power, queue, heat, progress, chaos, angle, handoffPulse })),
      queueLanes: this.lanes.map(({ fill, progress, speed }) => ({ fill, progress, glow: clamp(.22 + speed * 1.5) })),
      settlement: this.settlement.map(({ progress, intensity, hold }) => ({ progress, intensity, holding: hold > 0 })),
      streams: this.streams.map(stream => ({ intensity: stream.intensity, packets: stream.packets.map(({ progress, direction, alpha, size }) => ({ progress, direction, alpha, size })) })),
      powerPackets: this.powerPackets.map(lane => lane.map(packet => packet.progress)),
      power: { wind: this.windBudget, regulator: this.regulator, asic: this.asicLoad, turbineRpm: this.turbineRpm, turbineAngle: this.turbineAngle, fanRpm: [...this.fanRpm], fanAngles: [...this.fanAngles] },
      mix: { progress: this.mixProgress, angle: this.mixAngle, scan: this.scan, nonce: this.nonce >>> 0, bars: this.nodes.map(node => clamp(.18 + node.power * 1.9 + (node.chaos - .5) * .22)), entropy: this.globalChaos },
      vaultAngle: this.vaultAngle,
    };
  }

  private sampleDwell(mode: NodeMode) {
    const { mean, min, max } = MODE_DWELL[mode];
    const weibull = Math.pow(-Math.log(Math.max(1e-7, 1 - this.rng.next())), .72);
    return clamp(mean * (.42 + weibull), min, max);
  }

  private chooseMode(node: NodeState, index: number, allowSleep: boolean): NodeMode {
    const sleeping = this.nodes?.filter(item => item.mode === "HIBERNATING").length || 0;
    const heatStress = clamp((node.heat - .42) * 1.8);
    const queuePressure = clamp(node.queue);
    const weights: Array<[NodeMode, number]> = [
      ["SURGE", .055 + this.demand * .16 + queuePressure * .22 + (this.boosted ? .08 : 0) + node.chaos * .04],
      ["NOMINAL", .23 + this.demand * .22 + (index % 2) * .025],
      ["THROTTLE", .14 + (1 - this.demand) * .11 + heatStress * .16],
      ["COOLING", .08 + heatStress * .62],
      ["HIBERNATING", allowSleep && sleeping < 2 ? .035 + (1 - this.demand) * .15 + (queuePressure < .2 ? .06 : 0) : 0],
    ];
    for (const pair of weights) if (pair[0] === node.mode) pair[1] *= .42;
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    let draw = this.rng.next() * total;
    for (const [mode, weight] of weights) { draw -= weight; if (draw <= 0) return mode; }
    return "NOMINAL";
  }

  private ou(value: number, target: number, dt: number, tau: number, sigma: number) {
    const meanReversion = (target - value) * (1 - Math.exp(-dt / tau));
    const diffusion = sigma * Math.sqrt(dt) * this.rng.normal();
    return value + meanReversion + diffusion;
  }

  private tick(dt: number) {
    this.elapsed += dt * 1_000;
    this.globalChaos = clamp(logistic(this.globalChaos, 3.91) + (this.rng.next() - .5) * .008, .01, .99);
    this.demandNoise = clamp(this.ou(this.demandNoise, (this.globalChaos - .5) * .6, dt, 2.4, .1), -.5, .5);
    this.demand = clamp(.5 + this.demandNoise + (this.boosted ? .12 : 0), .12, .96);

    if (this.elapsed >= this.nextWindChange) {
      const gust = this.rng.normal() * .14 + (this.globalChaos - .5) * .2;
      this.windGoal = clamp(.57 + gust, .16, .98);
      this.nextWindChange = this.elapsed + this.rng.between(1_100, 5_800);
    }
    this.wind = clamp(this.ou(this.wind, this.windGoal, dt, this.rng.between(1.1, 3.6), .11), .08, 1);
    const regulatorTarget = clamp(this.wind * (.91 + this.globalChaos * .07) + this.demandNoise * .035, .08, 1);
    this.regulator = clamp(this.ou(this.regulator, regulatorTarget, dt, 1.15, .024), .06, 1);
    this.windBudget = clamp((this.wind * .72 + this.regulator * .28) * this.capacity * (this.boosted ? 1.05 : 1), .08, 1);

    this.nextArrival -= dt * 1_000;
    let arrivals = 0;
    while (this.nextArrival <= 0 && arrivals < 3) {
      this.enqueueWork();
      this.nextArrival += this.rng.between(320, 1_650);
      arrivals++;
    }

    this.nodes.forEach((node, index) => {
      node.noise = this.ou(node.noise, 0, dt, this.rng.between(.65, 2.8), .34);
      node.chaos = clamp(logistic(node.chaos, 3.86) + (this.globalChaos - .5) * .018 + node.noise * .006, .01, .99);
      node.age += dt * 1_000;
      node.dwell -= dt * 1_000;
      node.handoffPulse = Math.max(0, node.handoffPulse - dt);
      if (node.dwell <= 0) {
        node.mode = this.chooseMode(node, index, true);
        node.age = 0;
        node.dwell = this.sampleDwell(node.mode);
      }
    });

    const scores = this.nodes.map(node => Math.exp(clamp(node.queue * 1.1 + node.chaos * .44 - node.heat * .58 + node.noise * .12, -1.4, 1.8)));
    const scoreSum = scores.reduce((sum, score) => sum + score, 0) || 1;
    this.nodes.forEach((node, index) => {
      const allocation = this.windBudget * scores[index] / scoreSum;
      node.power = clamp(allocation * MODE_POWER[node.mode], 0, 1);
      const fanCooling = .10 + node.heat * .24 + (node.mode === "COOLING" ? .1 : 0);
      node.heat = clamp(node.heat + (node.power * .58 - fanCooling - .018 + node.noise * .025) * dt, .06, .98);
      const oldProgress = node.progress;
      const serviceRate = MODE_WORK[node.mode] * (.34 + node.power * 1.65) * (.84 + node.chaos * .28);
      if (node.mode !== "HANDOFF") node.progress += dt * serviceRate / node.workDuration;
      node.queue = clamp(node.queue - Math.max(0, node.progress - oldProgress) * .42 + Math.max(0, node.noise) * dt * .012, 0, 1);
      const direction = (node.mode === "THROTTLE" || node.mode === "COOLING" ? -1 : 1) * (.38 + node.power * 2.4 + node.chaos * .08);
      node.angle = (node.angle + direction * dt) % (Math.PI * 2);
      if (node.progress >= 1) this.completeWork(index, node);
    });

    this.asicLoad = clamp(this.nodes.reduce((sum, node) => sum + node.power, 0));
    this.updateLanes(dt);
    this.updateSettlement(dt);
    this.updateStreams(dt);
    this.updatePowerPackets(dt);
    this.updateFans(dt);
    this.updateMix(dt);
    this.vaultAngle = (this.vaultAngle + dt * (.18 + this.nodes[3].power * .9 + this.rng.next() * .12)) % (Math.PI * 2);
  }

  private enqueueWork() {
    const weights = this.nodes.map(node => Math.exp(clamp(-node.queue * 1.4 + node.chaos * .35 + (node.mode === "HIBERNATING" ? -.7 : 0), -2, 1)));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let draw = this.rng.next() * total;
    let target = 0;
    for (let i = 0; i < weights.length; i++) { draw -= weights[i]; if (draw <= 0) { target = i; break; } }
    this.nodes[target].queue = clamp(this.nodes[target].queue + this.rng.between(.08, .23));
  }

  private completeWork(index: number, node: NodeState) {
    node.progress = this.rng.between(.015, .12);
    node.workDuration = this.rng.between(2.3, 8.8) * (.82 + this.rng.next() * .38);
    node.completed++;
    node.mode = "HANDOFF";
    node.age = 0;
    node.dwell = this.sampleDwell("HANDOFF");
    node.handoffPulse = 1.1 + this.rng.next() * .9;
    this.nonce = (this.nonce + 1 + Math.floor(this.rng.next() * 0x1fff)) >>> 0;

    const choices = this.nodes.map((other, i) => ({
      index: i,
      weight: i === index ? 0 : Math.exp(clamp(-other.queue * 1.5 - other.heat * .55 + other.power * .8 + other.chaos * .28 + this.rng.normal() * .12, -2, 2)),
    }));
    const sum = choices.reduce((value, item) => value + item.weight, 0) || 1;
    let draw = this.rng.next() * sum;
    let destination = (index + 1) % NODE_COUNT;
    for (const choice of choices) { draw -= choice.weight; if (draw <= 0) { destination = choice.index; break; } }
    this.nodes[destination].queue = clamp(this.nodes[destination].queue + this.rng.between(.06, .2));
    const edge = ROUTE_EDGES.findIndex(([from, to]) => from === index && to === destination);
    if (edge >= 0 && this.streams[edge]) this.streams[edge].pulse = 1;
    this.launchNodeTrace(index, 1, this.rng.between(0, 110));
    this.launchNodeTrace(destination, -1, this.rng.between(260, 920));
  }

  private launchNodeTrace(nodeIndex: number, direction: 1 | -1, holdMs: number) {
    const stream = this.streams[NODE_TRACE_STREAMS[nodeIndex]];
    if (!stream) return;
    stream.pulse = Math.max(stream.pulse, .95 + this.rng.next() * .45);
    const packet = stream.packets[0];
    if (!packet) return;
    packet.progress = direction > 0 ? this.rng.between(.035, .18) : this.rng.between(.82, .965);
    packet.direction = direction;
    packet.hold = holdMs;
    packet.speed = this.rng.between(.18, .44);
  }

  private updateLanes(dt: number) {
    this.lanes.forEach((lane, index) => {
      const node = this.nodes[index % NODE_COUNT];
      lane.noise = this.ou(lane.noise, node.chaos - .5, dt, this.rng.between(.4, 1.8), .2);
      const targetFill = clamp(node.queue * .78 + .08 + lane.noise * .08 + (index >= NODE_COUNT ? node.heat * .09 : 0));
      lane.fill = clamp(relax(lane.fill, targetFill, dt, .5 + index * .07));
      const idleScale = node.mode === "HIBERNATING" ? .07 : node.mode === "COOLING" ? .35 : 1;
      const targetSpeed = (.075 + node.power * .48 + node.chaos * .04) * idleScale;
      lane.speed = clamp(this.ou(lane.speed, targetSpeed, dt, this.rng.between(.25, 1.15), .035), .008, .55);
      if (this.rng.next() < dt * (.07 + node.queue * .08)) lane.speed *= this.rng.between(.16, .55);
      lane.progress = wrap(lane.progress + lane.speed * dt);
    });
  }

  private updateSettlement(dt: number) {
    const nodeMap = [0, 2, 1, 3];
    this.settlement.forEach((stage, index) => {
      const node = this.nodes[nodeMap[index]];
      stage.noise = this.ou(stage.noise, node.chaos - .5, dt, .9, .24);
      if (stage.hold > 0) stage.hold = Math.max(0, stage.hold - dt * 1_000);
      else {
        const idleScale = node.mode === "HIBERNATING" ? .09 : node.mode === "COOLING" ? .42 : 1;
        const speed = (.045 + node.power * .2 + node.chaos * .018 + stage.noise * .012) * idleScale;
        stage.progress += Math.max(.004, speed) * dt;
        if (stage.progress >= 1) {
          stage.progress = this.rng.between(.01, .16);
          stage.hold = this.rng.between(180, 1_200);
        }
      }
      stage.intensity = clamp(.16 + node.power * .62 + stage.progress * .2 + (node.mode === "HANDOFF" ? .25 : 0));
    });
  }

  private updateStreams(dt: number) {
    this.streams.forEach((stream, index) => {
      const visualNodeIndex = index >= 14 && index <= 17 ? [0, 2, 1, 3][index - 14] : null;
      const from = this.nodes[visualNodeIndex ?? stream.from];
      const to = this.nodes[stream.to];
      stream.pulse = Math.max(0, stream.pulse - dt * this.rng.between(.5, 1.7));
      const targetIntensity = index === 18
        ? clamp(.12 + this.wind * .67 + stream.pulse * .42)
        : clamp(.12 + from.power * .64 + from.queue * .18 + stream.pulse * .42 - to.queue * .12);
      stream.intensity = clamp(this.ou(stream.intensity, targetIntensity, dt, .36 + this.rng.next() * .85, .08));
      stream.packets.forEach(packet => {
        if (packet.hold > 0) packet.hold = Math.max(0, packet.hold - dt * 1_000);
        else {
          const destinationBrake = index === 18 ? .92 : to.mode === "HIBERNATING" ? .28 : to.mode === "COOLING" ? .68 : 1;
          const windDrive = index === 18 ? this.wind * .24 : 0;
          const targetSpeed = clamp((.07 + from.power * .42 + stream.pulse * .18 + from.chaos * .035 + windDrive) * destinationBrake, .018, .48);
          packet.speed = clamp(this.ou(packet.speed, targetSpeed, dt, .28 + this.rng.next() * .7, .035), .012, .55);
          packet.progress += packet.direction * packet.speed * dt;
          if (packet.progress >= 1 || packet.progress <= 0) {
            packet.progress = packet.direction > 0 ? 0 : 1;
            packet.hold = this.rng.between(120, 1_050) + to.queue * 760;
            if (this.rng.next() < .17 + to.queue * .22) packet.direction = packet.direction === 1 ? -1 : 1;
          } else if (this.rng.next() < dt * (.025 + to.queue * .12)) {
            packet.hold = this.rng.between(180, 900);
          }
        }
      });
    });
  }

  private updatePowerPackets(dt: number) {
    this.powerPackets.forEach((lane, laneIndex) => lane.forEach(packet => {
      if (packet.hold > 0) packet.hold = Math.max(0, packet.hold - dt * 1_000);
      else {
        const bus = laneIndex === 0 ? this.wind : this.regulator;
        const targetSpeed = .12 + bus * .36 + this.rng.next() * .07;
        packet.speed = clamp(this.ou(packet.speed, targetSpeed, dt, .42 + this.rng.next() * .4, .03), .02, .58);
        packet.progress = wrap(packet.progress + packet.speed * dt);
        if (this.rng.next() < dt * (.08 + (1 - bus) * .22)) packet.hold = this.rng.between(140, 800);
      }
    }));
  }

  private updateFans(dt: number) {
    this.fanRpm.forEach((rpm, index) => {
      const node = this.nodes[index % NODE_COUNT];
      const airflowBias = index % 2 ? .94 : 1.06;
      const target = (520 + node.heat * 1_950 + node.power * 1_200 + Math.abs(node.noise) * 130) * airflowBias;
      const nextRpm = clamp(this.ou(rpm, target, dt, .55 + (index % 3) * .22, 210), 380, 3_850);
      this.fanRpm[index] = nextRpm;
      const direction = index % 2 ? -1 : 1;
      this.fanAngles[index] = (this.fanAngles[index] + direction * nextRpm / 60 * Math.PI * 2 * dt) % (Math.PI * 2);
    });
    const turbineTarget = 14 + this.wind * 68 + this.rng.normal() * 4 + (this.globalChaos - .5) * 10;
    this.turbineRpm = clamp(this.ou(this.turbineRpm, turbineTarget, dt, 1.6, 2.8), 8, 94);
    this.turbineAngle = (this.turbineAngle + this.turbineRpm / 60 * Math.PI * 2 * dt) % (Math.PI * 2);
  }

  private updateMix(dt: number) {
    const mixNode = this.nodes[2];
    const rate = .16 + this.asicLoad * .52 + mixNode.chaos * .08;
    this.mixProgress += dt * rate;
    if (this.mixProgress >= 1) {
      this.mixProgress -= 1;
      this.nonce = (this.nonce + 1 + Math.floor(this.rng.next() * 0x3fff)) >>> 0;
    }
    this.mixAngle = (this.mixAngle + dt * (.24 + this.asicLoad * 1.7) * (mixNode.mode === "HIBERNATING" ? .08 : 1) * this.rng.between(.78, 1.22)) % (Math.PI * 2);
    this.scan = wrap(this.scan + dt * (.14 + mixNode.power * .42) * (mixNode.mode === "HIBERNATING" ? .12 : 1));
  }
}
