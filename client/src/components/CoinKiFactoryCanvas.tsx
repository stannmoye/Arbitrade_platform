import { useEffect, useRef } from "react";

type CoinKiFactoryCanvasProps = {
  running: boolean;
  boostActive: boolean;
  motionEnabled: boolean;
};

const SCENE_WIDTH = 1000;
const SCENE_HEIGHT = 650;

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke?: string,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function fan(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, index: number, boosted: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = boosted ? "#00e7a2" : "#12d9f6";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#03101d";
  ctx.strokeStyle = boosted ? "#00dfad" : "#12b8e8";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.rotate(time * (boosted ? 8.8 : 2.7) + index * 0.42);
  for (let blade = 0; blade < 6; blade += 1) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.ellipse(0, -21, 8, 19, 0.16, 0, Math.PI * 2);
    ctx.fillStyle = boosted ? "#39f2ca" : "#168fc9";
    ctx.fill();
  }
  ctx.fillStyle = "#dffaff";
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  time: number,
  running: boolean,
  boostActive: boolean,
  motionEnabled: boolean,
) {
  const t = motionEnabled ? time : 0;
  ctx.clearRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

  const background = ctx.createLinearGradient(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  background.addColorStop(0, "#061b30");
  background.addColorStop(0.52, "#041322");
  background.addColorStop(1, "#020914");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

  const ambient = ctx.createRadialGradient(450, 280, 40, 480, 330, 650);
  ambient.addColorStop(0, boostActive ? "rgba(0,219,171,.12)" : "rgba(18,161,231,.13)");
  ambient.addColorStop(1, "rgba(2,9,20,0)");
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

  // Perspective service-bay floor grid.
  ctx.save();
  ctx.strokeStyle = "#0b3b5a";
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  for (let i = 0; i < 17; i += 1) {
    const y = 356 + i * i * 1.05;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SCENE_WIDTH, y);
    ctx.stroke();
  }
  for (let i = -10; i <= 10; i += 1) {
    ctx.beginPath();
    ctx.moveTo(500 + i * 30, 300);
    ctx.lineTo(500 + i * 83, SCENE_HEIGHT);
    ctx.stroke();
  }
  ctx.restore();

  // Enclosed utility pipes and status lamps across the back wall.
  for (let i = 0; i < 8; i += 1) {
    const x = 46 + i * 105;
    const pipe = i % 3 === 0 ? "#ad7c35" : "#0879b3";
    ctx.strokeStyle = pipe;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, 52);
    ctx.lineTo(x, 118);
    ctx.lineTo(x + 30, 138);
    ctx.stroke();
    ctx.fillStyle = i % 3 === 0 ? "#ffc94d" : "#12d9f6";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = motionEnabled ? 10 + Math.sin(t * 2 + i) * 3 : 7;
    ctx.beginPath();
    ctx.arc(x, 52, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Main sealed processing chamber.
  ctx.save();
  ctx.shadowColor = boostActive ? "#00dba8" : "#078ed1";
  ctx.shadowBlur = 24;
  roundedRect(ctx, 54, 158, 668, 238, 18, "#061728", "#1571a5");
  ctx.restore();
  roundedRect(ctx, 72, 176, 632, 202, 12, "#09253a", "#235d7b");

  // Armored ribs and illuminated seams.
  for (let i = 0; i < 9; i += 1) {
    const x = 88 + i * 68;
    ctx.fillStyle = i % 2 ? "#0a3858" : "#082b46";
    ctx.fillRect(x, 188, 9, 178);
    ctx.fillStyle = boostActive ? "#08b998" : "#168fd0";
    ctx.globalAlpha = 0.72;
    ctx.fillRect(x + 3, 198, 2, 158);
    ctx.globalAlpha = 1;
  }

  [150, 300, 455, 610].forEach((x, index) => fan(ctx, x, 278, t, index, boostActive));

  // CoinKi identity plate and live status strip.
  roundedRect(ctx, 354, 184, 119, 48, 8, "#04111d", "#d4a641");
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd46b";
  ctx.font = "800 16px Inter, Segoe UI, sans-serif";
  ctx.fillText("CoinKi", 413, 204);
  ctx.fillStyle = "#77d9f1";
  ctx.font = "700 8px Inter, Segoe UI, sans-serif";
  ctx.fillText("SIMULATION CORE · CKI", 413, 220);
  for (let i = 0; i < 20; i += 1) {
    ctx.fillStyle = i % 5 === 0 && boostActive ? "#00e7a2" : "#168fd0";
    ctx.globalAlpha = 0.45 + (motionEnabled ? Math.sin(t * 4 + i) * 0.18 : 0.25);
    ctx.beginPath();
    ctx.arc(94 + i * 32, 166, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Belt body with moving rollers and contained CKI discs.
  roundedRect(ctx, 28, 416, 735, 104, 13, "#04111d", "#17547a");
  roundedRect(ctx, 40, 428, 711, 78, 9, "#09243a", "#14628e");
  for (let i = 0; i < 30; i += 1) {
    const x = 49 + i * 23;
    ctx.fillStyle = "#164567";
    ctx.fillRect(x, 437, 13, 58);
    ctx.fillStyle = "#2180a4";
    ctx.fillRect(x + 2, 437, 2, 58);
  }
  ctx.fillStyle = "#1591b4";
  ctx.fillRect(40, 424, 711, 4);
  ctx.fillRect(40, 506, 711, 4);

  for (let i = 0; i < 20; i += 1) {
    const phase = (i / 20 + t * (boostActive ? 0.18 : 0.105)) % 1;
    const x = 54 + phase * 678;
    const y = 466 + Math.sin(phase * 14 + i) * 4;
    const coin = ctx.createRadialGradient(x - 4, y - 5, 1, x, y, 15);
    coin.addColorStop(0, "#fff2b4");
    coin.addColorStop(0.53, "#ffc94d");
    coin.addColorStop(1, "#976016");
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(motionEnabled ? Math.sin(t * 2 + i) * 0.12 : 0);
    ctx.shadowColor = "#ffc94d";
    ctx.shadowBlur = 8;
    ctx.fillStyle = coin;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffed9a";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#593a07";
    ctx.font = "900 7px Inter, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CKI", 0, 2.5);
    ctx.restore();
  }

  // Closed conduits lead to the two explicitly simulated storage stages.
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 17;
  ctx.strokeStyle = "#06223a";
  ctx.beginPath();
  ctx.moveTo(697, 245);
  ctx.bezierCurveTo(792, 226, 746, 120, 818, 145);
  ctx.stroke();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#087faf";
  ctx.shadowColor = "#12d9f6";
  ctx.shadowBlur = 13;
  ctx.stroke();
  ctx.lineWidth = 13;
  ctx.strokeStyle = "#06223a";
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(746, 466);
  ctx.bezierCurveTo(830, 488, 760, 564, 818, 548);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#078da5";
  ctx.shadowColor = "#00e7c4";
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.restore();

  for (let i = 0; i < 7; i += 1) {
    const phase = (t / 2.8 + i / 7) % 1;
    const x = 701 + 111 * phase;
    const y = 245 - 103 * Math.sin(phase * Math.PI);
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.shadowColor = "#74f5ff";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#86f5ff";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Buffered and ledger vaults.
  const vaults = [
    { x: 814, y: 83, title: "CKI BUFFER", subtitle: "CAPACITY READY", color: "#12d9f6" },
    { x: 814, y: 337, title: "SIM VAULT", subtitle: "LEDGER LINKED", color: "#00e7a2" },
  ];
  vaults.forEach(vault => {
    ctx.save();
    ctx.shadowColor = vault.color;
    ctx.shadowBlur = 14;
    roundedRect(ctx, vault.x, vault.y, 156, 112, 11, "#061b2d", "#1682ad");
    ctx.restore();
    roundedRect(ctx, vault.x + 9, vault.y + 9, 138, 94, 7, "#09253b", "#1b5777");
    ctx.strokeStyle = vault.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(vault.x + 37, vault.y + 39, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(vault.x + 27, vault.y + 39);
    ctx.lineTo(vault.x + 47, vault.y + 39);
    ctx.moveTo(vault.x + 37, vault.y + 29);
    ctx.lineTo(vault.x + 37, vault.y + 49);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = "#a9eafb";
    ctx.font = "800 10px Inter, Segoe UI, sans-serif";
    ctx.fillText(vault.title, vault.x + 61, vault.y + 35);
    ctx.fillStyle = vault.color;
    ctx.font = "700 8px Inter, Segoe UI, sans-serif";
    ctx.fillText(vault.subtitle, vault.x + 61, vault.y + 52);
    ctx.fillStyle = "#799bb1";
    ctx.font = "700 7px Inter, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SIMULATION ONLY", vault.x + 78, vault.y + 82);
  });

  // A small enclosed status overlay keeps the scene legible at narrow sizes.
  roundedRect(ctx, 22, 22, 214, 42, 9, "rgba(3,18,32,.93)", "#145578");
  ctx.fillStyle = running ? (boostActive ? "#00e7a2" : "#55e7c1") : "#9caeb7";
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = motionEnabled && running ? 10 : 4;
  ctx.beginPath();
  ctx.arc(42, 43, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  ctx.fillStyle = "#eaf8ff";
  ctx.font = "800 10px Inter, Segoe UI, sans-serif";
  ctx.fillText(boostActive ? "BOOST CORE ENGAGED" : running ? "SIMULATION ONLINE" : "ENGINE STANDBY", 55, 41);
  ctx.fillStyle = "#8baec7";
  ctx.font = "600 8px Inter, Segoe UI, sans-serif";
  ctx.fillText("VISUAL MODEL · SERVER LEDGER", 55, 54);
}

export function CoinKiFactoryCanvas({ running, boostActive, motionEnabled }: CoinKiFactoryCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !ctx) return;

    let frame = 0;
    let startTime: number | null = null;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(SCENE_WIDTH * ratio);
      canvas.height = Math.round(SCENE_HEIGHT * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawScene(ctx, 0, running, boostActive, motionEnabled);
    };

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    window.addEventListener("resize", resize);
    resize();

    const render = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      drawScene(ctx, (timestamp - startTime) / 1000, running, boostActive, motionEnabled);
      if (motionEnabled) frame = window.requestAnimationFrame(render);
    };
    if (motionEnabled) frame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [running, boostActive, motionEnabled]);

  return <canvas
    ref={canvasRef}
    className="cm-factory-canvas"
    role="img"
    aria-label="CoinKi mining factory simulation showing rotating fans, CKI coins contained on a conveyor, enclosed transfer conduits and simulated vaults."
  />;
}
