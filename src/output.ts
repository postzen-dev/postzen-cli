// Output helpers. Success JSON to stdout; API/network errors as JSON to stderr.
import type { ApiResult } from "./http.js";

export function printJson(value: unknown, pretty: boolean): void {
	process.stdout.write(`${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`);
}

/** Emit a successful API result and return the exit code (always 0 here). */
export function emitSuccess(result: ApiResult, pretty: boolean): number {
	if (result.data === undefined || result.status === 204) {
		printJson({ ok: true }, pretty);
		return 0;
	}
	printJson(result.data, pretty);
	return 0;
}

/** Emit a non-2xx API result to stderr as `{ "error": { status, ... } }`. */
export function emitApiError(result: ApiResult, pretty: boolean): number {
	const error: Record<string, unknown> = { status: result.status };
	if (result.data !== undefined && typeof result.data === "object" && result.data !== null && !Array.isArray(result.data)) {
		Object.assign(error, result.data);
	} else if (result.data !== undefined) {
		error.body = result.data;
	}
	process.stderr.write(`${JSON.stringify({ error }, null, pretty ? 2 : undefined)}\n`);
	return 1;
}

/** Emit a network/transport failure to stderr. */
export function emitNetworkError(err: unknown, pretty: boolean): number {
	const message = err instanceof Error ? err.message : String(err);
	process.stderr.write(`${JSON.stringify({ error: { message } }, null, pretty ? 2 : undefined)}\n`);
	return 1;
}
