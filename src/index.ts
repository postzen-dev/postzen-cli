#!/usr/bin/env node
// Entry point. Dispatches to auth commands, generated commands, group/overview
// help, or version. Usage errors exit 2; runtime/API errors exit 1.
import { generatedCommands } from "./generated/commands.js";
import { UsageError } from "./errors.js";
import { overviewHelp, groupHelp, commandHelp, versionText } from "./help.js";
import { runCommand } from "./run-command.js";
import { runAuth } from "./commands/auth.js";

const AUTH_COMMANDS = new Set(["auth:set", "auth:check", "auth:status"]);
const commandByName = new Map(generatedCommands.map((c) => [c.name, c]));
const groups = new Set(generatedCommands.map((c) => c.group));

async function main(argv: string[]): Promise<number> {
	// `--version` / `version` short-circuit regardless of position.
	if (argv.includes("--version") || argv[0] === "version") {
		process.stdout.write(`${versionText()}\n`);
		return 0;
	}

	// First bare token is the command word.
	const cmdIndex = argv.findIndex((t) => !t.startsWith("-"));
	const token = cmdIndex === -1 ? undefined : argv[cmdIndex];
	const rest = cmdIndex === -1 ? argv.filter((t) => t.startsWith("-")) : argv.slice(cmdIndex + 1);

	// No command, or explicit `help` with no topic -> overview.
	if (token === undefined || token === "help") {
		const topic = token === "help" ? rest.find((t) => !t.startsWith("-")) : undefined;
		if (topic) return printTopic(topic);
		process.stdout.write(`${overviewHelp()}\n`);
		return 0;
	}

	if (AUTH_COMMANDS.has(token)) return runAuth(token, rest);

	const command = commandByName.get(token);
	if (command) return runCommand(command, rest);

	// A bare group name -> that group's commands.
	if (!token.includes(":") && groups.has(token)) {
		process.stdout.write(`${groupHelp(token)}\n`);
		return 0;
	}

	throw new UsageError(`Unknown command: ${token}. Run \`postzen help\` to see available commands.`);
}

function printTopic(topic: string): number {
	const command = commandByName.get(topic);
	if (command) {
		process.stdout.write(`${commandHelp(command)}\n`);
		return 0;
	}
	if (groups.has(topic)) {
		process.stdout.write(`${groupHelp(topic)}\n`);
		return 0;
	}
	throw new UsageError(`No help topic '${topic}'. Run \`postzen help\` for the command list.`);
}

// Flush stdout/stderr, then exit. An explicit exit is required because Node's
// global fetch (undici) keeps connection sockets alive after a request, which
// would otherwise leave the process hanging for seconds after printing output.
// Flushing rides on write callbacks (FIFO behind any queued output) rather than
// `drain`, which only fires after a write has overflowed the high-water mark.
function flushAndExit(code: number): void {
	let pending = 2;
	const done = () => {
		if (--pending === 0) process.exit(code);
	};
	process.stdout.write("", done);
	process.stderr.write("", done);
}

main(process.argv.slice(2))
	.then((code) => flushAndExit(code))
	.catch((err) => {
		if (err instanceof UsageError) {
			process.stderr.write(`${err.message}\n`);
			flushAndExit(2);
		} else {
			const message = err instanceof Error ? err.message : String(err);
			process.stderr.write(`${JSON.stringify({ error: { message } })}\n`);
			flushAndExit(1);
		}
	});
