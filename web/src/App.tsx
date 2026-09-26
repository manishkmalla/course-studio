import { useEffect, useState } from "react";
import { apiFetch } from "./lib/api";

interface HealthResponse {
  status: string;
  db: string;
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<HealthResponse>("/api/health").then(setHealth).catch((err: Error) => {
      setError(err.message);
    });
  }, []);

  return (
    <main>
      <h1>Course Studio</h1>
      {error && <p>API error: {error}</p>}
      {!error && !health && <p>Checking API health...</p>}
      {health && (
        <p>
          API status: {health.status} (db: {health.db})
        </p>
      )}
    </main>
  );
}
