"use client";

import { type ReactNode, useActionState, useState } from "react";
import styles from "../../../components/onboarding/onboarding.module.css";
import {
  DISPLAY_NAME_MAX,
  displayNameLength,
  displayNameProblem,
} from "../../../lib/onboarding/display-name.ts";
import { type SaveNameState, saveDisplayName } from "./actions.ts";

/**
 * The name field, its 1–32 character count, the error line, and Confirm. An invalid name shows
 * its error here and is never sent; a valid one goes to `saveDisplayName`, which redirects to the
 * tutorial on success.
 */
export function NameForm({ initialName }: { initialName: string }): ReactNode {
  const [name, setName] = useState(initialName);
  const [state, submit, pending] = useActionState(
    async (previous: SaveNameState, formData: FormData): Promise<SaveNameState> => {
      const problem = displayNameProblem(String(formData.get("name") ?? ""));
      if (problem) return { error: problem };
      return saveDisplayName(previous, formData);
    },
    { error: null },
  );
  const [edited, setEdited] = useState(false);
  const error = edited ? null : state.error;
  const length = displayNameLength(name);

  return (
    <form
      action={(formData) => {
        setEdited(false);
        submit(formData);
      }}
      className={styles.field}
      noValidate
    >
      <label htmlFor="display-name" className={styles.label}>
        Display name
      </label>
      <input
        id="display-name"
        name="name"
        className={styles.input}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setEdited(true);
        }}
        autoComplete="nickname"
        spellCheck={false}
        maxLength={DISPLAY_NAME_MAX * 2}
        aria-invalid={error ? true : undefined}
        aria-describedby="display-name-error display-name-count"
        disabled={pending}
      />
      <div className={styles.fieldFoot}>
        <p id="display-name-error" className={styles.error} role="alert">
          {error}
        </p>
        <span
          id="display-name-count"
          className={`${styles.count} ${length > DISPLAY_NAME_MAX ? styles.countOver : ""}`}
        >
          {length}/{DISPLAY_NAME_MAX}
        </span>
      </div>
      <div className={styles.actions}>
        <button type="submit" className={styles.button} disabled={pending}>
          {pending ? "Saving…" : "Confirm"}
        </button>
      </div>
    </form>
  );
}
