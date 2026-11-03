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
  title: string,
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
