// 036. What the account keeps against its limit, for the Privacy pane: the
// figure, `signed_out` when the session has ended under the page, or null when
// the read did not go through, which the pane says with a retry.

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export interface StorageAnswer {
  usedBytes: number;
  limitBytes: number;
}

export async function fetchStorage(): Promise<StorageAnswer | "signed_out" | null> {
  try {
    const response = await fetch(`${API}/api/me/storage`, { credentials: "include" });
    if (response.status === 401) return "signed_out";
    return response.ok ? ((await response.json()) as StorageAnswer) : null;
  } catch {
    return null;
  }
}
