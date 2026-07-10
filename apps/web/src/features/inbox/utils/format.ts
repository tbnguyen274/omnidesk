export function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatMessagePreview(
  content: string | null | undefined,
  contentType?: string,
) {
  if (!content) {
    return "No messages yet";
  }

  const text =
    contentType === "HTML" || looksLikeHtml(content)
      ? stripHtml(content)
      : content;

  return (
    decodeHtmlEntities(text).replace(/\s+/g, " ").trim() || "No messages yet"
  );
}

export function getInitials(value: string | null) {
  if (!value) {
    return "NA";
  }

  return value
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function getErrorMessage(caught: unknown) {
  if (caught instanceof Error) {
    return caught.message;
  }

  return "Unable to send reply";
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}
