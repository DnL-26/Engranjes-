import { brassLevel } from "./brass";
import { CONFIG } from "./config";
import { gearOf, MAX_TIER, teethMaxed, tierOf } from "./economy";
import type { GameState } from "./types";

/**
 * Logros: hitos con nombre que dan un pequeño bonus permanente de ingresos cada uno
 * (CONFIG.achievementBonus). Se comprueban unas veces por segundo; una vez conseguidos no se pierden.
 */
export interface Achievement {
  id: string;
  name: string;
  /** Qué hay que hacer. Se ve aunque no esté conseguido, para que sirva de objetivo. */
  desc: string;
  check(s: GameState): boolean;
}

const quantumCount = (s: GameState) => s.shafts.filter((sh) => tierOf(sh.revs) >= MAX_TIER).length;
const maxedCount = (s: GameState) => s.shafts.filter((_, i) => i > 0 && teethMaxed(s, i)).length;
const gearboxes = (s: GameState) => s.shafts.filter((_, i) => i > 0 && gearOf(s, i) !== 0).length;

const A = (id: string, name: string, desc: string, check: (s: GameState) => boolean): Achievement => ({ id, name, desc, check });

export const ACHIEVEMENTS: Achievement[] = [
  // Primeros pasos
  A("firstTurn", "Primera vuelta", "Da una vuelta completa con la manivela.", (s) => s.shafts[0].revs >= 1 || s.motorLevel > 0),
  A("motor1", "Motorizado", "Instala un motor.", (s) => s.motorLevel >= 1),
  A("motor25", "Buen motor", "Sube el motor al nivel 25.", (s) => s.motorLevel >= 25),
  A("motor100", "Motor de catedral", "Sube el motor al nivel 100.", (s) => s.motorLevel >= 100),
  A("crank100", "Brazo de hierro", "Gira la manivela 100 veces.", (s) => s.stats.crankClicks >= 100),
  A("crank1000", "Brazo de acero", "Gira la manivela 1.000 veces.", (s) => s.stats.crankClicks >= 1000),
  A("crank10000", "Brazo cuántico", "Gira la manivela 10.000 veces.", (s) => s.stats.crankClicks >= 10000),

  // Etapas
  A("stages1", "Engranado", "Añade tu primer engranaje.", (s) => s.maxStages >= 1),
  A("stages5", "Tren de cinco", "Llega a 5 etapas.", (s) => s.maxStages >= 5),
  A("stages10", "Diez pisos", "Llega a 10 etapas.", (s) => s.maxStages >= 10),
  A("stages20", "Media torre", "Llega a 20 etapas.", (s) => s.maxStages >= 20),
  A("stages30", "Torre entera", "Llega a 30 etapas.", (s) => s.maxStages >= 30),
  A("stages50", "Rascacielos", "Llega a 50 etapas.", (s) => s.maxStages >= 50),
  A("stages75", "Escalera al cielo", "Llega a 75 etapas.", (s) => s.maxStages >= 75),

  // Velocidad
  A("rps1e3", "Zumbido", "Que la salida gire a mil vueltas por segundo.", (s) => s.bestRps >= 1e3),
  A("rps1e6", "Silbido", "Un millón de vueltas por segundo.", (s) => s.bestRps >= 1e6),
  A("rps1e12", "Borrón", "Un billón de vueltas por segundo.", (s) => s.bestRps >= 1e12),
  A("rps1e20", "Al rojo blanco", "10²⁰ vueltas por segundo.", (s) => s.bestRps >= 1e20),
  A("rps1e30", "Más rápido que la luz (casi)", "10³⁰ vueltas por segundo.", (s) => s.bestRps >= 1e30),
  A("rps1e60", "Más allá del reloj", "10⁶⁰ vueltas por segundo.", (s) => s.bestRps >= 1e60),
  A("rps1e100", "Gúgol", "10¹⁰⁰ vueltas por segundo.", (s) => s.bestRps >= 1e100),

  // Materiales y dientes
  A("bronze", "Edad del bronce", "Que un eje llegue a Bronce.", (s) => s.shafts.some((sh) => tierOf(sh.revs) >= 2)),
  A("steel", "Edad del acero", "Que un eje llegue a Acero.", (s) => s.shafts.some((sh) => tierOf(sh.revs) >= 4)),
  A("quantum1", "Sin nombre", "Que un eje llegue a Cuántico.", (s) => quantumCount(s) >= 1),
  A("quantum5", "Quinteto cuántico", "Ten 5 ejes Cuánticos a la vez.", (s) => quantumCount(s) >= 5),
  A("quantum10", "Orquesta cuántica", "Ten 10 ejes Cuánticos a la vez.", (s) => quantumCount(s) >= 10),
  A("maxTeeth1", "Ni un diente más", "Llena de dientes una rueda.", (s) => maxedCount(s) >= 1),
  A("maxTeeth10", "Dentadura completa", "Ten 10 ruedas llenas de dientes a la vez.", (s) => maxedCount(s) >= 10),

  // Sobremarcha
  A("stall1", "Olor a quemado", "Gripa el motor por primera vez.", (s) => s.stats.stalls >= 1),
  A("stall10", "Aprendiz testarudo", "Gripa el motor 10 veces.", (s) => s.stats.stalls >= 10),
  A("hold10", "Sangre fría", "Mantén la sobremarcha 10 segundos seguidos sin gripar.", (s) => s.stats.maxHold >= 10),

  // Fundición y latón
  A("rebirth1", "Al horno", "Funde el tren por primera vez.", (s) => s.rebirths >= 1),
  A("rebirth5", "Fundidor", "Funde el tren 5 veces.", (s) => s.rebirths >= 5),
  A("rebirth25", "Maestro fundidor", "Funde el tren 25 veces.", (s) => s.rebirths >= 25),
  A("bigMelt", "Paciencia de relojero", "Consigue 30 de latón en una sola fundición.", (s) => s.stats.lastRebirthGain >= 30),
  A("motors3", "Trío de motores", "Ten 3 motores en paralelo.", (s) => brassLevel(s, "motors") >= 2),
  A("pinion6", "Piñón de seis", "Talla piñones de 6 dientes.", (s) => brassLevel(s, "pinion") >= 2),
  A("automaton", "Manos libres", "Compra el autómata.", (s) => brassLevel(s, "automaton") >= 1),

  // Cajas de cambios
  A("gearbox1", "Cambio de marcha", "Instala una caja de cambios.", (s) => gearboxes(s) >= 1),
  A("gearbox5", "Conductor", "Ten 5 cajas de cambios a la vez.", (s) => gearboxes(s) >= 5),
  A("shift50", "Caja nerviosa", "Cambia de marcha 50 veces.", (s) => s.stats.gearShifts >= 50),

  // Eventos
  A("golden1", "Oro que rueda", "Atrapa un engranaje dorado.", (s) => s.stats.goldenCaught >= 1),
  A("golden25", "Buscador de oro", "Atrapa 25 engranajes dorados.", (s) => s.stats.goldenCaught >= 25),
  A("perfect", "Mano de mecánico", "Haz una reparación perfecta de un atasco.", (s) => s.stats.perfectRepairs >= 1),
  A("request1", "Buen vecino", "Cumple un pedido del pueblo.", (s) => s.stats.requestsDone >= 1),
  A("request10", "Orgullo de Valdehierro", "Cumple 10 pedidos del pueblo.", (s) => s.stats.requestsDone >= 10),
  A("streak5", "Atento", "Consigue una racha de 5 eventos.", (s) => s.stats.maxStreak >= 5),
  A("streak10", "Ojo de halcón", "Consigue una racha de 10 eventos.", (s) => s.stats.maxStreak >= 10),
  A("unstable5", "Al filo", "Estabiliza un engranaje inestable a ×5 o más.", (s) => s.stats.bestUnstable >= 5),
  A("resonance6", "Oído absoluto", "Acierta 6 compases en una resonancia.", (s) => s.stats.bestResonance >= 6),
  A("junk", "Timado", "Compra chatarra al chatarrero.", (s) => s.stats.peddlerJunk >= 1),
  A("fragments", "Anselmo entero", "Recoge los 12 fragmentos de recuerdo.", (s) => s.events.fragments >= 12),

  // Historia y tiempo
  A("ending", "El Gran Reloj da la hora", "Haz que el Gran Reloj vuelva a andar.", (s) => s.story.ended),
  A("hour1", "Una hora en el taller", "Juega una hora.", (s) => s.timeAll >= 3600),
  A("hour5", "Inquilino de la torre", "Juega cinco horas.", (s) => s.timeAll >= 5 * 3600),
];

export function achievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Comprueba los logros pendientes; devuelve los recién conseguidos. */
export function checkAchievements(s: GameState): string[] {
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.achievements.includes(a.id) || !a.check(s)) continue;
    s.achievements.push(a.id);
    fresh.push(a.id);
  }
  return fresh;
}

export function achievementBonusText(s: GameState): string {
  return `+${Math.round(s.achievements.length * CONFIG.achievementBonus * 100)}% de ingresos`;
}
