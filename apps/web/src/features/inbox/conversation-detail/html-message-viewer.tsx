"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export function HtmlMessageViewer({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(100);

  // Check if it's a full standalone HTML document / marketing email template
  const isFullDocument = useMemo(() => {
    return /<!DOCTYPE|<html|<head|<body|<meta|<style/i.test(html);
  }, [html]);

  // Sanitize script/event handlers from input
  const cleanHtml = useMemo(() => {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/\son\w+="[^"]*"/gi, "")
      .replace(/\son\w+='[^']*'/gi, "");
  }, [html]);

  const fullIframeHtml = useMemo(() => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1e293b;
      background: transparent;
      overflow: hidden;
    }
    #email-root {
      display: flow-root;
      padding: 4px 6px 12px 6px;
      word-break: break-word;
    }
    img { max-width: 100% !important; height: auto !important; }
    table { max-width: 100% !important; }
    a { color: #2563eb; }
    blockquote, .gmail_quote {
      border-left: 3px solid #cbd5e1;
      margin: 8px 0;
      padding-left: 10px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div id="email-root">${cleanHtml}</div>
  <script>
    function sendHeight() {
      var root = document.getElementById('email-root');
      if (!root) return;
      var h = Math.ceil(root.getBoundingClientRect().height);
      if (h > 0) {
        window.parent.postMessage({ type: 'OMNIDESK_HTML_HEIGHT', height: h + 10 }, '*');
      }
    }
    window.addEventListener('load', sendHeight);
    if (window.ResizeObserver) {
      new ResizeObserver(sendHeight).observe(document.getElementById('email-root'));
    }
  </script>
</body>
</html>`;
  }, [cleanHtml]);

  useEffect(() => {
    if (!isFullDocument) return;

    const handleMessage = (e: MessageEvent) => {
      if (
        e.data &&
        e.data.type === "OMNIDESK_HTML_HEIGHT" &&
        typeof e.data.height === "number"
      ) {
        setIframeHeight(e.data.height);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isFullDocument]);

  if (isFullDocument) {
    return (
      <div className="w-full overflow-hidden rounded-lg my-1">
        <iframe
          ref={iframeRef}
          srcDoc={fullIframeHtml}
          className="w-full border-none bg-transparent block"
          style={{
            height: `${iframeHeight}px`,
            minHeight: "40px",
          }}
          sandbox="allow-same-origin allow-scripts allow-popups"
        />
      </div>
    );
  }

  return (
    <div
      className="email-html-content text-sm leading-relaxed break-words overflow-x-auto max-w-full [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2.5 [&_blockquote]:my-1.5 [&_blockquote]:text-slate-500 [&_.gmail_quote]:border-l-2 [&_.gmail_quote]:border-slate-300 [&_.gmail_quote]:pl-2.5 [&_.gmail_quote]:my-1.5 [&_.gmail_attr]:text-xs [&_.gmail_attr]:text-slate-400 [&_.gmail_attr]:mb-1 [&_a]:text-blue-600 [&_a]:underline [&_img]:max-w-full [&_img]:h-auto [&_table]:max-w-full"
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  );
}
