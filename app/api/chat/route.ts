import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { env } from "@/lib/env";
import { meetingRequestSchema } from "@/lib/meeting-schema";

const requestSchema = z.object({
  message: z.string().min(1),
  resolvedParticipants: z
    .array(
      z.object({
        id: z.string().optional(),
        displayName: z.string(),
        email: z.string().email().optional(),
      })
    )
    .default([]),
});

const fallbackMeetingRequest = {
  participants: [],
  durationMinutes: 60,
  dateRange: {
    type: "unspecified",
  },
  timeOfDay: "unspecified",
  weekdaysOnly: true,
  constraints: {
    avoidLunch: true,
    includeTravelTime: false,
    avoidFocusTime: true,
  },
  candidateCount: 4,
} satisfies z.infer<typeof meetingRequestSchema>;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!env.openaiApiKey) {
    return NextResponse.json({
      mode: "mock",
      meetingRequest: {
        ...fallbackMeetingRequest,
        participants: parsed.data.resolvedParticipants.map((participant) => ({
          ...participant,
          required: true,
        })),
      },
      reply: "OPENAI_API_KEYが未設定のため、モック解析結果を返しています。",
    });
  }

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const response = await client.responses.create({
    model: "gpt-5.1-mini",
    input: [
      {
        role: "system",
        content:
          "ユーザーの会議調整依頼を構造化してください。参加者はresolvedParticipantsを正として扱い、名前から推測しないでください。",
      },
      {
        role: "user",
        content: JSON.stringify(parsed.data),
      },
    ],
  });

  return NextResponse.json({
    mode: "openai",
    text: response.output_text,
  });
}
