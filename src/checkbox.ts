import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isUpKey,
  makeTheme,
  useKeypress,
  usePagination,
  usePrefix,
  useRef,
  useState,
} from "@inquirer/core";
import { cursorHide } from "@inquirer/ansi";
import { c } from "./colors.ts";

const GG_TIMEOUT_MS = 500;

export interface CheckboxChoice<Value> {
  readonly name: string;
  readonly value: Value;
  readonly checked?: boolean;
}

export interface CheckboxHints {
  readonly navigate: string;
  readonly jump: string;
  readonly toggle: string;
  readonly search: string;
  readonly filter: string;
  readonly apply: string;
  readonly clear: string;
  readonly save: string;
  readonly cancel: string;
  readonly searchLabel: string;
  readonly filterLabel: string;
  readonly selectedCount: (n: number) => string;
  readonly noMatch: string;
}

export interface CheckboxConfig<Value> {
  readonly message: string;
  readonly choices: ReadonlyArray<CheckboxChoice<Value>>;
  readonly pageSize?: number;
  readonly hints: CheckboxHints;
}

const checkboxTheme = {
  prefix: { idle: c.green("?"), done: c.green("✓") },
  spinner: { interval: 80, frames: ["⠋"] },
  style: {
    answer: (text: string) => c.cyan(text),
    message: (text: string) => c.bold(text),
    error: (text: string) => c.red(text),
    defaultAnswer: (text: string) => c.dim(text),
    help: (text: string) => c.dim(text),
    highlight: (text: string) => c.cyan(text),
    key: (text: string) => c.cyan(text),
    description: (text: string) => c.cyan(text),
    disabled: (text: string) => c.dim(text),
  },
  helpMode: "always" as const,
};

// printable single character that should land in the search query.
// excludes space (reserved for toggle in nav mode) and control bytes.
function isTypeableChar(seq: string | undefined): seq is string {
  return (
    typeof seq === "string" &&
    seq.length === 1 &&
    seq !== " " &&
    seq.charCodeAt(0) >= 0x20 &&
    seq.charCodeAt(0) !== 0x7f
  );
}

type Mode = "nav" | "search";

const promptImpl = createPrompt<unknown[] | null, CheckboxConfig<unknown>>(
  (config, done) => {
    const pageSize = config.pageSize ?? 12;
    const theme = makeTheme(checkboxTheme, undefined);
    const h = config.hints;
    const [status, setStatus] = useState<"idle" | "done">("idle");
    const [cancelled, setCancelled] = useState(false);
    const prefix = usePrefix({ status, theme });

    const all = config.choices;
    const [mode, setMode] = useState<Mode>("nav");
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const lastGAt = useRef(0);
    // selection as a Set replaced on every change so state updates fire
    const [selected, setSelected] = useState<ReadonlySet<unknown>>(
      () => new Set(all.filter((ch) => ch.checked).map((ch) => ch.value)),
    );

    const needle = query.toLowerCase();
    const filtered = needle
      ? all.filter((ch) => ch.name.toLowerCase().includes(needle))
      : all;

    const clampedActive = Math.min(active, Math.max(0, filtered.length - 1));

    const moveUp = () => setActive(clampedActive > 0 ? clampedActive - 1 : 0);
    const moveDown = () =>
      setActive(
        clampedActive < filtered.length - 1 ? clampedActive + 1 : clampedActive,
      );

    useKeypress((key) => {
      const seq = (key as unknown as { sequence?: string }).sequence;

      // ---- search mode: keystrokes build the query ----
      if (mode === "search") {
        if (key.name === "escape") {
          // clear the search and return to navigation
          setQuery("");
          setActive(0);
          setMode("nav");
          return;
        }
        if (isEnterKey(key)) {
          // apply the filter, keep it, go navigate the matches
          setMode("nav");
          return;
        }
        if (key.name === "backspace") {
          if (query.length > 0) {
            setQuery(query.slice(0, -1));
            setActive(0);
          } else {
            setMode("nav");
          }
          return;
        }
        // arrows still move the cursor while searching
        if (isUpKey(key, [])) return moveUp();
        if (isDownKey(key, [])) return moveDown();
        if (isTypeableChar(seq)) {
          setQuery(query + seq);
          setActive(0);
        }
        return;
      }

      // ---- nav mode: vim-style movement, space toggles, / searches ----
      if (key.name === "escape") {
        setCancelled(true);
        setStatus("done");
        done(null);
        return;
      }
      if (isEnterKey(key)) {
        setStatus("done");
        // preserve original choice order in the result
        done(all.filter((ch) => selected.has(ch.value)).map((ch) => ch.value));
        return;
      }
      if (seq === "/") {
        setMode("search");
        return;
      }
      if (key.name === "space" || seq === " ") {
        const item = filtered[clampedActive];
        if (item) {
          const next = new Set(selected);
          if (next.has(item.value)) next.delete(item.value);
          else next.add(item.value);
          setSelected(next);
        }
        return;
      }
      if (seq === "G") {
        setActive(Math.max(0, filtered.length - 1));
        return;
      }
      if (seq === "g") {
        const now = Date.now();
        if (now - lastGAt.current < GG_TIMEOUT_MS) {
          setActive(0);
          lastGAt.current = 0;
        } else {
          lastGAt.current = now;
        }
        return;
      }
      if (isUpKey(key, []) || seq === "k") return moveUp();
      if (isDownKey(key, []) || seq === "j") return moveDown();
    });

    const message = theme.style.message(config.message);
    const countStr = theme.style.help(h.selectedCount(selected.size));

    if (status === "done") {
      if (cancelled) return "";
      return [prefix, message, theme.style.answer(h.selectedCount(selected.size))]
        .filter(Boolean)
        .join(" ");
    }

    const page = usePagination({
      items: filtered,
      active: clampedActive,
      renderItem({ item, isActive }) {
        const isChecked = selected.has(item.value);
        const box = isChecked ? c.green("◉") : c.dim("◯");
        const cursor = isActive ? c.cyan(">") : " ";
        const label = isActive ? theme.style.highlight(item.name) : item.name;
        return `${cursor} ${box} ${label}`;
      },
      pageSize,
      loop: false,
    });

    // status line: search box while typing, applied-filter hint while navigating
    let statusLine: string;
    if (mode === "search") {
      statusLine = `  ${c.dim(h.searchLabel)} ${query}${c.cyan("▏")} ${countStr}`;
    } else if (query) {
      statusLine = `  ${c.dim(h.filterLabel)} ${c.cyan(query)} ${countStr}`;
    } else {
      statusLine = `  ${countStr}`;
    }

    const body = filtered.length === 0 ? `  ${c.dim(h.noMatch)}` : page;

    const keys: ReadonlyArray<readonly [string, string]> =
      mode === "search"
        ? [
            ["↑↓", h.navigate],
            ["a-z", h.filter],
            ["⏎", h.apply],
            ["esc", h.clear],
          ]
        : [
            ["↑↓ jk", h.navigate],
            ["gg/G", h.jump],
            ["space", h.toggle],
            ["/", h.search],
            ["⏎", h.save],
            ["esc", h.cancel],
          ];
    const helpLine = keys
      .map(([k, a]) => `${c.bold(k)} ${c.dim(a)}`)
      .join(c.dim(" • "));

    return (
      [[prefix, message].filter(Boolean).join(" "), statusLine, body, helpLine]
        .filter((line) => line !== "")
        .join("\n") + cursorHide
    );
  },
);

export async function filterableCheckbox<Value>(
  config: CheckboxConfig<Value>,
): Promise<Value[] | null> {
  const result = (await promptImpl(
    config as CheckboxConfig<unknown>,
  )) as Value[] | null;
  return result;
}
