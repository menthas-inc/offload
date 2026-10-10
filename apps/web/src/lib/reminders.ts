// 042. Remind me on a thread note or a memory, whose editors write their
// words through routes of their own. A row's goes in its dialog's one save.
// The author's alone: anybody else gets the 404 a missing thing gets.

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

/** True when it landed. */
export async function setReminders(of: "note" | "memory", id: string, on: boolean): Promise<boolean> {
  try {
    const response = await fetch(`${API}/v1/reminders`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ of, id, on }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
