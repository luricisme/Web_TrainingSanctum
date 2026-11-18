"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ClassColor,
  type MusicTrackRef,
  type TaskCategorySummary,
  nextClassColor,
  taskCategoryNameSchema,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { ColourPicker } from "@/app/components/colour-picker";
import {
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  inputClass,
  labelClass,
  tintFor,
} from "@/app/components/ui";
import { Modal } from "../classes/modal";
import { RowMenu } from "../classes/row-menu";
import { DeleteCategoryModal } from "./delete-category-modal";
import { PLANNER_CATEGORIES_KEY as KEY } from "./categories-key";
import { MusicField } from "./music-field";

type Editing = { kind: "new" } | { kind: "edit"; id: string; focusColour: boolean } | null;

/**
 * Categories modal (EXPERIENCE.md "Category modal"): rows of name and tint,
 * create, rename, recolour and delete. The colour picker is the Class one.
 */
export function CategoriesModal({ onClose }: { onClose: () => void }) {
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<TaskCategorySummary[]>("/api/planner/categories"),
  });
  const categories = data ?? [];
  const empty = !isPending && !isError && categories.length === 0;
  const deleteTarget = deleting ? categories.find((c) => c.id === deleting) : undefined;

  return (
    <>
    <Modal title="Categories" onClose={onClose}>
      {isPending ? (
        <div
          aria-label="Loading categories"
          className="h-16 animate-pulse rounded-md bg-elevated motion-reduce:animate-none"
        />
      ) : isError && !data ? (
        <div role="alert" className="flex flex-col items-start gap-4">
          <p className="text-body text-foreground-secondary">Could not load your categories.</p>
          <button type="button" onClick={() => void refetch()} className={buttonSecondary}>
            Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {categories.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {categories.map((c) =>
                editing?.kind === "edit" && editing.id === c.id ? (
                  <li key={c.id}>
                    <CategoryForm
                      key={c.id}
                      existing={c}
                      focusColour={editing.focusColour}
                      count={categories.length}
                      onDone={() => setEditing(null)}
                    />
                  </li>
                ) : (
                  <li
                    key={c.id}
                    className={`flex items-center gap-3 rounded-lg border py-2 pl-4 pr-2 ${tintFor(c.color)}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-body font-semibold text-foreground">{c.name}</p>
                      <p className="text-caption text-foreground-secondary">
                        {c.taskCount === 1 ? "1 task" : `${c.taskCount} tasks`}
                      </p>
                    </div>
                    <RowMenu
                      name={c.name}
                      items={[
                        { label: "Rename", onSelect: () => setEditing({ kind: "edit", id: c.id, focusColour: false }) },
                        { label: "Colour", onSelect: () => setEditing({ kind: "edit", id: c.id, focusColour: true }) },
                        { label: "Delete", danger: true, onSelect: () => setDeleting(c.id) },
                      ]}
                    />
                  </li>
                )
              )}
            </ul>
          ) : null}

          {empty || editing?.kind === "new" ? (
            <div className="flex flex-col gap-4">
              {empty ? (
                <p className="text-body font-semibold text-foreground">Create your first category</p>
              ) : null}
              <CategoryForm
                count={categories.length}
                onDone={() => setEditing(null)}
                onCancel={empty ? undefined : () => setEditing(null)}
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {!empty && editing?.kind !== "new" ? (
              <button
                type="button"
                onClick={() => setEditing({ kind: "new" })}
                className={buttonSecondary}
              >
                New category
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={onClose} className={buttonSecondary}>
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
    {deleteTarget ? (
      <DeleteCategoryModal
        key={deleteTarget.id}
        target={deleteTarget}
        others={categories.filter((c) => c.id !== deleteTarget.id)}
        onClose={() => setDeleting(null)}
      />
    ) : null}
    </>
  );
}

/** Name and colour for a new (no `existing`) or edited Category. */
function CategoryForm({
  existing,
  focusColour = false,
  count,
  onDone,
  onCancel,
}: {
  existing?: TaskCategorySummary;
  focusColour?: boolean;
  /** How many categories exist, for the default colour of a new one. */
  count: number;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState<ClassColor>(existing?.color ?? nextClassColor(count));
  const [musicTrack, setMusicTrack] = useState<MusicTrackRef | null>(existing?.musicTrack ?? null);
  const [error, setError] = useState<string | null>(null);
  const formId = existing?.id ?? "new";

  const save = useMutation({
    mutationFn: (body: { name: string; color: ClassColor; musicTrack: MusicTrackRef | null }) =>
      existing
        ? apiFetch<TaskCategorySummary>(`/api/planner/categories/${existing.id}`, {
            method: "PATCH",
            json: body,
          })
        : apiFetch<TaskCategorySummary>("/api/planner/categories", {
            method: "POST",
            json: body,
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      onDone();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? (err.fields?.name ?? err.message)
          : "Something went wrong. Try again."
      );
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = taskCategoryNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a category name.");
      return;
    }
    save.mutate({ name: parsed.data, color, musicTrack });
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-md border border-divider bg-card p-4"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={`category-name-${formId}`} className={labelClass}>
          Category name
        </label>
        <input
          id={`category-name-${formId}`}
          name="name"
          type="text"
          autoComplete="off"
          autoFocus={!focusColour}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `category-name-error-${formId}` : undefined}
          className={inputClass}
        />
        {error ? (
          <p id={`category-name-error-${formId}`} role="alert" className={fieldErrorClass}>
            {error}
          </p>
        ) : null}
      </div>
      <ColourPicker
        name={`category-color-${formId}`}
        value={color}
        onChange={setColor}
        autoFocusSelected={focusColour}
      />
      <MusicField value={musicTrack} onChange={setMusicTrack} />
      <div className="flex flex-wrap justify-end gap-3">
        {existing || onCancel ? (
          <button type="button" onClick={existing ? onDone : onCancel} className={buttonSecondary}>
            Cancel
          </button>
        ) : null}
        <button type="submit" disabled={save.isPending} className={buttonPrimary}>
          {existing ? "Save" : "Create category"}
        </button>
      </div>
    </form>
  );
}
