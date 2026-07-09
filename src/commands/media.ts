// media:upload — presign, upload the file bytes, print the public URL.
// Replaces the multi-step media:create-presign flow with one command.
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { parseArgs, type FlagKnowledge } from "../args.js";
import { UsageError } from "../errors.js";
import { apiRequest } from "../http.js";
import { resolveKey, resolveBaseUrl } from "../config.js";
import { printJson, emitApiError, emitNetworkError } from "../output.js";
import { INVALID_KEY_MESSAGE, MISSING_KEY_MESSAGE } from "../messages.js";

// Extension -> presign contentType enum. Keep in sync with the presign schema.
const CONTENT_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	gif: "image/gif",
	mp4: "video/mp4",
	mpeg: "video/mpeg",
	mpg: "video/mpeg",
	mov: "video/quicktime",
	avi: "video/x-msvideo",
	webm: "video/webm",
	m4v: "video/x-m4v",
	pdf: "application/pdf",
};

export const MEDIA_UPLOAD_HELP = [
	"postzen media:upload <file> [--flags]",
	"",
	"Upload a media file and return its public URL.",
	"",
	"Presigns an upload slot, PUTs the raw file bytes to PostZen-hosted storage, and prints",
	"the public URL to reference in a post's mediaItems. Requires a read-write API key.",
	"",
	"Arguments:",
	"  file  Path to the local file to upload (max 100 MB).",
	"",
	"Flags:",
	"  --profileId <string>    Optional profile scope. The API key must have access to it.",
	"  --contentType <string>  MIME type. Inferred from the file extension when omitted.",
	"  --filename <string>     Stored file name. Defaults to the file's base name.",
	"",
	"Example:",
	"  postzen media:upload ./photo.jpg --profileId prof_123",
].join("\n");

/** Map a file extension to a presign contentType, or throw a UsageError. */
function inferContentType(file: string): string {
	const ext = extname(file).slice(1).toLowerCase();
	const ct = CONTENT_TYPES[ext];
	if (!ct) {
		throw new UsageError(
			`Cannot infer content type from extension ".${ext}". ` +
				"Pass --contentType explicitly (e.g. --contentType image/png).",
		);
	}
	return ct;
}

export async function runMediaUpload(tokens: string[]): Promise<number> {
	const known = new Map<string, FlagKnowledge>([
		["profileId", { consumesValue: true }],
		["contentType", { consumesValue: true }],
		["filename", { consumesValue: true }],
	]);

	const parsed = parseArgs(tokens, known);
	if (parsed.help) {
		process.stdout.write(`${MEDIA_UPLOAD_HELP}\n`);
		return 0;
	}

	const file = parsed.positionals[0];
	if (file === undefined) {
		throw new UsageError("media:upload requires a <file>. Example: postzen media:upload ./photo.jpg");
	}
	if (parsed.positionals.length > 1) {
		throw new UsageError("Too many arguments for media:upload. Expected 1 (file).");
	}

	// Read the bytes up front — this validates the file exists and is readable.
	let bytes: Buffer;
	try {
		bytes = readFileSync(file);
	} catch {
		throw new UsageError(`Cannot read file: ${file}. Check that the path exists and is readable.`);
	}
	const size = bytes.length;

	const contentType = parsed.values.get("contentType")?.[0] ?? inferContentType(file);
	const filename = parsed.values.get("filename")?.[0] ?? basename(file);
	const profileId = parsed.values.get("profileId")?.[0];

	const { key } = resolveKey();
	if (!key) throw new UsageError(MISSING_KEY_MESSAGE);
	const { url: baseUrl } = resolveBaseUrl();

	// Step 1: presign the upload (bearer auth via apiRequest).
	const presignBody: Record<string, unknown> = { filename, contentType, size };
	if (profileId) presignBody.profileId = profileId;

	let presign;
	try {
		presign = await apiRequest({ baseUrl, key, method: "POST", path: "/v1/media/presign", body: presignBody });
	} catch (err) {
		return emitNetworkError(err, parsed.pretty);
	}
	if (presign.status === 401) throw new UsageError(INVALID_KEY_MESSAGE);
	if (!presign.ok) return emitApiError(presign, parsed.pretty);

	const data = presign.data as { uploadUrl?: string; publicUrl?: string; key?: string; type?: string };
	if (!data || typeof data.uploadUrl !== "string") {
		process.stderr.write(`${JSON.stringify({ error: { message: "presign response missing uploadUrl" } })}\n`);
		return 1;
	}

	// Step 2: PUT the raw bytes to the presigned storage URL. No Authorization
	// header — the URL is already signed.
	let uploadRes: Response;
	try {
		uploadRes = await fetch(data.uploadUrl, {
			method: "PUT",
			headers: { "content-type": contentType },
			body: bytes,
		});
	} catch (err) {
		return emitNetworkError(err, parsed.pretty);
	}
	if (!uploadRes.ok) {
		const error = { status: uploadRes.status, message: "upload to presigned URL failed" };
		process.stderr.write(`${JSON.stringify({ error }, null, parsed.pretty ? 2 : undefined)}\n`);
		return 1;
	}

	printJson({ publicUrl: data.publicUrl, key: data.key, type: data.type, size, filename }, parsed.pretty);
	return 0;
}
