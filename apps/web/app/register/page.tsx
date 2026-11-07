"use client";

/**
 * Minimal registration form (spec-1-2 Task: apps/web/app/register/page.tsx).
 *
 * Validates email/password with the shared Zod schema before ever calling
 * Better Auth (AD-6 / spec-1-2 Boundaries: "checked before any Better Auth
 * call"), captures the browser's IANA timezone, calls `signUp.email`, and
 * redirects to `/` on success — Better Auth's own post-signup session
 * issuance leaves the user logged in, so no separate login step is needed.
 *
 * No UI polish beyond a minimal functional form using the existing
 * dual-theme Tailwind tokens (spec-1-2 Boundaries "Never"): no design spec
 * exists for this screen.
 */
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { registerSchema } from "@training-sanctum/domain";
import type { ErrorEnvelope } from "@training-sanctum/domain";
import { signUp } from "@/lib/auth-client";

type FieldErrors = NonNullable<ErrorEnvelope["error"]["fields"]>;

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const timezone =
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "";

    const parsed = registerSchema.safeParse({ email, password, timezone });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      let timezoneError: string | undefined;
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" || key === "password") {
          errors[key] ??= issue.message;
        } else if (key === "timezone") {
          timezoneError ??= issue.message;
        }
      }
      setFieldErrors(errors);
      // No dedicated timezone input (it's captured automatically, not
      // user-editable) — surface a failure (e.g. `Intl` unavailable) as a
      // form-level error instead of a silently-stuck submit.
      if (timezoneError) {
        setFormError(
          "Could not determine your timezone automatically. Please try a different browser."
        );
      }
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await signUp.email({
        email: parsed.data.email,
        password: parsed.data.password,
        timezone: parsed.data.timezone,
        name,
      });

      if (error) {
        // apps/web/app/api/auth/[...all]/route.ts reshapes this endpoint's
        // error responses into the standard `{error:{code,message,fields}}`
        // envelope (AD-10), so the client's parsed error body is nested one
        // level under `error.error` rather than Better Auth's native flat
        // `{code,message}` shape.
        const envelopeError = (
          error as unknown as { error?: ErrorEnvelope["error"] }
        ).error;
        const code = envelopeError?.code ?? error.code;

        if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
          setFieldErrors({
            email:
              envelopeError?.fields?.email ??
              "An account with this email already exists.",
          });
        } else {
          setFormError(
            envelopeError?.message ??
              error.message ??
              "Something went wrong. Please try again."
          );
        }
        return;
      }

      router.push("/");
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-card p-6">
        <h1 className="mb-6 text-2xl font-bold text-foreground">
          Create your account
        </h1>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm text-foreground-secondary">
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-[var(--radius-sm)] border border-border bg-elevated px-3 py-2 text-foreground"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm text-foreground-secondary">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-[var(--radius-sm)] border border-border bg-elevated px-3 py-2 text-foreground"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
            {fieldErrors.email ? (
              <p id="email-error" className="text-sm text-error">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm text-foreground-secondary">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-[var(--radius-sm)] border border-border bg-elevated px-3 py-2 text-foreground"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
            />
            {fieldErrors.password ? (
              <p id="password-error" className="text-sm text-error">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          {formError ? <p className="text-sm text-error">{formError}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-[var(--radius-sm)] bg-accent px-4 py-2 font-semibold text-foreground-soft hover:bg-accent-hover disabled:opacity-60"
          >
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>
      </div>
    </main>
  );
}
