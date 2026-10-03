"use client";

// The staff record the nav renders, and a way for a page to say it is stale.
//
// The nav shows a count of who is waiting. Inviting or removing people changes
// that count, and the page doing the changing is not the component showing it,
// so without this the number stays wrong until a reload. A context rather than
// a refetch on an interval: the page knows exactly when the number moved, and
// polling for something you already know is wasteful and still late.

import { createContext, useContext } from "react";

export interface Staff {
  role: "support" | "owner";
  email: string;
  waiting: number;
  /** 034. What is wrong on Health: dead jobs, services down, a late backup.
   *  Zero for support, who does not see Health. */
  wrong: number;
}

export interface AdminState {
  staff: Staff | null;
  /** Call after anything that changes what the nav counts. */
  refresh: () => void;
}

const AdminContext = createContext<AdminState>({ staff: null, refresh: () => {} });

export const AdminProvider = AdminContext.Provider;

export function useAdmin(): AdminState {
  return useContext(AdminContext);
}
