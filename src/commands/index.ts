// Custom-command registry. Hand-written commands that override or extend the
// generated set (mirrors the MCP server's custom-tools-over-generated pattern).
// Custom commands win over generated ones at dispatch; names in
// SUPPRESSED_GENERATED are hidden from dispatch and all help output.
import { runAuth, AUTH_HELP } from "./auth.js";
import { runMediaUpload, MEDIA_UPLOAD_HELP } from "./media.js";

export interface CustomCommand {
	name: string;
	/** Group heading the command appears under. `auth` renders in its own block. */
	group: string;
	summary: string;
	/** Detailed help for `<command> --help` and `help <command>`. */
	help: string;
	run(tokens: string[]): Promise<number>;
}

export const customCommands: CustomCommand[] = [
	{
		name: "auth:set",
		group: "auth",
		summary: "Save an API key to ~/.postzen/config.json (validated first).",
		help: AUTH_HELP["auth:set"],
		run: (tokens) => runAuth("auth:set", tokens),
	},
	{
		name: "auth:check",
		group: "auth",
		summary: "Verify the resolved API key against the API.",
		help: AUTH_HELP["auth:check"],
		run: (tokens) => runAuth("auth:check", tokens),
	},
	{
		name: "auth:status",
		group: "auth",
		summary: "Show the masked key in use and where it came from.",
		help: AUTH_HELP["auth:status"],
		run: (tokens) => runAuth("auth:status", tokens),
	},
	{
		name: "media:upload",
		group: "media",
		summary: "Upload a media file and return its public URL",
		help: MEDIA_UPLOAD_HELP,
		run: runMediaUpload,
	},
];

export const customCommandByName = new Map(customCommands.map((c) => [c.name, c]));

// Generated commands hidden from dispatch and help — superseded by a custom one.
export const SUPPRESSED_GENERATED = new Set<string>(["media:create-presign"]);
