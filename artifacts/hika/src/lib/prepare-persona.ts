import { getAccessToken } from "@/lib/auth";

export type PreparedPersona = {
  ready: boolean;
  hasResume: boolean;
  hasJd: boolean;
  skills: string[];
  name: string;
};

export async function prepareInterviewPersona(
  docs: Array<{ id: string; name: string }>,
  jobDescription = "",
): Promise<PreparedPersona | null> {
  if (!docs.length && !jobDescription.trim()) return null;
  const apiUrl = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const token = await getAccessToken();
  const response = await fetch(`${apiUrl}/api/openai/prepare-persona`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      uploadedDocs: docs.slice(0, 3),
      jobDescription: jobDescription.slice(0, 4000),
    }),
  });
  if (!response.ok) return null;
  return response.json() as Promise<PreparedPersona>;
}
