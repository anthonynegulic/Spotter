"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowUp, CalendarDays, MoreHorizontal, Plus, Repeat, SkipForward, Trash2, Undo2 } from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";
import { db } from "@/lib/db/local";
import {
  createSession,
  deleteCardio,
  deleteSet,
  discardSession,
  exerciseHistory,
  findOrCreateExercise,
  finishSession,
  lastTimeFrom,
  logSet,
  planFromItems,
  saveCardio,
  setExerciseIncrement,
  updateSession,
  updateSet,
  type SessionSets,
} from "@/lib/db/repo";
import type { CardioRow, ExerciseRow, PlanItem, ProgramDayRow, ProgramItemRow, SessionRow, SetRow } from "@/lib/db/types";
import { newId } from "@/lib/db/write";
import { useNow } from "@/lib/hooks/useNow";
import { clearRest, startRest } from "@/lib/workout/rest";
import { prsForSets } from "@/lib/workout/summary";
import { btn, Chip, cx, Sheet } from "../ui";
import { CardioCard } from "./CardioCard";
import { ExercisePicker } from "./ExercisePicker";
import { StrengthCard } from "./StrengthCard";

const DEFAULT_REST = 90;

export interface WorkoutViewProps {
  userId: string;
  programId: string | null;
  day: (ProgramDayRow & { items: ProgramItemRow[] }) | null;
  session: SessionRow | null;
  eyebrow: string;
  onChooseDay?: () => void;
  onFinished: (sessionId: string) => void;
}

/** Today's workout: one card per exercise, the current one expanded for logging. */
export function WorkoutView({ userId, programId, day, session, eyebrow, onChooseDay, onFinished }: WorkoutViewProps) {
  const created = useRef<Promise<SessionRow> | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<PlanItem | null>(null);
  const [picker, setPicker] = useState<{ mode: "swap"; item: PlanItem } | { mode: "add" } | null>(null);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const plan = useMemo(() => session?.plan ?? (day ? planFromItems(day.items) : []), [session, day]);
  const exerciseIds = useMemo(
    () => [...new Set(plan.filter((p) => p.type === "strength" && p.exercise_id).map((p) => p.exercise_id!))],
    [plan],
  );

  const data = useLiveQuery(async () => {
    const sets = session ? (await db.sets.where("session_id").equals(session.id).toArray()).filter((s) => !s.deleted_at) : [];
    const cardio = session ? (await db.cardio_entries.where("session_id").equals(session.id).toArray()).filter((c) => !c.deleted_at) : [];
    const exercises = new Map<string, ExerciseRow>();
    const histories = new Map<string, SessionSets[]>();
    for (const id of exerciseIds) {
      const ex = await db.exercises.get(id);
      if (ex) exercises.set(id, ex);
      histories.set(id, await exerciseHistory(id));
    }
    return { sets, cardio, exercises, histories };
  }, [session?.id, exerciseIds.join(",")]);

  const now = useNow(30_000, session !== null);

  if (!data) return null;
  const { sets, cardio, exercises, histories } = data;

  const setsFor = (item: PlanItem): SetRow[] =>
    sets.filter((s) => s.item_key === item.key && s.exercise_id === item.exercise_id).sort((a, b) => a.set_number - b.set_number);
  const cardioFor = (item: PlanItem): CardioRow | undefined => cardio.find((c) => c.item_key === item.key);
  const isComplete = (item: PlanItem, extra = 0) =>
    item.skipped || (item.type === "cardio" ? cardioFor(item) !== undefined : setsFor(item).length + extra >= item.sets);

  const allByExercise = new Map<string, SetRow[]>();
  for (const [id, h] of histories) allByExercise.set(id, h.flatMap((x) => x.sets));
  const prs = prsForSets(sets, allByExercise);

  const current = currentItem(plan, (it) => (it.type === "cardio" ? (cardioFor(it) ? 1 : 0) : setsFor(it).length), isComplete);
  const focus = focusKey && plan.some((p) => p.key === focusKey) ? focusKey : current?.key ?? null;

  const strength = plan.filter((p) => p.type === "strength" && !p.skipped);
  const totalSets = strength.reduce((n, p) => n + p.sets, 0);
  const doneSets = strength.reduce((n, p) => n + Math.min(p.sets, setsFor(p).length), 0);
  const anythingLogged = sets.length > 0 || cardio.length > 0;
  const elapsedMin = session ? Math.max(0, Math.floor((now - new Date(session.started_at).getTime()) / 60000)) : null;

  async function ensureSession(nextPlan = plan): Promise<SessionRow> {
    if (session) return session;
    if (!created.current) {
      created.current = createSession({ userId, programId, day, name: day?.name ?? "Workout", plan: nextPlan });
    }
    return created.current;
  }

  async function savePlan(next: PlanItem[]) {
    if (session) await updateSession(session, { plan: next });
    else await ensureSession(next);
  }

  async function onLog(item: PlanItem, weight: number, reps: number) {
    const s = await ensureSession();
    const logged = setsFor(item);
    await logSet({ userId, sessionId: s.id, exerciseId: item.exercise_id!, itemKey: item.key, setNumber: logged.length + 1, weightKg: weight, reps });

    const count = (it: PlanItem) => setsFor(it).length + (it.key === item.key ? 1 : 0);
    const group = item.superset_group ? plan.filter((p) => p.superset_group === item.superset_group && !p.skipped && p.type === "strength") : [item];
    const roundDone = group.every((g) => count(g) === count(item) || count(g) >= g.sets);
    const remaining = plan.some((p) => !p.skipped && (p.type === "cardio" ? !cardioFor(p) : count(p) < p.sets));

    if (roundDone && remaining) startRest(item.rest_seconds ?? DEFAULT_REST);
    if (!remaining) clearRest();

    // Stay on this card, move to the next exercise in a superset, or let focus fall to the next one.
    if (group.length > 1) {
      const next = [...group].filter((g) => count(g) < g.sets).sort((a, b) => count(a) - count(b) || group.indexOf(a) - group.indexOf(b))[0];
      setFocusKey(next?.key ?? null);
    } else {
      setFocusKey(count(item) >= item.sets ? null : item.key);
    }
  }

  async function onLogCardio(item: PlanItem, values: Pick<CardioRow, "duration_min" | "incline" | "speed_kmh" | "distance_km">) {
    const s = await ensureSession();
    const existing = cardioFor(item);
    await saveCardio({ ...existing, ...values, user_id: userId, session_id: s.id, item_key: item.key, name: item.name });
    if (!existing) setFocusKey(null);
    const remaining = plan.some((p) => p.key !== item.key && !isComplete(p));
    if (!remaining) clearRest();
  }

  async function swap(item: PlanItem, choice: { existing: ExerciseRow } | { name: string; equipment: ExerciseRow["equipment"] }) {
    const ex = "existing" in choice ? choice.existing : await findOrCreateExercise(choice.name, choice.equipment, userId);
    await savePlan(
      plan.map((p) =>
        p.key === item.key
          ? { ...p, exercise_id: ex.id, name: ex.name, equipment: ex.equipment, swapped_from: p.swapped_from ?? p.name, skipped: false }
          : p,
      ),
    );
    setFocusKey(item.key);
  }

  async function add(choice: { existing: ExerciseRow } | { name: string; equipment: ExerciseRow["equipment"] }) {
    const ex = "existing" in choice ? choice.existing : await findOrCreateExercise(choice.name, choice.equipment, userId);
    const item: PlanItem = {
      key: newId(), type: "strength", exercise_id: ex.id, name: ex.name, equipment: ex.equipment, sets: 3,
      reps_min: 8, reps_max: 12, rest_seconds: DEFAULT_REST, superset_group: null, duration_minutes: null, notes: null, skipped: false,
    };
    await savePlan([...plan, item]);
    setFocusKey(item.key);
  }

  function move(item: PlanItem, delta: -1 | 1) {
    const i = plan.findIndex((p) => p.key === item.key);
    const j = i + delta;
    if (j < 0 || j >= plan.length) return;
    const next = [...plan];
    [next[i], next[j]] = [next[j], next[i]];
    void savePlan(next);
  }

  async function finish() {
    if (!session) return;
    await finishSession(session);
    clearRest();
    onFinished(session.id);
  }

  const blocks = groupBlocks(plan);

  return (
    <div className="flex flex-col gap-3 px-[var(--spacing-gutter)]">
      <header className="flex items-start gap-2 pt-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-2">{eyebrow}</p>
          <h1 className="text-display font-extrabold tracking-tight">{session?.name ?? day?.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip tone="blue">
              {doneSets} of {totalSets} sets
            </Chip>
            {elapsedMin !== null && <Chip>{elapsedMin} min</Chip>}
          </div>
        </div>
        <button onClick={() => setHeaderMenu(true)} aria-label="Workout options" className="grid size-12 place-items-center rounded-[var(--radius-panel)] bg-card">
          <MoreHorizontal className="size-6" />
        </button>
      </header>

      {blocks.map((block, bi) =>
        block.group ? (
          <section key={bi} className="rounded-[calc(var(--radius-card)+6px)] border-2 border-dashed border-accent-tint p-1.5">
            <p className="px-3 pt-1 pb-1.5 text-sm font-extrabold text-accent-ink">Superset {block.group}</p>
            <div className="flex flex-col gap-2">{block.items.map(renderItem)}</div>
          </section>
        ) : (
          <Fragment key={bi}>{block.items.map(renderItem)}</Fragment>
        ),
      )}

      <button onClick={() => setPicker({ mode: "add" })} className={`${btn.link} justify-center`}>
        <Plus className="size-5" /> Add exercise
      </button>

      <NotesField session={session} onSave={async (notes) => updateSession(await ensureSession(), { notes })} />

      <button onClick={finish} disabled={!anythingLogged} className={`${btn.primary} mt-1 w-full`}>
        Finish workout
      </button>
      {!anythingLogged && <p className="-mt-1 text-center text-sm text-ink-3">Log a set to start the clock.</p>}

      <Sheet open={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor?.name}>
        {menuFor && (
          <MenuList>
            {menuFor.type === "strength" && (
              <MenuButton icon={Repeat} onClick={() => { setPicker({ mode: "swap", item: menuFor }); setMenuFor(null); }}>
                Swap for today
              </MenuButton>
            )}
            <MenuButton
              icon={menuFor.skipped ? Undo2 : SkipForward}
              onClick={() => {
                void savePlan(plan.map((p) => (p.key === menuFor.key ? { ...p, skipped: !p.skipped } : p)));
                if (focus === menuFor.key) setFocusKey(null);
                setMenuFor(null);
              }}
            >
              {menuFor.skipped ? "Don't skip" : "Skip for today"}
            </MenuButton>
            <MenuButton icon={ArrowUp} onClick={() => { move(menuFor, -1); setMenuFor(null); }}>Move up</MenuButton>
            <MenuButton icon={ArrowDown} onClick={() => { move(menuFor, 1); setMenuFor(null); }}>Move down</MenuButton>
          </MenuList>
        )}
      </Sheet>

      <Sheet open={headerMenu} onClose={() => setHeaderMenu(false)} title="Workout">
        <MenuList>
          <MenuButton icon={Plus} onClick={() => { setPicker({ mode: "add" }); setHeaderMenu(false); }}>Add exercise</MenuButton>
          {onChooseDay && !anythingLogged && (
            <MenuButton icon={CalendarDays} onClick={() => { setHeaderMenu(false); onChooseDay(); }}>Choose a different day</MenuButton>
          )}
          {session && (
            <MenuButton icon={Trash2} danger onClick={() => { setHeaderMenu(false); setConfirmDiscard(true); }}>Discard workout</MenuButton>
          )}
        </MenuList>
      </Sheet>

      <Sheet open={confirmDiscard} onClose={() => setConfirmDiscard(false)} title="Discard this workout?">
        <p className="mb-4 text-ink-2">Everything logged in it will be removed. Your program isn&apos;t affected.</p>
        <div className="flex gap-3">
          <button onClick={() => setConfirmDiscard(false)} className={`${btn.quiet} min-h-14 flex-1`}>Keep it</button>
          <button
            onClick={async () => {
              if (session) await discardSession(session);
              clearRest();
              setConfirmDiscard(false);
            }}
            className={`${btn.primary} flex-1 bg-danger active:bg-danger`}
          >
            Discard
          </button>
        </div>
      </Sheet>

      <ExercisePicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        title={picker?.mode === "swap" ? `Swap ${picker.item.name}` : "Add exercise"}
        defaultEquipment={(picker?.mode === "swap" ? picker.item.equipment : null) ?? "other"}
        onPick={(choice) => {
          if (picker?.mode === "swap") void swap(picker.item, choice);
          else void add(choice);
          setPicker(null);
        }}
      />
    </div>
  );

  function renderItem(item: PlanItem) {
    const focused = focus === item.key && !item.skipped;
    if (item.type === "cardio") {
      return (
        <CardioCard
          key={item.key}
          item={item}
          entry={cardioFor(item)}
          focused={focused}
          onFocus={() => setFocusKey(item.key)}
          onLog={(v) => void onLogCardio(item, v)}
          onDelete={() => {
            const e = cardioFor(item);
            if (e) void deleteCardio(e);
          }}
          onMenu={() => setMenuFor(item)}
        />
      );
    }
    const exercise = item.exercise_id ? exercises.get(item.exercise_id) : undefined;
    const history = item.exercise_id ? histories.get(item.exercise_id) ?? [] : [];
    return (
      <StrengthCard
        key={item.key}
        item={item}
        exercise={exercise}
        logged={setsFor(item)}
        lastTime={lastTimeFrom(history, session?.id ?? null, session?.day_key ?? day?.day_key ?? null, session?.program_id ?? programId)}
        prs={prs}
        focused={focused}
        onFocus={() => setFocusKey(item.key)}
        onLog={(w, r) => void onLog(item, w, r)}
        onEditSet={(s, patch) => void updateSet(s, patch)}
        onDeleteSet={(s) => void deleteSet(s)}
        onAddSet={() => void savePlan(plan.map((p) => (p.key === item.key ? { ...p, sets: p.sets + 1 } : p)))}
        onIncrementChange={(step) => item.exercise_id && void setExerciseIncrement(item.exercise_id, step)}
        onMenu={() => setMenuFor(item)}
      />
    );
  }
}

/**
 * The item to log next: the first unfinished one in order. Within a superset,
 * the exercise with the fewest sets logged, so the group alternates.
 */
export function currentItem(plan: PlanItem[], loggedCount: (it: PlanItem) => number, isComplete: (it: PlanItem) => boolean): PlanItem | null {
  const first = plan.find((p) => !isComplete(p));
  if (!first) return null;
  if (!first.superset_group) return first;
  const group = plan.filter((p) => p.superset_group === first.superset_group && !isComplete(p));
  return group.sort((a, b) => loggedCount(a) - loggedCount(b) || plan.indexOf(a) - plan.indexOf(b))[0];
}

function groupBlocks(plan: PlanItem[]): { group: string | null; items: PlanItem[] }[] {
  const blocks: { group: string | null; items: PlanItem[] }[] = [];
  for (const item of plan) {
    const last = blocks.at(-1);
    if (item.superset_group && last?.group === item.superset_group) last.items.push(item);
    else if (!item.superset_group && last && last.group === null) last.items.push(item);
    else blocks.push({ group: item.superset_group, items: [item] });
  }
  return blocks;
}

function NotesField({ session, onSave }: { session: SessionRow | null; onSave: (notes: string | null) => Promise<unknown> }) {
  const [value, setValue] = useState(session?.notes ?? "");
  return (
    <label className="mt-2 flex flex-col gap-1.5">
      <span className="px-1 text-sm font-bold text-ink-2">Workout notes</span>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const next = value.trim() || null;
          if (next !== (session?.notes ?? null)) void onSave(next);
        }}
        rows={2}
        placeholder="How did it feel?"
        className="rounded-[var(--radius-card)] bg-card p-4 outline-none focus:ring-2 focus:ring-accent"
      />
    </label>
  );
}

function MenuList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

function MenuButton({
  icon: Icon,
  onClick,
  children,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button onClick={onClick} className={cx("flex min-h-14 items-center gap-3 rounded-[var(--radius-panel)] bg-pill px-4 text-left text-lg font-bold", danger && "text-danger")}>
      <Icon className="size-5" />
      {children}
    </button>
  );
}
