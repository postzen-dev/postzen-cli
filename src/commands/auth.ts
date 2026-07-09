// auth:set, auth:check, auth:status — API key management.
import { parseArgs, type FlagKnowledge } from "../args.js";
import { UsageError } from "../errors.js";
import { apiRequest } from "../http.js";
import { readConfig, writeConfig, resolveKey, resolveBaseUrl, maskKey } from "../config.js";
import { printJson, emitApiError, emitNetworkError } from "../output.js";
import { INVALID_KEY_MESSAGE, MISSING_KEY_MESSAGE } from "../messages.js";

export const AUTH_HELP: Record<string, string> = {
	"auth:set": "postzen auth:set --key pzn_live_...\n\nValidate an API key and save it to ~/.postzen/config.json (mode 0600).",
	"auth:check": "postzen auth:check\n\nVerify the resolved API key against the API. Prints the number of accessible profiles.",
	"auth:status": "postzen auth:status\n\nShow the masked API key currently in use and where it was resolved from.",
};

/** Verify a key by listing profiles. Returns the parsed result. */
async function verifyKey(key: string, baseUrl: string) {
	return apiRequest({ baseUrl, key, method: "GET", path: "/v1/profiles" });
}

function profileCount(data: unknown): number | undefined {
	if (data && typeof data === "object" && Array.isArray((data as { profiles?: unknown }).profiles)) {
		return (data as { profiles: unknown[] }).profiles.length;
	}
	return undefined;
}

export async function runAuth(sub: string, tokens: string[]): Promise<number> {
	const known = new Map<string, FlagKnowledge>();
	if (sub === "auth:set") known.set("key", { consumesValue: true });

	const parsed = parseArgs(tokens, known);
	if (parsed.help) {
		process.stdout.write(`${AUTH_HELP[sub]}\n`);
		return 0;
	}

	if (sub === "auth:set") return authSet(parsed.values.get("key")?.[0], parsed.pretty);
	if (sub === "auth:check") return authCheck(parsed.pretty);
	if (sub === "auth:status") return authStatus(parsed.pretty);
	throw new UsageError(`Unknown auth command: ${sub}`);
}

async function authSet(key: string | undefined, pretty: boolean): Promise<number> {
	if (!key) throw new UsageError("auth:set requires --key. Example: postzen auth:set --key pzn_live_...");
	const config = readConfig();
	const { url: baseUrl } = resolveBaseUrl(config);
	let result;
	try {
		result = await verifyKey(key, baseUrl);
	} catch (err) {
		return emitNetworkError(err, pretty);
	}
	if (result.status === 401) throw new UsageError(INVALID_KEY_MESSAGE);
	if (!result.ok) return emitApiError(result, pretty);

	writeConfig({ ...config, apiKey: key });
	printJson({ ok: true, saved: true, profiles: profileCount(result.data) }, pretty);
	return 0;
}

async function authCheck(pretty: boolean): Promise<number> {
	const { key } = resolveKey();
	if (!key) throw new UsageError(MISSING_KEY_MESSAGE);
	const { url: baseUrl } = resolveBaseUrl();
	let result;
	try {
		result = await verifyKey(key, baseUrl);
	} catch (err) {
		return emitNetworkError(err, pretty);
	}
	if (result.status === 401) throw new UsageError(INVALID_KEY_MESSAGE);
	if (!result.ok) return emitApiError(result, pretty);
	printJson({ ok: true, profiles: profileCount(result.data) ?? 0 }, pretty);
	return 0;
}

function authStatus(pretty: boolean): number {
	const config = readConfig();
	const { key, source } = resolveKey(config);
	const { url, source: urlSource } = resolveBaseUrl(config);
	printJson(
		{
			apiKey: key ? maskKey(key) : null,
			keySource:
				source === "POSTZEN_API_KEY"
					? "POSTZEN_API_KEY env var"
					: source === "config"
						? "~/.postzen/config.json"
						: "none",
			apiUrl: url,
			apiUrlSource:
				urlSource === "POSTZEN_API_URL"
					? "POSTZEN_API_URL env var"
					: urlSource === "config"
						? "~/.postzen/config.json"
						: "default",
		},
		pretty,
	);
	return 0;
}
