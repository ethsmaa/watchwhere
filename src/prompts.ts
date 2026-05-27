import * as readline from "node:readline";
import { c } from "./colors.ts";

export interface EditableInputOptions {
  message: string;
  prefill: string;
  validate?: (value: string) => true | string;
}

export function editableInput(opts: EditableInputOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    let prefill = opts.prefill;

    const ask = (): void => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      let answered = false;

      rl.on("SIGINT", () => {
        if (answered) return;
        answered = true;
        rl.close();
        const err = new Error("cancelled") as Error & { name: string };
        err.name = "ExitPromptError";
        reject(err);
      });

      rl.question(`${c.green("?")} ${opts.message} `, (answer) => {
        answered = true;
        rl.close();
        const validation = opts.validate?.(answer);
        if (validation === undefined || validation === true) {
          resolve(answer);
          return;
        }
        console.log(`  ${c.red("›")} ${validation}`);
        prefill = answer;
        ask();
      });

      // prompt needs to render first
      setImmediate(() => rl.write(prefill));
    };

    ask();
  });
}
