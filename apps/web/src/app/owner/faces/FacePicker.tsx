"use client";

import Image from "next/image";
import { type MouseEvent, type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import {
  buildExport,
  type FacePoints,
  FORM_LABELS,
  formKey,
  MARKER_LABELS,
  MARKERS,
  type Marker,
  type Point,
  SPLASH_FORMS,
  SPLASH_SIZE,
} from "../../../lib/faces/face-points.ts";
import { saveFacePoints } from "./actions.ts";

type Draft = Partial<Record<Marker, Point>>;

const MARKER_COLOURS: Readonly<Record<Marker, string>> = {
  leftEye: "#ef4444",
  rightEye: "#3b82f6",
  chin: "#22c55e",
};

const ZOOMS = [1, 2, 3] as const;

function isComplete(draft: Draft): draft is FacePoints {
  return MARKERS.every((m) => draft[m]);
}

function samePoints(a: Draft, b: FacePoints | undefined): boolean {
  if (!b) return false;
  return MARKERS.every((m) => a[m]?.[0] === b[m][0] && a[m]?.[1] === b[m][1]);
}

/** Owner face picker (M2-06C): 48 splashes, three clicks each, saved under RLS, exported as JSON. */
export function FacePicker({
  initialSaved,
}: {
  initialSaved: Readonly<Record<string, FacePoints>>;
}): ReactNode {
  const [saved, setSaved] = useState<Record<string, FacePoints>>({ ...initialSaved });
  const [index, setIndex] = useState(0);
  const splash = SPLASH_FORMS[index] ?? SPLASH_FORMS[0];
  const key = splash ? formKey(splash.unit, splash.form) : "";
  const [draft, setDraft] = useState<Draft>(() => initialDraft(key));
  const [active, setActive] = useState<Marker>("leftEye");
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(2);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const viewport = useRef<HTMLDivElement>(null);

  function initialDraft(k: string): Draft {
    const f = SPLASH_FORMS.find((s) => formKey(s.unit, s.form) === k);
    return { ...(saved[k] ?? initialSaved[k] ?? f?.guess ?? {}) };
  }

  function select(next: number): void {
    const target = SPLASH_FORMS[next];
    if (!target) return;
    setIndex(next);
    setDraft(initialDraft(formKey(target.unit, target.form)));
    setActive("leftEye");
    setStatus(null);
  }

  // Centre the viewport on the face (or the splash's upper middle) when the form or zoom changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: recentre only on form or zoom change.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const pts = MARKERS.map((m) => draft[m]).filter((p): p is Point => Boolean(p));
    const cx = pts.length ? pts.reduce((s, p) => s + p[0], 0) / pts.length : SPLASH_SIZE / 2;
    const cy = pts.length ? pts.reduce((s, p) => s + p[1], 0) / pts.length : SPLASH_SIZE / 3;
    const k = el.scrollWidth / SPLASH_SIZE;
    el.scrollTo({ left: cx * k - el.clientWidth / 2, top: cy * k - el.clientHeight / 2 });
  }, [index, zoom]);

  if (!splash) return null;
  const savedPoints = saved[key];
  const dirty = !samePoints(draft, savedPoints);
  const fromGuess = !savedPoints && splash.guess !== null && samePoints(draft, splash.guess);

  function place(event: MouseEvent<HTMLButtonElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * SPLASH_SIZE;
    const y = ((event.clientY - rect.top) / rect.height) * SPLASH_SIZE;
    const point: Point = [
      Math.round(Math.min(Math.max(x, 0), SPLASH_SIZE) * 10) / 10,
      Math.round(Math.min(Math.max(y, 0), SPLASH_SIZE) * 10) / 10,
    ];
    setDraft((d) => ({ ...d, [active]: point }));
    setActive(MARKERS[(MARKERS.indexOf(active) + 1) % MARKERS.length] ?? "leftEye");
    setStatus(null);
  }

  function save(andNext: boolean): void {
    if (!splash || !isComplete(draft)) return;
    const points: FacePoints = {
      leftEye: draft.leftEye,
      rightEye: draft.rightEye,
      chin: draft.chin,
    };
    startTransition(async () => {
      const result = await saveFacePoints(splash.unit, splash.form, points);
      if (!result.ok) {
        setStatus({ ok: false, text: result.message });
        return;
      }
      setSaved((s) => ({ ...s, [key]: points }));
      setStatus({ ok: true, text: "Saved." });
      if (andNext) {
        const next = SPLASH_FORMS.findIndex((f, i) => i > index && !saved[formKey(f.unit, f.form)]);
        if (next >= 0) select(next);
      }
    });
  }

  function download(): void {
    const blob = new Blob([`${JSON.stringify(buildExport(saved), null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "face-points.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const savedCount = SPLASH_FORMS.filter((f) => saved[formKey(f.unit, f.form)]).length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-4 py-6 text-stone-200">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-[0.18em] text-amber-100">Face picker</h1>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {savedCount} / {SPLASH_FORMS.length} saved
          </span>
          <button
            type="button"
            onClick={download}
            className="rounded-lg border border-amber-500/40 bg-[#181723] px-3 py-2 font-semibold text-amber-50 hover:bg-[#221f30]"
          >
            Download JSON
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row">
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold capitalize text-amber-100">
              {splash.unit} {FORM_LABELS[splash.form]}
            </span>
            <span className="text-stone-400">
              {savedPoints
                ? "saved"
                : fromGuess
                  ? "face cascade guess (check it)"
                  : splash.guess
                    ? "unsaved"
                    : "no cascade guess: click all three"}
            </span>
            <span className="ml-auto flex gap-1">
              {ZOOMS.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoom(z)}
                  aria-pressed={zoom === z}
                  className={`rounded px-2 py-1 ${zoom === z ? "bg-amber-600 text-white" : "bg-[#181723]"}`}
                >
                  {z}×
                </button>
              ))}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            {MARKERS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setActive(m)}
                aria-pressed={active === m}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                  active === m ? "border-amber-400 bg-[#2a2436]" : "border-stone-700 bg-[#181723]"
                }`}
              >
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: MARKER_COLOURS[m] }}
                />
                {MARKER_LABELS[m]}
                {draft[m] ? "" : " (unset)"}
              </button>
            ))}
          </div>

          <div
            ref={viewport}
            className="relative h-[min(70dvh,640px)] overflow-auto rounded-xl border border-stone-700 bg-[repeating-conic-gradient(#2a2a33_0%_25%,#1f1f27_0%_50%)] bg-[length:24px_24px]"
          >
            <button
              type="button"
              onClick={place}
              aria-label={`Place ${MARKER_LABELS[active]}`}
              className="relative block cursor-crosshair"
              style={{ width: `${zoom * 100}%`, aspectRatio: "1 / 1", minWidth: zoom * 320 }}
            >
              <Image
                key={key}
                src={splash.src}
                alt={`${splash.unit} ${FORM_LABELS[splash.form]} splash`}
                fill
                unoptimized
                draggable={false}
                className="pointer-events-none select-none"
              />
              {MARKERS.map((m) => {
                const p = draft[m];
                if (!p) return null;
                return (
                  <span
                    key={m}
                    className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                    style={{
                      left: `${(p[0] / SPLASH_SIZE) * 100}%`,
                      top: `${(p[1] / SPLASH_SIZE) * 100}%`,
                      background: MARKER_COLOURS[m],
                    }}
                  />
                );
              })}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              disabled={pending || !isComplete(draft) || !dirty}
              onClick={() => save(false)}
              className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              disabled={pending || !isComplete(draft)}
              onClick={() => save(true)}
              className="rounded-lg border border-amber-500/40 bg-[#181723] px-4 py-2 font-semibold text-amber-50 disabled:opacity-40"
            >
              Save and next unsaved
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setDraft(savedPoints ? { ...savedPoints } : { ...(splash.guess ?? {}) });
                setActive("leftEye");
                setStatus(null);
              }}
              className="rounded-lg border border-stone-700 px-4 py-2 disabled:opacity-40"
            >
              Reset
            </button>
            {status ? (
              <span role="status" className={status.ok ? "text-emerald-300" : "text-rose-300"}>
                {status.text}
              </span>
            ) : null}
          </div>
        </section>

        <nav aria-label="Unit forms" className="grid grid-cols-6 content-start gap-1 lg:w-80">
          {SPLASH_FORMS.map((f, i) => {
            const k = formKey(f.unit, f.form);
            const state = saved[k] ? "saved" : f.guess ? "guess" : "none";
            return (
              <button
                key={k}
                type="button"
                onClick={() => select(i)}
                aria-current={i === index ? "true" : undefined}
                title={`${f.unit} ${FORM_LABELS[f.form]} (${state})`}
                className={`relative aspect-square overflow-hidden rounded border-2 bg-[#181723] ${
                  i === index
                    ? "border-amber-300"
                    : state === "saved"
                      ? "border-emerald-500/70"
                      : state === "guess"
                        ? "border-sky-500/50"
                        : "border-stone-700"
                }`}
              >
                <Image src={f.src} alt="" fill sizes="56px" className="object-contain" />
                <span className="absolute bottom-0 left-0 bg-black/60 px-0.5 text-[10px] leading-tight">
                  {FORM_LABELS[f.form]}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </main>
  );
}
