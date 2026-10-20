// The Apple Health bridge for the second test user (after progress.e2e.mjs,
// which leaves a workout in progress today). Posts a Health Auto Export
// payload to the ingest endpoint and checks it lands in the app.
import { chromium, devices } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const API = "http://localhost:54321";
const PG_PORT = process.env.E2E_PG_PORT ?? "54330";
const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });
const sql = (q) => execSync(`psql -h 127.0.0.1 -p ${PG_PORT} -U postgres -d app -tAc "${q}"`).toString().trim();
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const step = (m) => console.log("•", m);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); console.log("  ✓", m); };
const waitFor = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };
const U = "00000000-0000-0000-0000-00000000000b";

// The fixture, moved to today, with the strength workout around the session in progress.
const pad = (n) => String(n).padStart(2, "0");
const offset = () => { const m = -new Date().getTimezoneOffset(); return `${m >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(m) / 60))}${pad(Math.abs(m) % 60)}`; };
const hae = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${offset()}`;
const today = new Date();
const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
const fixture = JSON.parse(readFileSync("supabase/functions/_shared/__tests__/fixture-v2.json", "utf8"));
for (const m of fixture.data.metrics) for (const p of m.data) p.date = hae(midnight);
fixture.data.workouts[0].start = hae(new Date(Date.now() - 20 * 60_000));
fixture.data.workouts[0].end = hae(new Date(Date.now() + 25 * 60_000));
fixture.data.workouts[1].start = hae(new Date(Date.now() - 6 * 3600_000));
fixture.data.workouts[1].end = hae(new Date(Date.now() - 6 * 3600_000 + 20 * 60_000));
const post = (token, body = fixture) =>
  fetch(`${API}/functions/v1/health-ingest`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "X-Ingest-Token": token } : {}) }, body: JSON.stringify(body) });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const iphone = { ...devices["iPhone 13"] };
delete iphone.defaultBrowserType;
const ctx = await browser.newContext({ ...iphone, permissions: ["clipboard-read", "clipboard-write"] });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

step("sign in and create a token");
await page.goto(BASE + "/login");
await page.fill("input[type=email]", "abrar@example.com");
await page.fill("input[type=password]", "pass-abrar");
await page.click("button[type=submit]");
await page.waitForURL("**/today");
await page.goto(BASE + "/settings");
await page.getByText("Not connected").waitFor();
await page.getByRole("button", { name: "Create a token" }).click();
await page.getByRole("button", { name: "Create token" }).click();
await page.getByText("Copy it now").waitFor();
const token = (await page.locator("code").first().innerText()).trim();
assert(token.startsWith("spt_") && token.length > 40, "token shown once");
assert((await page.locator("code").nth(1).innerText()).endsWith("/functions/v1/health-ingest"), "endpoint URL shown");
await shot(page, "d1-token");
await page.getByRole("button", { name: "Done" }).click();
assert(await waitFor(() => sql(`select count(*) from ingest_tokens where user_id = '${U}'`) === "1"), "token hash synced");
assert(!sql(`select token_hash from ingest_tokens where user_id = '${U}'`).includes(token), "only the hash is stored");

step("ingest endpoint");
assert((await post(null)).status === 401, "no token → 401");
assert((await post("spt_wrong")).status === 401, "wrong token → 401");
const res = await post(token);
const body = await res.json();
assert(res.status === 200 && body.samples === 7 && body.workouts === 2, `accepted ${JSON.stringify(body)}`);
await post(token);
assert(sql(`select count(*) from health_samples where user_id = '${U}' and source <> 'manual'`) === "7", "re-send didn't duplicate samples");
assert(sql(`select count(*) from health_workouts where user_id = '${U}'`) === "2", "re-send didn't duplicate workouts");
assert(sql(`select round(value) from health_samples where user_id = '${U}' and metric = 'active_energy'`) === "500", "kJ stored as kcal");

step("the app shows it");
await page.reload();
await page.getByText(/Last received just now|Last received \d+ min ago/).waitFor({ timeout: 20000 });
await page.getByText("7 daily readings and 2 workouts so far.").waitFor();
await page.getByText("How to set up Health Auto Export").click();
await shot(page, "d2-settings");
await page.goto(BASE + "/goals");
const steps = page.locator("div.rounded-\\[var\\(--radius-card\\)\\]", { has: page.getByRole("heading", { name: "Steps" }) });
await steps.getByText("8,000").waitFor();
await steps.getByText("From Apple Health").waitFor();
assert(await page.getByText("Connect Apple Health").count() === 0, "connect prompt gone");
await shot(page, "d3-goals");
await page.goto(BASE + "/progress");
await page.getByRole("heading", { name: "Body weight" }).waitFor();
await page.getByText("80.4").first().waitFor();
await page.getByRole("heading", { name: "Daily activity" }).waitFor();
await page.getByRole("heading", { name: "Body weight" }).scrollIntoViewIfNeeded();
await shot(page, "d4-progress-body");

step("finishing the session in progress shows the Watch workout");
await page.goto(BASE + "/today");
await page.getByRole("button", { name: "Finish workout" }).click();
await page.getByText("From your Watch").waitFor();
await page.getByText("Traditional Strength Training, matched by time.").waitFor();
await shot(page, "d5-summary-watch");

step("revoking a token stops it");
await page.goto(BASE + "/settings");
await page.getByRole("button", { name: "Revoke…" }).click();
await page.getByRole("button", { name: "Revoke", exact: true }).click();
assert(await waitFor(async () => (await post(token)).status === 401), "revoked token → 401");

assert(errors.length === 0, `no page errors (${errors.join("; ")})`);
await browser.close();
console.log("HEALTH E2E PASSED");
