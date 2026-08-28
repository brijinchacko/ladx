"use client";

/**
 * Where the web writes a document: its own API route, which holds the
 * database. The desktop writes a file into the project folder instead.
 */
export async function saveDocumentViaApi({
  id,
  title,
  content,
}: {
  id: string;
  title: string;
  content: string;
}): Promise<boolean> {
  const res = await fetch(`/api/documents/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content }),
  });
  return res.ok;
}
