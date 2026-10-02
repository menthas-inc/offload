"use client";

// 030. Whether the top thread pane is drawing its map column, so the composer,
// which belongs to no pane, can end where the list does instead of covering the
// map and Google's logo and legal line with it.

import { createContext } from "react";

export const MapColumnContext = createContext<(on: boolean) => void>(() => {});
