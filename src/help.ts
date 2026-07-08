// Help text rendering: overview, per-group, and per-command detail.
import { generatedCommands, apiVersion } from "./generated/commands.js";
import type { GeneratedCommand } from "./types.js";
import { typeLabel } from "./schema.js";
import { version } from "./version.js";

const AUTH_COMMANDS = [
	{ name: "auth:set", summary: "Save an API key to ~/.postzen/config.json (validated first)." },
	{ name: "auth:check", summary: "Verify the resolved API key against the API." },
	{ name: "auth:status", summary: "Show the masked key in use and where it came from." },
];

const GLOBAL_FLAGS = [
	["--pretty", "Indent JSON output (2 spaces). Default is a single compact line."],
	["--help, -h", "Show help for a command or the CLI."],
	["--version", "Print the CLI and API version."],
];

function pad(s: string, width: number): string {
	return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function groupsInOrder(): string[] {
	const seen: string[] = [];
	for (const c of generatedCommands) if (!seen.includes(c.group)) seen.push(c.group);
	return seen;
}

export function overviewHelp(): string {
	const lines: string[] = [];
	lines.push("postzen — command-line client for the PostZen API");
	lines.push("");
	lines.push("Usage:");
	lines.push("  postzen <group:action> [positionals] [--flags]");
	lines.push("  postzen <group>            List the commands in a group");
	lines.push("  postzen <command> --help   Detailed help for a command");
	lines.push("");
	lines.push("Output is a single line of JSON by default — built for piping and AI agents.");
	lines.push("Pass --pretty for indented output.");
	lines.push("");
	lines.push("Authentication:");
	const authWidth = Math.max(...AUTH_COMMANDS.map((c) => c.name.length));
	for (const c of AUTH_COMMANDS) lines.push(`  ${pad(c.name, authWidth)}  ${c.summary}`);
	lines.push("");
	lines.push("  Set POSTZEN_API_KEY to override the saved key; POSTZEN_API_URL to override the base URL.");
	lines.push("");

	const nameWidth = Math.max(...generatedCommands.map((c) => c.name.length));
	for (const group of groupsInOrder()) {
		lines.push(`${group}:`);
		for (const c of generatedCommands.filter((cmd) => cmd.group === group)) {
			lines.push(`  ${pad(c.name, nameWidth)}  ${c.summary}`);
		}
		lines.push("");
	}

	lines.push("Global flags:");
	const flagWidth = Math.max(...GLOBAL_FLAGS.map(([f]) => f.length));
	for (const [flag, desc] of GLOBAL_FLAGS) lines.push(`  ${pad(flag, flagWidth)}  ${desc}`);
	return lines.join("\n");
}

export function groupHelp(group: string): string {
	const cmds = generatedCommands.filter((c) => c.group === group);
	const lines: string[] = [`${group} commands:`, ""];
	const nameWidth = Math.max(...cmds.map((c) => c.name.length));
	for (const c of cmds) lines.push(`  ${pad(c.name, nameWidth)}  ${c.summary}`);
	lines.push("");
	lines.push(`Run \`postzen ${cmds[0]?.name ?? group + ":..."} --help\` for command details.`);
	return lines.join("\n");
}

export function commandHelp(command: GeneratedCommand): string {
	const lines: string[] = [];
	const posUsage = command.positionals.map((p) => `<${p.name}>`).join(" ");
	lines.push(`postzen ${command.name}${posUsage ? " " + posUsage : ""} [--flags]`);
	lines.push("");
	if (command.summary) lines.push(command.summary);
	if (command.description) {
		lines.push("");
		lines.push(command.description);
	}
	lines.push("");
	lines.push(`Request: ${command.method} ${command.pathTemplate}`);

	if (command.positionals.length) {
		lines.push("");
		lines.push("Arguments:");
		const width = Math.max(...command.positionals.map((p) => p.name.length));
		for (const p of command.positionals) {
			lines.push(`  ${pad(p.name, width)}  ${p.description || "(path parameter)"}`);
		}
	}

	if (command.flags.length) {
		lines.push("");
		lines.push("Flags:");
		const rendered = command.flags.map((f) => {
			const label = `--${f.name} <${typeLabel(f.schema)}>`;
			const bits: string[] = [];
			if (f.required) bits.push("required");
			const enumVals = f.schema.enum ?? (f.schema.items?.enum as unknown[] | undefined);
			if (enumVals) bits.push(`one of: ${enumVals.join(", ")}`);
			const desc = [f.description, bits.length ? `(${bits.join("; ")})` : ""].filter(Boolean).join(" ");
			return { label, desc };
		});
		const width = Math.max(...rendered.map((r) => r.label.length));
		for (const r of rendered) lines.push(`  ${pad(r.label, width)}  ${r.desc}`.trimEnd());
	}
	return lines.join("\n");
}

export function versionText(): string {
	return `postzen-cli ${version} (PostZen API ${apiVersion})`;
}
