import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isUpKey,
  makeTheme,
  useKeypress,
  usePagination,
  usePrefix,
  useState,
} from "@inquirer/core";
import { c } from "./colors.ts";

export interface PickerChoice<Value> {
  readonly name: string;
  readonly value: Value;
  readonly description?: string;
}

export interface PickerConfig<Value> {
  readonly message: string;
  readonly choices: ReadonlyArray<PickerChoice<Value>>;
  readonly pageSize?: number;
  readonly extraKeys?: ReadonlyArray<readonly [string, string]>;
}

const pickerTheme = {
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

const promptImpl = createPrompt<unknown | null, PickerConfig<unknown>>(
  (config, done) => {
    const pageSize = config.pageSize ?? 10;
    const theme = makeTheme(pickerTheme, undefined);
    const [status, setStatus] = useState<"idle" | "done">("idle");
    const [cancelled, setCancelled] = useState(false);
    const prefix = usePrefix({ status, theme });
    const items = config.choices;
    const [active, setActive] = useState(0);

    useKeypress((key) => {
      if (key.name === "escape") {
        setCancelled(true);
        setStatus("done");
        done(null);
        return;
      }
      if (isEnterKey(key)) {
        setStatus("done");
        const chosen = items[active];
        if (chosen) done(chosen.value);
        return;
      }
      if (isUpKey(key, [])) {
        if (active > 0) setActive(active - 1);
        return;
      }
      if (isDownKey(key, [])) {
        if (active < items.length - 1) setActive(active + 1);
        return;
      }
    });

    const message = theme.style.message(config.message);

    if (status === "done") {
      if (cancelled) return "";
      const chosen = items[active];
      return [prefix, message, theme.style.answer(chosen?.name ?? "")]
        .filter(Boolean)
        .join(" ");
    }

    const page = usePagination({
      items,
      active,
      renderItem({ item, isActive }) {
        const color = isActive ? theme.style.highlight : (x: string) => x;
        const cursor = isActive ? ">" : " ";
        return color(`${cursor} ${item.name}`);
      },
      pageSize,
      loop: false,
    });

    const description = items[active]?.description;
    const helpLine = [
      ["↑↓", "navigate"],
      ["⏎", "select"],
      ...(config.extraKeys ?? []),
    ]
      .map(([k, a]) => `${c.bold(k!)} ${c.dim(a!)}`)
      .join(c.dim(" • "));

    return [
      [prefix, message].filter(Boolean).join(" "),
      page,
      description ? `\n${theme.style.description(description)}` : "",
      helpLine,
    ]
      .filter((line) => line !== "")
      .join("\n");
  },
);

export async function picker<Value>(
  config: PickerConfig<Value>,
): Promise<Value | null> {
  const result = (await promptImpl(
    config as PickerConfig<unknown>,
  )) as Value | null;
  return result;
}
