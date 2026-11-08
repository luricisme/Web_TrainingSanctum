import { LogoutButton } from "./components/logout-button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">Training Sanctum</h1>
      <p className="max-w-md text-foreground-secondary">
        Your personal flashcard sanctum is being built. This is the
        deployment skeleton for Story 1.1 &mdash; auth, folders, cards, and
        spaced-repetition review are coming in the stories that follow.
      </p>
      <LogoutButton />
    </main>
  );
}
