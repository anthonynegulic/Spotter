"use client";

import { Check, Copy, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { btn, Card, ScreenHeader } from "@/components/ui";
import { parseProgram } from "@/lib/program/parse";
import { PENDING_IMPORT_KEY } from "@/lib/program/pending";
import { PROGRAM_PROMPT } from "@/lib/program/prompt";


function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-accent-tint text-lg font-extrabold text-accent-ink">{n}</span>
        <h2 className="text-xl font-extrabold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

export default function ImportPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(PROGRAM_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrors(["Couldn't copy automatically. Press and hold the prompt to copy it."]);
    }
  }

  function preview(source = text) {
    const result = parseProgram(source);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    sessionStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify({ program: result.program, raw: source }));
    router.push("/program/review");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    preview(content);
    e.target.value = "";
  }

  return (
    <AppShell tabs={false}>
      <ScreenHeader title="Import program" back="/program" />
      <div className="flex flex-col gap-4 px-[var(--spacing-gutter)] pb-32">
        <Step n={1} title="Get your program as JSON">
          <p className="mb-3 text-ink-2">Copy this prompt into Claude or ChatGPT, then paste in your program underneath it.</p>
          <pre className="mb-3 max-h-28 overflow-hidden rounded-[var(--radius-panel)] bg-pill p-4 font-mono text-sm whitespace-pre-wrap text-ink select-all">
            {PROGRAM_PROMPT.split("\n")[0]}
          </pre>
          <button onClick={copyPrompt} className={`${btn.tinted} w-full`}>
            {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
            {copied ? "Copied" : "Copy prompt"}
          </button>
        </Step>

        <Step n={2} title="Paste the reply">
          <p className="mb-3 text-ink-2">Paste the whole reply. Spotter ignores any extra text around the JSON.</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Here\'s your program…\n\n```json\n{ "schemaVersion": 1, … }\n```'}
            rows={9}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="w-full rounded-[var(--radius-panel)] border-2 border-line bg-white p-4 font-mono text-sm outline-none focus:border-accent"
          />
          <button onClick={() => fileRef.current?.click()} className={`${btn.link} mt-2`}>
            <FileText className="size-5" /> Or choose a file
          </button>
          <input ref={fileRef} type="file" accept=".json,.txt,application/json,text/plain" className="hidden" onChange={onFile} />
        </Step>

        {errors.length > 0 && (
          <Card className="border-2 border-warm-tint p-5" role="alert">
            <h3 className="mb-2 font-extrabold text-warm-ink">That didn&apos;t import yet</h3>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-ink">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <div className="pb-safe fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-[var(--spacing-gutter)] pt-6">
        <div className="mx-auto max-w-xl pb-4">
          <button onClick={() => preview()} disabled={!text.trim()} className={`${btn.primary} w-full`}>
            Preview program
          </button>
        </div>
      </div>
    </AppShell>
  );
}
