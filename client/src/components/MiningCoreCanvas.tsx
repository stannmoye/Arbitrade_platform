import { useEffect, useRef } from "react";
import { createMiningMotionSeed, MiningMotionModel, type MiningMotionSnapshot, type MotionStreamSnapshot } from "./mining-motion";

type MiningCoreCanvasProps = {
  running: boolean;
  playing: boolean;
  boosted: boolean;
  hashPowerThs: number;
  rewardPulseKey: number;
};

type MovingToken = { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; lift: number; sway: number };
type CoreControls = { start: () => void; stop: () => void; draw: (now: number, animate: boolean) => void };

/**
 * Isolated canvas port of the ASIC scene in coinki-balanced-compact.zip.
 * The visual layer has no reward timer, wallet mutation, or demo-only controls;
 * reward particles are emitted only when the server-posted CKI total changes.
 */
export function MiningCoreCanvas(props: MiningCoreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  const controlsRef = useRef<CoreControls | null>(null);
  propsRef.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvas?.parentElement;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !wrap || !ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let lastFrame = 0;
    let lastPaint = 0;
    let lastRewardKey = Math.max(0, Number(propsRef.current.rewardPulseKey) || 0);
    let particles: Array<{ x: number; y: number; size: number; velocity: number; alpha: number; phase: number }> = [];
    let sparks: Array<{ x: number; y: number; t: number; life: number }> = [];
    let tokens: MovingToken[] = [];
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const motionModel = new MiningMotionModel(createMiningMotionSeed());
    let motionSnapshot: MiningMotionSnapshot = motionModel.snapshot();

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    };
    const line = (points: number[][], color: string, lineWidth = 1, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]));
      ctx.stroke();
      ctx.restore();
    };
    const text = (value: string, x: number, y: number, size = 9, color = "#7e9aa9", align: CanvasTextAlign = "left", font = "ui-monospace, SFMono-Regular, monospace") => {
      ctx.save();
      ctx.font = `${size}px ${font}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(value, x, y);
      ctx.restore();
    };
    const glow = (x: number, y: number, radius: number, color: string, alpha = .2) => {
      const rgba = color.replace(")", `,${alpha})`).replace("rgb", "rgba");
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, rgba);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    };
    const seedParticles = () => {
      particles = Array.from({ length: 90 }, () => ({
        x: Math.random(), y: Math.random(), size: .4 + Math.random() * 1.5,
        velocity: .008 + Math.random() * .025, alpha: .12 + Math.random() * .45,
        phase: Math.random() * 6.28,
      }));
      sparks = Array.from({ length: 22 }, () => ({
        x: .13 + Math.random() * .74, y: .18 + Math.random() * .62,
        t: Math.random() * 4, life: .3 + Math.random() * .55,
      }));
    };

    const drawBackground = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const background = ctx.createRadialGradient(width * .5, height * .46, 10, width * .5, height * .46, Math.max(width, height) * .7);
      background.addColorStop(0, "#142a38");
      background.addColorStop(.52, "#0b1823");
      background.addColorStop(1, "#07111a");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.globalAlpha = .2;
      ctx.strokeStyle = "#2b5868";
      ctx.lineWidth = .6;
      const step = 28;
      for (let x = 0; x < width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = 0; y < height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      ctx.restore();
      particles.forEach(particle => {
        if (!reduceMotion && propsRef.current.running && propsRef.current.playing) particle.x = (particle.x + particle.velocity * .17) % 1;
        ctx.globalAlpha = particle.alpha * (.65 + .35 * Math.sin(time * .001 + particle.phase));
        ctx.fillStyle = "#80cdd4";
        ctx.fillRect(particle.x * width, particle.y * height, particle.size, particle.size);
      });
      ctx.globalAlpha = 1;
    };

    const drawTrace = (points: number[][], stream: MotionStreamSnapshot | undefined, packetColor = "rgb(80,205,224)", active = true) => {
      line(points, "#274b5b", 1.15, .95);
      line(points, "#4ca8b3", .8, .55);
      const lengths: number[] = [];
      let total = 0;
      for (let i = 1; i < points.length; i++) {
        const distance = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
        lengths.push(distance);
        total += distance;
      }
      if (!total || !active || !stream || stream.intensity < .035) return;
      const pointAt = (progress: number) => {
        let distance = Math.max(0, Math.min(.999999, progress)) * total;
        for (let i = 0; i < lengths.length; i++) {
          if (distance <= lengths[i]) {
            const segmentProgress = distance / lengths[i];
            return { x: lerp(points[i][0], points[i + 1][0], segmentProgress), y: lerp(points[i][1], points[i + 1][1], segmentProgress) };
          }
          distance -= lengths[i];
        }
        return { x: points[points.length - 1][0], y: points[points.length - 1][1] };
      };
      stream.packets.forEach(packet => {
        const head = pointAt(packet.progress);
        const tail = pointAt(packet.progress - packet.direction * .075);
        ctx.save();
        ctx.strokeStyle = packetColor;
        ctx.globalAlpha = .6 * packet.alpha * stream.intensity;
        ctx.lineWidth = 1.4 + packet.size * .34;
        ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
        ctx.globalAlpha = packet.alpha * stream.intensity;
        ctx.shadowColor = packetColor;
        ctx.shadowBlur = 6 + packet.size * 2;
        ctx.fillStyle = packetColor;
        ctx.beginPath(); ctx.arc(head.x, head.y, packet.size, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
    };


    const drawChip = (time: number, motion: MiningMotionSnapshot) => {
      const state = propsRef.current;
      const boosted = state.boosted;
      const active = state.running;
      const hashPower = Number.isFinite(state.hashPowerThs) ? Math.max(0, state.hashPowerThs) : 0;
      let traceIndex = 0;
      const trace = (points: number[][], color = "rgb(80,205,224)") => drawTrace(points, motion.streams[traceIndex++], color, active);
      const scale = Math.min(width / 730, height / 410, 1.3);
      const centerX = width * .5;
      const centerY = height * .49;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(scale, scale);
      const chipWidth = 390;
      const chipHeight = 258;
      const x = -chipWidth / 2;
      const y = -chipHeight / 2;

      // Etched motherboard, solder points, and live packet traces.
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 24;
      ctx.fillStyle = "#071019";
      roundRect(x - 22, y - 18, chipWidth + 44, chipHeight + 42, 18);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#39515d";
      ctx.lineWidth = 1.1;
      roundRect(x - 22, y - 18, chipWidth + 44, chipHeight + 42, 18);
      ctx.stroke();
      ctx.fillStyle = "#111f2b";
      roundRect(x - 14, y - 10, chipWidth + 28, chipHeight + 26, 13);
      ctx.fill();
      ctx.strokeStyle = "#263e4b";
      roundRect(x - 14, y - 10, chipWidth + 28, chipHeight + 26, 13);
      ctx.stroke();
      for (let i = 0; i < 16; i++) {
        const xx = x - 10 + i * (chipWidth + 20) / 15;
        for (const yy of [y - 5, y + chipHeight + 11]) {
          ctx.fillStyle = "#6c7e81"; roundRect(xx - 2, yy, 4, 4, 1); ctx.fill();
          ctx.fillStyle = "#d4b879"; ctx.fillRect(xx - 1, yy + 1, 2, 1);
        }
      }
      for (let i = 0; i < 11; i++) {
        const yy = y + 10 + i * (chipHeight - 20) / 10;
        for (const xx of [x - 18, x + chipWidth + 10]) { ctx.fillStyle = "#74878b"; roundRect(xx, yy, 5, 3, 1); ctx.fill(); }
      }
      for (let i = 0; i < 7; i++) {
        const yy = y + 26 + i * 31;
        trace([[x - 4, yy], [x + 22, yy], [x + 22, yy + (i % 2 ? -9 : 9)], [x + 62, yy + (i % 2 ? -9 : 9)]]);
        trace([[x + chipWidth - 60, yy], [x + chipWidth - 22, yy], [x + chipWidth - 22, yy + (i % 2 ? 9 : -9)], [x + chipWidth + 4, yy + (i % 2 ? 9 : -9)]]);
      }

      // Central ASIC package and textured silicon die.
      ctx.fillStyle = "#050c12"; roundRect(-119, -83, 238, 166, 12); ctx.fill();
      ctx.strokeStyle = "#536875"; ctx.lineWidth = 1.3; roundRect(-119, -83, 238, 166, 12); ctx.stroke();
      ctx.fillStyle = "#172a35"; roundRect(-111, -75, 222, 150, 9); ctx.fill();
      ctx.strokeStyle = "#334d5b"; roundRect(-111, -75, 222, 150, 9); ctx.stroke();
      for (let i = 0; i < 10; i++) { const xx = -91 + i * 20; ctx.fillStyle = "#9c885d"; ctx.fillRect(xx, -89, 8, 6); ctx.fillRect(xx, 83, 8, 6); }
      for (let i = 0; i < 6; i++) { const yy = -60 + i * 24; ctx.fillStyle = "#9c885d"; ctx.fillRect(-125, yy, 6, 8); ctx.fillRect(119, yy, 6, 8); }
      const die = ctx.createLinearGradient(-80, -50, 80, 50);
      die.addColorStop(0, "#1d3946"); die.addColorStop(.5, "#102630"); die.addColorStop(1, "#1a303a");
      ctx.fillStyle = die; roundRect(-83, -54, 166, 108, 6); ctx.fill();
      ctx.strokeStyle = "#64818a"; ctx.lineWidth = .8; roundRect(-83, -54, 166, 108, 6); ctx.stroke();
      ctx.save(); roundRect(-78, -49, 156, 98, 4); ctx.clip(); ctx.strokeStyle = "#2d6672"; ctx.globalAlpha = .6;
      for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.moveTo(-78, -43 + i * 10); ctx.lineTo(78, -43 + i * 10); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-73 + i * 16, -49); ctx.lineTo(-73 + i * 16, 49); ctx.stroke(); }
      ctx.restore();
      if (active && time > 0) {
        ctx.save(); roundRect(-78, -49, 156, 98, 4); ctx.clip();
        const scanY = -49 + motion.mix.scan * 98;
        const scan = ctx.createLinearGradient(0, scanY - 8, 0, scanY + 8);
        scan.addColorStop(0, "rgba(45,205,229,0)"); scan.addColorStop(.5, "rgba(71,229,243,.34)"); scan.addColorStop(1, "rgba(45,205,229,0)");
        ctx.fillStyle = scan; ctx.fillRect(-78, scanY - 8, 156, 16);
        ctx.fillStyle = "rgba(125,239,247,.72)"; ctx.fillRect(-77, scanY, 154, 1.2);
        ctx.restore();
      }
      text("CKI / SILICON ARRAY", 0, -24, 10, "#d5e1e5", "center", "600 10px ui-monospace, monospace");
      text("SHA-256 COMPUTE CORE", 0, -9, 7, "#8ca8b2", "center");
      for (let i = 0; i < 9; i++) {
        const barLevel = motion.mix.bars[i % motion.mix.bars.length];
        const barWidth = 5 + barLevel * (boosted ? 13 : 10);
        ctx.fillStyle = active && i < 6 ? "#6fc8ce" : "#3e6672";
        ctx.globalAlpha = .42 + barLevel * .5;
        roundRect(-43 + i * 10, -1, barWidth, 3, 1); ctx.fill();
      }
      ctx.globalAlpha = 1;
      text(boosted ? "BOOSTED SIMULATION" : active ? "WORK DISTRIBUTION ACTIVE" : "CORE STANDBY", 0, 24, 7, boosted ? "#d9bd7e" : active ? "#80b8c1" : "#7e8d95", "center");
      const progress = active ? motion.mix.progress : 0;
      ctx.fillStyle = "#263c47"; roundRect(-53, 35, 106, 4, 2); ctx.fill();
      const mixGlow = ctx.createLinearGradient(-53, 0, 53, 0);
      mixGlow.addColorStop(0, boosted ? "#b98f43" : "#267c9c"); mixGlow.addColorStop(.65, boosted ? "#f5d384" : "#54e1ec"); mixGlow.addColorStop(1, "#bdfaff");
      ctx.save(); ctx.shadowColor = boosted ? "#e7bd62" : "#38d9ef"; ctx.shadowBlur = 8;
      ctx.fillStyle = mixGlow; roundRect(-53, 35, 106 * progress, 4, 2); ctx.fill(); ctx.restore();
      const nonce = motion.mix.nonce.toString(16).toUpperCase().padStart(6, "0").slice(-6);
      text(`NONCE ${nonce}`, 0, 49, 5.5, "#84aebb", "center");

      // Node regimes are independent semi-Markov processes coupled by workload and thermal feedback.
      const nodeColors: Record<MiningMotionSnapshot["nodes"][number]["mode"], string> = {
        SURGE: "#55e5f0", NOMINAL: "#71cbd3", THROTTLE: "#e3bf68", COOLING: "#57aeca", HIBERNATING: "#687a82", HANDOFF: "#57ddb4",
      };
      const nodeLabels: Record<MiningMotionSnapshot["nodes"][number]["mode"], string> = {
        SURGE: "FULL POWER", NOMINAL: "NORMAL", THROTTLE: "LOW POWER", COOLING: "COOLING", HIBERNATING: "HIBERNATING", HANDOFF: "PASSING WORK",
      };
      const nodes = [
        { motionIndex: 0, x: -210, y: -83, id: "NODE A4A7", sub: "WORK INTAKE" },
        { motionIndex: 2, x: 210, y: -83, id: "NODE 12C2", sub: "HASH MIX" },
        { motionIndex: 1, x: -210, y: 91, id: "NODE 38D1", sub: "PROOF VERIFY" },
        { motionIndex: 3, x: 210, y: 91, id: "NODE 71F9", sub: "VAULT LEDGER" },
      ];
      nodes.forEach(node => {
        const engineNode = motion.nodes[node.motionIndex];
        const isCurrent = active && (engineNode.mode === "SURGE" || engineNode.mode === "HANDOFF");
        const isRecent = active && engineNode.mode === "HANDOFF";
        const nodeColor = active ? nodeColors[engineNode.mode] : "#526a75";
        ctx.save();
        ctx.fillStyle = "#0a1721"; roundRect(node.x - 52, node.y - 22, 104, 44, 6); ctx.fill();
        ctx.shadowColor = isCurrent ? nodeColor : "#000"; ctx.shadowBlur = isCurrent ? 12 : 0;
        ctx.strokeStyle = isCurrent ? nodeColor : "#3c606c"; ctx.lineWidth = isCurrent ? 1.5 : .9;
        roundRect(node.x - 52, node.y - 22, 104, 44, 6); ctx.stroke(); ctx.shadowBlur = 0;
        const ledX = node.x - 39, ledY = node.y - 8;
        glow(ledX, ledY, isCurrent ? 14 : 8, isCurrent ? "rgb(69,222,242)" : "rgb(91,178,191)", active ? .12 + engineNode.power * .3 : .06);
        ctx.save(); ctx.translate(ledX, ledY); ctx.rotate(engineNode.angle);
        ctx.strokeStyle = isCurrent ? "rgba(108,233,246,.9)" : "rgba(81,153,169,.55)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 5.3, -.7, 1.35); ctx.stroke();
        ctx.fillStyle = isCurrent ? "#ffe08a" : isRecent ? "#3fe1b4" : nodeColor;
        ctx.beginPath(); ctx.arc(0, 0, 2.7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        text(node.id, node.x - 31, node.y - 5, 7.5, isCurrent ? "#f2fdff" : "#d8e3e7");
        text(node.sub, node.x - 31, node.y + 7, 5.7, "#7c9aa7");
        const mode = !active ? "STANDBY" : nodeLabels[engineNode.mode];
        text(mode, node.x + 43, node.y - 5, 4.4, nodeColor, "right");
        text(`Q${Math.round(engineNode.queue * 9)} · ${Math.round(engineNode.power * 100)}%`, node.x + 43, node.y + 7, 4.1, "#8fb4bd", "right");
        ctx.fillStyle = "#213945"; roundRect(node.x - 40, node.y + 14, 80, 2.5, 1); ctx.fill();
        const workProgress = active ? Math.max(.025, engineNode.progress) : .12;
        const nodeFill = isRecent ? "#52d8ad" : nodeColor;
        ctx.save(); ctx.shadowColor = nodeFill; ctx.shadowBlur = isCurrent ? 6 : 2;
        ctx.fillStyle = nodeFill; roundRect(node.x - 40, node.y + 14, 80 * workProgress, 2.5, 1); ctx.fill(); ctx.restore();
        if (active) {
          const sweepX = node.x - 45 + engineNode.progress * 90;
          ctx.fillStyle = isCurrent ? "rgba(182,251,255,.85)" : "rgba(122,215,229,.55)";
          ctx.fillRect(sweepX, node.y - 14, 1.2, 27);
        }
        ctx.restore();
      });
      const paths = [
        [[-158, -83], [-128, -83], [-128, -42], [-83, -42]], [[158, -83], [128, -83], [128, -42], [83, -42]],
        [[-158, 91], [-128, 91], [-128, 42], [-83, 42]], [[158, 91], [128, 91], [128, 42], [83, 42]],
      ];
      paths.forEach((path, i) => trace(path, i === 3 ? "rgb(240,195,105)" : "rgb(91,219,237)"));

      // Seven high-visibility cooling rotors, with speed and glow tied to engine state.
      ctx.fillStyle = "#09151e"; roundRect(-164, 113, 328, 36, 6); ctx.fill();
      ctx.strokeStyle = "#3d6571"; ctx.lineWidth = 1; roundRect(-164, 113, 328, 36, 6); ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const fanX = -132 + i * 44;
        const fanTint = i % 2 ? "rgb(52,189,219)" : "rgb(93,218,229)";
        glow(fanX, 131, 20, fanTint, active ? .08 + motion.power.fanRpm[i] / 20_000 : .045);
        ctx.strokeStyle = active ? "#4da9bc" : "#385a66"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(fanX, 131, 15, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(119,231,240,.48)"; ctx.lineWidth = .8;
        ctx.beginPath(); ctx.arc(fanX, 131, 11.5, -1.5, .9); ctx.stroke();
        ctx.fillStyle = "#112934"; ctx.beginPath(); ctx.arc(fanX, 131, 10.5, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(fanX, 131);
        ctx.rotate(motion.power.fanAngles[i]);
        ctx.strokeStyle = "rgba(134,238,246,.42)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 8.2, -.65, 1.1); ctx.stroke();
        for (let blade = 0; blade < 7; blade++) {
          ctx.save(); ctx.rotate(blade * Math.PI * 2 / 7);
          const bladeGrad = ctx.createLinearGradient(0, -2, 0, -12);
          bladeGrad.addColorStop(0, "#b1e7e7"); bladeGrad.addColorStop(.35, "#55afbd"); bladeGrad.addColorStop(1, "#176080");
          ctx.fillStyle = bladeGrad; ctx.globalAlpha = active ? .58 + .4 * Math.min(1, motion.power.fanRpm[i] / 3_850) : .64;
          ctx.beginPath(); ctx.moveTo(-1.3, -1); ctx.quadraticCurveTo(-5, -8, -1, -13); ctx.quadraticCurveTo(4, -10, 2, -2); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1; ctx.fillStyle = "#dbf6f3"; ctx.beginPath(); ctx.arc(0, 0, 2.8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#e1fdff"; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(0, 0, 4.1, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      text("7× ACTIVE COOLING FAN ARRAY / THERMAL EXHAUST", 0, 165, 6.7, "#8fb8c4", "center");

      // Prominent three-blade wind turbine: animated rotor feeds the simulated power bus.
      ctx.save(); ctx.translate(-300, 104);
      line([[0, 0], [0, -48]], "#65989e", 3, .96);
      line([[-7, 0], [0, -10], [7, 0]], "#477782", 1.4, .85);
      glow(0, -48, 24, "rgb(79,220,195)", active ? .29 : .08);
      ctx.strokeStyle = "rgba(112,232,220,.68)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, -48, 35, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.translate(0, -48); ctx.rotate(motion.power.turbineAngle);
      for (let blade = 0; blade < 3; blade++) {
        ctx.save(); ctx.rotate(blade * Math.PI * 2 / 3);
        const bladeGrad = ctx.createLinearGradient(0, -2, 0, -34);
        bladeGrad.addColorStop(0, "#d7fff0"); bladeGrad.addColorStop(.22, "#72e5d0"); bladeGrad.addColorStop(1, "#237e91");
        ctx.fillStyle = bladeGrad; ctx.shadowColor = "#4be1d2"; ctx.shadowBlur = active ? 9 : 2;
        ctx.beginPath(); ctx.moveTo(-2, -2); ctx.quadraticCurveTo(-5, -18, -1, -35); ctx.quadraticCurveTo(4, -30, 3, -8); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.shadowBlur = 0; ctx.fillStyle = "#ecfff7"; ctx.beginPath(); ctx.arc(0, 0, 5.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#51cbbf"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      const turbinePhase = motion.streams[traceIndex]?.packets[0]?.progress ?? .5;
      glow(0, -41 + turbinePhase * 34, 9, "rgb(81,235,202)", active ? .5 : .12);
      text("WIND TURBINE", 0, 18, 6.2, "#9debdc", "center");
      text("SIM POWER INPUT", 0, 27, 5.1, "#719caa", "center");
      ctx.restore();
      trace([[-300, 104], [-300, 145], [-80, 145], [-80, 163]], "rgb(74,227,190)");

      // Transient sparks and token particles emitted only by actual reward-total changes.
      // Transient sparks and token particles emitted only by actual reward-total changes.
      sparks.forEach((spark, i) => {
        if (active && !reduceMotion) { spark.t += .016; if (spark.t > spark.life) { spark.t = 0; spark.x = .13 + Math.random() * .74; spark.y = .2 + Math.random() * .57; } }
        if (spark.t < .12) {
          const sparkX = spark.x * width;
          const sparkY = spark.y * height;
          ctx.save(); ctx.globalAlpha = 1 - spark.t / .12; ctx.strokeStyle = i % 3 ? "#8cdde0" : "#dfc17a"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(sparkX - 3, sparkY - 5); ctx.lineTo(sparkX + 1, sparkY - 1); ctx.lineTo(sparkX - 2, sparkY + 2); ctx.lineTo(sparkX + 4, sparkY + 6); ctx.stroke(); ctx.restore();
        }
      });
      tokens.forEach(token => {
        const progress = Math.min(1, token.t / token.dur);
        const eased = progress * progress * (3 - 2 * progress);
        const tokenX = lerp(token.x0, token.x1, eased) + Math.sin(progress * Math.PI) * token.sway;
        const tokenY = lerp(token.y0, token.y1, eased) - Math.sin(progress * Math.PI) * token.lift;
        ctx.save(); ctx.globalAlpha = Math.sin(progress * Math.PI) * .95;
        ctx.strokeStyle = "rgba(238,198,111,.66)"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(tokenX - 15, tokenY + 2); ctx.lineTo(tokenX - 4, tokenY); ctx.stroke();
        glow(tokenX, tokenY, 21, "rgb(236,192,93)", .34);
        ctx.fillStyle = "#e5c984"; ctx.strokeStyle = "#fff0b1"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(tokenX, tokenY, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        text("₵", tokenX, tokenY + 2.7, 7, "#40321b", "center", "bold 8px sans-serif"); ctx.restore();
      });

      // Integrated instrument surround, populated from the actual customer session where available.
      ctx.save(); ctx.strokeStyle = "#294957"; ctx.lineWidth = 1; ctx.globalAlpha = .9; roundRect(-365, -205, 730, 410, 15); ctx.stroke();
      ctx.strokeStyle = "#162f3b"; roundRect(-356, -196, 712, 392, 11); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = "#0a1721"; roundRect(-334, -190, 668, 24, 5); ctx.fill(); ctx.strokeStyle = "#284653"; roundRect(-334, -190, 668, 24, 5); ctx.stroke();
      text("CKI / ASIC FABRIC", -320, -175, 7, "#8eb4be");
      text(`HASH ${hashPower.toFixed(2)} TH/s`, -175, -175, 7, "#83a8b4");
      text(active ? (boosted ? "BOOST ACTIVE" : "ENGINE ACTIVE") : "ENGINE STANDBY", -45, -175, 7, boosted ? "#d8b46b" : "#83a8b4");
      text("SIMULATION", 95, -175, 7, "#83a8b4");
      for (let i = 0; i < 24; i++) { const node = motion.nodes[i % motion.nodes.length]; const lit = active && (i / 24 < motion.power.asic || node.mode === "SURGE"); ctx.fillStyle = lit ? "#6ebfc3" : "#263f4b"; ctx.globalAlpha = lit ? .46 + node.chaos * .48 : .42; ctx.fillRect(225 + i * 4.1, -182, 2, 7); }
      ctx.globalAlpha = 1;

      // Work queue and settlement ledger: each lane scans, carries packets and changes phase.
      ctx.fillStyle = "#09151f"; roundRect(-354, -148, 86, 116, 7); ctx.fill();
      ctx.strokeStyle = "#3a6673"; roundRect(-354, -148, 86, 116, 7); ctx.stroke();
      text("WORK QUEUE", -342, -133, 7.2, "#a8e5eb");
      const queuedTasks = Math.round(motion.nodes.reduce((sum, node) => sum + node.queue, 0) * 8);
      text(active ? `${queuedTasks} TASKS · LIVE SIM` : "QUEUE · HOLD", -342, -121, 4.8, "#7192a0");
      for (let i = 0; i < 6; i++) {
        const y = -108 + i * 12;
        const lane = motion.queueLanes[i];
        const laneNode = motion.nodes[i % motion.nodes.length];
        const lanePhase = active ? lane.progress : .12;
        const busy = active && (laneNode.mode === "SURGE" || laneNode.mode === "HANDOFF" || lane.fill > .65);
        ctx.fillStyle = "#1b303b"; roundRect(-342, y, 61, 3.8, 1.7); ctx.fill();
        const laneGrad = ctx.createLinearGradient(-342, 0, -281, 0);
        laneGrad.addColorStop(0, busy ? "#167d99" : "#245466"); laneGrad.addColorStop(1, busy ? "#6ee9ef" : "#3d9aaa");
        ctx.save(); ctx.shadowColor = busy ? "#46ddef" : "#20758a"; ctx.shadowBlur = busy ? 6 : 2;
        ctx.fillStyle = laneGrad; roundRect(-342, y, 61 * lane.fill, 3.8, 1.7); ctx.fill(); ctx.restore();
        const packetX = -342 + 61 * lanePhase;
        for (let tail = 2; tail >= 0; tail--) {
          const tx = packetX - tail * 4.5;
          ctx.globalAlpha = tail === 0 ? 1 : .5 / tail;
          ctx.fillStyle = tail === 0 ? "#e7fdff" : "#67d7e4";
          ctx.shadowColor = "#45dff3"; ctx.shadowBlur = tail === 0 ? 8 : 4;
          ctx.fillRect(tx, y - .8, 2.2, 5.4);
        }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
      text(`MIX SEQ ${motion.mix.nonce.toString(16).toUpperCase().padStart(4, "0").slice(-4)}`, -342, -36, 5.2, "#7ed9dd");

      ctx.fillStyle = "#09151f"; roundRect(268, -148, 86, 116, 7); ctx.fill();
      ctx.strokeStyle = "#5d5944"; roundRect(268, -148, 86, 116, 7); ctx.stroke();
      text("SETTLEMENT", 280, -133, 7.1, "#e8d095");
      text("SIMULATED STATE", 280, -121, 4.8, "#a39367");
      const settlementRows = ["WORK ROUTED", "HASH VERIFIED", "CKI MINT QUEUE", "VAULT / LEDGER"];
      for (let i = 0; i < 4; i++) {
        const y = -106 + i * 17;
        const stage = motion.settlement[i];
        const liveRow = active && (stage.progress > .7 || stage.holding);
        ctx.fillStyle = "#132833"; roundRect(280, y, 60, 12, 3); ctx.fill();
        ctx.strokeStyle = liveRow ? "#61d7dc" : "#294957"; ctx.lineWidth = liveRow ? .9 : .5; roundRect(280, y, 60, 12, 3); ctx.stroke();
        const rowProgress = active ? stage.progress : .08;
        ctx.fillStyle = liveRow ? "#d8bd74" : "#367f8c"; roundRect(283, y + 3, 47 * rowProgress, 6, 2); ctx.fill();
        const packetX = 283 + 47 * rowProgress;
        glow(packetX, y + 6, 7, liveRow ? "rgb(241,199,108)" : "rgb(77,194,210)", stage.intensity * (liveRow ? .5 : .3));
        text(settlementRows[i], 310, y + 8, 4.2, liveRow ? "#fff0bd" : "#a3c0c5");
      }

      // Three-stage power converter with repeated energy packets flowing turbine -> ASIC.
      ctx.fillStyle = "#0a1721"; roundRect(-252, 158, 504, 30, 5); ctx.fill();
      ctx.strokeStyle = "#2b4855"; roundRect(-252, 158, 504, 30, 5); ctx.stroke();
      text("POWER DISTRIBUTION BUS · SIM", -239, 170, 6.1, "#a6d5dc");
      const railXs = [-80, 12, 104];
      const railLabels = ["WIND INPUT", "DC REGULATOR", "ASIC LOAD"];
      const railColors = ["#59e0bd", "#57d7e9", "#e1c06e"];
      railXs.forEach((railX, i) => {
        const color = railColors[i];
        ctx.fillStyle = "#152a35"; roundRect(railX, 163, 79, 17, 3); ctx.fill();
        ctx.strokeStyle = i === 0 ? "#4c827c" : "#345361"; roundRect(railX, 163, 79, 17, 3); ctx.stroke();
        text(railLabels[i], railX + 39, 171, 5.2, i === 0 ? "#9debdc" : i === 2 ? "#ead48f" : "#91dce5", "center");
        ctx.fillStyle = "#203d49"; roundRect(railX + 7, 175, 65, 2, 1); ctx.fill();
        const load = active ? [motion.power.wind, motion.power.regulator, motion.power.asic][i] : .08;
        ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 5; ctx.fillStyle = color; roundRect(railX + 7, 175, 65 * load, 2, 1); ctx.fill(); ctx.restore();
        if (i < 2) {
          line([[railX + 80, 171], [railX + 89, 171]], "#5b9ba3", 1.2, .95);
          for (const q of motion.powerPackets[i]) {
            const px = railX + 80 + q * 9;
            glow(px, 171, 7, `rgb(${i ? "100,224,244" : "83,235,197"})`, .16 + load * .42);
            ctx.fillStyle = i ? "#b6f8ff" : "#bdffdf"; ctx.beginPath(); ctx.arc(px, 171, 1.7, 0, Math.PI * 2); ctx.fill();
          }
        }
      });

      // Hash mixer and CKI-vault sync indicators update independently of posted reward events.
      ctx.fillStyle = "#0a1721"; roundRect(-354, -20, 86, 52, 6); ctx.fill();
      ctx.strokeStyle = "#3d7380"; roundRect(-354, -20, 86, 52, 6); ctx.stroke();
      text("HASH MIX", -342, -7, 6.4, "#9bdce4");
      text(`${hashPower.toFixed(2)} TH/s`, -342, 7, 7.4, "#e9f8fb");
      text(active ? `SIM / ${motion.mix.nonce.toString(16).toUpperCase().slice(-4)}` : "NO PACKAGE", -342, 20, 4.8, "#78b8c2");
      ctx.save(); ctx.translate(-283, 5); ctx.rotate(motion.mix.angle);
      ctx.strokeStyle = active ? "#5be2ec" : "#49616b"; ctx.lineWidth = 1.5; ctx.shadowColor = "#29d5ea"; ctx.shadowBlur = active ? 7 : 0;
      ctx.beginPath(); ctx.rect(-6, -6, 12, 12); ctx.stroke(); ctx.rotate(Math.PI / 4); ctx.strokeRect(-4.4, -4.4, 8.8, 8.8);
      ctx.fillStyle = "#dcfbff"; ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.restore();

      ctx.fillStyle = "#0a1721"; roundRect(268, -20, 86, 52, 6); ctx.fill();
      ctx.strokeStyle = "#645b42"; roundRect(268, -20, 86, 52, 6); ctx.stroke();
      text("VAULT SYNC", 280, -7, 6.2, "#e9d394");
      text(active ? "SECURE / SIM" : "STANDBY", 280, 7, 6.2, "#f4e5b7");
      text("LEDGER ROUTE", 280, 20, 4.8, "#b5a67c");
      ctx.save(); ctx.translate(339, 4); ctx.rotate(-motion.vaultAngle);
      ctx.strokeStyle = active ? "#e2c270" : "#6a6656"; ctx.lineWidth = 1.4; ctx.shadowColor = "#f1c85e"; ctx.shadowBlur = active ? 7 : 0;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 1.65); ctx.stroke();
      ctx.fillStyle = "#f5e6b4"; ctx.beginPath(); ctx.arc(0, -7, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.restore();

      for (let i = 0; i < 4; i++) { const y = -8 + i * 8; trace([[-268, y], [-258, y], [-258, y + (i % 2 ? 4 : -4)], [-244, y + (i % 2 ? 4 : -4)]]); trace([[244, y], [258, y], [258, y + (i % 2 ? -4 : 4)], [268, y + (i % 2 ? -4 : 4)]]); }
      ctx.restore();
      ctx.restore();
    };

    const render = (now: number, animate: boolean) => {
      const state = propsRef.current;
      const rewardKey = Math.max(0, Number(state.rewardPulseKey) || 0);
      if (rewardKey > lastRewardKey) {
        tokens.push({ x0: width * .5, y0: height * .47, x1: width * .84, y1: height * .49, t: 0, dur: motionModel.randomBetween(1_250, 2_250), lift: motionModel.randomBetween(18, 43), sway: motionModel.randomBetween(-10, 10) });
        lastRewardKey = rewardKey;
      }
      const shouldAnimate = animate && state.running && state.playing && !reduceMotion;
      if (shouldAnimate) {
        const dt = lastFrame ? Math.min(100, now - lastFrame) : 16;
        motionSnapshot = motionModel.advance(dt, state.boosted, state.hashPowerThs);
        tokens.forEach(token => { token.t += dt; });
        tokens = tokens.filter(token => token.t < token.dur);
      }
      lastFrame = now;
      const drawTime = shouldAnimate ? now : 0;
      drawBackground(drawTime);
      drawChip(drawTime, motionSnapshot);
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedParticles();
      render(performance.now(), false);
    };
    const frame = (now: number) => {
      if (now - lastPaint >= 33) { render(now, true); lastPaint = now; }
      const state = propsRef.current;
      if (state.running && state.playing && !reduceMotion) raf = window.requestAnimationFrame(frame);
      else raf = 0;
    };
    const start = () => { if (!reduceMotion && !raf) raf = window.requestAnimationFrame(frame); else render(performance.now(), false); };
    const stop = () => { if (raf) window.cancelAnimationFrame(raf); raf = 0; render(performance.now(), false); };
    const controls: CoreControls = { start, stop, draw: render };
    controlsRef.current = controls;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(wrap);
    if (!observer) window.addEventListener("resize", resize);
    resize();
    if (propsRef.current.running && propsRef.current.playing && !reduceMotion) start();

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", resize);
      controlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (props.running && props.playing) controls.start();
    else controls.stop();
  }, [props.running, props.playing, props.boosted, props.hashPowerThs, props.rewardPulseKey]);

  return <canvas ref={canvasRef} className="cm-mining-core-canvas" aria-label="Animated mining simulation with cooling fans, wind turbine, hash mixer, moving work queues, and four processing nodes" />;
}
