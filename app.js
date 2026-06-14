const loginScreen = document.querySelector("#login-screen");
const appShell = document.querySelector("#app-shell");
const roleChip = document.querySelector("#role-chip");
const adminButton = document.querySelector("#admin-button");
const logoutButton = document.querySelector("#logout-button");
const loginButtons = document.querySelectorAll("[data-login-role]");
const mobileTabs = document.querySelectorAll("[data-mobile-tab]");
const panels = document.querySelectorAll("[data-panel]");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const messages = document.querySelector("#messages");
const quickPrompts = document.querySelectorAll("[data-prompt]");
const durationLabel = document.querySelector("#duration-label");
const rangeLabel = document.querySelector("#range-label");
const timeOfDayLabel = document.querySelector("#timeofday-label");
const participantLabel = document.querySelector("#participant-label");
const candidateCount = document.querySelector("#candidate-count");
const candidateList = document.querySelector("#candidate-list");
const mentionPopover = document.querySelector("#mention-popover");
const selectedParticipants = document.querySelector("#selected-participants");
const addParticipantButton = document.querySelector("#add-participant");

const contacts = [
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
];

const mockCandidates = [
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

let selected = [];

loginButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const role = button.dataset.loginRole;
    roleChip.textContent = role;
    adminButton.hidden = role !== "管理者";
    loginScreen.classList.add("is-hidden");
    appShell.classList.remove("is-hidden");
    input.focus();
  });
});

logoutButton.addEventListener("click", () => {
  appShell.classList.add("is-hidden");
  loginScreen.classList.remove("is-hidden");
});

mobileTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setMobilePanel(tab.dataset.mobileTab);
  });
});

quickPrompts.forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.prompt;
    selectContactsByIds(button.dataset.contacts);
    input.focus();
    resizeInput();
    renderSelectedParticipants();
  });
});

addParticipantButton.addEventListener("click", () => {
  renderMentionOptions("");
  mentionPopover.classList.remove("is-hidden");
  input.focus();
});

input.addEventListener("input", () => {
  resizeInput();
  updateMentionPopover();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    mentionPopover.classList.add("is-hidden");
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".composer") && !event.target.closest(".selected-participants")) {
    mentionPopover.classList.add("is-hidden");
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text) {
    return;
  }

  inferParticipantsFromText(text);
  appendMessage("user", text);
  input.value = "";
  resizeInput();
  mentionPopover.classList.add("is-hidden");

  const parsed = parseMeetingRequest(text);
  updateSummary(parsed);
  updateCandidates(parsed);
  setMobilePanel("insights");

  window.setTimeout(() => {
    appendMessage(
      "assistant",
      `${participantSummary()}との${parsed.duration}会議について、${parsed.range}の${parsed.timeOfDay}で候補を${parsed.count}件作成しました。参加者はメールアドレスで確定済みです。`
    );
  }, 240);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

renderSelectedParticipants();
updateCandidates({ count: 4 });

function setMobilePanel(panelName) {
  mobileTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.mobileTab === panelName);
  });

  panels.forEach((panel) => {
    panel.classList.toggle("is-mobile-active", panel.dataset.panel === panelName);
  });
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
}

function updateMentionPopover() {
  const match = getMentionQuery(input.value, input.selectionStart);

  if (!match) {
    mentionPopover.classList.add("is-hidden");
    return;
  }

  renderMentionOptions(match.query);
  mentionPopover.classList.remove("is-hidden");
}

function getMentionQuery(value, cursor) {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/@([^\s@]*)$/);
  return match ? { query: match[1] } : null;
}

function renderMentionOptions(query) {
  const normalized = query.toLowerCase();
  const candidates = contacts.filter((contact) => {
    return (
      contact.displayName.toLowerCase().includes(normalized) ||
      contact.email.toLowerCase().includes(normalized) ||
      contact.department.toLowerCase().includes(normalized)
    );
  });

  mentionPopover.innerHTML = candidates
    .map(
      (contact) => `
        <button class="mention-item" type="button" data-contact-id="${contact.id}" role="option">
          <span class="mention-avatar">${contact.displayName.slice(0, 1)}</span>
          <span>
            <span class="mention-name">${contact.displayName}</span>
            <span class="mention-meta">${contact.department} / ${contact.jobTitle}</span>
          </span>
          <span class="mention-email">${contact.email}</span>
        </button>
      `
    )
    .join("");

  mentionPopover.querySelectorAll("[data-contact-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const contact = contacts.find((item) => item.id === button.dataset.contactId);
      if (contact) {
        selectContact(contact);
      }
    });
  });
}

function selectContact(contact) {
  if (!selected.some((item) => item.id === contact.id)) {
    selected.push(contact);
  }

  const cursor = input.selectionStart;
  const beforeCursor = input.value.slice(0, cursor);
  const afterCursor = input.value.slice(cursor);
  const replaced = beforeCursor.replace(/@[^\s@]*$/, `@${contact.displayName} `);
  input.value = `${replaced}${afterCursor}`;
  input.focus();
  input.selectionStart = input.selectionEnd = replaced.length;
  mentionPopover.classList.add("is-hidden");
  resizeInput();
  renderSelectedParticipants();
}

function inferParticipantsFromText(text) {
  const nameCounts = contacts.reduce((result, contact) => {
    result[contact.displayName] = (result[contact.displayName] ?? 0) + 1;
    return result;
  }, {});

  contacts.forEach((contact) => {
    const canResolveByName = nameCounts[contact.displayName] === 1;
    if (
      canResolveByName &&
      text.includes(`@${contact.displayName}`) &&
      !selected.some((item) => item.id === contact.id)
    ) {
      selected.push(contact);
    }
  });
}

function selectContactsByIds(value) {
  if (!value) {
    return;
  }

  value.split(",").forEach((id) => {
    const contact = contacts.find((item) => item.id === id);
    if (contact && !selected.some((item) => item.id === contact.id)) {
      selected.push(contact);
    }
  });
}

function renderSelectedParticipants() {
  const chips = selected
    .map(
      (contact) => `
        <span class="participant-chip">
          ${contact.displayName}
          <small>${contact.department}</small>
          <button type="button" aria-label="${contact.displayName}を削除" data-remove-id="${contact.id}">x</button>
        </span>
      `
    )
    .join("");

  selectedParticipants.innerHTML = `${chips}<button class="add-participant" type="button" id="add-participant">参加者を追加</button>`;
  selectedParticipants.querySelector("#add-participant").addEventListener("click", () => {
    renderMentionOptions("");
    mentionPopover.classList.remove("is-hidden");
    input.focus();
  });
  selectedParticipants.querySelectorAll("[data-remove-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selected = selected.filter((contact) => contact.id !== button.dataset.removeId);
      renderSelectedParticipants();
      updateParticipantLabel();
    });
  });
  updateParticipantLabel();
}

function appendMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  article.innerHTML = `
    <div class="avatar">${role === "user" ? "You" : "AI"}</div>
    <div class="bubble"><p>${escapeHtml(text)}</p></div>
  `;
  messages.appendChild(article);
  messages.scrollTop = messages.scrollHeight;
}

function parseMeetingRequest(text) {
  const duration = text.includes("90") || text.includes("90分")
    ? "90分"
    : text.includes("30") || text.includes("30分")
      ? "30分"
      : "60分";
  const range = text.includes("来週") ? "来週" : text.includes("今週") ? "今週中" : "直近5営業日";
  const timeOfDay = text.includes("午前")
    ? "午前のみ"
    : text.includes("午後")
      ? "午後のみ"
      : "終日";
  const count = text.match(/5件/) ? 5 : text.match(/3件/) ? 3 : 4;

  return {
    duration,
    range,
    timeOfDay,
    count,
  };
}

function updateSummary(parsed) {
  durationLabel.textContent = parsed.duration;
  rangeLabel.textContent = parsed.range;
  timeOfDayLabel.textContent = parsed.timeOfDay;
  updateParticipantLabel();
}

function updateParticipantLabel() {
  participantLabel.textContent = selected.length
    ? selected.map((contact) => `${contact.displayName}（${contact.department}）`).join("、")
    : "未選択";
}

function participantSummary() {
  return selected.length ? selected.map((contact) => contact.displayName).join("、") : "指定参加者";
}

function updateCandidates(parsed) {
  const selectedCandidates = mockCandidates.slice(0, parsed.count);
  candidateCount.textContent = `${selectedCandidates.length}件`;

  candidateList.innerHTML = selectedCandidates
    .map((candidate) => {
      const tags = candidate.tags.map((tag) => `<span>${tag}</span>`).join("");
      return `
        <article class="candidate-card ${candidate.variant ?? ""}">
          <div class="candidate-top">
            <div>
              <p class="candidate-date">${candidate.date}</p>
              <h3>${candidate.time}</h3>
            </div>
            <span class="score">${candidate.score}</span>
          </div>
          <p>${candidate.reason}</p>
          <div class="tags">${tags}</div>
        </article>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
