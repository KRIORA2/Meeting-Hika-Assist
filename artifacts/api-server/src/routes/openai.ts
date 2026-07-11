import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { AnalyzeContextBody, TranscribeAudioBody } from "@workspace/api-zod";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { Buffer } from "node:buffer";

const router = Router();

router.post("/openai/analyze", async (req, res) => {
  const parsed = AnalyzeContextBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { transcript, screenshotBase64 } = parsed.data;

  const userContent: ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Meeting transcript:\n${transcript || "(no transcript yet)"}`,
    },
  ];

  if (screenshotBase64) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${screenshotBase64}`,
        detail: "low",
      },
    });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are Hika — a real-time AI Meeting Assistant for technical interviews and meetings. You give instant, complete, copy-paste-ready answers. You are like a senior engineer whispering the perfect answer in the user's ear.

CORE RULE: The input contains "ANSWER THIS: <text>". Answer THAT. Ignore surrounding filler. Use your own expert knowledge directly.

ALWAYS write real, complete, working code when the question involves:
- SQL → full query with correct syntax
- Python / PySpark / Scala → runnable script
- Azure CLI / PowerShell / Terraform → exact commands
- Data pipelines, ETL, transformations → full working code
- Any "how do I…", "write a…", "show me…", "give me…" involving technical topics → CODE

CODE RULES:
- Write COMPLETE code, not pseudocode or snippets with "..." placeholders
- Use realistic column/table names (customers, orders, employees, etc.)
- Always include comments for non-obvious parts
- For SQL: include WITH clauses, PARTITION BY, proper JOINs as needed
- For Python: include imports
- For Azure: include az login hint if resource group needed

DETECTION — write code sections for ALL of these (even if not explicitly asked):
- "duplicates", "dedup", "distinct" → SQL with ROW_NUMBER()
- "null", "missing", "empty" → handling code
- "aggregate", "group by", "sum", "count", "average" → full SQL
- "join", "merge", "combine" → JOIN query
- "pivot", "unpivot", "transpose" → pivot query
- "slowly changing dimension", "SCD" → SCD Type 2 SQL
- "incremental load", "delta load", "watermark" → pipeline code
- "partition", "cluster", "index" → optimized SQL
- "API", "REST", "request" → Python requests code
- "Azure Data Factory", "ADF" → JSON pipeline definition
- "Azure Synapse", "Databricks", "Spark" → PySpark code
- "Terraform" → HCL resource block
- "regex", "pattern match" → regex pattern + code

ANSWER FORMAT — return ONLY valid JSON, no markdown:
{
  "question": "Concise label ≤60 chars",
  "answer": "2-3 sentences. Lead with the direct answer. No fluff.",
  "suggestions": ["One natural follow-up the user could say out loud"],
  "confidence": "high|medium|low",
  "sections": [
    {
      "type": "code",
      "title": "SQL / Python / PySpark / Azure CLI / etc.",
      "language": "sql|python|bash|hcl|scala|json",
      "content": "COMPLETE working code here"
    }
  ]
}

NEVER use "Meeting context" as the question label.
NEVER write placeholder code like "# your logic here" or "...".
NEVER apologize or add meta-commentary. Just answer like the smartest person in the room.`,
        },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2048,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let result: {
      question?: string;
      answer?: string;
      suggestions?: string[];
      confidence?: string;
      sections?: Array<{ type: string; title: string; content: string; language?: string | null }>;
    };
    try {
      result = JSON.parse(raw);
    } catch {
      result = {};
    }

    res.json({
      question: result.question ?? "Meeting context",
      answer: result.answer ?? "No insights available for the current context.",
      suggestions: result.suggestions ?? [],
      confidence: result.confidence ?? "low",
      sections: result.sections ?? [],
    });
  } catch (err) {
    req.log.error({ err }, "OpenAI analyze error");
    res.status(500).json({ error: "Failed to analyze context" });
  }
});

router.post("/openai/transcribe", async (req, res) => {
  const parsed = TranscribeAudioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { audioBase64, mimeType = "audio/webm" } = parsed.data;

  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");

    if (audioBuffer.length < 500) {
      res.json({ transcript: "" });
      return;
    }

    const ext = mimeType.includes("mp4")
      ? "mp4"
      : mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("mp3")
      ? "mp3"
      : "webm";

    const blob = new Blob([audioBuffer], { type: mimeType });
    const file = new File([blob], `audio.${ext}`, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      file: file as unknown as Parameters<typeof openai.audio.transcriptions.create>[0]["file"],
      response_format: "text",
    });

    const text =
      typeof transcription === "string"
        ? transcription
        : ((transcription as { text?: string }).text ?? "");
    res.json({ transcript: text.trim() });
  } catch (err) {
    req.log.error({ err }, "OpenAI transcribe error");
    res.status(500).json({ error: "Failed to transcribe audio" });
  }
});

export default router;
