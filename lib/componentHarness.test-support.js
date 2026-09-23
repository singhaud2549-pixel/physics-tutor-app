import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";

// Run the real component handlers with deterministic hooks and canvas/network fakes.
// This does not emulate Safari's event delivery; device verification is still needed.
export async function componentHarness(path, props, globals = {}) {
  const slots = [];
  const pending = [];
  let cursor = 0;
  let tree;
  const hooks = {
    useRef(value) {
      const i = cursor++;
      return (slots[i] ??= { current: value });
    },
    useState(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value;
      return [slots[i], (v) => { slots[i] = typeof v === "function" ? v(slots[i]) : v; }];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((v, j) => v !== slots[i].deps[j])) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((v, j) => v !== slots[i][j])) pending.push(fn);
      slots[i] = deps;
    },
    h(type, props, ...children) {
      if (type === "canvas" && props.ref) props.ref.current = globals.canvas;
      return { type, props: props || {}, children: children.flat(Infinity).filter(Boolean) };
    },
    Fragment: "fragment",
    ...globals,
  };
  const source = readFileSync(path, "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace("export default function", "function");
  const name = /function (\w+)/.exec(source)[1];
  const { code } = await transformWithOxc(source, "component.jsx", {
    jsx: { runtime: "classic", pragma: "h", pragmaFrag: "Fragment" },
  });
  const Component = new Function(...Object.keys(hooks), `${code}\nreturn ${name};`)(...Object.values(hooks));
  function render() {
    cursor = 0;
    tree = Component(props);
    pending.splice(0).forEach((fn) => fn());
    return tree;
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of node.children || []) {
      const found = find(predicate, child);
      if (found) return found;
    }
    return null;
  }
  render();
  return { render, find };
}
