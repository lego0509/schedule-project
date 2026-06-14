import type { MeetingRequest } from "./meeting-schema";

const TIMEZONE = "Asia/Tokyo";
const CANDIDATE_LIMIT = 3;
const SLOT_STEP_MINUTES = 30;

export type BusyBlock = {
  participantId: string | null;
  participantName: string;
  startAt: string;
  endAt: string;
  status: "busy" | "tentative";
};

export type CalendarAvailability = {
  provider: "outlook_mock_all_free";
  timezone: typeof TIMEZONE;
  generatedAt: string;
  window: {
    startAt: string;
    endAt: string;
  };
  assumptions: string[];
  participants: {
    id: string | null;
    displayName: string;
    email: string | null;
    availability: "all_free";
    busyBlocks: BusyBlock[];
  }[];
};

export type MeetingCandidate = {
  id: string;
  startAt: string;
  endAt: string;
  dateLabel: string;
  timeLabel: string;
  score: number;
  reason: string;
  conflictLevel: "none" | "soft" | "hard";
  tags: string[];
};

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

type CandidateSlot = {
  date: CalendarDate;
  startMinute: number;
  endMinute: number;
};

export function buildAllFreeAvailability(request: MeetingRequest): CalendarAvailability {
  const dates = resolveTargetDates(request);
  const firstDate = dates[0] ?? getJstToday();
  const lastDate = dates[dates.length - 1] ?? firstDate;

  return {
    provider: "outlook_mock_all_free",
    timezone: TIMEZONE,
    generatedAt: new Date().toISOString(),
    window: {
      startAt: toJstIso(firstDate, 9 * 60),
      endAt: toJstIso(lastDate, 18 * 60),
    },
    assumptions: [
      "Outlook連携前の仮データです。",
      "選択された参加者は対象期間内のすべての時間が空いているものとして扱います。",
      "候補算出はAIではなくプログラムで実行しています。",
    ],
    participants: request.participants.map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      email: participant.email,
      availability: "all_free",
      busyBlocks: [],
    })),
  };
}

export function calculateMeetingCandidates(
  request: MeetingRequest,
  availability: CalendarAvailability
): MeetingCandidate[] {
  const dates = resolveTargetDates(request);
  const slots = dates.flatMap((date) => buildSlotsForDate(date, request));
  const availableSlots = slots.filter((slot) => isSlotAvailable(slot, availability));

  return availableSlots
    .map((slot) => scoreSlot(slot, request))
    .sort((a, b) => b.score - a.score || a.startAt.localeCompare(b.startAt))
    .slice(0, CANDIDATE_LIMIT)
    .map((candidate, index) => ({
      ...candidate,
      id: `candidate-${index + 1}`,
      score: Math.round(candidate.score),
    }));
}

function resolveTargetDates(request: MeetingRequest): CalendarDate[] {
  if (request.dateRange.type === "custom" && request.dateRange.start && request.dateRange.end) {
    const start = parseIsoAsJstDate(request.dateRange.start);
    const end = parseIsoAsJstDate(request.dateRange.end);
    if (start && end) {
      return enumerateBusinessDates(start, end, request.weekdaysOnly).slice(0, 10);
    }
  }

  const today = getJstToday();
  const day = dayOfWeek(today);

  if (request.dateRange.type === "next_week") {
    const daysUntilNextMonday = day === 0 ? 1 : 8 - day;
    const start = addCalendarDays(today, daysUntilNextMonday);
    return Array.from({ length: 5 }, (_, index) => addCalendarDays(start, index));
  }

  if (request.dateRange.type === "this_week") {
    const daysUntilMonday = day === 0 ? 1 : day === 6 ? 2 : 0;
    const start = addCalendarDays(today, daysUntilMonday);
    const startDay = dayOfWeek(start);
    const daysUntilFriday = 5 - startDay;
    return Array.from({ length: daysUntilFriday + 1 }, (_, index) => addCalendarDays(start, index)).filter(
      (date) => !request.weekdaysOnly || isWeekday(date)
    );
  }

  return nextBusinessDates(today, 5);
}

function buildSlotsForDate(date: CalendarDate, request: MeetingRequest): CandidateSlot[] {
  const duration = request.durationMinutes;
  const windows = getTargetWindows(request.timeOfDay);
  const slots: CandidateSlot[] = [];

  windows.forEach((window) => {
    for (let start = window.start; start + duration <= window.end; start += SLOT_STEP_MINUTES) {
      const end = start + duration;
      if (isExcludedByFixedRules(start, end, request)) {
        continue;
      }
      slots.push({
        date,
        startMinute: start,
        endMinute: end,
      });
    }
  });

  return slots;
}

function getTargetWindows(timeOfDay: MeetingRequest["timeOfDay"]) {
  if (timeOfDay === "morning") {
    return [{ start: 9 * 60, end: 12 * 60 }];
  }
  if (timeOfDay === "afternoon") {
    return [{ start: 13 * 60, end: 18 * 60 }];
  }
  return [{ start: 9 * 60, end: 18 * 60 }];
}

function isExcludedByFixedRules(start: number, end: number, request: MeetingRequest) {
  const excluded = [
    request.constraints.avoidLunch ? { start: 12 * 60, end: 13 * 60 } : null,
    request.constraints.avoidFocusTime ? { start: 14 * 60, end: 15 * 60 } : null,
  ].filter((item): item is { start: number; end: number } => Boolean(item));

  return excluded.some((block) => overlaps(start, end, block.start, block.end));
}

function isSlotAvailable(slot: CandidateSlot, availability: CalendarAvailability) {
  const startAt = toJstIso(slot.date, slot.startMinute);
  const endAt = toJstIso(slot.date, slot.endMinute);

  return availability.participants.every((participant) =>
    participant.busyBlocks.every((block) => !dateRangesOverlap(startAt, endAt, block.startAt, block.endAt))
  );
}

function scoreSlot(slot: CandidateSlot, request: MeetingRequest): Omit<MeetingCandidate, "id"> {
  const startAt = toJstIso(slot.date, slot.startMinute);
  const endAt = toJstIso(slot.date, slot.endMinute);
  const preferredMinute = request.timeOfDay === "afternoon" ? 13 * 60 + 30 : 10 * 60;
  const distancePenalty = Math.abs(slot.startMinute - preferredMinute) / 30;
  const dayPenalty = businessDayOffset(getJstToday(), slot.date);
  const score = 100 - distancePenalty * 2 - dayPenalty;
  const tags = ["全員空き", "衝突なし"];

  if (request.timeOfDay === "morning") tags.push("午前");
  if (request.timeOfDay === "afternoon") tags.push("午後");
  if (request.constraints.avoidLunch) tags.push("昼休み回避");
  if (request.constraints.avoidFocusTime) tags.push("集中時間回避");

  return {
    startAt,
    endAt,
    dateLabel: formatDateLabel(startAt),
    timeLabel: `${formatTimeLabel(startAt)} - ${formatTimeLabel(endAt)}`,
    score,
    reason: buildReason(request),
    conflictLevel: "none",
    tags,
  };
}

function buildReason(request: MeetingRequest) {
  const parts = ["全員の予定が空いている仮データ上で衝突がありません"];
  if (request.constraints.avoidLunch) parts.push("昼休みに重ならない枠です");
  if (request.constraints.avoidFocusTime) parts.push("集中時間帯を避けています");
  return `${parts.join("。")}。`;
}

function getJstToday(): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function nextBusinessDates(start: CalendarDate, count: number): CalendarDate[] {
  const dates: CalendarDate[] = [];
  let offset = 0;
  while (dates.length < count) {
    const date = addCalendarDays(start, offset);
    if (isWeekday(date)) {
      dates.push(date);
    }
    offset += 1;
  }
  return dates;
}

function enumerateBusinessDates(start: CalendarDate, end: CalendarDate, weekdaysOnly: boolean) {
  const dates: CalendarDate[] = [];
  let current = start;
  while (compareCalendarDate(current, end) <= 0) {
    if (!weekdaysOnly || isWeekday(current)) {
      dates.push(current);
    }
    current = addCalendarDays(current, 1);
  }
  return dates;
}

function parseIsoAsJstDate(value: string): CalendarDate | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function dayOfWeek(date: CalendarDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function isWeekday(date: CalendarDate) {
  const day = dayOfWeek(date);
  return day >= 1 && day <= 5;
}

function businessDayOffset(from: CalendarDate, to: CalendarDate) {
  let offset = 0;
  let cursor = from;
  while (compareCalendarDate(cursor, to) < 0) {
    cursor = addCalendarDays(cursor, 1);
    if (isWeekday(cursor)) {
      offset += 1;
    }
  }
  return offset;
}

function compareCalendarDate(a: CalendarDate, b: CalendarDate) {
  return calendarDateNumber(a) - calendarDateNumber(b);
}

function calendarDateNumber(date: CalendarDate) {
  return date.year * 10000 + date.month * 100 + date.day;
}

function toJstIso(date: CalendarDate, minuteOfDay: number) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day, hour - 9, minute));
  return utc.toISOString();
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TIMEZONE,
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}

function formatTimeLabel(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

function dateRangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return new Date(startA).getTime() < new Date(endB).getTime() && new Date(startB).getTime() < new Date(endA).getTime();
}
