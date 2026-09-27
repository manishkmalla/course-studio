export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed with status ${status}`,
    );
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
