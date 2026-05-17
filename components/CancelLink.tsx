"use client";

import { type CSSProperties } from "react";

/**
 * "Cancel — go back" link used on the auth page. Prefers history.back() when
 * the visitor has somewhere to return to; falls back to the apex when this
 * is a fresh tab loaded directly via /?next=…
 */
export function CancelLink({ style }: { style?: CSSProperties }) {
  return (
    <a
      href="https://elijahfrost.com"
      onClick={(e) => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          e.preventDefault();
          window.history.back();
        }
        // else: let the browser follow the href to the apex
      }}
      style={style}
    >
      Cancel — go back
    </a>
  );
}
