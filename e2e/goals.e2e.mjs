// Daily goals for the first test user. Run via e2e/run.sh.
import { chromium, devices } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const PG_PORT = process.env.E2E_PG_PORT ?? "54330";
const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });
const sql = (q) => execSync(`psql -h 127.0.0.1 -p ${PG_PORT} -U postgres -d app -tAc "${q}"`).toString().trim();
const shot = (page, name, full = false) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
const step = (m) => console.log("•", m);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); console.log("  ✓", m); };
const waitFor = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)); } return false; };
const U = "00000000-0000-0000-0000-00000000000a";
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const iphone = { ...devices["iPhone 13"] };
delete iphone.defaultBrowserType;
const errors = [];

async function signIn(ctx) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE + "/login");
  await page.fill("input[type=email]", "ante@example.com");
  await page.fill("input[type=password]", "pass-ante");
  await page.click("button[type=submit]");
  await page.waitForURL("**/today");
  return page;
}

step("defaults appear once, even with two phones");
const phone1 = await browser.newContext({ ...iphone });
const phone2 = await browser.newContext({ ...iphone });
const [page, page2] = await Promise.all([signIn(phone1), signIn(phone2)]);
await Promise.all([page.goto(BASE + "/goals"), page2.goto(BASE + "/goals")]);
await page.getByRole("heading", { name: "Protein" }).waitFor();
await page2.getByRole("heading", { name: "Protein" }).waitFor();
assert(await waitFor(() => sql(`select count(*) from daily_goals where user_id = '${U}'`) === "5"), "5 default goals on the server, not 10");
await phone2.close();

step("protein follows body weight");
await page.getByText("Add your weight to set your protein target").waitFor();
await page.getByRole("button", { name: "Add", exact: true }).first().click();
await page.getByLabel("Amount in kg").fill("85.3");
await page.getByRole("button", { name: "Save" }).click();
await page.getByText("2 g per kg of 85.3 kg").waitFor();
assert(await page.getByText("/ 170 g").count() === 1, "protein target 170 g (2 × 85.3, rounded to 5)");

step("quick-add, custom amount and undo");
const protein = page.locator("div.rounded-\\[var\\(--radius-card\\)\\]", { has: page.getByRole("heading", { name: "Protein" }) });
await protein.getByRole("button", { name: "+30 g" }).click();
await protein.getByRole("button", { name: "+30 g" }).click();
await protein.getByRole("button", { name: "Other" }).click();
await page.getByLabel("Amount in g").fill("25");
await page.getByRole("button", { name: "Add", exact: true }).click();
await protein.getByText("85", { exact: true }).waitFor();
await protein.getByRole("button", { name: "Remove 30 g" }).first().click();
await protein.getByText("55", { exact: true }).waitFor();
assert(await waitFor(() => sql(`select sum(value) from daily_entries e join daily_goals g on g.id = e.goal_id where g.type = 'protein' and e.deleted_at is null`) === "55.00"), "server sums to 55 g after removing one +30");

step("steps entered by hand, with a streak from previous days");
const stepsId = sql(`select id from daily_goals where user_id = '${U}' and type = 'steps'`);
sql(`update daily_goals set created_at = now() - interval '10 days' where id = '${stepsId}'`);
for (const n of [1, 2, 3]) sql(`insert into daily_entries (id, user_id, goal_id, date, value) values ('${randomUUID()}', '${U}', '${stepsId}', '${daysAgo(n)}', 11000)`);
await page.reload();
const steps = page.locator("div.rounded-\\[var\\(--radius-card\\)\\]", { has: page.getByRole("heading", { name: "Steps" }) });
await steps.getByText("3-day streak").waitFor();
assert(true, "3-day streak while today is still in progress");
await steps.getByRole("button", { name: "Enter today's total" }).click();
await page.getByLabel("Amount in steps").fill("10500");
await page.getByRole("button", { name: "Save" }).click();
await steps.getByText("4-day streak").waitFor();
assert(true, "today's total completes the goal and extends the streak");
await shot(page, "c1-goals");
await page.screenshot({ path: `${SHOTS}/c1-goals-full.png`, fullPage: true });

step("history sheet");
await steps.getByRole("button", { name: "Steps history" }).click();
await page.getByText("Current streak").waitFor();
await shot(page, "c2-history");
await page.getByRole("button", { name: "Close" }).click({ position: { x: 20, y: 20 } });

step("edit: add a yes/no goal, hide water, change the step target");
await page.getByRole("link", { name: "Edit" }).click();
await page.waitForURL("**/goals/edit");
await page.getByPlaceholder("e.g. Stretch 10 minutes").fill("Creatine");
await page.getByRole("button", { name: "Add goal" }).click();
await page.getByRole("switch", { name: "Show Water" }).click();
const stepTarget = page.locator("div.rounded-\\[var\\(--radius-card\\)\\]", { has: page.locator('input[value="Steps"]') }).getByRole("textbox").nth(1);
await stepTarget.fill("12000");
await stepTarget.blur();
await shot(page, "c3-edit");
assert(await waitFor(() => sql(`select target from daily_goals where id = '${stepsId}'`) === "12000.00"), "step target saved");
await page.getByRole("link", { name: "Back" }).click();
await page.waitForURL("**/goals");
await page.getByRole("heading", { name: "Creatine" }).waitFor();
assert(await page.getByRole("heading", { name: "Water" }).count() === 0, "water hidden");
await page.getByText("1 hidden goal").waitFor();
await page.getByRole("button", { name: "Mark as done" }).click();
await page.getByRole("button", { name: "Done" }).waitFor();
assert(await waitFor(() => sql(`select count(*) from daily_entries e join daily_goals g on g.id = e.goal_id where g.label = 'Creatine' and e.deleted_at is null`) === "1"), "yes/no goal ticked off");

step("yesterday");
await page.getByRole("button", { name: "Previous day" }).click();
await page.getByText("Yesterday").waitFor();
await steps.getByText("11,000").waitFor();
assert(true, "yesterday shows yesterday's steps");

assert(errors.length === 0, `no page errors (${errors.join("; ")})`);
await browser.close();
console.log("GOALS E2E PASSED");
