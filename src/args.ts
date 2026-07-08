// Hand-rolled argument parser. Generic over a set of known flags so the same
// logic serves generated commands and the auth commands.
import { UsageError } from "./errors.js";

export interface FlagKnowledge {
	/** Whether the flag takes a value. Boolean flags do not consume the next token. */
	consumesValue: boolean;
}

export interface ParsedArgs {
	positionals: string[];
	/** Every occurrence of each flag, in order, as raw strings. */
	values: Map<string, string[]>;
	pretty: boolean;
	help: boolean;
}

const GLOBAL_BOOLEANS = new Set(["pretty", "help"]);

/**
 * Parse tokens against a map of known flags. Unknown flags throw a UsageError.
 * `--flag value` and `--flag=value` both work; boolean flags accept a bare
 * `--flag` (true) or `--flag=false`. `--` ends flag parsing.
 */
export function parseArgs(tokens: string[], known: Map<string, FlagKnowledge>): ParsedArgs {
	const positionals: string[] = [];
	const values = new Map<string, string[]>();
	let pretty = false;
	let help = false;
	let onlyPositionals = false;

	const push = (name: string, value: string) => {
		const list = values.get(name);
		if (list) list.push(value);
		else values.set(name, [value]);
	};

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (onlyPositionals || !token.startsWith("-") || token === "-") {
			positionals.push(token);
			continue;
		}
		if (token === "--") {
			onlyPositionals = true;
			continue;
		}

		const dashless = token.startsWith("--") ? token.slice(2) : token.slice(1);
		const eq = dashless.indexOf("=");
		const name = eq === -1 ? dashless : dashless.slice(0, eq);
		const inlineValue = eq === -1 ? undefined : dashless.slice(eq + 1);

		if (name === "help" || name === "h") {
			help = true;
			continue;
		}
		if (name === "pretty") {
			pretty = true;
			continue;
		}

		const spec = known.get(name);
		if (!spec) {
			throw new UsageError(`Unknown flag: --${name}. Run with --help to see available flags.`);
		}

		if (!spec.consumesValue) {
			// Boolean flag.
			push(name, inlineValue ?? "true");
			continue;
		}

		if (inlineValue !== undefined) {
			push(name, inlineValue);
			continue;
		}
		const next = tokens[i + 1];
		if (next === undefined) throw new UsageError(`Flag --${name} expects a value.`);
		push(name, next);
		i++;
	}

	return { positionals, values, pretty, help };
}

export { GLOBAL_BOOLEANS };
