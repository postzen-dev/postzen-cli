// Generates src/generated/commands.ts from the PostZen OpenAPI spec at the
// repo root (synced from the postzen monorepo by CI). One CLI command per
// operation, named `group:action`. The runtime maps positionals/flags back
// onto the original HTTP request. Run via `npm run generate`.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const specPath = join(root, "openapi.json");
const outPath = join(root, "src", "generated", "commands.ts");

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const componentSchemas = spec.components?.schemas ?? {};

// Inline every $ref so command schemas are self-contained JSON Schema.
// Cycles are cut with a plain description node.
function deref(schema, seen = new Set()) {
	if (schema === null || typeof schema !== "object") return schema;
	if (Array.isArray(schema)) return schema.map((s) => deref(s, seen));
	if (schema.$ref) {
		const match = /^#\/components\/schemas\/(.+)$/.exec(schema.$ref);
		if (!match) throw new Error(`Unsupported $ref target: ${schema.$ref}`);
		const name = match[1];
		if (seen.has(name)) return { description: `Recursive reference to ${name}` };
		const target = componentSchemas[name];
		if (!target) throw new Error(`Unresolvable $ref: ${schema.$ref}`);
		return deref(target, new Set([...seen, name]));
	}
	const out = {};
	for (const [key, value] of Object.entries(schema)) out[key] = deref(value, seen);
	return out;
}

// "createConnectUrl" -> ["create", "Connect", "Url"]
function splitCamel(s) {
	return s
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.split(/\s+/)
		.filter(Boolean);
}

const kebab = (words) => words.map((w) => w.toLowerCase()).join("-");
const stripS = (s) => (s.toLowerCase().endsWith("s") ? s.toLowerCase().slice(0, -1) : s.toLowerCase());

// action = operationId words minus any word that matches the tag (singular or
// plural); group = kebab-case of the first tag.
function commandName(operationId, tag) {
	const group = kebab(splitCamel(tag));
	const tagForm = stripS(tag);
	const words = splitCamel(operationId).filter((w) => stripS(w) !== tagForm);
	const action = words.length ? kebab(words) : kebab(splitCamel(operationId));
	return { group, action, name: `${group}:${action}` };
}

const METHODS = ["get", "put", "post", "patch", "delete"];
const commands = [];
const seenNames = new Set();

for (const [path, pathItem] of Object.entries(spec.paths)) {
	const sharedParams = pathItem.parameters ?? [];
	for (const method of METHODS) {
		const op = pathItem[method];
		if (!op) continue;
		if (!op.operationId) throw new Error(`Missing operationId for ${method.toUpperCase()} ${path}`);
		const tag = op.tags?.[0];
		if (!tag) throw new Error(`Missing tag for ${op.operationId}`);

		const { group, action, name } = commandName(op.operationId, tag);
		if (seenNames.has(name)) throw new Error(`Command name collision: ${name} (${op.operationId})`);
		seenNames.add(name);

		const pathParams = new Map();
		const flags = [];

		for (const param of [...sharedParams, ...(op.parameters ?? [])]) {
			if (param.$ref) throw new Error(`$ref parameters not supported (${op.operationId})`);
			const schema = deref(param.schema ?? {});
			if (param.in === "path") {
				pathParams.set(param.name, { name: param.name, description: param.description ?? "", schema });
			} else if (param.in === "query" || param.in === "header") {
				flags.push({
					name: param.name,
					in: param.in,
					required: Boolean(param.required),
					schema,
					description: param.description ?? "",
				});
			} else {
				throw new Error(`Unsupported parameter location '${param.in}' (${op.operationId})`);
			}
		}

		// Positionals follow the order the placeholders appear in the path.
		const positionals = [];
		for (const m of path.matchAll(/\{([^}]+)\}/g)) {
			const p = pathParams.get(m[1]);
			if (!p) throw new Error(`Path param '${m[1]}' has no parameter definition (${op.operationId})`);
			positionals.push(p);
		}

		// Flatten plain-object request bodies into top-level flags; anything
		// exotic (oneOf/allOf, non-object) is nested under a single `body` flag.
		let bodyMode = null;
		const bodyKeys = [];
		const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
		if (bodySchema) {
			const resolved = deref(bodySchema);
			const isPlainObject =
				resolved.type === "object" && resolved.properties && !resolved.oneOf && !resolved.anyOf && !resolved.allOf;
			if (isPlainObject) {
				bodyMode = "flat";
				const req = new Set(resolved.required ?? []);
				for (const [key, value] of Object.entries(resolved.properties)) {
					if (positionals.some((p) => p.name === key) || flags.some((f) => f.name === key))
						throw new Error(`Body property '${key}' collides with a parameter on ${op.operationId}`);
					flags.push({
						name: key,
						in: "body",
						required: req.has(key),
						schema: value,
						description: value.description ?? "",
					});
					bodyKeys.push(key);
				}
			} else {
				bodyMode = "nested";
				flags.push({
					name: "body",
					in: "body",
					required: Boolean(op.requestBody.required),
					schema: resolved,
					description: "Raw JSON request body.",
				});
				bodyKeys.push("body");
			}
		}

		commands.push({
			name,
			group,
			action,
			summary: op.summary ?? "",
			description: op.description ?? "",
			method: method.toUpperCase(),
			pathTemplate: path,
			positionals,
			flags,
			bodyMode,
			bodyKeys,
		});
	}
}

commands.sort((a, b) => a.name.localeCompare(b.name));

const header = `// AUTO-GENERATED by scripts/generate-commands.mjs from openapi.json.
// Do not edit by hand — rerun \`npm run generate\` instead.
import type { GeneratedCommand } from "../types.js";

export const apiBaseUrl = ${JSON.stringify(spec.servers?.[0]?.url ?? "https://api.postzen.dev")};
export const apiVersion = ${JSON.stringify(spec.info.version)};

export const generatedCommands: GeneratedCommand[] = `;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${header}${JSON.stringify(commands, null, "\t")};\n`);
console.log(`Generated ${commands.length} commands -> ${outPath}`);
for (const c of commands) console.log(`  ${c.name}  (${c.method} ${c.pathTemplate})`);
