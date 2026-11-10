"use client";

import * as React from "react";

import { toPath, useApp } from "@/lib/litespm/router";

/**
 * A real `<a href>` that navigates inside the app. Plain left-clicks are
 * handled client-side (no reload); middle-click, Ctrl/Cmd-click, "open in new
 * tab", copy-link and crawlers all get an ordinary URL - which `<button>`
 * navigation never offered.
 */
export const NavLink = React.forwardRef<
  HTMLAnchorElement,
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string }
>(function NavLink({ to, onClick, children, ...rest }, ref) {
  const navigate = useApp((s) => s.navigate);
  return (
    <a
      ref={ref}
      href={toPath(to)}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          rest.target === "_blank"
        ) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
});
