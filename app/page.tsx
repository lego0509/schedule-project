"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ChatResponse } from "@/lib/chat-schema";
import type { MeetingRequest } from "@/lib/meeting-schema";
import type { CalendarAvailability, MeetingCandidate } from "@/lib/scheduler";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";

type Role = "利用者" | "管理者";

type Contact = {
  id: string;
  displayName: string;
  email: string;
  department: string;
  jobTitle: string;
};

type Message = {
  role: "assistant" | "user";
  text: string;
};

type ChatApiResponse = ChatResponse & {
  mode: "mock" | "openai";
  calendarAvailability: CalendarAvailability | null;
  candidates: MeetingCandidate[];
};

type Candidate = {
  date: string;
  time: string;
  score: string;
  reason: string;
  tags: string[];
  variant?: "best" | "warning";
};

type ParsedRequest = {
  duration: string;
  range: string;
  timeOfDay: string;
  count: number;
};

const contacts: Contact[] = [
  {
    id: "user-001",
    displayName: "山田 太郎",
    email: "taro.yamada@example.com",
    department: "営業部",
    jobTitle: "マネージャー",
  },
  {
    id: "user-002",
    displayName: "山田 太郎",
    email: "taro.yamada2@example.com",
    department: "開発部",
    jobTitle: "エンジニア",
  },
  {
    id: "user-003",
    displayName: "佐藤 花子",
    email: "hanako.sato@example.com",
    department: "人事部",
    jobTitle: "採用担当",
  },
  {
    id: "user-004",
    displayName: "高橋 健",
    email: "ken.takahashi@example.com",
    department: "営業企画",
    jobTitle: "リーダー",
  },
  {
    id: "user-005",
    displayName: "鈴木 愛",
    email: "ai.suzuki@example.com",
    department: "デザイン部",
    jobTitle: "デザイナー",
  },
  {
    id: "user-006",
    displayName: "田中 美咲",
    email: "misaki.tanaka@example.com",
    department: "マーケティング部",
    jobTitle: "プランナー",
  },
  {
    id: "user-007",
    displayName: "伊藤 誠",
    email: "makoto.ito@example.com",
    department: "経理部",
    jobTitle: "主任",
  },
  {
    id: "user-008",
    displayName: "渡辺 優",
    email: "yu.watanabe@example.com",
    department: "カスタマーサクセス",
    jobTitle: "担当",
  },
];

const mockCandidates: Candidate[] = [
  {
    date: "6月16日 火",
    time: "09:30 - 10:30",
    score: "最適",
    reason: "選択済み参加者全員が空いており、直前後の予定にも余裕があります。",
    tags: ["衝突なし", "移動不要", "午前"],
    variant: "best",
  },
  {
    date: "6月17日 水",
    time: "10:00 - 11:00",
    score: "92%",
    reason: "既存予定との間隔が十分あり、昼休みに重なりません。",
    tags: ["衝突なし", "昼休み回避"],
  },
  {
    date: "6月18日 木",
    time: "09:00 - 10:00",
    score: "88%",
    reason: "午後の予定を避け、午前の空き枠を優先しました。",
    tags: ["午前", "平日"],
  },
  {
    date: "6月19日 金",
    time: "11:00 - 12:00",
    score: "候補",
    reason: "会議後すぐ昼休みのため、余裕は少なめです。",
    tags: ["衝突なし", "余裕少"],
    variant: "warning",
  },
  {
    date: "6月22日 月",
    time: "15:00 - 16:00",
    score: "84%",
    reason: "来週の中では参加者の空きが揃いやすい枠です。",
    tags: ["来週", "衝突なし"],
  },
];

const quickPrompts = [
  {
    label: "今週中・午前・60分",
    contacts: ["user-001", "user-003"],
    text: "@山田 太郎 @佐藤 花子 との1時間会議の候補日を出して。今週中、午前のみで。",
  },
  {
    label: "平日・30分・昼休み除外",
    contacts: ["user-004"],
    text: "@高橋 健 との30分ミーティングを平日で3件出して。昼休みは避けたい。",
  },
  {
    label: "来週・90分・集中時間除外",
    contacts: ["user-005"],
    text: "@鈴木 愛 との90分の打ち合わせ候補を来週で5件ください。集中時間帯は避けて。",
  },
];

const loginRoleStorageKey = "schedule-ai-login-role";
const visibleParticipantLimit = 6;

export default function Home() {
  const [role, setRole] = useState<Role | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"chat" | "insights">("chat");
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [participantsExpanded, setParticipantsExpanded] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selected, setSelected] = useState<Contact[]>([]);
  const [parsed, setParsed] = useState<ParsedRequest>({
    duration: "60分",
    range: "今週中",
    timeOfDay: "午前のみ",
    count: 4,
  });
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "@で参加者を検索してから、会議時間や期間を入力してください。同姓同名でもメールアドレスで判別します。",
    },
  ]);
  const [lastAiResult, setLastAiResult] = useState<ChatApiResponse | null>(null);
  const [candidateCards, setCandidateCards] = useState<Candidate[]>(mockCandidates.slice(0, 3));

  const mentionQuery = useMemo(() => {
    const match = input.match(/@([^\s@]*)$/);
    return match?.[1] ?? "";
  }, [input]);

  const mentionCandidates = useMemo(() => {
    const normalized = mentionQuery.toLowerCase();
    return contacts.filter((contact) => {
      return (
        contact.displayName.toLowerCase().includes(normalized) ||
        contact.email.toLowerCase().includes(normalized) ||
        contact.department.toLowerCase().includes(normalized)
      );
    });
  }, [mentionQuery]);

  const participantLabel = selected.length
    ? selected.map((contact) => `${contact.displayName}（${contact.department}）`).join("、")
    : "未選択";
  const overflowParticipantCount = Math.max(selected.length - visibleParticipantLimit, 0);
  const visibleParticipants = participantsExpanded ? selected : selected.slice(0, visibleParticipantLimit);

  useEffect(() => {
    if (inputRef.current) {
      resizeComposerTextarea(inputRef.current);
    }
  }, [input]);

  useEffect(() => {
    scrollMessagesToBottom(messagesRef.current);
  }, [messages.length, isSending, mobilePanel]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    const supabase = createSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setAuthError(error.message);
        return;
      }

      const sessionUser = data.session?.user ?? null;
      setAuthUser(sessionUser);

      if (sessionUser) {
        const storedRole = window.sessionStorage.getItem(loginRoleStorageKey) as Role | null;
        setRole(storedRole ?? "利用者");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setAuthUser(sessionUser);

      if (sessionUser) {
        const storedRole = window.sessionStorage.getItem(loginRoleStorageKey) as Role | null;
        setRole(storedRole ?? "利用者");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleMicrosoftSignIn(nextRole: Role) {
    setAuthError(null);

    if (!isSupabaseConfigured) {
      setAuthError("Supabaseの環境変数が未設定です。NEXT_PUBLIC_SUPABASE_URLとNEXT_PUBLIC_SUPABASE_ANON_KEYを設定してください。");
      return;
    }

    setAuthLoading(true);
    window.sessionStorage.setItem(loginRoleStorageKey, nextRole);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "openid email profile offline_access",
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setAuthError(error.message);
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    if (isSupabaseConfigured) {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    }

    window.sessionStorage.removeItem(loginRoleStorageKey);
    setAuthUser(null);
    setRole(null);
  }

  function handleSkipLogin() {
    setAuthError(null);
    setAuthUser(null);
    window.sessionStorage.setItem(loginRoleStorageKey, "利用者");
    setRole("利用者");
  }

  if (!role) {
    return (
      <section className="login-screen" aria-label="ログイン">
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true">
            S
          </div>
          <p className="eyebrow">Schedule AI</p>
          <h1>会議候補をチャットで作成</h1>
          <p>
            Microsoftアカウントでログインし、チャットから参加者と条件を指定して会議候補を作成します。
          </p>
          <p className={`auth-message ${authError ? "is-error" : ""}`}>
            {authError ??
              (isSupabaseConfigured
                ? "個人Microsoftアカウントでログインできます。"
                : "Supabase環境変数を設定するとMicrosoftログインを試せます。")}
          </p>
          <button className="skip-login-button" type="button" onClick={handleSkipLogin}>
            テスト用にログインなしで利用者画面へ
          </button>
        </div>

        <div className="login-grid">
          <article className="login-card">
            <span className="role-label">利用者用</span>
            <h2>会議候補を作成</h2>
            <p>参加者をメンションで指定し、空き時間候補を確認します。</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => handleMicrosoftSignIn("利用者")}
              disabled={authLoading}
            >
              {authLoading ? "ログイン処理中" : "Microsoftでログイン"}
            </button>
          </article>
          <article className="login-card admin">
            <span className="role-label">管理者用</span>
            <h2>利用設定を管理</h2>
            <p>連携設定、ユーザー設定、候補算出ルールの管理画面に入ります。</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => handleMicrosoftSignIn("管理者")}
              disabled={authLoading}
            >
              {authLoading ? "ログイン処理中" : "管理者としてログイン"}
            </button>
          </article>
        </div>
      </section>
    );
  }

  function handlePrompt(prompt: (typeof quickPrompts)[number]) {
    setInput(prompt.text);
    addContactsByIds(prompt.contacts);
  }

  function addContactsByIds(ids: string[]) {
    const additions = ids
      .map((id) => contacts.find((contact) => contact.id === id))
      .filter((contact): contact is Contact => Boolean(contact));
    setParticipantsExpanded(false);
    setSelected((current) => {
      const next = [...current];
      additions.forEach((contact) => {
        if (!next.some((item) => item.id === contact.id)) {
          next.push(contact);
        }
      });
      return next;
    });
  }

  function selectContact(contact: Contact) {
    setSelected((current) => {
      if (current.some((item) => item.id === contact.id)) {
        return current;
      }
      return [...current, contact];
    });
    setParticipantsExpanded(false);
    setInput((current) => current.replace(/@[^\s@]*$/, `@${contact.displayName} `));
    setMentionOpen(false);
  }

  function removeContact(id: string) {
    setSelected((current) => {
      const next = current.filter((contact) => contact.id !== id);
      if (next.length <= visibleParticipantLimit) {
        setParticipantsExpanded(false);
      }
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text) {
      return;
    }

    const history = messages.slice(-8);
    const resolvedParticipants = selected.map((contact) => ({
      id: contact.id,
      displayName: contact.displayName,
      email: contact.email,
    }));

    setIsSending(true);
    setMessages((current) => [
      ...current,
      { role: "user", text },
    ]);
    setInput("");
    setMentionOpen(false);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          history,
          resolvedParticipants,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error ?? "AI応答の取得に失敗しました。");
      }

      const result = (await response.json()) as ChatApiResponse;
      logChatApiResult(result);
      setLastAiResult(result);
      setMessages((current) => [...current, { role: "assistant", text: result.reply }]);

      if (result.intent === "schedule_request" && result.scheduleRequest) {
        setParsed({
          ...convertMeetingRequestToParsed(result.scheduleRequest),
          count: result.candidates.length,
        });
        if (result.candidates.length) {
          setCandidateCards(result.candidates.map(convertCandidateToCard));
        }
        setMobilePanel("insights");
      } else {
        setMobilePanel("chat");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI応答の取得に失敗しました。";
      console.error("[ScheduleAI] Chat API error", error);
      setMessages((current) => [...current, { role: "assistant", text: message }]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            S
          </div>
          <div>
            <p className="eyebrow">Schedule AI</p>
            <h1>会議候補をチャットで作成</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="role-chip">{role}</span>
          {authUser?.email ? <span className="role-chip">{authUser.email}</span> : null}
          {role === "管理者" ? (
            <button className="ghost-button" type="button">
              管理
            </button>
          ) : null}
          <button className="ghost-button" type="button" onClick={handleSignOut}>
            ログアウト
          </button>
        </div>
      </header>

      <nav className="mobile-tabs" aria-label="表示切り替え">
        <button
          className={mobilePanel === "chat" ? "is-active" : ""}
          type="button"
          onClick={() => setMobilePanel("chat")}
        >
          チャット
        </button>
        <button
          className={mobilePanel === "insights" ? "is-active" : ""}
          type="button"
          onClick={() => setMobilePanel("insights")}
        >
          候補・条件
        </button>
      </nav>

      <main className="main-layout">
        <section
          className={`chat-panel ${mobilePanel === "chat" ? "is-mobile-active" : ""}`}
          aria-label="チャット"
        >
          <div className="chat-header">
            <div>
              <h2>依頼内容</h2>
              <p>@を入力して、候補から参加者を確定できます。</p>
            </div>
            <span className="status-pill">{lastAiResult?.mode === "openai" ? "AI接続" : "AI判定"}</span>
          </div>

          <div className="quick-prompts" aria-label="入力例">
            {quickPrompts.map((prompt) => (
              <button key={prompt.label} type="button" onClick={() => handlePrompt(prompt)}>
                {prompt.label}
              </button>
            ))}
          </div>

          <div className="selected-participants" aria-label="選択済み参加者">
            <button className="add-participant" type="button" onClick={() => setMentionOpen(true)}>
              参加者を追加
            </button>
            {visibleParticipants.map((contact) => (
              <span className="participant-chip" key={contact.id}>
                {contact.displayName}
                <small>{contact.department}</small>
                <button
                  type="button"
                  aria-label={`${contact.displayName}を削除`}
                  onClick={() => removeContact(contact.id)}
                >
                  x
                </button>
              </span>
            ))}
            {overflowParticipantCount ? (
              <button
                className="participant-more"
                type="button"
                onClick={() => setParticipantsExpanded((current) => !current)}
                aria-expanded={participantsExpanded}
              >
                {participantsExpanded ? "まとめる" : `他${overflowParticipantCount}人`}
              </button>
            ) : null}
          </div>

          <div className="messages" ref={messagesRef} aria-live="polite">
            {messages.map((message, index) => (
              <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                <div className="avatar">{message.role === "user" ? "You" : "AI"}</div>
                <div className="bubble">
                  <p>{message.text}</p>
                </div>
              </article>
            ))}
            {isSending ? (
              <article className="message assistant typing" aria-label="AIが入力中です">
                <div className="avatar">AI</div>
                <div className="bubble">
                  <div className="typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </article>
            ) : null}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            {mentionOpen ? (
              <div className="mention-popover" role="listbox" aria-label="参加者候補">
                {mentionCandidates.map((contact) => (
                  <button
                    className="mention-item"
                    type="button"
                    key={contact.id}
                    onClick={() => selectContact(contact)}
                    role="option"
                  >
                    <span className="mention-avatar">{contact.displayName.slice(0, 1)}</span>
                    <span>
                      <span className="mention-name">{contact.displayName}</span>
                      <span className="mention-meta">
                        {contact.department} / {contact.jobTitle}
                      </span>
                    </span>
                    <span className="mention-email">{contact.email}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <label className="sr-only" htmlFor="chat-input">
              依頼内容
            </label>
            <textarea
              ref={inputRef}
              id="chat-input"
              rows={2}
              placeholder="例: @山田 と @佐藤 の1時間会議を今週中で"
              value={input}
              onChange={(event) => {
                const nextInput = event.target.value;
                setInput(nextInput);
                resizeComposerTextarea(event.currentTarget);
                setMentionOpen(/@[^\s@]*$/.test(nextInput));
              }}
              onFocus={() => {
                if (/@[^\s@]*$/.test(input)) {
                  setMentionOpen(true);
                }
              }}
            />
            <button type="submit" disabled={isSending}>
              {isSending ? "送信中" : "送信"}
            </button>
          </form>
        </section>

        <aside
          className={`insight-panel ${mobilePanel === "insights" ? "is-mobile-active" : ""}`}
          aria-label="候補日と条件"
        >
          <div className="insight-scroll">
            <section className="summary-section">
              <div className="section-heading">
                <h2>抽出された条件</h2>
                <span>{lastAiResult?.intent === "small_talk" ? "雑談" : "AI JSON"}</span>
              </div>
              <div className="condition-grid">
                <div>
                  <span>参加者</span>
                  <strong>{participantLabel}</strong>
                </div>
                <div>
                  <span>会議時間</span>
                  <strong>{parsed.duration}</strong>
                </div>
                <div>
                  <span>期間</span>
                  <strong>{parsed.range}</strong>
                </div>
                <div>
                  <span>時間帯</span>
                  <strong>{parsed.timeOfDay}</strong>
                </div>
              </div>
            </section>

            <section className="candidate-section">
              <div className="section-heading">
                <h2>候補日</h2>
                <span>{candidateCards.length}件</span>
              </div>
              <div className="candidate-list">
                {candidateCards.map((candidate) => (
                  <article className={`candidate-card ${candidate.variant ?? ""}`} key={candidate.time}>
                    <div className="candidate-top">
                      <div>
                        <p className="candidate-date">{candidate.date}</p>
                        <h3>{candidate.time}</h3>
                      </div>
                      <span className="score">{candidate.score}</span>
                    </div>
                    <p>{candidate.reason}</p>
                    <div className="tags">
                      {candidate.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="calendar-preview">
              <div className="section-heading">
                <h2>ダミー予定</h2>
                <span>衝突判定対象</span>
              </div>
              <div className="timeline">
                <div className="timeline-row">
                  <span>09:00</span>
                  <div className="busy-block">朝会</div>
                </div>
                <div className="timeline-row">
                  <span>12:00</span>
                  <div className="break-block">昼休み</div>
                </div>
                <div className="timeline-row">
                  <span>14:00</span>
                  <div className="busy-block">集中時間</div>
                </div>
                <div className="timeline-row">
                  <span>16:00</span>
                  <div className="busy-block">顧客MTG</div>
                </div>
              </div>
            </section>
          </div>
        </aside>
      </main>
    </div>
  );
}

function parseMeetingRequest(text: string): ParsedRequest {
  const duration = text.includes("90") || text.includes("90分")
    ? "90分"
    : text.includes("30") || text.includes("30分")
      ? "30分"
      : "60分";
  const range = text.includes("来週") ? "来週" : text.includes("今週") ? "今週中" : "直近5営業日";
  const timeOfDay = text.includes("午前") ? "午前のみ" : text.includes("午後") ? "午後のみ" : "終日";
  const count = text.match(/5件/) ? 5 : text.match(/3件/) ? 3 : 4;

  return {
    duration,
    range,
    timeOfDay,
    count,
  };
}

function participantSummary(participants: Contact[]) {
  return participants.length ? participants.map((contact) => contact.displayName).join("、") : "指定参加者";
}

function logChatApiResult(result: ChatApiResponse) {
  console.groupCollapsed("[ScheduleAI] Chat API result");
  console.info("intent", result.intent);
  console.info("mode", result.mode);
  console.info("reply", result.reply);
  console.info("scheduleRequest", result.scheduleRequest);
  console.info("calendarAvailability", result.calendarAvailability);
  console.info("candidates", result.candidates);
  console.groupEnd();
}

function resizeComposerTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;

  const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight);
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

function scrollMessagesToBottom(container: HTMLDivElement | null) {
  if (!container) {
    return;
  }

  window.requestAnimationFrame(() => {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  });
}

function convertMeetingRequestToParsed(request: MeetingRequest): ParsedRequest {
  return {
    duration: `${request.durationMinutes}分`,
    range: convertDateRangeLabel(request.dateRange.type),
    timeOfDay: convertTimeOfDayLabel(request.timeOfDay),
    count: request.candidateCount,
  };
}

function convertDateRangeLabel(type: MeetingRequest["dateRange"]["type"]) {
  const labels = {
    this_week: "今週中",
    next_week: "来週",
    custom: "期間指定",
    unspecified: "未指定",
  } satisfies Record<MeetingRequest["dateRange"]["type"], string>;

  return labels[type];
}

function convertTimeOfDayLabel(type: MeetingRequest["timeOfDay"]) {
  const labels = {
    morning: "午前のみ",
    afternoon: "午後のみ",
    all_day: "終日",
    unspecified: "未指定",
  } satisfies Record<MeetingRequest["timeOfDay"], string>;

  return labels[type];
}

function convertCandidateToCard(candidate: MeetingCandidate, index: number): Candidate {
  return {
    date: candidate.dateLabel,
    time: candidate.timeLabel,
    score: index === 0 ? "最適" : `${candidate.score}%`,
    reason: candidate.reason,
    tags: candidate.tags,
    variant: index === 0 ? "best" : undefined,
  };
}
