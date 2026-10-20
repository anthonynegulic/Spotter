// Progress screens with three months of history, seeded straight into Postgres
// for the second test user. Run via e2e/run.sh after workout.e2e.mjs.
import { chromium, devices } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const PG_PORT = process.env.E2E_PG_PORT ?? "54330";
const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });
const psql = (sqlText) => execSync(`psql -h 127.0.0.1 -p ${PG_PORT} -U postgres -d app -v ON_ERROR_STOP=1 -q`, { input: sqlText }).toString();
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const step = (m) => console.log("•", m);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); console.log("  ✓", m); };

const U = "00000000-0000-0000-0000-00000000000b";
const todayDow = ((new Date().getDay() + 6) % 7) + 1;
const ids = { program: randomUUID(), version: randomUUID(), day: randomUUID(), other: randomUUID(), bench: randomUUID(), row: randomUUID(), item: randomUUID(), item2: randomUUID() };
let sql = `
insert into programs (id, user_id, name, is_active, activated_at) values ('${ids.program}', '${U}', 'Strength Block', true, now() - interval '13 weeks');
insert into program_versions (id, user_id, program_id, version, schema_version, weeks, raw_json) values ('${ids.version}', '${U}', '${ids.program}', 1, 1, 16, '{}');
insert into program_days (id, user_id, program_version_id, day_key, name, day_of_week, sort) values
  ('${ids.day}', '${U}', '${ids.version}', 'push', 'Push', ${todayDow}, 0),
  ('${ids.other}', '${U}', '${ids.version}', 'pull', 'Pull', ${(todayDow % 7) + 1}, 1);
insert into exercises (id, user_id, name, equipment, increment_kg) values
  ('${ids.bench}', '${U}', 'Barbell Bench Press', 'barbell', 2.5),
  ('${ids.row}', '${U}', 'Pull-Up', 'bodyweight', 2.5);
insert into program_items (id, user_id, program_day_id, exercise_id, type, name, sort, equipment, sets, reps_min, reps_max, rest_seconds) values
  ('${ids.item}', '${U}', '${ids.day}', '${ids.bench}', 'strength', 'Barbell Bench Press', 0, 'barbell', 3, 6, 8, 120),
  ('${ids.item2}', '${U}', '${ids.other}', '${ids.row}', 'strength', 'Pull-Up', 0, 'bodyweight', 3, 6, 10, 120);
`;
// ~3 sessions a week for 13 weeks, bench creeping up with a dip mid-way.
const now = Date.now();
let w = 70;
for (let i = 13 * 7; i >= 1; i--) {
  if (i % 7 === 0 || i % 7 === 3 || (i % 7 === 5 && i % 2 === 0)) {
    const started = new Date(now - i * 86400000);
    started.setHours(7, 0, 0, 0);
    const sid = randomUUID();
    w = Math.min(85, w + (i > 40 && i < 50 ? -2.5 : 0.5));
    const kg = Math.round(w / 2.5) * 2.5;
    sql += `insert into sessions (id, user_id, program_id, program_day_id, day_key, name, started_at, finished_at) values ('${sid}', '${U}', '${ids.program}', '${ids.day}', 'push', 'Push', '${started.toISOString()}', '${new Date(started.getTime() + 3600e3).toISOString()}');\n`;
    [8, 7, 7].forEach((r, n) => {
      sql += `insert into sets (id, user_id, session_id, exercise_id, item_key, set_number, weight_kg, reps, logged_at) values ('${randomUUID()}', '${U}', '${sid}', '${ids.bench}', 'seed', ${n + 1}, ${kg}, ${r}, '${new Date(started.getTime() + n * 300e3).toISOString()}');\n`;
    });
    if (i % 2 === 0) {
      sql += `insert into sets (id, user_id, session_id, exercise_id, item_key, set_number, weight_kg, reps, logged_at) values ('${randomUUID()}', '${U}', '${sid}', '${ids.row}', 'seed', 1, ${Math.floor((91 - i) / 30) * 2.5}, 8, '${new Date(started.getTime() + 1200e3).toISOString()}');\n`;
    }
  }
}
psql(sql);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const iphone = { ...devices["iPhone 13"] };
delete iphone.defaultBrowserType;
const ctx = await browser.newContext({ ...iphone });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

step("sign in as the second user with seeded history");
await page.goto(BASE + "/login");
await page.fill("input[type=email]", "abrar@example.com");
await page.fill("input[type=password]", "pass-abrar");
await page.click("button[type=submit]");
await page.waitForURL("**/today");
await page.getByText("Push").first().waitFor();

step("progress tab");
await page.goto(BASE + "/progress");
await page.getByText("Sessions per week").waitFor();
assert(await page.getByText(/This week \d+ of 2/).count() === 1, "this week x of 2 (calendar program target)");
await shot(page, "p1-progress");
await page.getByRole("tab", { name: "Volume" }).click();
await page.getByText("Volume per week").waitFor();
await page.getByRole("tab", { name: "Sessions" }).click();
await page.screenshot({ path: `${SHOTS}/p2-progress-full.png`, fullPage: true });

step("exercise detail");
await page.getByRole("link", { name: /Barbell Bench Press/ }).first().click();
await page.waitForURL("**/progress/exercise**");
await page.getByText("Estimated 1RM").waitFor();
assert(await page.locator(".recharts-area-curve").count() === 1, "e1RM chart drawn");
assert(await page.getByText(/kg since/).count() === 1, "change chip shown");
await shot(page, "p3-exercise");
await page.getByRole("tab", { name: "4W" }).click();
await shot(page, "p4-exercise-4w");
await page.getByRole("tab", { name: "Top set" }).click();
await page.getByText("Top set").first().waitFor();
await page.getByRole("tab", { name: "All" }).click();
const box = await page.locator(".recharts-surface").first().boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.locator(".recharts-tooltip-wrapper").getByText(/kg/).waitFor();
await shot(page, "p5-exercise-tooltip");

step("logging a heavier set celebrates a PR");
await page.goto(BASE + "/today");
await page.getByText("Barbell Bench Press").first().waitFor();
for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "More weight" }).click();
await page.click("text=Log set");
await page.getByText("New PR!").waitFor();
await page.waitForTimeout(1000);
assert(await page.getByText("New PR!").isVisible(), "PR toast still showing after the session starts");
await shot(page, "p6-pr-toast");
step("bodyweight lift shows top set, not an estimated 1RM");
await page.goto(`${BASE}/progress/exercise?id=${ids.row}`);
await page.getByText("Top set (added weight)").waitFor();
assert(await page.getByRole("tab", { name: "Est. 1RM" }).count() === 0, "no Est. 1RM toggle for pull-ups");

assert(errors.length === 0, `no page errors (${errors.join("; ")})`);
await browser.close();
console.log("PROGRESS E2E PASSED");
