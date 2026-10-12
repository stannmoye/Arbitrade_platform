import { describe, expect, it } from "vitest";
import { MiningMotionModel } from "../client/src/components/mining-motion";

describe("mining visual motion model", () => {
  it("replays the same seeded simulation exactly for diagnostics", () => {
    const left = new MiningMotionModel(0xA4A738D1);
    const right = new MiningMotionModel(0xA4A738D1);
    let leftFrame = left.snapshot();
    let rightFrame = right.snapshot();
    for (let i = 0; i < 900; i++) {
      leftFrame = left.advance(50, i > 220 && i < 540, 1.25);
      rightFrame = right.advance(50, i > 220 && i < 540, 1.25);
    }
    expect(leftFrame).toEqual(rightFrame);
  });

  it("diverges across independently seeded browser scenes", () => {
    const left = new MiningMotionModel(0xA4A7);
    const right = new MiningMotionModel(0x71F9);
    let leftFrame = left.snapshot();
    let rightFrame = right.snapshot();
    for (let i = 0; i < 240; i++) {
      leftFrame = left.advance(50, false, 1);
      rightFrame = right.advance(50, false, 1);
    }
    expect(leftFrame).not.toEqual(rightFrame);
  });

  it("gives every node multiple asynchronous operating regimes", () => {
    const model = new MiningMotionModel(0x12C238D1);
    const modes = Array.from({ length: 4 }, () => new Set<string>());
    let mixedModeFrames = 0;
    for (let i = 0; i < 2_400; i++) {
      const frame = model.advance(50, i % 1_600 < 700, 1.4);
      if (i % 20 === 0) {
        frame.nodes.forEach((node, index) => modes[index].add(node.mode));
        if (new Set(frame.nodes.map(node => node.mode)).size > 1) mixedModeFrames++;
      }
    }
    expect(modes.every(nodeModes => nodeModes.size >= 3)).toBe(true);
    expect(mixedModeFrames).toBeGreaterThan(50);
  });

  it("keeps power conserved, queues bounded, and packets within their routes", () => {
    const model = new MiningMotionModel(0x38D171F9);
    for (let i = 0; i < 2_000; i++) {
      const frame = model.advance(50, i % 160 < 55, 1.25);
      expect(frame.power.asic).toBeGreaterThanOrEqual(0);
      expect(frame.power.asic).toBeLessThanOrEqual(frame.power.wind + 1e-9);
      expect(frame.nodes.every(node => node.power >= 0 && node.power <= 1 && node.queue >= 0 && node.queue <= 1 && node.heat >= 0 && node.heat <= 1)).toBe(true);
      expect(frame.nodes.filter(node => node.mode === "HIBERNATING").length).toBeLessThanOrEqual(2);
      expect(frame.queueLanes.every(lane => lane.progress >= 0 && lane.progress < 1 && lane.fill >= 0 && lane.fill <= 1)).toBe(true);
      expect(frame.settlement.every(stage => stage.progress >= 0 && stage.progress < 1 && stage.intensity >= 0 && stage.intensity <= 1)).toBe(true);
      expect(frame.streams.every(stream => stream.packets.every(packet => packet.progress >= 0 && packet.progress <= 1))).toBe(true);
    }
  });

  it("routes completed work onto the corresponding node trace during handoff", () => {
    const model = new MiningMotionModel(0xA4A738D1);
    const traceForNode = [14, 16, 15, 17];
    let observedHandoffPacket = false;
    for (let i = 0; i < 4_000 && !observedHandoffPacket; i++) {
      const frame = model.advance(50, false, 1);
      frame.nodes.forEach((node, nodeIndex) => {
        if (node.mode !== "HANDOFF" || node.handoffPulse < .8) return;
        const sourceTrace = frame.streams[traceForNode[nodeIndex]];
        if (sourceTrace.packets.some(packet => packet.direction === 1 && packet.progress < .3)) observedHandoffPacket = true;
      });
    }
    expect(observedHandoffPacket).toBe(true);
  });
});
