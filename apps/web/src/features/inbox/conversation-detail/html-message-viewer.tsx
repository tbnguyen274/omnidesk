"use client";

import { useRef } from "react";

export function HtmlMessageViewer({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const adjustHeight = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        const height = iframeRef.current.contentWindow.document.documentElement.scrollHeight;
        iframeRef.current.style.height = `${Math.max(height, 60)}px`;
      } catch {
        // Ignore cross-origin errors if any
      }
    }
  };

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      onLoad={adjustHeight}
      className="w-full border-none bg-white rounded-md text-slate-950"
      style={{ minWidth: "100%", minHeight: "60px" }}
      sandbox="allow-same-origin allow-popups"
    />
  );
}
