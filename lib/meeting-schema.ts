import { z } from "zod";

export const meetingRequestSchema = z.object({
  participants: z.array(
    z.object({
      id: z.string().optional(),
      displayName: z.string(),
      email: z.string().email().optional(),
      required: z.boolean().default(true),
    })
  ),
  durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  dateRange: z.object({
    type: z.enum(["this_week", "next_week", "custom", "unspecified"]),
    start: z.string().optional(),
    end: z.string().optional(),
  }),
  timeOfDay: z.enum(["morning", "afternoon", "all_day", "unspecified"]),
  weekdaysOnly: z.boolean(),
  constraints: z.object({
    avoidLunch: z.boolean(),
    includeTravelTime: z.boolean(),
    avoidFocusTime: z.boolean(),
  }),
  candidateCount: z.number().int().min(3).max(5),
});

export type MeetingRequest = z.infer<typeof meetingRequestSchema>;
