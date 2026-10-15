"use client";

import { useEffect, useState } from "react";
import type { PlatformOS } from "../../lib/hosts";

/**
 * The reader's platform, resolved after mount.
 *
 * The build has no reader to ask, so the first frame assumes Linux and the
 * effect corrects it from the user agent. Both consumers — the manual-setup
 * disclosure and the compatibility tab's per-host card — then show the path
 * for the platform the reader is actually on, from the same registry.
 */
export function usePlatformOs(): PlatformOS {
  const [os, setOs] = useState<PlatformOS>("linux");

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    setOs(ua.includes("mac") ? "mac" : ua.includes("linux") ? "linux" : "win");
  }, []);

  return os;
}
