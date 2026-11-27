import { useEffect, useId, useMemo, useRef, useState } from "react";
import { findIcd11Chapter06Diagnosis, searchIcd11Chapter06Diagnoses, type Icd11Diagnosis } from "@workspace/api-zod";
import { Input } from "@/components/ui/input";

type Group = { name: string; diagnosis?: Icd11Diagnosis; children: Group[] };

function groupResults(matches: Icd11Diagnosis[]): Group {
  const root: Group = { name: "", children: [] };
  for (const match of matches) {
    let group = root;
    for (const name of [...match.parents, `${match.code} ${match.title}`]) {
      const existing = group.children.find((child) => child.name === name);
      if (existing) group = existing;
      else {
        const next: Group = { name, children: [] };
        group.children.push(next);
        group = next;
      }
    }
    group.diagnosis = match;
  }
  return root;
}

function DiagnosisGroup({ group, expanded, onSelect }: { group: Group; expanded: boolean; onSelect: (code: string) => void }) {
  return <ul className="space-y-1">{group.children.map((item) => <DiagnosisBranch key={item.name} item={item} expanded={expanded} onSelect={onSelect} />)}</ul>;
}

function DiagnosisBranch({ item, expanded, onSelect }: { item: Group; expanded: boolean; onSelect: (code: string) => void }) {
  const [open, setOpen] = useState(expanded);
  const diagnosis = item.diagnosis;
  const branch = item.children.length > 0;
  return <li>
    <div className="flex items-start gap-0.5">
      {branch && <button type="button" aria-expanded={open} aria-label={diagnosis ? `${open ? "Collapse" : "Expand"} ${diagnosis.code}` : undefined}
        className="shrink-0 rounded px-1.5 py-1 text-left text-sm font-semibold text-teal-900 hover:bg-teal-50" onClick={() => setOpen(!open)}>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>{!diagnosis && <> {item.name}</>}
      </button>}
      {diagnosis && <button type="button" data-diagnosis-code={diagnosis.code} className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-teal-50 focus-visible:bg-teal-50" onClick={() => onSelect(diagnosis.code)}>
        <span className="font-semibold">{diagnosis.code}</span> {diagnosis.title}
      </button>}
    </div>
    {branch && open && <div className="my-1 ml-2 border-l border-teal-200 pl-2"><DiagnosisGroup group={item} expanded={expanded} onSelect={onSelect} /></div>}
  </li>;
}

export function Chapter06DiagnosisPicker({ code, onSelect }: { code: string; onSelect: (code: string) => void }) {
  const inputId = useId();
  const resultsId = useId();
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const restoringFocus = useRef(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = findIcd11Chapter06Diagnosis(code);
  const matches = useMemo(() => searchIcd11Chapter06Diagnoses(query), [query]);
  const tree = useMemo(() => open ? groupResults(matches) : null, [matches, open]);

  useEffect(() => {
    if (!open) return;
    // A Safari tap can blur the input before the result receives its click.
    function dismissOutside(event: Event) {
      if (event.type === "focusin" && event.target === document.body) return;
      if (event.target instanceof Node && !picker.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [open]);

  function close(restore: boolean) {
    if (restore && input.current !== document.activeElement) {
      restoringFocus.current = true;
      input.current?.focus();
      restoringFocus.current = false;
    }
    setOpen(false);
  }

  function choose(value: string) {
    onSelect(value);
    close(true);
    setQuery("");
  }

  return <div ref={picker} className="relative space-y-1.5" onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); close(true); }
  }}>
    <label htmlFor={inputId} className="text-sm font-medium">ICD-11 diagnosis</label>
    <Input ref={input} id={inputId} className="rounded-[10px] border-[#d9e6e2]" autoComplete="off" placeholder="Type code or name"
      aria-controls={open ? resultsId : undefined} aria-describedby={`${inputId}-source`}
      value={open ? query : selected ? `${selected.code} ${selected.title}` : query}
      onFocus={() => { if (!restoringFocus.current) { setQuery(selected?.code ?? query); setOpen(true); } }}
      onClick={() => { if (!open) { setQuery(selected?.code ?? query); setOpen(true); } }}
      onChange={(event) => { onSelect(""); setQuery(event.target.value); setOpen(true); }}
      onKeyDown={(event) => {
        if (open && event.key === "Enter") {
          event.preventDefault();
          const exact = findIcd11Chapter06Diagnosis(query);
          if (exact) choose(exact.code);
          else if (matches.length === 1) choose(matches[0].code);
        }
        if (open && event.key === "ArrowDown") {
          event.preventDefault();
          const results = document.getElementById(resultsId);
          const visible = (selector: string) => [...(results?.querySelectorAll<HTMLElement>(selector) ?? [])].find((element) => element.getClientRects().length > 0);
          (visible("[data-diagnosis-code]") ?? visible("button"))?.focus();
        }
      }} />
    {open && tree && <section id={resultsId} aria-label="ICD-11 Chapter 06 results" className="max-h-72 overflow-auto rounded-lg border border-teal-200 bg-white p-2 shadow-lg">
      {matches.length ? <DiagnosisGroup key={query} group={tree} expanded={Boolean(query.trim())} onSelect={choose} /> :
        <p role="status" className="px-2 py-2 text-sm text-slate-600">No Chapter 06 diagnoses match.</p>}
    </section>}
    <p id={`${inputId}-source`} className="text-xs text-slate-500">WHO ICD-11 MMS 2026-01 · Chapter 06 · <a className="underline" href="https://icd.who.int/docs/icd-api/license/" target="_blank" rel="noreferrer">CC BY-ND 3.0 IGO</a></p>
  </div>;
}
