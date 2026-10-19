// Minimal Supabase stand-in for e2e: GoTrue-ish password auth issuing HS256
// JWTs, and /rest/v1 proxied to a real PostgREST (so RLS is real).
import http from "node:http";
import crypto from "node:crypto";

const SECRET = process.env.E2E_JWT_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-0123";
const PGRST = process.env.E2E_PGRST_URL ?? "http://127.0.0.1:3001";
const USERS = {
  "ante@example.com": { id: "00000000-0000-0000-0000-00000000000a", password: "pass-ante" },
  "abrar@example.com": { id: "00000000-0000-0000-0000-00000000000b", password: "pass-abrar" },
};
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
export function jwt(payload) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
if (process.argv[2] === "anon-key") {
  console.log(jwt({ role: "anon", iss: "e2e", exp: 4102444800 }));
  process.exit(0);
}

function session(email) {
  const u = USERS[email];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: u.id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  return { access_token: jwt({ sub: u.id, role: "authenticated", aud: "authenticated", email, exp }), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: `rt-${email}`, user };
}
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "access-control-expose-headers": "*",
};
const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json", ...cors }); res.end(body === undefined ? "" : JSON.stringify(body)); };

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, "http://x");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  if (url.pathname === "/auth/v1/token") {
    const body = JSON.parse(raw.toString() || "{}");
    if (url.searchParams.get("grant_type") === "password") {
      const u = USERS[body.email];
      if (!u || u.password !== body.password) return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials", msg: "Invalid login credentials" });
      return send(res, 200, session(body.email));
    }
    const email = String(body.refresh_token ?? "").replace(/^rt-/, "");
    if (!USERS[email]) return send(res, 400, { error: "invalid_grant" });
    return send(res, 200, session(email));
  }
  if (url.pathname === "/auth/v1/user") {
    const tok = (req.headers.authorization ?? "").replace("Bearer ", "");
    const payload = JSON.parse(Buffer.from(tok.split(".")[1] ?? "", "base64url").toString() || "{}");
    const email = payload.email;
    if (!USERS[email]) return send(res, 401, { msg: "bad jwt" });
    return send(res, 200, session(email).user);
  }
  if (url.pathname === "/auth/v1/logout") return send(res, 204);
  if (url.pathname.startsWith("/rest/v1/")) {
    const headers = { ...req.headers };
    delete headers.host; delete headers.apikey; delete headers["content-length"];
    const r = await fetch(`${PGRST}${url.pathname.slice(8)}${url.search}`, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : raw });
    const text = await r.text();
    const out = { ...cors, "content-type": r.headers.get("content-type") ?? "application/json" };
    const range = r.headers.get("content-range"); if (range) out["content-range"] = range;
    res.writeHead(r.status, out);
    return res.end(text);
  }
  send(res, 404, { msg: "not found" });
}).listen(54321, "127.0.0.1", () => console.log("gateway on 54321"));
