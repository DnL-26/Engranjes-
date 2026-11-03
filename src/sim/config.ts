/** Todos los números de balance del juego. */
export const CONFIG = {
  /** Paso fijo de la simulación, en segundos. */
  tickSeconds: 0.05,

  /** Dientes del piñón de cada eje; la relación de una etapa es dientes_rueda / pinionTeeth. */
  pinionTeeth: 8,
  baseWheelTeeth: 12,
  teethPerLevel: 2,
  maxTeethLevel: 20,

  /** Monedas por vuelta de cada eje, antes de multiplicadores. */
  payoutPerRev: 1,

  motor: {
    baseCost: 10,
    costGrowth: 1.15,
    rpsPerLevel: 0.5,
    /** La velocidad del motor se duplica cada tantos niveles. */
    doubleEvery: 50,
  },

  /**
   * Coste de la etapa n (1, 2, 3…) = baseCost × costGrowth^(n−1) × quadGrowth^((n−1)(n−2)/2).
   * El término cuadrático garantiza un muro aunque las mejoras de latón suban lo que da cada etapa.
   */
  stage: {
    baseCost: 40,
    costGrowth: 30,
    quadGrowth: 1.06,
  },

  /** Coste de un nivel de dientes = coste_de_su_etapa × costFactor × costGrowth^nivel. */
  teeth: {
    costFactor: 0.4,
    costGrowth: 1.25,
  },

  /** Cada nivel de material de cualquier eje multiplica los ingresos por esto. */
  tierMult: 1.1,

  /** Fundición: latón por cada engranaje construido en el ciclo. */
  brassPerStage: 1,

  /** Niveles de dientes extra por nivel de Fresadora. */
  millLevels: 4,

  /** El autómata compra cada tantos segundos. */
  automatonInterval: 0.5,

  story: {
    /** Velocidad de salida (vueltas/s) a la que el Gran Reloj vuelve a andar: el final. */
    targetRps: 1e40,
  },

  crank: {
    /** Impulso mínimo de un clic, en vueltas/s (es lo único que mueve el tren antes del motor). */
    impulse: 1,
    /** Con motor, un clic suma esta fracción de su velocidad. */
    motorShare: 0.25,
    /** El impulso acumulado no pasa de tantos clics. */
    maxImpulses: 4,
    /** Constante de tiempo con la que decae el impulso. */
    decaySeconds: 0.8,
  },

  /** Constante de tiempo con la que el motor alcanza su velocidad (arranque, gripado). */
  inertiaSeconds: 0.6,

  overdrive: {
    unlockStages: 3,
    maxMult: 3,
    rampPerSec: 2,
    releasePerSec: 3,
    heatPerSec: 0.18,
    coolPerSec: 0.12,
    stallSeconds: 8,
  },

  /** Tope de cualquier cantidad: por encima, los números de coma flotante se desbordan a Infinity. */
  maxNumber: 1e300,

  offline: {
    maxSeconds: 8 * 3600,
    maxSteps: 2000,
  },
};

export const MATERIALS = [
  { name: "Madera", color: "#9a6b3f", edge: "#5e3f22", glow: null },
  { name: "Cobre", color: "#c87a4a", edge: "#7d4325", glow: null },
  { name: "Bronce", color: "#c99a4b", edge: "#7a5a22", glow: null },
  { name: "Hierro", color: "#8a8d91", edge: "#4c4f53", glow: null },
  { name: "Acero", color: "#a9b9c9", edge: "#5c6b7a", glow: null },
  { name: "Titanio", color: "#c9c3d6", edge: "#6f6880", glow: null },
  { name: "Tungsteno", color: "#5b6070", edge: "#2c303b", glow: "#7f8cff" },
  { name: "Cristal", color: "#9fe8f0", edge: "#3f9aa6", glow: "#9fe8f0" },
  { name: "Plasma", color: "#ff6fd8", edge: "#a0287f", glow: "#ff6fd8" },
  { name: "Estelar", color: "#ffe27a", edge: "#b08a1a", glow: "#fff1b0" },
  { name: "Cuántico", color: "#f4f4ff", edge: "#7a7aff", glow: "#b9b9ff" },
] as const;
