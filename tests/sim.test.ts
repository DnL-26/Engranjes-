import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../src/core/save";
import { Game } from "../src/core/game";
import { CONFIG } from "../src/sim/config";
import { buyBrass } from "../src/sim/brass";
import { pickTip, STORY } from "../src/sim/dialogue";
import { actOnEvent, countPurchase, makeRequest, spawnEvent, tickEvents } from "../src/sim/events";
import { checkStory, claimReaction, clockProgress, ENDING_ID } from "../src/sim/story";
import {
  brassForReset,
  crankImpulse,
  buyMotor,
  buyStage,
  buyTeeth,
  crank,
  incomePerSecond,
  MAX_TIER,
  maxTeethLevel,
  motorRps,
  rebirth,
  stageCount,
  motorCost,
  newGame,
  shaftSpeeds,
  stageCost,
  stageRatio,
  teethBulk,
  tick,
  tierOf,
} from "../src/sim/economy";

const idle = { overdriveHeld: false };

function run(s: ReturnType<typeof newGame>, seconds: number, held = false) {
  for (let t = 0; t < seconds; t += CONFIG.tickSeconds) tick(s, { overdriveHeld: held }, CONFIG.tickSeconds);
}

describe("tren", () => {
  it("una partida nueva no produce nada hasta girar la manivela", () => {
    const s = newGame();
    run(s, 1);
    expect(s.coins).toBe(0);
    crank(s);
    expect(incomePerSecond(s)).toBeGreaterThan(0);
  });

  it("la manivela decae sola y no pasa del máximo", () => {
    const s = newGame();
    for (let i = 0; i < 20; i++) crank(s);
    expect(s.crank).toBe(CONFIG.crank.impulse * CONFIG.crank.maxImpulses);
    run(s, 10);
    expect(s.crank).toBeLessThan(0.01);
  });

  it("cada etapa multiplica la velocidad por su relación", () => {
    const s = newGame();
    s.coins = 1e9;
    buyMotor(s, 1);
    buyStage(s);
    buyStage(s);
    buyTeeth(s, 2, 3);
    s.motorSpeed = 2;
    const v = shaftSpeeds(s);
    expect(stageRatio(s, 1)).toBe(1.5);
    expect(stageRatio(s, 2)).toBe(18 / 8);
    expect(v[1]).toBeCloseTo(2 * 1.5);
    expect(v[2]).toBeCloseTo(2 * 1.5 * 2.25);
  });

  it("el motor alcanza su velocidad con inercia", () => {
    const s = newGame();
    s.coins = 1e9;
    buyMotor(s, 10);
    tick(s, idle, CONFIG.tickSeconds);
    expect(s.motorSpeed).toBeLessThan(1);
    run(s, 5);
    expect(s.motorSpeed).toBeCloseTo(5, 2);
  });
});

describe("compras", () => {
  it("no compra sin dinero y cobra el precio exacto", () => {
    const s = newGame();
    expect(buyMotor(s, 1)).toBe(0);
    s.coins = motorCost(0);
    expect(buyMotor(s, 1)).toBe(1);
    expect(s.coins).toBeCloseTo(0);
    expect(buyStage(s)).toBe(false);
    s.coins = stageCost(1);
    expect(buyStage(s)).toBe(true);
    expect(s.shafts.length).toBe(2);
  });

  it("comprar al máximo se queda en lo asequible y respeta el tope de dientes", () => {
    const s = newGame();
    s.shafts.push({ teethLevel: 0, revs: 0 });
    s.coins = 1e3;
    const b = teethBulk(s, 1, Infinity);
    expect(b.cost).toBeLessThanOrEqual(1e3);
    expect(buyTeeth(s, 1, Infinity)).toBe(b.count);
    s.coins = 1e30;
    buyTeeth(s, 1, Infinity);
    expect(s.shafts[1].teethLevel).toBe(CONFIG.maxTeethLevel);
    expect(buyTeeth(s, 1, 1)).toBe(0);
  });
});

describe("materiales", () => {
  it("suben con cada potencia de diez y se detienen en el último", () => {
    expect(tierOf(9)).toBe(0);
    expect(tierOf(10)).toBe(1);
    expect(tierOf(999)).toBe(2);
    expect(tierOf(1e40)).toBe(MAX_TIER);
  });

  it("el paso de simulación avisa de cada subida", () => {
    const s = newGame();
    s.shafts[0].revs = 9.99;
    s.motorSpeed = 1;
    const r = tick(s, idle, 0.1);
    expect(r.tierUps).toEqual([{ shaft: 0, tier: 1 }]);
  });
});

describe("sobremarcha", () => {
  it("no funciona hasta tener sus etapas", () => {
    const s = newGame();
    run(s, 1, true);
    expect(s.overdrive).toBe(0);
  });

  it("acelera, calienta y acaba gripando el motor", () => {
    const s = newGame();
    s.coins = 1e12;
    buyMotor(s, 10);
    for (let i = 0; i < CONFIG.overdrive.unlockStages; i++) buyStage(s);
    run(s, 8);
    const normal = shaftSpeeds(s)[0];
    run(s, 1, true);
    expect(shaftSpeeds(s)[0]).toBeCloseTo(normal * CONFIG.overdrive.maxMult, 1);

    let stalled = false;
    for (let t = 0; t < 10 && !stalled; t += CONFIG.tickSeconds) {
      stalled = tick(s, { overdriveHeld: true }, CONFIG.tickSeconds).stalled;
    }
    expect(stalled).toBe(true);
    expect(crank(s)).toBe(false);
    run(s, 3, true);
    expect(s.overdrive).toBe(0);
    expect(s.motorSpeed).toBeLessThan(normal * 0.1);
    run(s, CONFIG.overdrive.stallSeconds);
    expect(s.stall).toBe(0);
  });
});

describe("guardado y progreso offline", () => {
  it("el guardado ida y vuelta conserva el estado", () => {
    const s = newGame();
    s.coins = 1234.5;
    s.motorLevel = 7;
    s.shafts.push({ teethLevel: 3, revs: 456 });
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it("el progreso offline produce y no deja sobremarcha ni manivela", () => {
    const s = newGame();
    s.coins = 1e6;
    buyMotor(s, 10);
    buyStage(s);
    const g = new Game(s);
    const before = s.coins;
    const summary = g.runOffline(600);
    expect(summary.gained).toBeGreaterThan(0);
    expect(s.coins - before).toBeCloseTo(summary.gained);
    expect(s.crank).toBe(0);
    expect(g.drainEvents()).toEqual([]);
  });
});

describe("fundición y latón", () => {
  it("da un latón por cada engranaje construido en el ciclo", () => {
    const s = newGame();
    expect(brassForReset(s)).toBe(0);
    s.coins = 1e12;
    for (let i = 0; i < 4; i++) buyStage(s);
    expect(brassForReset(s)).toBe(4);
  });

  it("se puede fundir siempre, aunque sin engranajes no da latón", () => {
    const s = newGame();
    s.coins = 500;
    expect(rebirth(s)).toBe(0);
    expect(s.rebirths).toBe(1);
    expect(s.coins).toBe(0);
  });

  it("las etapas regaladas por los Planos no cuentan para el latón", () => {
    const s = newGame();
    s.brass = 100;
    buyBrass(s, "blueprints");
    buyBrass(s, "blueprints");
    rebirth(s);
    expect(stageCount(s)).toBe(2);
    expect(brassForReset(s)).toBe(0);
    s.coins = 1e12;
    buyStage(s);
    expect(brassForReset(s)).toBe(1);
  });

  it("fundir reinicia el ciclo y conserva lo permanente", () => {
    const s = newGame();
    s.coins = 1e25;
    buyMotor(s, 5);
    buyStage(s);
    buyStage(s);
    s.totalRun = 1e25;
    s.bestRps = 1e9;
    s.story.seen.push("intro");
    const gain = brassForReset(s);
    expect(rebirth(s)).toBe(gain);
    expect(s.brass).toBe(gain);
    expect(s.rebirths).toBe(1);
    expect(s.coins).toBe(0);
    expect(s.motorLevel).toBe(0);
    expect(s.shafts.length).toBe(1);
    expect(s.bestRps).toBe(1e9);
    expect(s.story.seen).toEqual(["intro"]);
    expect(s.maxStages).toBe(2);
  });

  it("las mejoras cambian el tren: motores, piñones, fresadora y planos", () => {
    const s = newGame();
    s.brass = 1e6;
    s.coins = 1e9;
    buyMotor(s, 10);
    const one = motorRps(s);
    expect(buyBrass(s, "motors")).toBe(true);
    expect(motorRps(s)).toBeCloseTo(one * 2);

    buyStage(s);
    expect(stageRatio(s, 1)).toBe(12 / 8);
    buyBrass(s, "pinion");
    expect(stageRatio(s, 1)).toBe(12 / 7);

    const before = maxTeethLevel(s);
    buyBrass(s, "mill");
    expect(maxTeethLevel(s)).toBe(before + CONFIG.millLevels);

    buyBrass(s, "blueprints");
    buyBrass(s, "blueprints");
    s.totalRun = 1e25;
    rebirth(s);
    expect(stageCount(s)).toBe(2);
    expect(s.motorLevel).toBe(1);
  });

  it("no compra con latón insuficiente ni pasa del máximo", () => {
    const s = newGame();
    expect(buyBrass(s, "motors")).toBe(false);
    s.brass = 1e9;
    while (buyBrass(s, "pinion"));
    expect(s.brassUpgrades.pinion).toBe(2);
  });

  it("el autómata compra solo y ahorra para la etapa si es lo que más rinde", () => {
    const s = newGame();
    s.brassUpgrades.automaton = 2;
    s.coins = 1e6;
    run(s, 1);
    expect(s.motorLevel).toBeGreaterThan(0);
    expect(stageCount(s)).toBeGreaterThan(0);
  });
});

describe("historia", () => {
  it("desbloquea las páginas por hitos y deja pendientes las no leídas", () => {
    const s = newGame();
    expect(checkStory(s)).toEqual(["intro"]);
    expect(checkStory(s)).toEqual([]);
    s.motorLevel = 1;
    expect(checkStory(s)).toEqual(["motor"]);
    expect(s.story.unread).toEqual(["intro", "motor"]);
  });

  it("el final llega con la velocidad objetivo y el juego sigue", () => {
    const s = newGame();
    s.bestRps = CONFIG.story.targetRps;
    expect(clockProgress(s)).toBe(1);
    checkStory(s);
    expect(s.story.ended).toBe(true);
    expect(s.story.seen).toContain(ENDING_ID);
    s.coins = stageCost(1);
    expect(buyStage(s)).toBe(true);
  });
});

describe("límites numéricos", () => {
  it("nada se desborda a Infinity ni a NaN", () => {
    const s = newGame();
    s.motorLevel = 10;
    s.motorSpeed = 1e200;
    for (let i = 0; i < 30; i++) s.shafts.push({ teethLevel: 20, revs: 0 });
    run(s, 1);
    expect(Number.isFinite(s.coins)).toBe(true);
    expect(Number.isFinite(s.bestRps)).toBe(true);
    expect(Number.isNaN(s.totalRun)).toBe(false);
    // Las etapas imposibles cuestan Infinity: inalcanzables, pero nunca NaN.
    expect(stageCost(400)).toBe(Infinity);
  });
});

describe("Anselmo", () => {
  it("cada parte de la historia tiene frases y un id único", () => {
    const ids = new Set(STORY.map((p) => p.id));
    expect(ids.size).toBe(STORY.length);
    for (const p of STORY) {
      expect(p.lines.length).toBeGreaterThan(0);
      for (const l of p.lines) expect(l.text.length).toBeGreaterThan(0);
    }
  });

  it("las reacciones de una sola vez no se repiten", () => {
    const s = newGame();
    expect(claimReaction(s, "firstStall")).toBe(true);
    expect(claimReaction(s, "firstStall")).toBe(false);
    expect(claimReaction(s, "stallAgain")).toBe(true);
    expect(claimReaction(s, "stallAgain")).toBe(true);
  });

  it("aconseja según el momento de la partida", () => {
    const s = newGame();
    expect(pickTip(s, { idle: 0 })?.id).toBe("crank");
    s.coins = 1e6;
    expect(pickTip(s, { idle: 0 })?.id).toBe("motor");
    buyMotor(s, 1);
    expect(pickTip(s, { idle: 0 })?.id).toBe("stage");
    expect(pickTip(s, { idle: 0 }, "stage")?.id).not.toBe("stage");
  });
});

describe("eventos aleatorios", () => {
  const midGame = () => {
    const s = newGame();
    s.coins = 1e12;
    buyMotor(s, 20);
    for (let i = 0; i < 4; i++) buyStage(s);
    for (let i = 1; i <= 4; i++) buyTeeth(s, i, 5);
    s.motorSpeed = motorRps(s);
    s.coins = 0;
    return s;
  };

  it("no aparecen sin motor, ni con una ventana abierta, ni en el progreso offline", () => {
    const s = newGame();
    s.events.cooldown = 0;
    expect(tickEvents(s, 1, true)).toEqual([]);
    const m = midGame();
    m.events.cooldown = 0;
    expect(tickEvents(m, 1, false)).toEqual([]);
    expect(tickEvents(m, 1, true)[0]?.type).toBe("spawn");

    const g = new Game(midGame());
    g.state.events.cooldown = 0;
    g.runOffline(600);
    expect(g.state.events.active).toBeNull();
  });

  it("el engranaje dorado da monedas o un frenesí", () => {
    const s = midGame();
    spawnEvent(s, "golden");
    const coins = actOnEvent(s, "click", () => 0.1);
    expect(coins?.type).toBe("resolve");
    expect(s.coins).toBeGreaterThan(0);
    spawnEvent(s, "golden");
    const before = incomePerSecond(s);
    actOnEvent(s, "click", () => 0.7);
    // Frenesí ×7, y la racha pasa de 1 (×1.05) a 2 (×1.10).
    expect(incomePerSecond(s) / before).toBeCloseTo((7 * 1.1) / 1.05, 6);
  });

  it("un atasco deja su etapa en ×1 hasta que se desatasca a golpes", () => {
    const s = midGame();
    const before = shaftSpeeds(s);
    spawnEvent(s, "jam", () => 0.99);
    const stage = s.events.active!.stage!;
    expect(shaftSpeeds(s)[stage]).toBeCloseTo(before[stage - 1]);
    for (let i = 0; i < 4; i++) expect(actOnEvent(s)?.type).toBe("progress");
    expect(actOnEvent(s)).toMatchObject({ type: "resolve", outcome: "perfect" });
    expect(shaftSpeeds(s)[stage]).toBeCloseTo(before[stage]);
  });

  it("el engranaje inestable revienta si se espera demasiado", () => {
    const s = midGame();
    spawnEvent(s, "unstable", () => 0);
    const a = s.events.active!;
    const levels = s.shafts[a.stage!].teethLevel;
    const news = [];
    for (let t = 0; t < 30 && s.events.active; t += 0.5) news.push(...tickEvents(s, 0.5, false));
    expect(news.some((n) => n.type === "miss" && n.kind === "unstable")).toBe(true);
    expect(s.shafts[a.stage!].teethLevel).toBe(levels - 2);
    expect(s.events.streak).toBe(0);
  });

  it("la campanada multiplica la manivela y la tormenta quita el calor", () => {
    const s = midGame();
    const imp = crankImpulse(s);
    spawnEvent(s, "bell");
    expect(crankImpulse(s)).toBeCloseTo(imp * 50);
    spawnEvent(s, "storm");
    s.overdrive = 1;
    tick(s, { overdriveHeld: true }, 1);
    expect(s.heat).toBe(0);
  });

  it("los pedidos escalan con el progreso del jugador", () => {
    const early = midGame();
    const late = midGame();
    late.coins = 1e30;
    for (let i = 0; i < 6; i++) buyStage(late);
    for (let i = 1; i < late.shafts.length; i++) buyTeeth(late, i, 10);
    late.motorSpeed = motorRps(late);
    late.rebirths = 2;
    late.coins = 0;
    const always = () => 0;
    const a = makeRequest(early, always).request;
    const b = makeRequest(late, always).request;
    expect(a.kind).toBe(b.kind);
    expect(b.target).toBeGreaterThan(a.target * 100);
    expect(b.reward.coins).toBeGreaterThan(a.reward.coins * 100);
    expect(a.reward.brass).toBe(0);
    expect(b.reward.brass).toBeGreaterThan(0);
  });

  it("cumplir un pedido da el premio y sube la racha", () => {
    const s = midGame();
    spawnEvent(s, "request", () => 0.4);
    const r = s.events.active!.request!;
    r.progress = r.target;
    if (r.kind === "speed") s.motorSpeed = 1e30;
    if (r.kind === "earn") s.totalRun = r.base + r.target;
    if (r.kind === "stage") { s.coins = 1e40; buyStage(s); }
    if (r.kind === "hold") { s.overdrive = 1; r.progress = r.target; }
    if (r.kind === "buys") countPurchase(s, r.target);
    const news = tickEvents(s, 0.05, false);
    expect(news).toContainEqual(expect.objectContaining({ type: "resolve", kind: "request" }));
    expect(s.events.streak).toBe(1);
  });

  it("los fragmentos de recuerdo dan un bonus permanente que sobrevive a la fundición", () => {
    const s = midGame();
    const before = incomePerSecond(s);
    spawnEvent(s, "fragment");
    actOnEvent(s);
    expect(s.events.fragments).toBe(1);
    expect(incomePerSecond(s)).toBeGreaterThan(before);
    rebirth(s);
    expect(s.events.fragments).toBe(1);
    expect(s.events.buffs).toEqual([]);
  });
});

describe("pedido de sobremarcha", () => {
  it("siempre se puede cumplir antes de que el motor se gripe", () => {
    for (const radiator of [0, 2, 4]) {
      const s = newGame();
      s.coins = 1e12;
      buyMotor(s, 10);
      for (let i = 0; i < 3; i++) buyStage(s);
      s.brassUpgrades.radiator = radiator;
      // Probar valores del azar hasta que salga un pedido de mantener la sobremarcha.
      let request = makeRequest(s, () => 0).request;
      for (let r = 0; request.kind !== "hold" && r < 1; r += 0.05) request = makeRequest(s, () => r).request;
      expect(request.kind).toBe("hold");
      let held = 0;
      for (let t = 0; t < 60 && s.stall === 0; t += CONFIG.tickSeconds) {
        tick(s, { overdriveHeld: true }, CONFIG.tickSeconds);
        if (s.overdrive > 0.9 && s.stall === 0) held += CONFIG.tickSeconds;
      }
      expect(held).toBeGreaterThan(request.target);
    }
  });
});

describe("resonancia", () => {
  it("solo cuentan los clics al compás, y con 3 aciertos da un multiplicador", () => {
    const s = newGame();
    s.motorLevel = 1;
    spawnEvent(s, "resonance");
    const a = s.events.active!;
    a.elapsed = 0.4; // a mitad de compás: fallo
    expect(actOnEvent(s)).toMatchObject({ type: "progress", amount: -1 });
    for (let i = 1; i <= 3; i++) {
      a.elapsed = i * 0.8 + 0.05;
      expect(actOnEvent(s)).toMatchObject({ type: "progress", amount: i });
    }
    a.timeLeft = 0.01;
    const news = tickEvents(s, 0.05, false);
    expect(news).toContainEqual(expect.objectContaining({ type: "resolve", kind: "resonance" }));
    expect(s.events.buffs.some((b) => b.id === "resonance")).toBe(true);
  });
});
