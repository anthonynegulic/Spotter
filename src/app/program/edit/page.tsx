"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Minus, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DiffList } from "@/components/DiffList";
import { btn, Card, cx, ScreenHeader, Sheet } from "@/components/ui";
import { ExercisePicker } from "@/components/workout/ExercisePicker";
import { useUserId } from "@/lib/auth";
import { loadProgramTree, type ProgramTree } from "@/lib/db/queries";
import { addProgramVersion } from "@/lib/db/repo";
import { diffPrograms, isEmptyDiff } from "@/lib/program/diff";
import { programToJson, treeToProgram } from "@/lib/program/fromTree";
import { validateProgram } from "@/lib/program/parse";
import { DAYS_OF_WEEK, EQUIPMENT, type Program, type ProgramDay, type ProgramItem } from "@/lib/program/schema";
import { formatReps } from "@/lib/workout/stats";

export default function EditProgramPage() {
  return (
    <AppShell tabs={false}>
      <Suspense>
        <Loader />
      </Suspense>
    </AppShell>
  );
}

function Loader() {
  const id = useSearchParams().get("id");
  const tree = useLiveQuery(() => (id ? loadProgramTree(id) : null), [id]);
  if (tree === undefined) return null;
  if (!tree) {
    return (
      <>
        <ScreenHeader title="Edit program" back="/program" />
        <p className="px-[var(--spacing-gutter)] text-ink-2">That program isn&apos;t on this phone yet.</p>
      </>
    );
  }
  // Keyed on the version so a sync that lands a newer version starts a fresh draft.
  return <Editor key={tree.version.id} tree={tree} />;
}

type Pick = { mode: "swap"; day: number; item: number } | { mode: "add"; day: number } | null;

/**
 * Optional tweaks to a program. Edits are a draft until "Review changes",
 * then saved as a new version, the same as a re-import, so history and the
 * diff behave identically either way.
 */
function Editor({ tree }: { tree: ProgramTree }) {
  const router = useRouter();
  const userId = useUserId();
  const [original] = useState(() => treeToProgram(tree));
  const [draft, setDraft] = useState<Program>(() => structuredClone(original));
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick>(null);
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (fn: (p: Program) => void) =>
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  const back = `/program/view?id=${tree.program.id}`;
  const diff = diffPrograms(original, draft);
  const validation = validateProgram(programToJson(draft));

  async function save() {
    if (!validation.ok) return;
    setSaving(true);
    await addProgramVersion({
      programId: tree.program.id,
      program: validation.program,
      raw: programToJson(validation.program),
      userId,
      makeActive: false,
      restartWeek: false,
    });
    router.replace(back);
  }

  function leave() {
    if (!isEmptyDiff(diff) && !window.confirm("Discard your changes?")) return;
    router.push(back);
  }

  return (
    <>
      <ScreenHeader
        title="Edit program"
        right={
          <button onClick={leave} className={btn.quiet}>
            Cancel
          </button>
        }
      />
      <div className="flex flex-col gap-4 px-[var(--spacing-gutter)] pb-36">
        <Card className="flex flex-col gap-3 p-5">
          <TextField label="Name" value={draft.name} onChange={(v) => update((p) => void (p.name = v))} />
          <div className="flex gap-3">
            <NumberField label="Weeks" value={draft.weeks ?? null} onChange={(v) => update((p) => void (p.weeks = v ?? undefined))} />
          </div>
          <TextField
            label="Progression notes"
            multiline
            value={draft.progressionNotes ?? ""}
            onChange={(v) => update((p) => void (p.progressionNotes = v || undefined))}
          />
        </Card>

        {draft.days.map((day, di) => (
          <DayEditor
            key={day.id}
            day={day}
            index={di}
            count={draft.days.length}
            open={open}
            setOpen={setOpen}
            update={(fn) => update((p) => fn(p.days[di]))}
            move={(delta) =>
              update((p) => {
                const [d] = p.days.splice(di, 1);
                p.days.splice(di + delta, 0, d);
              })
            }
            remove={() => {
              if (window.confirm(`Remove ${day.name} from the program?`)) update((p) => void p.days.splice(di, 1));
            }}
            onSwap={(ii) => setPick({ mode: "swap", day: di, item: ii })}
            onAddExercise={() => setPick({ mode: "add", day: di })}
          />
        ))}

        <button
          onClick={() =>
            update((p) => {
              const used = new Set(p.days.map((d) => d.id));
              let n = p.days.length + 1;
              while (used.has(`day-${n}`)) n++;
              p.days.push({ id: `day-${n}`, name: `Day ${n}`, dayOfWeek: null, items: [] });
            })
          }
          className={`${btn.tinted} w-full`}
        >
          <Plus className="size-5" /> Add day
        </button>
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-[var(--spacing-gutter)] pt-6">
        <div className="mx-auto max-w-xl pb-4">
          <button onClick={() => setReview(true)} disabled={isEmptyDiff(diff)} className={`${btn.primary} w-full`}>
            {isEmptyDiff(diff) ? "No changes yet" : "Review changes"}
          </button>
        </div>
      </div>

      <Sheet open={review} onClose={() => setReview(false)} title="Save as a new version?">
        <div className="flex flex-col gap-4">
          {validation.ok ? (
            <>
              <div className="rounded-[var(--radius-panel)] bg-pill p-4">
                <DiffList diff={diff} />
              </div>
              <p className="text-sm text-ink-2">Your logged history carries over. Workouts already in progress keep today&apos;s plan.</p>
              <button onClick={save} disabled={saving} className={`${btn.primary} w-full`}>
                {saving ? "Saving…" : `Save version ${tree.version.version + 1}`}
              </button>
            </>
          ) : (
            <>
              <p className="font-bold text-warm-ink">A few things to fix first:</p>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {validation.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Sheet>

      <ExercisePicker
        open={pick !== null}
        onClose={() => setPick(null)}
        title={pick?.mode === "swap" ? "Swap exercise" : "Add exercise"}
        defaultEquipment={
          pick?.mode === "swap" ? ((draft.days[pick.day].items[pick.item] as Extract<ProgramItem, { type: "strength" }>).equipment ?? "other") : "other"
        }
        onPick={(choice) => {
          const name = "existing" in choice ? choice.existing.name : choice.name;
          const equipment = "existing" in choice ? choice.existing.equipment : choice.equipment;
          const p = pick;
          setPick(null);
          if (!p) return;
          update((prog) => {
            const day = prog.days[p.day];
            if (p.mode === "swap") {
              const it = day.items[p.item];
              if (it.type === "strength") day.items[p.item] = { ...it, name, equipment };
            } else {
              day.items.push({ type: "strength", name, equipment, sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90, supersetGroup: null });
              setOpen(`${day.id}:${day.items.length - 1}`);
            }
          });
        }}
      />
    </>
  );
}

function DayEditor({
  day,
  index,
  count,
  open,
  setOpen,
  update,
  move,
  remove,
  onSwap,
  onAddExercise,
}: {
  day: ProgramDay;
  index: number;
  count: number;
  open: string | null;
  setOpen: (k: string | null) => void;
  update: (fn: (d: ProgramDay) => void) => void;
  move: (delta: -1 | 1) => void;
  remove: () => void;
  onSwap: (item: number) => void;
  onAddExercise: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextField label={`Day ${index + 1}`} value={day.name} onChange={(v) => update((d) => void (d.name = v))} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-ink-2">On</span>
          <select
            value={day.dayOfWeek ?? ""}
            onChange={(e) => update((d) => void (d.dayOfWeek = (e.target.value || null) as ProgramDay["dayOfWeek"]))}
            className="min-h-12 rounded-[var(--radius-control)] border-2 border-line bg-white px-2 font-semibold"
          >
            <option value="">Rotation</option>
            {DAYS_OF_WEEK.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <IconButton label="Move day up" disabled={index === 0} onClick={() => move(-1)} icon={ArrowUp} onCard />
        <IconButton label="Move day down" disabled={index === count - 1} onClick={() => move(1)} icon={ArrowDown} onCard />
        <IconButton label="Remove day" onClick={remove} icon={Trash2} danger onCard />
      </div>

      <ul className="flex flex-col gap-2">
        {day.items.map((it, ii) => {
          const key = `${day.id}:${ii}`;
          const isOpen = open === key;
          return (
            <li key={key} className="rounded-[var(--radius-panel)] bg-pill">
              <button onClick={() => setOpen(isOpen ? null : key)} className="flex min-h-14 w-full items-center gap-3 px-4 text-left" aria-expanded={isOpen}>
                {it.type === "strength" && it.supersetGroup && (
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-tint text-xs font-extrabold text-accent-ink">{it.supersetGroup}</span>
                )}
                <span className="min-w-0 flex-1 truncate font-bold">{it.name}</span>
                <span className="shrink-0 text-ink-2">
                  {it.type === "cardio" ? `${it.durationMinutes} min` : `${it.sets} × ${formatReps(it.repsMin, it.repsMax)}`}
                </span>
                {isOpen ? <ChevronUp className="size-5 text-ink-3" /> : <ChevronDown className="size-5 text-ink-3" />}
              </button>
              {isOpen && (
                <ItemEditor
                  item={it}
                  first={ii === 0}
                  last={ii === day.items.length - 1}
                  update={(fn) => update((d) => fn(d.items[ii]))}
                  replace={(next) => update((d) => void (d.items[ii] = next))}
                  move={(delta) => {
                    update((d) => {
                      const [x] = d.items.splice(ii, 1);
                      d.items.splice(ii + delta, 0, x);
                    });
                    setOpen(`${day.id}:${ii + delta}`);
                  }}
                  remove={() => {
                    update((d) => void d.items.splice(ii, 1));
                    setOpen(null);
                  }}
                  swap={() => onSwap(ii)}
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <button onClick={onAddExercise} className={`${btn.quiet} flex-1`}>
          <Plus className="size-4" /> Exercise
        </button>
        <button
          onClick={() => update((d) => void d.items.push({ type: "cardio", name: "Cardio", durationMinutes: 20 }))}
          className={`${btn.quiet} flex-1`}
        >
          <Plus className="size-4" /> Cardio
        </button>
      </div>
    </Card>
  );
}

function ItemEditor({
  item,
  first,
  last,
  update,
  replace,
  move,
  remove,
  swap,
}: {
  item: ProgramItem;
  first: boolean;
  last: boolean;
  update: (fn: (it: ProgramItem) => void) => void;
  replace: (it: ProgramItem) => void;
  move: (delta: -1 | 1) => void;
  remove: () => void;
  swap: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      {item.type === "strength" ? (
        <>
          <button onClick={swap} className={`${btn.white} justify-between`}>
            <span className="truncate">{item.name}</span>
            <span className="text-sm text-accent-ink">Swap</span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <Stepper label="Sets" value={item.sets} min={1} max={20} onChange={(v) => replace({ ...item, sets: v })} />
            <Stepper label="Rest (s)" value={item.restSeconds ?? 90} min={0} max={900} step={15} onChange={(v) => replace({ ...item, restSeconds: v })} />
            <NumberField
              label="Reps from"
              value={item.repsMin}
              placeholder="AMRAP"
              onChange={(v) => replace({ ...item, repsMin: v, repsMax: v === null ? null : Math.max(v, item.repsMax ?? v) })}
            />
            <NumberField
              label="Reps to"
              value={item.repsMax}
              placeholder="AMRAP"
              onChange={(v) => replace({ ...item, repsMax: v, repsMin: v === null ? null : Math.min(v, item.repsMin ?? v) })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold text-ink-2">Equipment</span>
              <select
                value={item.equipment}
                onChange={(e) => replace({ ...item, equipment: e.target.value as (typeof EQUIPMENT)[number] })}
                className="min-h-12 rounded-[var(--radius-control)] border-2 border-line bg-white px-2 font-semibold capitalize"
              >
                {EQUIPMENT.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label="Superset"
              value={item.supersetGroup ?? ""}
              placeholder="None"
              onChange={(v) => replace({ ...item, supersetGroup: v.trim().toUpperCase().slice(0, 2) || null })}
            />
          </div>
        </>
      ) : (
        <>
          <TextField label="Name" value={item.name} onChange={(v) => update((it) => void (it.name = v))} />
          <Stepper label="Minutes" value={item.durationMinutes} min={1} max={600} onChange={(v) => replace({ ...item, durationMinutes: v })} />
        </>
      )}
      <TextField label="Notes" value={item.notes ?? ""} onChange={(v) => update((it) => void (it.notes = v || undefined))} />
      <div className="flex gap-2">
        <IconButton label="Move up" disabled={first} onClick={() => move(-1)} icon={ArrowUp} />
        <IconButton label="Move down" disabled={last} onClick={() => move(1)} icon={ArrowDown} />
        <IconButton label="Remove exercise" onClick={remove} icon={Trash2} danger />
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const cls = "w-full rounded-[var(--radius-control)] border-2 border-line bg-white px-3 py-2.5 outline-none focus:border-accent";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold text-ink-2">{label}</span>
      {multiline ? (
        <textarea rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${cls} min-h-12`} />
      )}
    </label>
  );
}

function NumberField({ label, value, onChange, placeholder }: { label: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold text-ink-2">{label}</span>
      <input
        inputMode="numeric"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
          onChange(Number.isNaN(n) || n <= 0 ? null : n);
        }}
        className="min-h-12 w-full rounded-[var(--radius-control)] border-2 border-line bg-white px-3 font-semibold outline-none focus:border-accent"
      />
    </label>
  );
}

function Stepper({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-bold text-ink-2">{label}</span>
      <div className="flex min-h-12 items-center rounded-[var(--radius-control)] bg-white p-1">
        <button aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, value - step))} className="grid size-10 place-items-center rounded-[var(--radius-button)] bg-pill">
          <Minus className="size-4" />
        </button>
        <span className="flex-1 text-center text-lg font-extrabold">{value}</span>
        <button aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + step))} className="grid size-10 place-items-center rounded-[var(--radius-button)] bg-pill">
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  icon: Icon,
  disabled,
  danger,
  onCard,
}: {
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  danger?: boolean;
  /** Sitting directly on a white card, so it needs the grey fill to show. */
  onCard?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cx("grid size-11 place-items-center rounded-[var(--radius-button)] disabled:opacity-30", onCard ? "bg-pill" : "bg-white", danger && "text-danger")}
    >
      <Icon className="size-5" />
    </button>
  );
}
