// Thin wrapper around fetch that talks to the PostZen API.
import { version } from "./version.js";

export interface ApiResult {
	status: number;
	ok: boolean;
	/** Parsed JSON when the body is JSON, the raw string otherwise, or undefined when empty. */
	data: unknown;
	rawText: string;
}

export interface ApiRequest {
	baseUrl: string;
	key: string;
	method: string;
	path: string;
	query?: Record<string, string>;
	headers?: Record<string, string>;
	body?: unknown;
}

export async function apiRequest(req: ApiRequest): Promise<ApiResult> {
	const url = new URL(req.baseUrl.replace(/\/$/, "") + req.path);
	for (const [name, value] of Object.entries(req.query ?? {})) url.searchParams.set(name, value);

	const headers: Record<string, string> = {
		authorization: `Bearer ${req.key}`,
		accept: "application/json",
		"user-agent": `postzen-cli/${version}`,
		...req.headers,
	};

	let bodyText: string | undefined;
	if (req.body !== undefined) {
		bodyText = JSON.stringify(req.body);
		headers["content-type"] = "application/json";
	}

	const response = await fetch(url, { method: req.method, headers, body: bodyText });
	const rawText = await response.text();
	let data: unknown = undefined;
	if (rawText) {
		try {
			data = JSON.parse(rawText);
		} catch {
			data = rawText;
		}
	}
	return { status: response.status, ok: response.ok, data, rawText };
}
