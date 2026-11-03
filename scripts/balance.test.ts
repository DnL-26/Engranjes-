import { test } from "vitest";
import { BRASS, brassCost, brassMaxed, buyBrass } from "../src/sim/brass";
import { CONFIG } from "../src/sim/config";
import { applyBlueprints, automatonStep, brassForReset, crank, newGame, rebirth, stageCount, tick } from "../src/sim/economy";
import { clockProgress } from "../src/sim/story";
import type { GameState } from "../src/sim/types";
import { fmt, fmtDuration } from "../src/util/format";

/** Si no compra una etapa en tanto tiempo y la fundición da latón, funde. */
const STALL_SECONDS = Number(process.env.BOT_STALL ?? 150);

/** Gasta el latón de la mejora más barata a la más cara. */
function spendBrass(s: GameState): string[] {
  const bought: string[] = [];
  for (;;) {
    const open = BRASS.filter((d) => !brassMaxed(s, d.id));
    if (open.length === 0) break;
    const d = open.reduce((a, b) => (brassCost(s, a.id) <= brassCost(s, b.id) ? a : b));
    if (!buyBrass(s, d.id)) break;
    if (d.id === "blueprints") applyBlueprints(s);
    bought.push(d.id);
  }
  return bought;
}

test("bot: varios ciclos con fundición", () => {
  const s = newGame();
  const dt = 0.25;
  const total = Number(process.env.BOT_SECONDS ?? 4 * 3600);
  const clicksPerSecond = 4;
  let clickAcc = 0;
  let lastStageAt = 0;
  let lastStages = 0;
  let endedAt = -1;
  const lines: string[] = [];

  for (let t = 0; t < total; t += dt) {
    clickAcc += clicksPerSecond * dt;
    while (clickAcc >= 1) {
      crank(s);
      clickAcc--;
    }
    tick(s, { overdriveHeld: false }, dt);
    automatonStep(s, true);

    if (stageCount(s) !== lastStages) {
      lastStages = stageCount(s);
      lastStageAt = t;
    }
    if (endedAt < 0 && s.bestRps >= CONFIG.story.targetRps) {
      endedAt = t;
      lines.push(`  *** FINAL a las ${fmtDuration(t)} (ciclo ${s.rebirths + 1}) ***`);
    }
    if (t - lastStageAt >= STALL_SECONDS && brassForReset(s) > 0) {
      const gain = brassForReset(s);
      lines.push(
        `${fmtDuration(t).padStart(7)}  ciclo ${s.rebirths + 1}: ${fmtDuration(s.timeRun)}, ` +
          `${stageCount(s)} etapas, salida 1e${Math.log10(s.bestRps).toFixed(1)} v/s, ` +
          `reloj ${(clockProgress(s) * 100).toFixed(0)}%, +${gain} latón`,
      );
      rebirth(s);
      const bought = spendBrass(s);
      lines.push(`           latón: ${bought.join(", ") || "nada"} (quedan ${fmt(s.brass)})`);
      lastStageAt = t;
      lastStages = stageCount(s);
    }
  }
  lines.push(`fin: ciclo ${s.rebirths + 1}, ${stageCount(s)} etapas, reloj ${(clockProgress(s) * 100).toFixed(0)}%`);
  console.log(lines.join("\n"));
}, 300_000);
