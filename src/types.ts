// Shared types for the generated command descriptors and the runtime.

/** A dereferenced JSON Schema node (loose — we only read a few fields). */
export interface JsonSchema {
	type?: string | string[];
	enum?: unknown[];
	items?: JsonSchema;
	properties?: Record<string, JsonSchema>;
	required?: string[];
	oneOf?: JsonSchema[];
	anyOf?: JsonSchema[];
	allOf?: JsonSchema[];
	default?: unknown;
	description?: string;
	format?: string;
	[key: string]: unknown;
}

export interface Positional {
	name: string;
	description: string;
	schema: JsonSchema;
}

export interface Flag {
	name: string;
	in: "query" | "header" | "body";
	required: boolean;
	schema: JsonSchema;
	description: string;
}

export interface GeneratedCommand {
	name: string;
	group: string;
	action: string;
	summary: string;
	description: string;
	method: string;
	pathTemplate: string;
	positionals: Positional[];
	flags: Flag[];
	bodyMode: "flat" | "nested" | null;
	bodyKeys: string[];
}
