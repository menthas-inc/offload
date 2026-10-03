// 036. What the account keeps against its limit, for Privacy. Null when the
// read did not come; the page says so with a retry.

import { send } from "./api";

export interface StorageAnswer {
  usedBytes: number;
  limitBytes: number;
}

export async function loadStorage(): Promise<StorageAnswer | null> {
  const { data } = await send<StorageAnswer>("/api/me/storage");
  return data;
}
