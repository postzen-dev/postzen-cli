// Dependency-free smoke test. Spins up a throwaway HTTP server that records
// requests and returns canned JSON, then drives the built CLI against it.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, "..", "dist", "index.js");

if (!existsSync(cliPath)) {
	console.error(`Built CLI not found at ${cliPath}. Run \`npm run build\` first.`);
	process.exit(1);
}

const requests = [];

const server = createServer((req, res) => {
	const url = new URL(req.url, "http://localhost");
	const chunks = [];
	req.on("data", (c) => chunks.push(c));
	req.on("end", () => {
		const bodyBuffer = Buffer.concat(chunks);
		const rawBody = bodyBuffer.toString("utf8");
		// Presigned uploads carry raw (possibly binary) bytes, not JSON.
		let body;
		if (rawBody) {
			try {
				body = JSON.parse(rawBody);
			} catch {
				body = undefined;
			}
		}
		requests.push({
			method: req.method,
			path: url.pathname,
			query: Object.fromEntries(url.searchParams.entries()),
			headers: req.headers,
			body,
			bodyBuffer,
		});

		const send = (status, obj) => {
			res.writeHead(status, { "content-type": "application/json" });
			res.end(JSON.stringify(obj));
		};

		if (req.method === "GET" && url.pathname === "/v1/profiles") {
			return send(200, { profiles: [{ _id: "p1" }, { _id: "p2" }] });
		}
		if (req.method === "GET" && url.pathname.startsWith("/v1/profiles/")) {
			const id = url.pathname.slice("/v1/profiles/".length);
			if (id === "fail") return send(400, { error: "boom" });
			return send(200, { profile: { _id: id } });
		}
		if (req.method === "GET" && url.pathname === "/v1/accounts") {
			return send(200, { accounts: [] });
		}
		if (req.method === "POST" && url.pathname === "/v1/posts") {
			return send(201, { post: { _id: "post1" }, message: "Post published successfully" });
		}
		if (req.method === "POST" && url.pathname === "/v1/media/presign") {
			return send(200, {
				uploadUrl: `${baseUrl}/upload/key123`,
				publicUrl: "https://media.postzen.dev/key123.png",
				key: "key123",
				type: "image",
			});
		}
		if (req.method === "PUT" && url.pathname === "/upload/key123") {
			return send(200, {});
		}
		return send(404, { error: "not found" });
	});
});

// Async spawn (not spawnSync): the HTTP server shares this process's event
// loop, so blocking it synchronously would deadlock the child's request.
function runCli(args, extraEnv = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn("node", [cliPath, ...args], {
			env: { ...process.env, POSTZEN_API_URL: baseUrl, POSTZEN_API_KEY: "testkey", ...extraEnv },
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => (stdout += d));
		child.stderr.on("data", (d) => (stderr += d));
		child.on("error", reject);
		child.on("close", (status) => resolve({ stdout, stderr, status }));
	});
}

let baseUrl;
const pass = (label) => console.log(`ok - ${label}`);

// Temp media files for the media:upload tests, kept inside the repo cache.
const tmpDir = join(here, "..", "node_modules", ".cache");
mkdirSync(tmpDir, { recursive: true });
const pngFile = join(tmpDir, "postzen-smoke.png");
const xyzFile = join(tmpDir, "postzen-smoke.xyz");

await new Promise((resolve) => server.listen(0, resolve));
baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
	// (a) profiles:list -> GET /v1/profiles with bearer header.
	{
		requests.length = 0;
		const r = await runCli(["profiles:list"]);
		assert.equal(r.status, 0, `profiles:list exit: ${r.stderr}`);
		const req = requests.at(-1);
		assert.equal(req.method, "GET");
		assert.equal(req.path, "/v1/profiles");
		assert.equal(req.headers.authorization, "Bearer testkey");
		assert.deepEqual(JSON.parse(r.stdout), { profiles: [{ _id: "p1" }, { _id: "p2" }] });
		assert.ok(!r.stdout.slice(0, -1).includes("\n"), "default output should be a single line");
		pass("profiles:list issues GET /v1/profiles with bearer auth");
	}

	// (b) profiles:get abc123 -> GET /v1/profiles/abc123.
	{
		const r = await runCli(["profiles:get", "abc123"]);
		assert.equal(r.status, 0, `profiles:get exit: ${r.stderr}`);
		assert.equal(requests.at(-1).path, "/v1/profiles/abc123");
		assert.equal(requests.at(-1).method, "GET");
		pass("profiles:get maps a positional to the path param");
	}

	// (c) posts:create with flattened body flags + comma array.
	{
		const r = await runCli(["posts:create", "--title", "T", "--content", "hello", "--publishNow", "--tags", "a,b,c"]);
		assert.equal(r.status, 0, `posts:create exit: ${r.stderr}`);
		const req = requests.at(-1);
		assert.equal(req.method, "POST");
		assert.equal(req.path, "/v1/posts");
		assert.equal(req.headers["content-type"], "application/json");
		assert.deepEqual(req.body, { title: "T", content: "hello", publishNow: true, tags: ["a", "b", "c"] });
		pass("posts:create flattens body flags and splits comma arrays");
	}

	// (d) query param lands in the query string.
	{
		const r = await runCli(["accounts:list", "--status", "connected", "--limit", "5"]);
		assert.equal(r.status, 0, `accounts:list exit: ${r.stderr}`);
		assert.equal(requests.at(-1).path, "/v1/accounts");
		assert.equal(requests.at(-1).query.status, "connected");
		assert.equal(requests.at(-1).query.limit, "5");
		pass("accounts:list sends query params");
	}

	// (e) non-2xx response -> exit 1, stderr JSON.
	{
		const r = await runCli(["profiles:get", "fail"]);
		assert.equal(r.status, 1, "non-2xx should exit 1");
		const parsed = JSON.parse(r.stderr);
		assert.equal(parsed.error.status, 400);
		assert.equal(parsed.error.error, "boom");
		pass("non-2xx response exits 1 with error JSON on stderr");
	}

	// (f) unknown flag -> exit 2.
	{
		const r = await runCli(["profiles:list", "--bogus"]);
		assert.equal(r.status, 2, "unknown flag should exit 2");
		assert.match(r.stderr, /Unknown flag/);
		pass("unknown flag exits 2 with a usage error");
	}

	// (g) --pretty produces indented output.
	{
		const r = await runCli(["profiles:list", "--pretty"]);
		assert.equal(r.status, 0);
		assert.match(r.stdout, /\n {2}"profiles"/, "pretty output should be indented");
		pass("--pretty indents output");
	}

	// (h) help lists the visible commands, hides the suppressed one.
	{
		const r = await runCli(["help"]);
		assert.equal(r.status, 0);
		const expected = [
			"profiles:list",
			"profiles:create",
			"profiles:get",
			"profiles:update",
			"profiles:delete",
			"accounts:list",
			"accounts:disconnect",
			"connect:create-url",
			"connect:complete",
			"media:upload",
			"posts:create",
		];
		for (const name of expected) assert.ok(r.stdout.includes(name), `help missing ${name}`);
		assert.ok(!r.stdout.includes("media:create-presign"), "help must not list the suppressed media:create-presign");
		pass("help lists custom + generated commands and hides media:create-presign");
	}

	// (i) media:upload — presign, PUT the bytes, print the public URL.
	{
		requests.length = 0;
		const bytes = Buffer.alloc(512);
		for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
		writeFileSync(pngFile, bytes);

		const r = await runCli(["media:upload", pngFile]);
		assert.equal(r.status, 0, `media:upload exit: ${r.stderr}`);

		const presignReq = requests.find((x) => x.path === "/v1/media/presign");
		assert.ok(presignReq, "presign request should have been made");
		assert.equal(presignReq.method, "POST");
		assert.equal(presignReq.headers.authorization, "Bearer testkey");
		assert.equal(presignReq.body.filename, basename(pngFile));
		assert.equal(presignReq.body.contentType, "image/png");
		assert.equal(presignReq.body.size, bytes.length);

		const putReq = requests.find((x) => x.path === "/upload/key123");
		assert.ok(putReq, "PUT to the presigned URL should have been made");
		assert.equal(putReq.method, "PUT");
		assert.equal(putReq.headers["content-type"], "image/png");
		assert.equal(putReq.headers.authorization, undefined, "PUT must not carry an Authorization header");
		assert.ok(putReq.bodyBuffer.equals(bytes), "PUT body bytes must equal the file exactly");

		const out = JSON.parse(r.stdout);
		assert.equal(out.publicUrl, "https://media.postzen.dev/key123.png");
		assert.equal(out.key, "key123");
		pass("media:upload presigns, uploads the bytes, and prints the public URL");
	}

	// (j) unknown extension without --contentType -> exit 2 mentioning --contentType.
	{
		writeFileSync(xyzFile, Buffer.from("hello world"));
		const r = await runCli(["media:upload", xyzFile]);
		assert.equal(r.status, 2, `unknown extension should exit 2: ${r.stdout}${r.stderr}`);
		assert.match(r.stderr, /--contentType/);
		pass("media:upload with an unknown extension exits 2 and mentions --contentType");
	}

	// (k) media:create-presign is suppressed -> unknown command, exit 2.
	{
		const r = await runCli(["media:create-presign", "--filename", "x.png", "--contentType", "image/png"]);
		assert.equal(r.status, 2, "suppressed command should exit 2");
		assert.match(r.stderr, /Unknown command/);
		pass("media:create-presign is suppressed and reports an unknown command");
	}

	console.log("\nAll smoke tests passed.");
} finally {
	server.close();
	rmSync(pngFile, { force: true });
	rmSync(xyzFile, { force: true });
}
