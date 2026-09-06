/**
 * EduHill Worker — persistent backend for the EduHill notes + quiz app.
 *
 * Stores two JSON blobs in Workers KV:
 *   - "notes"     -> Note[]
 *   - "questions" -> QuizQuestion[]
 *
 * This makes the data survive across devices/browsers and browser-data
 * clearing, since it now lives in Cloudflare KV instead of the browser.
 *
 * Endpoints:
 *   GET  /api/data       -> { notes: Note[], questions: QuizQuestion[] }
 *   PUT  /api/notes      -> body: Note[]           -> overwrites "notes"
 *   PUT  /api/questions  -> body: QuizQuestion[]   -> overwrites "questions"
 *
 * All requests (except OPTIONS preflight) must include:
 *   Authorization: Bearer <API_KEY>
 * where API_KEY matches the Worker secret set via `wrangler secret put API_KEY`.
 */

export interface Env {
	EDUHILL_KV: KVNamespace;
	API_KEY: string;
	// Optional: restrict CORS to your own GitHub Pages origin instead of "*".
	// Set with `wrangler secret put ALLOWED_ORIGIN` (e.g. https://eduhill26.github.io)
	ALLOWED_ORIGIN?: string;
}

interface Note {
	id: string;
	date: string;
	text: string;
	createdAt: number;
}

interface QuizQuestion {
	id: string;
	question: string;
	options: string[];
	correctIndex: number;
	explanation: string;
}

const MAX_NOTES = 2000;
const MAX_NOTE_TEXT_LENGTH = 5000;
const MAX_QUESTIONS = 500;
const MAX_QUESTION_TEXT_LENGTH = 2000;

function corsHeaders(env: Env): HeadersInit {
	return {
		"Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
		"Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Access-Control-Max-Age": "86400",
	};
}

function jsonResponse(body: unknown, status: number, env: Env): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			"X-Content-Type-Options": "nosniff",
			...corsHeaders(env),
		},
	});
}

function isAuthorized(request: Request, env: Env): boolean {
	if (!env.API_KEY) {
		// Fail closed: if no key has been configured, refuse all requests
		// rather than silently allowing open read/write access.
		return false;
	}
	const header = request.headers.get("Authorization") || "";
	const match = header.match(/^Bearer\s+(.+)$/i);
	return !!match && match[1] === env.API_KEY;
}

// --- Basic shape validation so a bad client can't corrupt storage or
// balloon the KV value size. This is intentionally lightweight (not a
// full schema validator) but blocks the obviously malformed cases.
function validateNotes(data: unknown): data is Note[] {
	if (!Array.isArray(data) || data.length > MAX_NOTES) return false;
	return data.every(
		(n) =>
			n &&
			typeof n === "object" &&
			typeof (n as Note).id === "string" &&
			typeof (n as Note).date === "string" &&
			typeof (n as Note).text === "string" &&
			(n as Note).text.length <= MAX_NOTE_TEXT_LENGTH &&
			typeof (n as Note).createdAt === "number"
	);
}

function validateQuestions(data: unknown): data is QuizQuestion[] {
	if (!Array.isArray(data) || data.length > MAX_QUESTIONS) return false;
	return data.every(
		(q) =>
			q &&
			typeof q === "object" &&
			typeof (q as QuizQuestion).id === "string" &&
			typeof (q as QuizQuestion).question === "string" &&
			(q as QuizQuestion).question.length <= MAX_QUESTION_TEXT_LENGTH &&
			Array.isArray((q as QuizQuestion).options) &&
			(q as QuizQuestion).options.length === 4 &&
			(q as QuizQuestion).options.every((o) => typeof o === "string") &&
			typeof (q as QuizQuestion).correctIndex === "number" &&
			(q as QuizQuestion).correctIndex >= 0 &&
			(q as QuizQuestion).correctIndex <= 3 &&
			typeof (q as QuizQuestion).explanation === "string"
	);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			const url = new URL(request.url);

			// Handle CORS preflight before auth, since browsers send it
			// without an Authorization header.
			if (request.method === "OPTIONS") {
				return new Response(null, { status: 204, headers: corsHeaders(env) });
			}

			if (!isAuthorized(request, env)) {
				return jsonResponse({ error: "Unauthorized" }, 401, env);
			}

			if (url.pathname === "/api/data" && request.method === "GET") {
				const [notesRaw, questionsRaw] = await Promise.all([
					env.EDUHILL_KV.get("notes"),
					env.EDUHILL_KV.get("questions"),
				]);
				return jsonResponse(
					{
						notes: notesRaw ? JSON.parse(notesRaw) : [],
						questions: questionsRaw ? JSON.parse(questionsRaw) : [],
					},
					200,
					env
				);
			}

			if (url.pathname === "/api/notes" && request.method === "PUT") {
				let body: unknown;
				try {
					body = await request.json();
				} catch {
					return jsonResponse({ error: "Invalid JSON body" }, 400, env);
				}
				if (!validateNotes(body)) {
					return jsonResponse({ error: "Invalid notes payload" }, 400, env);
				}
				await env.EDUHILL_KV.put("notes", JSON.stringify(body));
				return jsonResponse({ ok: true, count: body.length }, 200, env);
			}

			if (url.pathname === "/api/questions" && request.method === "PUT") {
				let body: unknown;
				try {
					body = await request.json();
				} catch {
					return jsonResponse({ error: "Invalid JSON body" }, 400, env);
				}
				if (!validateQuestions(body)) {
					return jsonResponse({ error: "Invalid questions payload" }, 400, env);
				}
				await env.EDUHILL_KV.put("questions", JSON.stringify(body));
				return jsonResponse({ ok: true, count: body.length }, 200, env);
			}

			return jsonResponse({ error: "Not found" }, 404, env);
		} catch (err) {
			console.error("EduHill worker error:", err);
			return jsonResponse({ error: "Internal server error" }, 500, env);
		}
	},
} satisfies ExportedHandler<Env>;
