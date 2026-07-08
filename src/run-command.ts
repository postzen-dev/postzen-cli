// Executes a generated command: parse args, coerce flags against the spec,
// map onto the HTTP request, print the result.
import type { GeneratedCommand } from "./types.js";
import { parseArgs, type FlagKnowledge } from "./args.js";
import { UsageError } from "./errors.js";
import { coerceFlag, isBooleanFlag, CoercionError } from "./schema.js";
import { resolveKey, resolveBaseUrl } from "./config.js";
import { apiRequest } from "./http.js";
import { emitSuccess, emitApiError, emitNetworkError } from "./output.js";
import { commandHelp } from "./help.js";
import { MISSING_KEY_MESSAGE } from "./messages.js";

export async function runCommand(command: GeneratedCommand, tokens: string[]): Promise<number> {
	const known = new Map<string, FlagKnowledge>();
	for (const flag of command.flags) known.set(flag.name, { consumesValue: !isBooleanFlag(flag.schema) });

	const parsed = parseArgs(tokens, known);
	if (parsed.help) {
		process.stdout.write(`${commandHelp(command)}\n`);
		return 0;
	}

	// Positionals -> path parameters.
	if (parsed.positionals.length > command.positionals.length) {
		throw new UsageError(
			`Too many arguments for ${command.name}. Expected ${command.positionals.length} ` +
				`(${command.positionals.map((p) => p.name).join(", ") || "none"}).`,
		);
	}
	let path = command.pathTemplate;
	for (let i = 0; i < command.positionals.length; i++) {
		const value = parsed.positionals[i];
		const p = command.positionals[i];
		if (value === undefined) {
			const missing = command.positionals.slice(i).map((x) => `<${x.name}>`).join(" ");
			throw new UsageError(`Missing argument(s) for ${command.name}: ${missing}. Run with --help for usage.`);
		}
		path = path.replace(`{${p.name}}`, encodeURIComponent(value));
	}

	// Flags -> query / headers / body.
	const query: Record<string, string> = {};
	const headers: Record<string, string> = {};
	const body: Record<string, unknown> = {};
	let nestedBody: unknown = undefined;
	let hasBody = false;

	for (const flag of command.flags) {
		const raws = parsed.values.get(flag.name);
		if (!raws) {
			if (flag.required) throw new UsageError(`Missing required flag --${flag.name} for ${command.name}.`);
			continue;
		}
		let value: unknown;
		try {
			value = coerceFlag(flag.schema, raws, flag.name);
		} catch (err) {
			if (err instanceof CoercionError) throw new UsageError(err.message);
			throw err;
		}
		if (flag.in === "query") {
			query[flag.name] = String(value);
		} else if (flag.in === "header") {
			headers[flag.name] = String(value);
		} else if (command.bodyMode === "nested") {
			nestedBody = value;
			hasBody = true;
		} else {
			body[flag.name] = value;
			hasBody = true;
		}
	}

	const { key } = resolveKey();
	if (!key) throw new UsageError(MISSING_KEY_MESSAGE);
	const { url: baseUrl } = resolveBaseUrl();

	const requestBody = command.bodyMode === "nested" ? nestedBody : hasBody ? body : undefined;

	try {
		const result = await apiRequest({
			baseUrl,
			key,
			method: command.method,
			path,
			query,
			headers,
			body: requestBody,
		});
		return result.ok ? emitSuccess(result, parsed.pretty) : emitApiError(result, parsed.pretty);
	} catch (err) {
		return emitNetworkError(err, parsed.pretty);
	}
}
