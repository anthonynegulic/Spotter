// Phase 1 acceptance flow, driven in Chromium with iPhone emulation against
// the static build. Run via e2e/run.sh, which starts everything it needs.
import { chromium, devices } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const PG_PORT = process.env.E2E_PG_PORT ?? "54330";
const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });
const sql = (q) => execSync(`psql -h 127.0.0.1 -p ${PG_PORT} -U postgres -d app -tAc "${q}"`).toString().trim();
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
const step = (m) => console.log("•", m);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); console.log("  ✓", m); };
const waitFor = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 200)); } return false; };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const iphone = { ...devices["iPhone 13"] };
delete iphone.defaultBrowserType;
const ctx = await browser.newContext({ ...iphone, serviceWorkers: "allow" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

step("sign in");
await page.goto(BASE + "/today");
await page.waitForURL("**/login");
await page.fill('input[type=email]', "ante@example.com");
await page.fill('input[type=password]', "wrong");
await page.click("button[type=submit]");
await page.getByText("don't match").waitFor();
await page.fill('input[type=password]', "pass-ante");
await page.click("button[type=submit]");
await page.waitForURL("**/today");
await page.getByText("Import a program").waitFor();
await shot(page, "01-empty-today");

step("import a chat reply with fences and chatter");
// Schedule Upper A for today and Lower A for tomorrow, whatever day this runs.
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const today = DOW[new Date().getDay()];
const tomorrow = DOW[(new Date().getDay() + 1) % 7];
const program = {
  schemaVersion: 1, name: "Pre-Penang Upper/Lower", author: "Claude", weeks: 8,
  progressionNotes: "Add 2.5 kg when all sets hit the top of the rep range.",
  days: [
    { id: "upper-a", name: "Upper A", dayOfWeek: today, items: [
      { type: "strength", name: "Barbell Bench Press", equipment: "barbell", sets: 3, reps: "6-8", restSeconds: 150, supersetGroup: null, notes: "Pause first rep" },
      { type: "strength", name: "Cable Fly", equipment: "cable", sets: 2, reps: "12-15", restSeconds: 60, supersetGroup: "A" },
      { type: "strength", name: "DB Lateral Raise", equipment: "dumbbell", sets: 2, reps: "12-15", restSeconds: 60, supersetGroup: "A" },
      { type: "cardio", name: "Incline Treadmill Walk", durationMinutes: 20, notes: "Incline 10-12" },
    ]},
    { id: "lower-a", name: "Lower A", dayOfWeek: tomorrow, items: [
      { type: "strength", name: "Dumbbell Lateral Raise", equipment: "dumbbell", sets: 3, reps: 15 },
      { type: "strength", name: "Barbell Back Squat", equipment: "barbell", sets: 3, reps: "5" },
    ]},
  ],
};
await page.goto(BASE + "/program/import");
await page.fill("textarea", "this is not json");
await page.click("text=Preview program");
await page.getByText("Couldn't find any JSON").waitFor();
const bad = structuredClone(program); bad.days[1].items[1].sets = "three";
await page.fill("textarea", JSON.stringify(bad));
await page.click("text=Preview program");
await page.getByText("Day 2 (Lower A), exercise 2 (Barbell Back Squat): `sets` must be a number").waitFor();
await shot(page, "02-import-error");
await page.fill("textarea", "Here's your program in Spotter's format:\n\n```json\n" + JSON.stringify(program, null, 2) + "\n```\n\nGood luck!");
await shot(page, "03-import");
await page.click("text=Preview program");
await page.waitForURL("**/program/review");
await page.getByText("2 days a week").waitFor();
await page.getByText("Cable Fly + DB Lateral Raise").waitFor();
await shot(page, "04-review");
await page.click("text=Save program");
await page.waitForURL("**/today");

const synced = await waitFor(() => sql("select count(*) from program_items") === "6");
assert(synced, "program synced to the server (6 items)");
assert(sql("select count(*) from exercises") === "4", "DB Lateral Raise and Dumbbell Lateral Raise matched to one exercise (4 exercises)");
assert(sql("select alias from exercise_aliases") === "dumbbell lateral raise", "imported variant stored as alias");

step("today's workout");
await page.getByText("Upper A").first().waitFor();
const weight = page.getByRole("button", { name: "Choose weight" });
assert((await weight.innerText()).startsWith("20"), "no history: barbell starts at 20 kg");
assert((await page.getByRole("button", { name: "Choose reps" }).innerText()).startsWith("6"), "reps start at bottom of range");
await shot(page, "05-today");

step("log set 1 with one tap");
await page.click("text=Log set");
await page.getByText("Set 1").first().waitFor();
await page.getByRole("timer").waitFor();
assert(await page.getByText(/^2:(2|3)\d$/).count() === 1 || await page.getByRole("timer").innerText().then(t => t.includes("2:")), "rest timer started at ~2:30");
await shot(page, "06-logged-set1");

step("wheel picker: scroll to pick, Done applies");
await page.getByRole("button", { name: "Choose weight" }).click();
const wheel = page.getByRole("listbox", { name: "Weight" });
await wheel.waitFor();
await wheel.evaluate((el) => el.scrollBy({ top: 48 * 4 }));
await page.waitForTimeout(400);
await shot(page, "05b-wheel");
await page.getByRole("button", { name: "Done" }).click();
assert((await weight.innerText()).startsWith("30"), "scrolling 4 notches picks 30 kg");
await page.getByRole("button", { name: "Less weight" }).click();
await page.getByRole("button", { name: "Less weight" }).click();
await page.getByRole("button", { name: "Less weight" }).click();
await page.getByRole("button", { name: "Less weight" }).click();
assert((await weight.innerText()).startsWith("20"), "nudged back to 20");

step("nudge weight and log set 2");
await page.getByRole("button", { name: "More weight" }).click();
await page.getByRole("button", { name: "More weight" }).click();
assert((await weight.innerText()).startsWith("25"), "nudges by barbell increment (2.5)");
await page.click("text=Log set");
assert(await waitFor(() => sql("select count(*) from sets") === "2"), "two sets synced");

step("rest timer survives reload (timestamp based)");
const before = await page.getByRole("timer").innerText();
await page.reload();
await page.getByRole("timer").waitFor();
const after = await page.getByRole("timer").innerText();
assert(after.includes(":"), `timer still running after reload (${before.split("\n")[1]} → ${after.split("\n")[1]})`);

step("offline: app loads from the service worker and logs locally");
await page.evaluate(() => navigator.serviceWorker.ready);
await ctx.setOffline(true);
await page.reload();
await page.getByText("Upper A").first().waitFor();
assert((await weight.innerText()).startsWith("25"), "set 3 pre-fills today's bumped weight");
await page.click("text=Log set");
await page.getByText(/Offline\. 1 change/).waitFor();
await shot(page, "07-offline");
assert(sql("select count(*) from sets") === "2", "server untouched while offline");
await page.goto(BASE + "/program"); // navigating offline works too
await page.getByText("Pre-Penang Upper/Lower").waitFor();
await page.goto(BASE + "/today");
await page.getByText("Upper A").first().waitFor();

step("back online: queued set syncs once");
await ctx.setOffline(false);
assert(await waitFor(() => sql("select count(*) from sets") === "3", 15000), "third set synced");
assert(sql("select count(distinct id) from sets") === "3", "no duplicates");

step("superset alternates and cardio logs in one tap");
await page.getByText("Cable Fly").first().waitFor();
const focusedName = async () => (await page.locator("h3").first().innerText());
assert((await focusedName()) === "Cable Fly", "bench done, focus moves to superset A1");
await page.click("text=Log set");
assert(await waitFor(async () => (await focusedName()) === "DB Lateral Raise"), "after A1, focus moves to A2");
await page.click("text=Log set");
assert(await waitFor(async () => (await focusedName()) === "Cable Fly"), "after A2, back to A1 for round 2");
await page.click("text=Log set");
await page.click("text=Log set");
await page.getByText("Incline Treadmill Walk").first().waitFor();
await page.click("text=Log cardio");
assert(await waitFor(() => sql("select duration_min from cardio_entries") === "20.0"), "cardio logged with program duration");
await shot(page, "08-all-done");

step("edit sheet opens for a logged set");
await page.getByText("Barbell Bench Press").first().click();
await page.getByRole("button", { name: /Set 3/ }).click();
await page.getByRole("button", { name: "Save" }).waitFor();
await shot(page, "09-edit-sheet");
await page.getByRole("button", { name: "Close" }).click({ position: { x: 20, y: 20 } });

step("finish workout");
await page.click("text=Finish workout");
await page.getByText("Workout complete").waitFor();
await shot(page, "10-summary");
assert(await page.getByText("First workout in the books").count() === 1, "encouraging first-workout message");
assert(await waitFor(() => sql("select count(*) from sessions where finished_at is not null") === "1"), "session finished on the server");
await page.click("text=Done");
await page.getByText("Done for today").waitFor();

step("train again: pre-fill from last time");
await page.click("text=Train again");
await page.getByRole("button", { name: /Upper A/ }).click();
await page.getByText("Last time: 20 kg × 6").or(page.getByText(/Last time: 20 × 6/)).first().waitFor();
assert((await weight.innerText()).startsWith("20"), "set 1 pre-fills last time's set 1 weight");
await page.getByText("Last time 20 × 6").waitFor();
await page.click("text=Log set");
await shot(page, "11-second-session");

step("unfinished session from yesterday prompts finish/discard");
await page.clock.install({ time: new Date(Date.now() + 26 * 3600 * 1000) });
await page.reload();
await page.getByText("Unfinished workout").waitFor();
await shot(page, "12-stale");
await page.click("text=Finish it");
await page.getByText("Lower A").first().waitFor();
await shot(page, "13-next-day");

step("second user sees nothing of the first");
const ctx2 = await browser.newContext({ ...iphone });
const p2 = await ctx2.newPage();
await p2.goto(BASE + "/login");
await p2.fill('input[type=email]', "abrar@example.com");
await p2.fill('input[type=password]', "pass-abrar");
await p2.click("button[type=submit]");
await p2.waitForURL("**/today");
await p2.getByText("Import a program").waitFor();
await p2.goto(BASE + "/program");
await p2.getByText("No programs yet").waitFor();
assert(true, "Abrar's phone shows no programs");

console.log("\nconsole errors:", errors.filter(e => !e.includes("Failed to fetch") && !e.includes("ERR_INTERNET_DISCONNECTED")).slice(0, 10));
await browser.close();
console.log("E2E PASSED");
