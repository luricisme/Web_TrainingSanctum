"use client";

/**
 * Minimal registration form (spec-1-2 Task: apps/web/app/register/page.tsx).
 *
 * Validates name/email/password with the shared Zod schema before ever
 * calling Better Auth (AD-6 / spec-1-2 Boundaries: "checked before any
 * Better Auth call"), captures the browser's IANA timezone, calls `signUp.email`, and
 * redirects to `/` on success — Better Auth's own post-signup session
 * issuance leaves the user logged in, so no separate login step is needed.
 *
 * Styled per DESIGN.md ("Focus Indigo") and the Design DNA `design_style`
 * (_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/),
 * spec-restyle-register-focus-indigo: editorial split, with an overline
 * masthead and section-bullet marker on the left and the form on a `card`
 * surface on the right, stacked below 1024px. Values come from DESIGN.md
 * tokens: colors and radii via the globals.css utilities, while type-scale
 * values (overline/heading-1 size, line-height, tracking) and the bullet
 * size are inlined until typography tokens are coded. The accent marks the
 * submit button (plus the section bullet and input focus).
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerSchema } from "@training-sanctum/domain";
import type { ErrorEnvelope } from "@training-sanctum/domain";
import { signUp } from "@/lib/auth-client";
import { SectionMarker } from "@/app/components/section-marker";
import {
  buttonPrimary,
  fieldErrorClass,
  formErrorClass,
  inputClass,
  labelClass,
  linkClass,
} from "@/app/components/ui";

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

    const parsed = registerSchema.safeParse({ name, email, password, timezone });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      let timezoneError: string | undefined;
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "name" || key === "email" || key === "password") {
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
        name: parsed.data.name,
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
    <main className="flex min-h-screen bg-backdrop px-4 py-12 lg:items-center lg:py-16">
      <div className="mx-auto grid w-full max-w-content content-start gap-8 lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] lg:gap-16">
        <header className="mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end">
          <SectionMarker>Training Sanctum</SectionMarker>
          <h1 className="mt-6 text-heading-1 text-foreground">
            Create your account
          </h1>
          <p className="mt-6 text-body text-foreground-secondary">
            Your daily vocabulary review, kept quiet.
          </p>
        </header>

        <div aria-hidden="true" className="hidden lg:block" />

        <div className="mx-auto w-full max-w-md self-start rounded-lg border border-divider bg-card p-6 shadow-medium lg:mx-0 lg:justify-self-start lg:p-8">
          <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-2">
              <label htmlFor="name" className={labelClass}>
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
                className={inputClass}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
              />
              {fieldErrors.name ? (
                <p id="name-error" className={fieldErrorClass}>
                  {fieldErrors.name}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email ? (
                <p id="email-error" className={fieldErrorClass}>
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputClass}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
              />
              {fieldErrors.password ? (
                <p id="password-error" className={fieldErrorClass}>
                  {fieldErrors.password}
                </p>
              ) : null}
            </div>

            {formError ? (
              <p className={formErrorClass}>
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className={`${buttonPrimary} mt-1`}
            >
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-body-sm text-foreground-secondary">
            Already have an account?{" "}
            <Link
              href="/login"
              className={linkClass}
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
