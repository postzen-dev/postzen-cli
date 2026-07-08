// Config file handling and credential resolution.
// ~/.postzen/config.json holds { apiKey, apiUrl? } and is written 0600.
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { apiBaseUrl } from "./generated/commands.js";

export interface Config {
	apiKey?: string;
	apiUrl?: string;
}

const configDir = join(homedir(), ".postzen");
export const configPath = join(configDir, "config.json");

export function readConfig(): Config {
	try {
		if (!existsSync(configPath)) return {};
		return JSON.parse(readFileSync(configPath, "utf8")) as Config;
	} catch {
		return {};
	}
}

export function writeConfig(config: Config): void {
	mkdirSync(configDir, { recursive: true, mode: 0o700 });
	writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`, { mode: 0o600 });
	chmodSync(configPath, 0o600);
}

export interface KeyResolution {
	key: string | undefined;
	source: "POSTZEN_API_KEY" | "config" | "none";
}

/** Env var wins over the config file. */
export function resolveKey(config: Config = readConfig()): KeyResolution {
	if (process.env.POSTZEN_API_KEY) return { key: process.env.POSTZEN_API_KEY, source: "POSTZEN_API_KEY" };
	if (config.apiKey) return { key: config.apiKey, source: "config" };
	return { key: undefined, source: "none" };
}

export interface BaseUrlResolution {
	url: string;
	source: "POSTZEN_API_URL" | "config" | "default";
}

export function resolveBaseUrl(config: Config = readConfig()): BaseUrlResolution {
	if (process.env.POSTZEN_API_URL) return { url: process.env.POSTZEN_API_URL, source: "POSTZEN_API_URL" };
	if (config.apiUrl) return { url: config.apiUrl, source: "config" };
	return { url: apiBaseUrl, source: "default" };
}

/** e.g. pzn_live_abcd…wxyz */
export function maskKey(key: string): string {
	if (key.length <= 12) return `${key.slice(0, 4)}…`;
	return `${key.slice(0, 12)}…${key.slice(-4)}`;
}
