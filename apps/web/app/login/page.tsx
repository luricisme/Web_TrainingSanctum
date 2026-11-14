"use client";

/**
 * Login form (spec-1-3). Mirrors /register's editorial split (overline
 * masthead + section bullet left, form on a `card` surface right) and uses
 * the same DESIGN.md token utilities. Input is validated with the shared
 * `loginSchema` before any Better Auth call (AD-6). Wrong password and
 * unknown email are indistinguishable: one generic form-level alert.
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginSchema } from "@training-sanctum/domain";
import { signIn } from "@/lib/auth-client";
import { SectionMarker } from "@/app/components/section-marker";
import {
  buttonPrimary,
  fieldErrorClass,
  formErrorClass,
  inputClass,
  labelClass,
  linkClass,
} from "@/app/components/ui";

type FieldErrors = { email?: string; password?: string };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" || key === "password") {
          errors[key] ??=
            key === "email" ? "Enter a valid email address." : issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await signIn.email({
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (error) {
        // The catch-all route wraps sign-in failures in the standard
        // envelope. Every 401 (wrong password or unknown email) shows the
        // same generic message, revealing nothing about which part was wrong.
        setFormError(
          error.status === 401
            ? "Invalid email or password."
            : error.status === 429
              ? "Too many attempts. Try again in a moment."
              : "Something went wrong. Please try again."
        );
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
            Welcome back
          </h1>
          <p className="mt-6 text-body text-foreground-secondary">
            Pick up your daily review where you left off.
          </p>
        </header>

        <div aria-hidden="true" className="hidden lg:block" />

        <div className="mx-auto w-full max-w-md self-start rounded-lg border border-divider bg-card p-6 shadow-medium lg:mx-0 lg:justify-self-start lg:p-8">
          <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
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
                autoComplete="current-password"
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
              <p
                role="alert"
                className={formErrorClass}
              >
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className={`${buttonPrimary} mt-1`}
            >
              {submitting ? "Logging in..." : "Log in"}
            </button>
          </form>

          <p className="mt-6 text-body-sm text-foreground-secondary">
            No account yet?{" "}
            <Link
              href="/register"
              className={linkClass}
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
