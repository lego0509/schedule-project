import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { chatResponseSchema, type ChatResponse } from "@/lib/chat-schema";
import { env } from "@/lib/env";
import { meetingRequestSchema } from "@/lib/meeting-schema";

const requestSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string(),
      })
    )
    .default([]),
  resolvedParticipants: z
    .array(
      z.object({
        id: z.string().nullable().optional(),
        displayName: z.string(),
        email: z.string().email().nullable().optional(),
      })
    )
    .default([]),
});

type ChatRequest = z.infer<typeof requestSchema>;

const fallbackMeetingRequest = {
  participants: [],
  durationMinutes: 60,
  dateRange: {
    type: "unspecified",
    start: null,
    end: null,
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

function createMockResponse(message: string, resolvedParticipants: ChatRequest["resolvedParticipants"]): ChatResponse {
  const isScheduleRequest = /会議|予定|候補|日程|空き|スケジュール|打ち合わせ|ミーティング|MTG/i.test(message);

  if (!isScheduleRequest) {
    return {
      intent: "small_talk",
      reply: "今はAI API未接続のためモック応答です。日程調整の依頼を送ると、構造化JSONの形で返します。",
      scheduleRequest: null,
    };
  }

  const durationMinutes = message.includes("90") || message.includes("90分") ? 90 : message.includes("30") ? 30 : 60;
  const candidateCount = message.match(/5件/) ? 5 : message.match(/3件/) ? 3 : 4;
  const timeOfDay = message.includes("午前") ? "morning" : message.includes("午後") ? "afternoon" : "unspecified";
  const dateRangeType = message.includes("来週") ? "next_week" : message.includes("今週") ? "this_week" : "unspecified";

  return {
    intent: "schedule_request",
    reply: "OPENAI_API_KEYが未設定のため、モック解析結果を返しています。参加者、会議時間、期間、条件をJSON化しました。",
    scheduleRequest: {
      ...fallbackMeetingRequest,
      participants: resolvedParticipants.map((participant) => ({
        id: participant.id ?? null,
        displayName: participant.displayName,
        email: participant.email ?? null,
        required: true,
      })),
      durationMinutes,
      dateRange: {
        type: dateRangeType,
        start: null,
        end: null,
      },
      timeOfDay,
      candidateCount,
    },
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!env.openaiApiKey) {
    return NextResponse.json({
      mode: "mock",
      ...createMockResponse(parsed.data.message, parsed.data.resolvedParticipants),
    });
  }

  try {
    const client = new OpenAI({ apiKey: env.openaiApiKey });
    const response = await client.responses.parse({
      model: env.openaiModel,
      input: [
        {
          role: "system",
          content: [
            "あなたはスケジュール管理AIの入力分類器です。",
            "ユーザー入力を small_talk または schedule_request に分類してください。",
            "small_talk は雑談、挨拶、使い方質問、日程調整と無関係な会話です。この場合 scheduleRequest は null にしてください。",
            "schedule_request は会議候補、空き時間、日程調整、予定確認に関する依頼です。この場合 scheduleRequest を必ず埋めてください。",
            "参加者は resolvedParticipants を正として扱い、本文中の名前から勝手に同姓同名を推測しないでください。",
            "resolvedParticipants が空で参加者が必要な依頼なら、participants は空配列のままにし、reply でメンション選択を促してください。",
            "日付が不明な場合は dateRange.type を unspecified にしてください。",
            "候補件数は3から5に丸めてください。",
            "reply は日本語で、ユーザーにそのまま返せる短い文章にしてください。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            currentMessage: parsed.data.message,
            resolvedParticipants: parsed.data.resolvedParticipants,
            recentHistory: parsed.data.history.slice(-8),
          }),
        },
      ],
      text: {
        format: zodTextFormat(chatResponseSchema, "schedule_chat_response"),
      },
    });

    const output = response.output_parsed;
    if (!output) {
      return NextResponse.json({ error: "Failed to parse OpenAI response" }, { status: 502 });
    }

    return NextResponse.json({
      mode: "openai",
      ...output,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
