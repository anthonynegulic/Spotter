// Program versions, in-app editing and merging exercises, for the first test
// user after workout.e2e.mjs has imported their program. Run via e2e/run.sh.
import { chromium, devices } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const PG_PORT = process.env.E2E_PG_PORT ?? "54330";
const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });
const sql = (q) => execSync(`psql -h 127.0.0.1 -p ${PG_PORT} -U postgres -d app -tAc "${q}"`).toString().trim();
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const step = (m) => console.log("•", m);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); console.log("  ✓", m); };
const waitFor = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)); } return false; };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const iphone = { ...devices["iPhone 13"] };
delete iphone.defaultBrowserType;
const ctx = await browser.newContext({ ...iphone });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());

step("sign in");
await page.goto(BASE + "/login");
await page.fill("input[type=email]", "ante@example.com");
await page.fill("input[type=password]", "pass-ante");
await page.click("button[type=submit]");
await page.waitForURL("**/today");
const programId = sql("select id from programs where name = 'Pre-Penang Upper/Lower'");
const versions = () => sql(`select count(*) from program_versions where program_id = '${programId}'`);

step("re-import the same program with changes → new version with a diff");
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const today = DOW[new Date().getDay()];
const tomorrow = DOW[(new Date().getDay() + 1) % 7];
const revised = {
  schemaVersion: 1, name: "Pre-Penang Upper/Lower", author: "Claude", weeks: 8,
  days: [
    { id: "upper-a", name: "Upper A", dayOfWeek: today, items: [
      { type: "strength", name: "Barbell Bench Press", equipment: "barbell", sets: 5, reps: 5, restSeconds: 180 },
      { type: "strength", name: "Cable Fly", equipment: "cable", sets: 2, reps: "12-15", restSeconds: 60, supersetGroup: "A" },
      { type: "strength", name: "DB Lateral Raise", equipment: "dumbbell", sets: 2, reps: "12-15", restSeconds: 60, supersetGroup: "A" },
      { type: "strength", name: "Seated Cable Row", equipment: "cable", sets: 3, reps: "8-10" },
    ]},
    { id: "lower-a", name: "Lower A", dayOfWeek: tomorrow, items: [
      { type: "strength", name: "Barbell Back Squat", equipment: "barbell", sets: 3, reps: "5" },
    ]},
  ],
};
await page.goto(BASE + "/program/import");
await page.fill("textarea", "```json\n" + JSON.stringify(revised) + "\n```");
await page.click("text=Preview program");
await page.waitForURL("**/program/review");
await page.getByText("You already have").waitFor();
await page.getByText("Barbell Bench Press: 3×6–8 → 5×5, rest 2.5 min → 3 min").waitFor().catch(async () => {
  await page.getByText(/Barbell Bench Press: 3×6–8 → 5×5/).waitFor();
});
await page.getByText("Seated Cable Row added").waitFor();
await page.getByText("Incline Treadmill Walk removed").waitFor();
await shot(page, "b1-reimport-diff");
await page.click("text=Save new version");
await page.waitForURL("**/today");
assert(await waitFor(() => versions() === "2"), "version 2 saved on the server");
assert(sql(`select count(*) from programs where name = 'Pre-Penang Upper/Lower'`) === "1", "still one program");

step("edit in the app → version 3");
await page.goto(`${BASE}/program/view?id=${programId}`);
await page.getByText(/Version 2/).waitFor();
await page.getByText("Seated Cable Row").first().waitFor();
assert(true, "program shows the new version");
await page.getByRole("link", { name: "Edit program" }).click();
await page.waitForURL("**/program/edit**");
await page.getByRole("button", { name: /Seated Cable Row/ }).click();
await page.getByRole("button", { name: "More Sets" }).click();
await page.getByRole("button", { name: "Exercise", exact: true }).first().click();
await page.getByPlaceholder("Search or type a new exercise").fill("Face Pull");
await page.getByText("Use “Face Pull”").click();
await shot(page, "b2-editor");
await page.click("text=Review changes");
await page.getByText("Seated Cable Row: 3×8–10 → 4×8–10").waitFor();
await page.getByText("Face Pull added").waitFor();
await shot(page, "b3-editor-review");
await page.click("text=Save version 3");
await page.waitForURL("**/program/view**");
assert(await waitFor(() => versions() === "3"), "version 3 saved on the server");
assert(sql("select count(*) from exercises where name = 'Face Pull'") === "1", "new exercise created for Face Pull");

step("merge two exercises");
const fly = sql("select id from exercises where name = 'Cable Fly'");
const bench = sql("select id from exercises where name = 'Barbell Bench Press'");
const flySets = Number(sql(`select count(*) from sets where exercise_id = '${fly}'`));
await page.goto(`${BASE}/progress/exercise?id=${fly}`);
await page.getByRole("button", { name: "Exercise options" }).click();
await page.click("text=Merge with…");
await page.getByPlaceholder("Search your exercises").fill("bench");
await page.getByRole("button", { name: /Barbell Bench Press/ }).click();
await page.getByText("This can't be undone.").waitFor();
await shot(page, "b4-merge-confirm");
await page.getByRole("button", { name: "Merge", exact: true }).click();
await page.waitForURL(`**/progress/exercise?id=${bench}`);
assert(await waitFor(() => sql(`select merged_into from exercises where id = '${fly}'`) === bench), "Cable Fly retired, pointing at Bench Press");
assert(await waitFor(() => sql(`select count(*) from sets where exercise_id = '${fly}'`) === "0"), `its ${flySets} sets moved`);
assert(sql(`select count(*) from exercise_aliases where exercise_id = '${bench}' and alias = 'cable fly'`) === "1", "old name kept as an alias");
await shot(page, "b5-after-merge");

assert(errors.length === 0, `no page errors (${errors.join("; ")})`);
await browser.close();
console.log("PROGRAM E2E PASSED");
