"use client";

import Image from "next/image";
import { type ReactNode, useState } from "react";

export type ArtForm = { label: string; file: string };

type UnitArtProps = {
  id: string;
  name: string;
  illustrationAlt: string;
  stageBackground: string;
  accentText: string;
  forms?: ArtForm[];
  priority: boolean;
  /** The body of the main card, drawn between the splash and the evolution line. */
  children: ReactNode;
};

const DEFAULT_FORM = "6star";

/** A unit's large splash plus its evolution line; picking a form shows it in the splash. */
export function UnitArt({
  id,
  name,
  illustrationAlt,
  stageBackground,
  accentText,
  forms,
  priority,
  children,
}: UnitArtProps): ReactNode {
  const [selected, setSelected] = useState(DEFAULT_FORM);
  const selectedForm = forms?.find((form) => form.file === selected);
  const alt =
    selected === DEFAULT_FORM || !selectedForm
      ? illustrationAlt
      : `${name}, ${selectedForm.label} form`;

  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-amber-500/30 bg-[#181723] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className={`relative aspect-square overflow-hidden ${stageBackground}`}>
          <div className="absolute inset-5 rounded-full border border-amber-400/10" />
          <Image
            key={selected}
            src={`/assets/units/${id}/illustration-${selected}.png`}
            alt={alt}
            width={1024}
            height={1024}
            priority={priority}
            className="relative h-full w-full object-contain"
          />
          {selectedForm ? (
            <span className="absolute right-4 top-4 rounded-full bg-black/40 px-3 py-1 text-xs font-semibold text-amber-100">
              {selectedForm.label}
            </span>
          ) : null}
        </div>
        {children}
      </section>

      {forms ? (
        <section className="mt-5 rounded-3xl border border-amber-500/20 bg-[#181723] px-6 py-5">
          <p className={`text-xs font-bold uppercase tracking-[0.2em] ${accentText}`}>
            Evolution line
          </p>
          <ol className="mt-4 grid grid-cols-3 gap-3">
            {forms.map((form) => {
              const isSelected = form.file === selected;
              return (
                <li key={form.label}>
                  <button
                    type="button"
                    onClick={() => setSelected(form.file)}
                    aria-pressed={isSelected}
                    aria-label={`Show ${name}'s ${form.label} form`}
                    className={`w-full cursor-pointer rounded-2xl bg-[#10131d] p-1 text-center ring-2 transition ${
                      isSelected ? "ring-amber-300/80" : "ring-transparent hover:ring-amber-500/40"
                    }`}
                  >
                    <Image
                      src={`/assets/units/${id}/illustration-${form.file}.png`}
                      alt={`${name}, ${form.label} form`}
                      width={1024}
                      height={1024}
                      sizes="128px"
                      className="aspect-square w-full object-contain"
                    />
                    <span className="text-xs font-semibold text-amber-100/80">{form.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </>
  );
}
