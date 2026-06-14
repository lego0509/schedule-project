import { z } from "zod";
import { meetingRequestSchema } from "./meeting-schema";

export const chatIntentSchema = z.enum(["small_talk", "schedule_request"]);

export const chatResponseSchema = z.object({
  intent: chatIntentSchema,
  reply: z.string(),
  scheduleRequest: meetingRequestSchema.nullable(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;
