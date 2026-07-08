// Schema helpers: turning a JSON Schema node into a CLI type label and
// coercing raw string flag values into the right JSON type.
import type { JsonSchema } from "./types.js";

export type CliType = "string" | "number" | "integer" | "boolean" | "array" | "object";

/** First concrete type, ignoring a `null` union member. */
export function cliType(schema: JsonSchema): CliType {
	let t = schema.type;
	if (Array.isArray(t)) t = t.find((x) => x !== "null");
	if (t === "number" || t === "integer" || t === "boolean" || t === "array" || t === "object") return t;
	if (t === "string") return "string";
	// No `type`: infer from shape.
	if (schema.properties || schema.oneOf || schema.anyOf || schema.allOf) return "object";
	if (schema.items) return "array";
	return "string";
}

/** Array whose items are objects (or exotic) => value must be raw JSON. */
export function isJsonArray(schema: JsonSchema): boolean {
	if (cliType(schema) !== "array") return false;
	const items = schema.items;
	if (!items) return false;
	return cliType(items) === "object";
}

/** Whether a bare `--flag` (no `=value`, no following token) makes sense. */
export function isBooleanFlag(schema: JsonSchema): boolean {
	return cliType(schema) === "boolean";
}

/** Human-readable type label used in help output. */
export function typeLabel(schema: JsonSchema): string {
	const t = cliType(schema);
	if (t === "array") {
		const items = schema.items;
		const itemLabel = items ? cliType(items) : "string";
		return `${itemLabel}[]`;
	}
	if (t === "object") return "json";
	return t;
}

class CoercionError extends Error {}

function coerceScalar(raw: string, t: CliType, flagName: string): unknown {
	if (t === "boolean") {
		if (raw === "true" || raw === "1") return true;
		if (raw === "false" || raw === "0") return false;
		throw new CoercionError(`--${flagName} expects a boolean (true/false), got "${raw}"`);
	}
	if (t === "integer" || t === "number") {
		const n = Number(raw);
		if (!Number.isFinite(n)) throw new CoercionError(`--${flagName} expects a number, got "${raw}"`);
		if (t === "integer" && !Number.isInteger(n)) throw new CoercionError(`--${flagName} expects an integer, got "${raw}"`);
		return n;
	}
	return raw;
}

/**
 * Coerce the raw occurrences of one flag into its JSON value.
 * `raws` holds one entry per time the flag appeared on the command line.
 * Throws a plain Error with a user-facing message on bad input.
 */
export function coerceFlag(schema: JsonSchema, raws: string[], flagName: string): unknown {
	const t = cliType(schema);

	if (t === "object") {
		return parseJson(raws[raws.length - 1], flagName);
	}

	if (t === "array") {
		if (isJsonArray(schema)) {
			// Raw JSON; repeating the flag concatenates arrays.
			const out: unknown[] = [];
			for (const raw of raws) {
				const parsed = parseJson(raw, flagName);
				if (Array.isArray(parsed)) out.push(...parsed);
				else out.push(parsed);
			}
			return out;
		}
		// Scalar array: comma-separated and/or repeatable.
		const itemType = schema.items ? cliType(schema.items) : "string";
		const parts = raws.flatMap((raw) => raw.split(","));
		return parts.map((p) => coerceScalar(p, itemType, flagName));
	}

	return coerceScalar(raws[raws.length - 1], t, flagName);
}

function parseJson(raw: string, flagName: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		throw new CoercionError(`--${flagName} expects valid JSON, but it could not be parsed`);
	}
}

export { CoercionError };
