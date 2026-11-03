import { brassCost, brassMaxed, BRASS } from "./brass";
import { CONFIG } from "./config";
import {
  brassForReset,
  clockProgress,
  MAX_TIER,
  motorCost,
  overdriveUnlocked,
  stageCost,
  stageCount,
  teethCost,
  teethMaxed,
  tierOf,
} from "./economy";
import type { GameState } from "./types";

/**
 * Todo lo que dice Anselmo, el relojero atrapado como vapor dentro del Gran Reloj. Los textos están
 * aquí juntos para poder retocarlos sin tocar la lógica.
 */

export type Expr = "normal" | "surprised" | "worried" | "proud";

export interface Line {
  expr: Expr;
  text: string;
}

const L = (expr: Expr, text: string): Line => ({ expr, text });

// --- Historia: se desbloquea con hitos, en orden ---

export interface StoryPage {
  id: string;
  /** Título en la lista de Recuerdos. */
  title: string;
  lines: Line[];
  when(s: GameState): boolean;
}

export const ENDING_ID = "final";

export const STORY: StoryPage[] = [
  {
    id: "intro",
    title: "Una voz en el mecanismo",
    lines: [
      L("surprised", "¿Eh…? ¿Quién anda ahí? ¿Alguien ha girado la manivela?"),
      L("normal", "Soy Anselmo Ruedas, el relojero. O lo que queda de él."),
      L("worried", "Hace once años el Gran Reloj se paró conmigo dentro. Desde entonces no soy más que vapor atrapado en el mecanismo."),
      L("normal", "Pero tus vueltas me llegan. Cada giro me devuelve un poco de mí. Si haces girar algo más rápido que nada en este mundo, el reloj despertará… y yo con él."),
      L("proud", "Empieza por lo pequeño, aprendiz. Gira la manivela."),
    ],
    when: () => true,
  },
  {
    id: "motor",
    title: "Un motor no se cansa",
    lines: [
      L("proud", "¡Un motor! No se cansa nunca. Ojalá yo tampoco."),
      L("normal", "Ahora piensa en relaciones: una rueda grande moviendo un piñón pequeño hace que el piñón vuele. Pon una detrás de otra y la velocidad se multiplica."),
    ],
    when: (s) => s.motorLevel > 0,
  },
  {
    id: "overdrive",
    title: "La palanca roja",
    lines: [
      L("normal", "¿Ves la palanca roja? La sobremarcha. Exprime el motor hasta el triple mientras la mantienes."),
      L("worried", "Pero lo calienta. Yo gripé tres motores antes de aprender a soltarla a tiempo. No pierdas de vista el calor."),
    ],
    when: (s) => stageCount(s) >= CONFIG.overdrive.unlockStages,
  },
  {
    id: "quantum",
    title: "El metal recuerda",
    lines: [
      L("surprised", "¿Has visto ese brillo? El metal recuerda cada vuelta: madera, cobre, bronce… y al final algo que ya no tiene nombre."),
      L("proud", "Yo lo llamé cuántico porque sonaba importante."),
    ],
    when: (s) => s.shafts.some((sh) => tierOf(sh.revs) >= MAX_TIER),
  },
  {
    id: "foundry",
    title: "El horno",
    lines: [
      L("normal", "Escucha, aprendiz: llegará un punto en que cada etapa cueste más de lo que aporta."),
      L("normal", "No te aferres al tren. Al fondo del taller está el horno: fúndelo cuando quieras. Cada engranaje que hayas construido te devolverá una pieza de latón."),
      L("proud", "El latón guarda la memoria de las máquinas que fueron. Con él construirás mejor."),
    ],
    when: (s) => s.rebirths > 0 || stageCount(s) >= 6,
  },
  {
    id: "brass",
    title: "Moldes y motores",
    lines: [
      L("proud", "¡Ja! Ahora entiendes por qué el taller está lleno de moldes."),
      L("normal", "Con el latón puedes montar motores en paralelo, tallar piñones más finos, dibujar planos… Lo tienes todo en la fundición."),
      L("surprised", "Y fíjate: después de fundir me siento… más cerca. El reloj recuerda lo que ya hiciste."),
    ],
    when: (s) => s.rebirths > 0,
  },
  {
    id: "tremor",
    title: "Un temblor en la plaza",
    lines: [
      L("surprised", "¿Lo has notado? La aguja del Gran Reloj se ha movido. Solo un temblor, pero se ha movido."),
      L("normal", "Hay gente en la plaza mirando hacia arriba. Y yo… ya casi me veo las manos."),
    ],
    when: (s) => clockProgress(s) >= 0.5,
  },
  {
    id: "lastpage",
    title: "Casi",
    lines: [
      L("worried", "Queda poco. Noto cómo los engranajes del reloj intentan moverse a mi alrededor…"),
      L("normal", "Cuando el último engranaje deje de verse, el reloj empezará a oírse. Sigue, aprendiz. No pares ahora."),
    ],
    when: (s) => clockProgress(s) >= 0.85,
  },
  {
    id: ENDING_ID,
    title: "El Gran Reloj da la hora",
    lines: [
      L("surprised", "¿Oyes eso?"),
      L("proud", "¡El Gran Reloj de Valdehierro da la hora! Por primera vez en once años."),
      L("normal", "La plaza se llena de gente. Alguien llora, alguien se ríe. Las palomas vuelven a la torre."),
      L("proud", "Y yo… mírame. Vuelvo a ser yo. Me has devuelto el tiempo, aprendiz."),
      L("normal", "El taller es tuyo. Sigue girando. Pasaré a verte de vez en cuando."),
    ],
    when: (s) => s.bestRps >= CONFIG.story.targetRps,
  },
];

// --- Reacciones: a lo que acaba de pasar. Las "once" solo se dicen la primera vez ---

export type ReactionId =
  | "firstStage"
  | "firstMaterial"
  | "firstMaxTeeth"
  | "firstOverdrive"
  | "firstStall"
  | "stallAgain"
  | "firstBrass"
  | "rebirthAgain";

export const REACTIONS: Record<ReactionId, { once: boolean; lines: Line[] }> = {
  firstStage: { once: true, lines: [L("proud", "¡Eso es! Mira cómo vuela ese piñón. Y cada etapa que añadas multiplicará todo lo de detrás.")] },
  firstMaterial: { once: true, lines: [L("surprised", "¿Ves cómo cambia de color? Cuantas más vueltas da un eje, mejor es su metal. Y todo el taller produce más.")] },
  firstMaxTeeth: { once: true, lines: [L("normal", "Esa rueda ya no admite más dientes. Cuando todas estén así, toca otra etapa.")] },
  firstOverdrive: { once: true, lines: [L("surprised", "¡Uy! Siento el temblor hasta aquí dentro. ¡Más, más… pero vigila el calor!")] },
  firstStall: { once: true, lines: [L("worried", "¡Suelta la palanca! Lo has gripado… Espera a que se enfríe; la próxima vez suéltala antes de llegar al rojo.")] },
  stallAgain: { once: false, lines: [L("worried", "Otra vez gripado… Ese motor necesita un radiador.")] },
  firstBrass: { once: true, lines: [L("proud", "Bien invertido. El latón nunca olvida.")] },
  rebirthAgain: { once: false, lines: [L("proud", "El horno ruge… ¡A empezar de nuevo, y más fuertes que antes!")] },
};

// --- Consejos: cuando llevas un rato sin comprar, o si pulsas a Anselmo ---

export interface TipContext {
  /** Segundos desde la última compra. */
  idle: number;
}

export interface Tip {
  id: string;
  when(s: GameState, ctx: TipContext): boolean;
  lines: Line[];
}

/** Por orden de prioridad: se dice el primero que se cumpla. */
export const TIPS: Tip[] = [
  {
    id: "crank",
    when: (s) => s.motorLevel === 0 && s.coins < motorCost(0),
    lines: [L("normal", "Haz clic en el taller o pulsa Espacio para girar la manivela. Cuando tengas monedas, instala un motor.")],
  },
  {
    id: "motor",
    when: (s) => s.motorLevel === 0 && s.coins >= motorCost(0),
    lines: [L("proud", "¡Ya puedes pagar un motor! Así no tendrás que girar la manivela tú solo.")],
  },
  {
    id: "stage",
    when: (s) => s.coins >= stageCost(stageCount(s) + 1),
    lines: [L("normal", "Tienes para otro engranaje, aprendiz. Cada etapa nueva multiplica la velocidad de la salida.")],
  },
  {
    id: "teeth",
    when: (s) => s.shafts.some((_, i) => i > 0 && !teethMaxed(s, i) && teethCost(i, s.shafts[i].teethLevel) <= s.coins),
    lines: [L("normal", "Las ruedas aún admiten dientes. Abre el taller de engranajes y súbelos: más dientes, más velocidad.")],
  },
  {
    id: "brassShop",
    when: (s) => BRASS.some((d) => !brassMaxed(s, d.id) && brassCost(s, d.id) <= s.brass),
    lines: [L("proud", "Tienes latón sin gastar. Pásate por la fundición: los motores en paralelo hacen milagros.")],
  },
  {
    id: "rebirth",
    when: (s, ctx) => ctx.idle > 120 && brassForReset(s) >= 5,
    lines: [L("worried", "El tren ya no da más de sí, ¿verdad? Fúndelo. Cada engranaje te dará una pieza de latón y volverás más fuerte.")],
  },
  {
    id: "overdrive",
    when: (s) => overdriveUnlocked(s) && s.heat === 0 && s.stall === 0,
    lines: [L("normal", "La palanca roja está fría. Mantén la sobremarcha unos segundos y suéltala antes de que el motor se ponga al rojo.")],
  },
];

/** Si no hay consejo útil y lo pulsas, Anselmo dice algo de esto. */
export const SMALL_TALK: Line[] = [
  L("normal", "¿Oyes eso? El reloj respira un poco más fuerte que ayer."),
  L("proud", "Once años sin hablar con nadie… perdona si me enrollo."),
  L("surprised", "¿Sabías que el primer reloj de esta torre lo hizo mi abuelo? Tenía un solo engranaje y se retrasaba una hora al día."),
  L("normal", "Un buen relojero no tiene prisa. Un buen relojero hace que las cosas giren deprisa. No es lo mismo."),
  L("worried", "A veces, entre vuelta y vuelta, se me olvida cómo era el sol."),
  L("proud", "Me gusta cómo trabajas, aprendiz."),
];

/** Consejo para este momento, o null si no hay ninguno útil. */
export function pickTip(s: GameState, ctx: TipContext, exclude?: string): Tip | null {
  for (const t of TIPS) if (t.id !== exclude && t.when(s, ctx)) return t;
  return null;
}

// --- Eventos aleatorios: Anselmo los anuncia y comenta cómo acaban ---

/** Clave: "spawn:<evento>", o "<evento>:<resultado>" al resolverse o perderse. */
export const EVENT_LINES: Record<string, Line> = {
  "spawn:golden": L("surprised", "¡Un engranaje dorado! ¡Atrápalo antes de que se vaya rodando!"),
  "spawn:bell": L("surprised", "¡La campana! Mientras suene, cada vuelta de manivela vale cincuenta. ¡Gira, gira!"),
  "spawn:fragment": L("worried", "Esa voluta… es un trozo de mí. ¿Me lo recoges?"),
  "spawn:jam": L("worried", "¡Se ha atascado una etapa! Dale unos golpes, rápido."),
  "spawn:pigeon": L("normal", "Una paloma de la torre se ha posado en los engranajes. Espántala antes de que se ponga cómoda."),
  "spawn:oil": L("normal", "Huele a aceite fresco. Engrasa el tren y girará más suave."),
  "spawn:unstable": L("worried", "Esa rueda vibra demasiado… Cuanto más esperes, más rinde. Pero si revienta, perderás dientes."),
  "spawn:peddler": L("normal", "El chatarrero pasa por la puerta. Sus ofertas son raras, pero a veces merecen la pena."),
  "spawn:storm": L("surprised", "¡Tormenta! Los rayos enfrían el motor: ¡ahora, la palanca roja, sin miedo!"),
  "spawn:request": L("proud", "¡Un vecino nos pide algo! Si lo cumples a tiempo, sabrán agradecértelo."),
  "spawn:resonance": L("surprised", "¿Oyes ese pulso? El tren resuena. Pulsa al compás del anillo."),
  "golden:frenzy": L("proud", "¡Frenesí! Todo gira siete veces más deprisa. ¡Aprovéchalo!"),
  "golden:cool": L("proud", "El motor, frío como el primer día. ¡Mete la sobremarcha!"),
  "jam:perfect": L("proud", "¡Reparación perfecta! Así se hace, aprendiz."),
  "jam:autofix": L("worried", "Al final se ha soltado solo… pero hemos perdido un buen rato."),
  "pigeon:brass": L("surprised", "¡Ja! Se le ha caído una pepita de latón al huir."),
  "unstable:stabilized": L("proud", "¡Justo a tiempo! Esa rueda va a rendir de lo lindo."),
  "unstable:broke": L("worried", "¡Ay! Ha reventado. Unos dientes menos… la próxima vez, estabilízala antes."),
  "peddler:mystery": L("surprised", "¡Vaya, el engranaje misterioso funciona!"),
  "peddler:junk": L("worried", "Chatarra. Ese truhán siempre se guarda un truco."),
  "peddler:elixir": L("surprised", "¡Uf, cómo quema ese elixir! Vigila el calor."),
  "request:done": L("proud", "¡Pedido cumplido! En la plaza ya hablan de ti."),
  "request:failed": L("worried", "No ha dado tiempo. Ya habrá otro pedido."),
  "resonance:tuned": L("proud", "¡En perfecta armonía! Así canta un buen tren."),
  "resonance:offbeat": L("normal", "Se nos ha ido el compás. No pasa nada, el tren volverá a resonar."),
};

/** Un fragmento de recuerdo por cada uno recogido, en orden. */
export const FRAGMENTS: Line[] = [
  L("normal", "Recuerdo el olor del taller de mi padre: aceite, serrín y pan recién hecho de la casa de al lado."),
  L("proud", "Mi primer reloj se retrasaba diez minutos al día. Lo regalé igual. Mi madre lo llevó hasta el final."),
  L("normal", "Valdehierro tenía feria cada otoño. Yo subía a la torre para ver los farolillos desde arriba."),
  L("worried", "Hubo un invierno en que el reloj se heló. Pasé tres noches calentando los ejes con velas."),
  L("proud", "Una vez construí un pájaro mecánico que cantaba las horas. Se lo llevó un conde. Nunca supe si siguió cantando."),
  L("normal", "Tuve un aprendiz antes que tú. Se marchó a la ciudad a hacer relojes de bolsillo. Me escribía cada Navidad."),
  L("worried", "La noche que se paró el reloj llovía. Subí a ajustar el escape… y el tiempo se cerró a mi alrededor como una mano."),
  L("normal", "Desde dentro, los años no pasan: gotean. Cada gota, una vuelta que nadie daba."),
  L("surprised", "¡Ahora me acuerdo! Dejé tu nombre en el cuaderno porque sabía que vendrías. No sé cómo lo sabía."),
  L("proud", "El secreto del Gran Reloj no está en un engranaje, sino en la relación entre todos. Como en un pueblo."),
  L("normal", "Echo de menos las campanadas de mediodía. La gente dejaba lo que hacía y miraba arriba, aunque supiera la hora."),
  L("proud", "Ya está. Me tengo entero, aprendiz. Gracias por recoger cada pedazo."),
];
