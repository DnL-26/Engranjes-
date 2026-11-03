import {
  Activity,
  Anvil,
  AudioWaveform,
  BellRing,
  BookOpen,
  Bot,
  CircleHelp,
  Clock,
  CloudLightning,
  Cog,
  Coins,
  createElement,
  Download,
  Drill,
  Droplet,
  Fan,
  Flame,
  FlaskConical,
  Gauge,
  Gem,
  Ghost,
  Handshake,
  Hourglass,
  Keyboard,
  Layers,
  Locate,
  Lock,
  Maximize2,
  MessageCircle,
  Music,
  Plus,
  Rocket,
  RotateCw,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Store,
  Target,
  Timer,
  Trash2,
  TriangleAlert,
  Trophy,
  Upload,
  Volume2,
  VolumeX,
  Wind,
  Wrench,
  Zap,
  ZapOff,
  type IconNode,
} from "lucide";
import { h } from "./dom";

/**
 * Iconos del juego (Lucide, licencia ISC). Se nombran por lo que significan en el juego, no por su
 * dibujo, para poder cambiar el dibujo sin tocar la interfaz.
 */
const ICONS = {
  motor: Fan,
  gear: Cog,
  rebirth: Flame,
  overdrive: Gauge,
  crank: RotateCw,
  memories: BookOpen,
  achievements: Trophy,
  viewAll: Maximize2,
  follow: Locate,
  settings: Settings,
  music: Music,
  sfx: Volume2,
  ambient: Wind,
  muted: VolumeX,
  calm: ZapOff,
  flashy: Zap,
  exportSave: Upload,
  importSave: Download,
  wipe: Trash2,
  keyboard: Keyboard,
  coins: Coins,
  clock: Clock,
  brass: Anvil,
  lock: Lock,
  plus: Plus,
  // Historia
  voice: MessageCircle,
  gem: Gem,
  bell: BellRing,
  hourglass: Hourglass,
  // Logros y mejoras
  layers: Layers,
  warning: TriangleAlert,
  timer: Timer,
  automaton: Bot,
  gearbox: SlidersHorizontal,
  wrench: Wrench,
  handshake: Handshake,
  target: Target,
  activity: Activity,
  wave: AudioWaveform,
  ghost: Ghost,
  drill: Drill,
  flask: FlaskConical,
  scroll: ScrollText,
  snow: Snowflake,
  rocket: Rocket,
  hammer: Anvil,
  // Eventos
  zap: Zap,
  droplet: Droplet,
  mystery: CircleHelp,
  storm: CloudLightning,
  store: Store,
  sparkles: Sparkles,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

/** Un icono SVG que hereda el color del texto y mide 1em (se escala con font-size). */
export function icon(name: IconName, cls = ""): SVGElement {
  const el = createElement(ICONS[name]);
  el.setAttribute("class", `ic ${cls}`.trim());
  el.setAttribute("aria-hidden", "true");
  el.removeAttribute("width");
  el.removeAttribute("height");
  return el;
}

/** Engranaje con un "+" en la esquina: añadir engranaje. */
export function gearPlusIcon(cls = ""): HTMLElement {
  return h("span", { class: `ic-stack ${cls}`.trim() }, icon("gear"), h("span", { class: "ic-badge" }, icon("plus")));
}

/** Etiqueta con icono delante: para botones y títulos. */
export function withIcon(name: IconName, text: string | Node, cls = ""): HTMLElement {
  return h("span", { class: `with-icon ${cls}`.trim() }, icon(name), typeof text === "string" ? h("span", {}, text) : text);
}
