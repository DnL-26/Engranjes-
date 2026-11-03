type Child = Node | string;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) el.className = cls;
  Object.assign(el, rest);
  el.append(...children);
  return el;
}

/** Evita tocar el DOM si el texto no cambió (se llama cada frame). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta #${id} en index.html`);
  return el as T;
}

// --- Tooltip ---

let tipEl: HTMLElement | null = null;
let tipOwner: Element | null = null;
let tipRender: (() => Child[]) | null = null;

function tipNode(): HTMLElement {
  if (!tipEl) {
    tipEl = h("div", { class: "tooltip", hidden: true, role: "tooltip" });
    document.body.append(tipEl);
  }
  return tipEl;
}

/** Coloca el tooltip junto al puntero sin salirse de la ventana. */
function placeTip(x: number, y: number): void {
  const t = tipNode();
  const pad = 12;
  const w = t.offsetWidth;
  const hgt = t.offsetHeight;
  const left = x + 16 + w > window.innerWidth - pad ? x - 16 - w : x + 16;
  const top = y + 18 + hgt > window.innerHeight - pad ? y - 12 - hgt : y + 18;
  t.style.left = `${Math.max(pad, left)}px`;
  t.style.top = `${Math.max(pad, top)}px`;
}

/** Vuelve a dibujar el tooltip visible (para datos que cambian mientras se mira, como la velocidad). */
export function refreshTooltip(): void {
  if (tipOwner && tipRender && tipEl && !tipEl.hidden) {
    if (!tipOwner.isConnected) hideTooltip();
    else tipEl.replaceChildren(...tipRender());
  }
}

export function hideTooltip(): void {
  tipOwner = null;
  tipRender = null;
  if (tipEl) tipEl.hidden = true;
}

/**
 * Descripción flotante al pasar el ratón (o al enfocar con el teclado). `render` se llama al
 * mostrarla y tras cada clic, para que refleje el estado del momento.
 */
export function tooltip(el: HTMLElement, render: () => Child[]): void {
  const show = (x: number, y: number) => {
    const t = tipNode();
    tipOwner = el;
    tipRender = render;
    t.replaceChildren(...render());
    t.hidden = false;
    placeTip(x, y);
  };
  el.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "touch") show(e.clientX, e.clientY);
  });
  el.addEventListener("pointermove", (e) => {
    if (tipOwner === el) placeTip(e.clientX, e.clientY);
  });
  el.addEventListener("pointerleave", () => {
    if (tipOwner === el) hideTooltip();
  });
  el.addEventListener("focus", () => {
    const r = el.getBoundingClientRect();
    show(r.right, r.top);
  });
  el.addEventListener("blur", () => {
    if (tipOwner === el) hideTooltip();
  });
  el.addEventListener("click", () => {
    if (tipOwner === el) tipNode().replaceChildren(...render());
  });
}

export interface ModalAction {
  label: string;
  primary?: boolean;
  onClick?: () => void;
}

let closeCurrent: (() => void) | null = null;

export function isModalOpen(): boolean {
  return closeCurrent !== null;
}

/** Modal propio: Electron no soporta window.prompt, así que no lo usamos. Esc lo cierra. */
export function showModal(
  title: string | Node,
  body: Child | Child[],
  actions: ModalAction[],
  opts: { wide?: boolean; onClose?: () => void } = {},
): () => void {
  closeCurrent?.();
  const root = byId("modal");
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  const close = () => {
    hideTooltip();
    root.hidden = true;
    root.replaceChildren();
    window.removeEventListener("keydown", onKey);
    closeCurrent = null;
    opts.onClose?.();
  };
  closeCurrent = close;
  window.addEventListener("keydown", onKey);
  const buttons = actions.map((a) =>
    h("button", {
      class: a.primary ? "primary" : "",
      onclick: () => {
        close();
        a.onClick?.();
      },
    }, a.label),
  );
  root.replaceChildren(
    h("div", { class: opts.wide ? "modal-card wide" : "modal-card" },
      h("h2", {}, title),
      h("div", { class: "modal-body" }, ...(Array.isArray(body) ? body : [body])),
      h("div", { class: "modal-actions" }, ...buttons),
    ),
  );
  root.hidden = false;
  return close;
}
