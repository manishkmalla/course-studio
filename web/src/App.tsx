import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { apiFetch, ApiError } from "@/lib/api";
import { AuthPage } from "@/pages/AuthPage";
import { CreatorArea } from "@/pages/creator/CreatorArea";
import { LearnerArea } from "@/pages/learner/LearnerArea";
import type { User } from "@/types";

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<User>("/api/auth/me")
      .then(setUser)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
          return;
        }
        setRestoreError(err instanceof Error ? err.message : "Failed to restore session");
      });
  }, []);

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  if (user === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {restoreError ? `Error: ${restoreError}` : "Loading…"}
        </p>
      </main>
    );
  }

  if (!user) {
    return <AuthPage onAuthenticated={setUser} />;
  }

  return (
    <div className="min-h-screen">
      <Header user={user} onLogout={handleLogout} />
      <main className="mx-auto max-w-3xl p-4">
        {user.role === "creator" ? <CreatorArea /> : <LearnerArea />}
      </main>
    </div>
  );
}
