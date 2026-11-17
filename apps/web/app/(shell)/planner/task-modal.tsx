"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TASK_MIN_ESTIMATE_MINUTES,
  type TaskCategorySummary,
  type TaskSummary,
  createTaskSchema,
  taskCategoryNameSchema,
  updateTaskSchema,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  inputClass,
  labelClass,
} from "@/app/components/ui";
import { Modal } from "../classes/modal";
import { PLANNER_CATEGORIES_KEY } from "./categories-key";
import { PLANNER_OVERDUE_KEY, PLANNER_TASKS_KEY } from "./tasks-key";

type Fields = Partial<Record<"title" | "categoryId" | "localDay" | "startTime" | "estimateMinutes", string>>;

/**
 * Add / Edit Task modal. With no Category yet it first offers to create one
 * inline (name field, default tint), then shows the form.
 */
export function TaskModal({
  existing,
  day,
  onClose,
  onSaved,
}: {
  existing?: TaskSummary;
  day: string;
  onClose: () => void;
  /** Called with the saved Task's day so the view can follow it. */
  onSaved: (day: string) => void;
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: PLANNER_CATEGORIES_KEY,
    queryFn: () => apiFetch<TaskCategorySummary[]>("/api/planner/categories"),
  });
  const categories = data ?? [];

  return (
    <Modal title={existing ? "Edit task" : "Add task"} onClose={onClose}>
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
      ) : categories.length === 0 ? (
        <FirstCategory />
      ) : (
        <TaskForm
          existing={existing}
          day={day}
          categories={categories}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}

function FirstCategory() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: { name: string }) =>
      apiFetch<TaskCategorySummary>("/api/planner/categories", { method: "POST", json: body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PLANNER_CATEGORIES_KEY }),
    onError: (err) =>
      setError(
        err instanceof ApiError
          ? (err.fields?.name ?? err.message)
          : "Something went wrong. Try again."
      ),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = taskCategoryNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a category name.");
      return;
    }
    create.mutate({ name: parsed.data });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <p className="text-body font-semibold text-foreground">Create a category</p>
        <p className="mt-1 text-body-sm text-foreground-secondary">
          Every task belongs to a category. Name your first one to continue.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="task-first-category" className={labelClass}>
          Category name
        </label>
        <input
          id="task-first-category"
          type="text"
          autoComplete="off"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "task-first-category-error" : undefined}
          className={inputClass}
        />
        {error ? (
          <p id="task-first-category-error" role="alert" className={fieldErrorClass}>
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={create.isPending} className={buttonPrimary}>
          Create category
        </button>
      </div>
    </form>
  );
}

function TaskForm({
  existing,
  day,
  categories,
  onClose,
  onSaved,
}: {
  existing?: TaskSummary;
  day: string;
  categories: TaskCategorySummary[];
  onClose: () => void;
  onSaved: (day: string) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [categoryId, setCategoryId] = useState(existing?.category.id ?? categories[0]!.id);
  const [localDay, setLocalDay] = useState(existing?.localDay ?? day);
  const [startTime, setStartTime] = useState(existing?.startTime ?? "");
  const [estimate, setEstimate] = useState(String(existing?.estimateMinutes ?? 25));
  const [errors, setErrors] = useState<Fields>({});
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      existing
        ? apiFetch<TaskSummary>(`/api/planner/tasks/${existing.id}`, { method: "PATCH", json: body })
        : apiFetch<TaskSummary>("/api/planner/tasks", { method: "POST", json: body }),
    onSuccess: async (task) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY }),
        queryClient.invalidateQueries({ queryKey: PLANNER_OVERDUE_KEY }),
        queryClient.invalidateQueries({ queryKey: PLANNER_CATEGORIES_KEY }),
      ]);
      onSaved(task.localDay);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fields) {
        setErrors(err.fields as Fields);
        setFormError(null);
      } else {
        setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const estimateValue = estimate.trim() === "" ? Number.NaN : Number(estimate);
    const time = startTime === "" ? null : startTime;

    if (existing) {
      const body: Record<string, unknown> = {};
      if (title !== existing.title) body.title = title;
      if (categoryId !== existing.category.id) body.categoryId = categoryId;
      if (localDay !== existing.localDay) body.localDay = localDay;
      if (time !== existing.startTime) body.startTime = time;
      if (estimateValue !== existing.estimateMinutes) body.estimateMinutes = estimateValue;
      // Validate the whole form so every bad field shows, then send only changes.
      const full = createTaskSchema.safeParse({
        title,
        categoryId,
        localDay,
        startTime: time,
        estimateMinutes: estimateValue,
      });
      if (!full.success) return showIssues(full.error.issues);
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
      const parsed = updateTaskSchema.safeParse(body);
      if (!parsed.success) return showIssues(parsed.error.issues);
      setErrors({});
      save.mutate(parsed.data);
      return;
    }

    const parsed = createTaskSchema.safeParse({
      title,
      categoryId,
      localDay,
      startTime: time,
      estimateMinutes: estimateValue,
    });
    if (!parsed.success) return showIssues(parsed.error.issues);
    setErrors({});
    save.mutate(parsed.data);
  }

  function showIssues(issues: { path: PropertyKey[]; message: string }[]) {
    const next: Fields = {};
    for (const issue of issues) {
      const key = String(issue.path[0]) as keyof Fields;
      next[key] ??= issue.message;
    }
    setErrors(next);
  }

  const field = (key: keyof Fields) => ({
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": errors[key] ? `task-${key}-error` : undefined,
  });
  const fieldError = (key: keyof Fields) =>
    errors[key] ? (
      <p id={`task-${key}-error`} role="alert" className={fieldErrorClass}>
        {errors[key]}
      </p>
    ) : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="task-title" className={labelClass}>
          Title
        </label>
        <input
          id="task-title"
          type="text"
          autoComplete="off"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={inputClass}
          {...field("title")}
        />
        {fieldError("title")}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="task-categoryId" className={labelClass}>
          Category
        </label>
        <select
          id="task-categoryId"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={inputClass}
          {...field("categoryId")}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {fieldError("categoryId")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="task-localDay" className={labelClass}>
            Day
          </label>
          <input
            id="task-localDay"
            type="date"
            value={localDay}
            onChange={(event) => setLocalDay(event.target.value)}
            className={inputClass}
            {...field("localDay")}
          />
          {fieldError("localDay")}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="task-startTime" className={labelClass}>
            Start time (optional)
          </label>
          <input
            id="task-startTime"
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className={inputClass}
            {...field("startTime")}
          />
          {fieldError("startTime")}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="task-estimateMinutes" className={labelClass}>
          Estimate (minutes)
        </label>
        <input
          id="task-estimateMinutes"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={estimate}
          onChange={(event) => setEstimate(event.target.value)}
          className={`${inputClass} font-mono`}
          {...field("estimateMinutes")}
        />
        <p className="text-caption text-foreground-tertiary">
          Whole minutes, {TASK_MIN_ESTIMATE_MINUTES} or more.
        </p>
        {fieldError("estimateMinutes")}
      </div>

      {formError ? (
        <p role="alert" className={fieldErrorClass}>
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onClose} className={buttonSecondary}>
          Cancel
        </button>
        <button type="submit" disabled={save.isPending} className={buttonPrimary}>
          {existing ? "Save" : "Add task"}
        </button>
      </div>
    </form>
  );
}
