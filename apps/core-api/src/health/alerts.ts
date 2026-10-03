// 034, section E. The alert conditions, and the count beside Health in the nav.
//
// `checkAlerts` runs each minute from the heartbeat timer, beside the beat,
// and is not a job. `wrongCount` is what `/v1/admin/me` returns as `wrong`:
// dead jobs not dismissed, plus services down, plus a late backup. Both are
// here so the section fills them without touching the timer or the shell.
// Until it does: nothing is checked and nothing is wrong.

export async function checkAlerts(): Promise<void> {}

export async function wrongCount(): Promise<number> {
  return 0;
}
