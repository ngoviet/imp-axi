import { runAxiCli, type AxiCliCommand } from "axi-sdk-js";
import { homeHeader, homeView } from "./commands/home.js";
import { COMMANDS, DESCRIPTION, topLevelHelp } from "./registry.js";
import { defaultRuntime, type Runtime } from "./runtime.js";
import { VERSION } from "./version.js";

export interface MainOptions {
  argv?: string[];
  stdout?: { write: (chunk: string) => unknown };
  runtime?: Runtime;
}

/** Lệnh luôn trả `help: [...]`; mảng rỗng thì bỏ hẳn (TOON in "help: []" là token thừa). */
function dropEmptyHelp(out: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(out["help"]) && out["help"].length === 0) {
    const { help: _help, ...rest } = out;
    void _help;
    return rest;
  }
  return out;
}

export async function main(options: MainOptions = {}): Promise<void> {
  const rt = options.runtime ?? defaultRuntime();
  const commands: Record<string, AxiCliCommand<undefined>> = {
    home: async (args) => ({ ...homeHeader(DESCRIPTION, rt), ...(await homeView(args, rt)) }),
  };
  for (const [name, spec] of Object.entries(COMMANDS)) {
    if (spec.run) commands[name] = async (args) => dropEmptyHelp(await spec.run!(args, rt));
  }
  await runAxiCli({
    description: DESCRIPTION,
    version: VERSION,
    ...(options.argv ? { argv: options.argv } : {}),
    ...(options.stdout ? { stdout: options.stdout } : {}),
    topLevelHelp: topLevelHelp(),
    getCommandHelp: (command) => COMMANDS[command]?.help,
    home: async () => ({ ...homeHeader(DESCRIPTION, rt), ...(await homeView([], rt)) }),
    commands,
  });
}
