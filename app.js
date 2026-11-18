const sb = window.supabase.createClient(
  window.INTENTLY_CONFIG.supabaseUrl,
  window.INTENTLY_CONFIG.supabaseAnonKey
);

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayStr() {
  return toLocalDateString(new Date());
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalDateString(d);
}

function addDaysStr(dateStr, delta) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toLocalDateString(d);
}

// ---------- Auth ----------

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    loginError.textContent = error.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
});

sb.auth.onAuthStateChange((_event, session) => {
  if (session) {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    refreshAll();
  } else {
    appView.classList.add("hidden");
    loginView.classList.remove("hidden");
  }
});

// ---------- Tabs ----------

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ---------- Intentions (today + plan for tomorrow) ----------

const todayIntentionsList = document.getElementById("today-intentions-list");
const todayIntentionsEmpty = document.getElementById("today-intentions-empty");
const intentionsList = document.getElementById("intentions-list");
const intentionForm = document.getElementById("intention-form");

async function loadIntentions() {
  const { data, error } = await sb
    .from("intentions")
    .select("*")
    .in("for_date", [todayStr(), tomorrowStr()])
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  const items = data || [];
  const today = todayStr();
  const tomorrow = tomorrowStr();

  renderIntentionsList(
    todayIntentionsList,
    items.filter((i) => i.for_date === today),
    { showCheckbox: true }
  );
  todayIntentionsEmpty.classList.toggle(
    "hidden",
    items.some((i) => i.for_date === today)
  );

  renderIntentionsList(
    intentionsList,
    items.filter((i) => i.for_date === tomorrow),
    { showCheckbox: false }
  );
}

function renderIntentionsList(container, items, { showCheckbox }) {
  container.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "list-item" + (item.done ? " done" : "");

    if (showCheckbox) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.done;
      checkbox.addEventListener("change", () => toggleIntentionDone(item.id, checkbox.checked));
      li.appendChild(checkbox);
    }

    const text = document.createElement("div");
    text.className = "item-text";
    const activity = document.createElement("div");
    activity.className = "item-title";
    activity.textContent = item.activity;
    const reason = document.createElement("div");
    reason.className = "item-reason";
    reason.textContent = item.reason;
    text.append(activity, reason);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Delete";
    deleteBtn.addEventListener("click", () => deleteIntention(item.id));

    li.append(text, deleteBtn);
    container.appendChild(li);
  }
}

async function toggleIntentionDone(id, done) {
  const { error } = await sb.from("intentions").update({ done }).eq("id", id);
  if (error) console.error(error);
  loadIntentions();
}

async function deleteIntention(id) {
  const { error } = await sb.from("intentions").delete().eq("id", id);
  if (error) console.error(error);
  loadIntentions();
}

intentionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const activityInput = document.getElementById("intention-activity");
  const reasonInput = document.getElementById("intention-reason");
  const { data: userData } = await sb.auth.getUser();
  const { error } = await sb.from("intentions").insert({
    user_id: userData.user.id,
    for_date: tomorrowStr(),
    activity: activityInput.value.trim(),
    reason: reasonInput.value.trim(),
  });
  if (error) {
    console.error(error);
    return;
  }
  activityInput.value = "";
  reasonInput.value = "";
  loadIntentions();
});

// ---------- Habits ----------

const habitsTodayList = document.getElementById("habits-today-list");
const habitsEmpty = document.getElementById("habits-empty");
const habitsManageList = document.getElementById("habits-manage-list");
const habitForm = document.getElementById("habit-form");
const xpSummaryEl = document.getElementById("xp-summary");

let cachedHabits = [];
let cachedLogs = [];
let cachedBounties = [];

async function loadHabits() {
  const { data: habits, error: habitsErr } = await sb
    .from("habits")
    .select("*")
    .order("created_at", { ascending: true });
  if (habitsErr) {
    console.error(habitsErr);
    return;
  }

  const { data: logs, error: logsErr } = await sb
    .from("habit_logs")
    .select("*");
  if (logsErr) {
    console.error(logsErr);
    return;
  }

  cachedHabits = habits || [];
  cachedLogs = logs || [];

  renderHabitsToday(cachedHabits, cachedLogs);
  renderHabitsManage(cachedHabits);
  renderCalendarPicker(cachedHabits);
  renderCalendar();
}

function computeStreak(habitId, logs) {
  const completedDates = new Set(
    logs.filter((l) => l.habit_id === habitId && l.value > 0).map((l) => l.for_date)
  );
  const today = todayStr();
  const yesterday = addDaysStr(today, -1);

  let anchor;
  if (completedDates.has(today)) anchor = today;
  else if (completedDates.has(yesterday)) anchor = yesterday;
  else return 0;

  let streak = 0;
  let cursor = anchor;
  while (completedDates.has(cursor)) {
    streak += 1;
    cursor = addDaysStr(cursor, -1);
  }
  return streak;
}

const KIND_RANK = { once: 0, duration: 1, multi: 2 };
const KIND_BADGE = { once: ["badge-once", "Daily"], multi: ["badge-multi", "Flexible"] };

function habitBadge(habit) {
  if (habit.kind === "duration") {
    const badge = document.createElement("span");
    badge.className = "badge badge-duration";
    badge.textContent = habit.unit || "min";
    return badge;
  }
  const [cls, label] = KIND_BADGE[habit.kind] || KIND_BADGE.once;
  const badge = document.createElement("span");
  badge.className = "badge " + cls;
  badge.textContent = label;
  return badge;
}

function xpForLog(habit, value) {
  return value * (habit.xp_value || 0);
}

function renderXpSummary() {
  const today = todayStr();
  const habitById = new Map(cachedHabits.map((h) => [h.id, h]));
  let todayXp = 0;
  let allTimeXp = 0;
  for (const log of cachedLogs) {
    const habit = habitById.get(log.habit_id);
    if (!habit) continue;
    const xp = xpForLog(habit, log.value);
    allTimeXp += xp;
    if (log.for_date === today) todayXp += xp;
  }
  for (const bounty of cachedBounties) {
    if (!bounty.completed_at) continue;
    allTimeXp += bounty.awarded_xp || 0;
    if (toLocalDateString(new Date(bounty.completed_at)) === today) todayXp += bounty.awarded_xp || 0;
  }
  xpSummaryEl.textContent = `⚡ ${todayXp} XP today · ${allTimeXp} XP all-time`;
}

function renderHabitsToday(habits, logs) {
  const active = habits
    .filter((h) => h.active)
    .sort((a, b) => (KIND_RANK[a.kind] ?? 0) - (KIND_RANK[b.kind] ?? 0));
  habitsTodayList.innerHTML = "";
  habitsEmpty.classList.toggle("hidden", active.length > 0);
  renderXpSummary();

  const today = todayStr();
  const valueToday = new Map(
    logs.filter((l) => l.for_date === today).map((l) => [l.habit_id, l.value])
  );

  for (const habit of active) {
    const li = document.createElement("li");
    li.className = "list-item";
    const currentValue = valueToday.get(habit.id) || 0;

    const control = document.createElement("div");
    control.className = "habit-control";
    if (habit.kind === "once") {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = currentValue > 0;
      checkbox.addEventListener("change", () =>
        setHabitValue(habit.id, checkbox.checked ? 1 : 0)
      );
      control.appendChild(checkbox);
    } else if (habit.kind === "multi") {
      const minusBtn = document.createElement("button");
      minusBtn.className = "stepper-btn";
      minusBtn.textContent = "−";
      minusBtn.disabled = currentValue <= 0;
      minusBtn.addEventListener("click", () => setHabitValue(habit.id, currentValue - 1));

      const countEl = document.createElement("span");
      countEl.className = "stepper-count";
      countEl.textContent = currentValue;

      const plusBtn = document.createElement("button");
      plusBtn.className = "stepper-btn";
      plusBtn.textContent = "+";
      plusBtn.addEventListener("click", () => setHabitValue(habit.id, currentValue + 1));

      control.append(minusBtn, countEl, plusBtn);
    } else if (habit.kind === "duration" && habit.tracks_books) {
      const unit = habit.unit || "min";
      control.classList.add("duration-control", "book-control");

      const totalEl = document.createElement("span");
      totalEl.className = "duration-total";
      totalEl.textContent = `${currentValue} ${unit}`;

      const resetBtn = document.createElement("button");
      resetBtn.className = "icon-btn";
      resetBtn.textContent = "✕";
      resetBtn.title = "Reset today";
      resetBtn.addEventListener("click", () => setHabitValue(habit.id, 0));

      const totalRow = document.createElement("div");
      totalRow.className = "duration-total-row";
      totalRow.append(totalEl, resetBtn);

      const bookSelect = document.createElement("select");
      bookSelect.className = "book-select";
      if (cachedBooks.length === 0) {
        const opt = document.createElement("option");
        opt.textContent = "Add a book first";
        opt.disabled = true;
        bookSelect.appendChild(opt);
        bookSelect.disabled = true;
      } else {
        for (const book of cachedBooks) {
          const opt = document.createElement("option");
          opt.value = book.id;
          opt.textContent = book.title;
          bookSelect.appendChild(opt);
        }
      }

      const amountInput = document.createElement("input");
      amountInput.type = "number";
      amountInput.min = "0.1";
      amountInput.step = "any";
      amountInput.className = "duration-input";
      amountInput.placeholder = unit;

      const addBtn = document.createElement("button");
      addBtn.className = "stepper-btn";
      addBtn.textContent = "+";
      addBtn.disabled = cachedBooks.length === 0;
      addBtn.addEventListener("click", () => {
        const amount = amountInput.value ? parseFloat(amountInput.value) : 1;
        if (!amount || amount <= 0) return;
        logReadingSession(habit.id, bookSelect.value, amount, currentValue);
        amountInput.value = "";
      });

      const entryRow = document.createElement("div");
      entryRow.className = "duration-entry";
      entryRow.append(amountInput, addBtn);

      control.append(totalRow, bookSelect, entryRow);
    } else {
      const unit = habit.unit || "min";
      control.classList.add("duration-control");

      const totalEl = document.createElement("span");
      totalEl.className = "duration-total";
      totalEl.textContent = `${currentValue} ${unit}`;

      const resetBtn = document.createElement("button");
      resetBtn.className = "icon-btn";
      resetBtn.textContent = "✕";
      resetBtn.title = "Reset today";
      resetBtn.addEventListener("click", () => setHabitValue(habit.id, 0));

      const totalRow = document.createElement("div");
      totalRow.className = "duration-total-row";
      totalRow.append(totalEl, resetBtn);

      const amountInput = document.createElement("input");
      amountInput.type = "number";
      amountInput.min = "0.1";
      amountInput.step = "any";
      amountInput.className = "duration-input";
      amountInput.placeholder = unit;

      const addBtn = document.createElement("button");
      addBtn.className = "stepper-btn";
      addBtn.textContent = "+";
      addBtn.addEventListener("click", () => {
        const amount = amountInput.value ? parseFloat(amountInput.value) : 1;
        if (!amount || amount <= 0) return;
        setHabitValue(habit.id, currentValue + amount);
        amountInput.value = "";
      });

      const entryRow = document.createElement("div");
      entryRow.className = "duration-entry";
      entryRow.append(amountInput, addBtn);

      control.append(totalRow, entryRow);
    }

    const text = document.createElement("div");
    text.className = "item-text";
    const nameRow = document.createElement("div");
    nameRow.className = "item-title-row";
    const name = document.createElement("span");
    name.className = "item-title";
    name.textContent = habit.name;
    nameRow.append(name, habitBadge(habit));
    const streak = document.createElement("div");
    streak.className = "item-reason";
    const streakCount = computeStreak(habit.id, logs);
    streak.textContent = streakCount > 0 ? `🔥 ${streakCount} day streak` : "No current streak";
    text.append(nameRow, streak);

    li.append(control, text);
    habitsTodayList.appendChild(li);
  }
}

async function setHabitValue(habitId, value) {
  const safeValue = Math.max(0, value);
  const today = todayStr();
  const { data: userData } = await sb.auth.getUser();
  const { error } = await sb
    .from("habit_logs")
    .upsert(
      { habit_id: habitId, for_date: today, value: safeValue, user_id: userData.user.id },
      { onConflict: "habit_id,for_date" }
    );
  if (error) console.error(error);
  loadHabits();
}

function renderHabitsManage(habits) {
  habitsManageList.innerHTML = "";
  for (const habit of habits) {
    const li = document.createElement("li");
    li.className = "list-item" + (habit.active ? "" : " inactive");

    const text = document.createElement("div");
    text.className = "item-text";
    const nameRow = document.createElement("div");
    nameRow.className = "item-title-row";
    const name = document.createElement("span");
    name.className = "item-title";
    name.textContent = habit.name;
    nameRow.append(name, habitBadge(habit));
    if (habit.tracks_books) {
      const bookBadge = document.createElement("span");
      bookBadge.className = "badge badge-book-reading";
      bookBadge.textContent = "Books";
      nameRow.appendChild(bookBadge);
    }
    text.appendChild(nameRow);
    const xpLine = document.createElement("div");
    xpLine.className = "item-reason";
    xpLine.textContent =
      habit.kind === "duration"
        ? `${habit.xp_value} XP / ${habit.unit || "min"}`
        : `${habit.xp_value} XP`;
    text.appendChild(xpLine);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "link-btn";
    toggleBtn.textContent = habit.active ? "Deactivate" : "Reactivate";
    toggleBtn.addEventListener("click", () => setHabitActive(habit.id, !habit.active));

    li.append(text, toggleBtn);
    habitsManageList.appendChild(li);
  }
}

async function setHabitActive(id, active) {
  const { error } = await sb.from("habits").update({ active }).eq("id", id);
  if (error) console.error(error);
  loadHabits();
}

const habitKindSelect = document.getElementById("habit-kind");
const habitXpInput = document.getElementById("habit-xp");
const habitXpHint = document.getElementById("habit-xp-hint");
const habitTracksBooksRow = document.getElementById("habit-tracks-books-row");
const habitTracksBooksCheckbox = document.getElementById("habit-tracks-books");
const habitUnitRow = document.getElementById("habit-unit-row");
const habitUnitInput = document.getElementById("habit-unit");

function updateXpHint() {
  const isDuration = habitKindSelect.value === "duration";
  if (habitKindSelect.value === "once") {
    habitXpHint.textContent = "XP earned each day you complete it.";
  } else if (habitKindSelect.value === "multi") {
    habitXpHint.textContent = "XP earned each time you tick it up.";
  } else {
    const unit = habitUnitInput.value.trim() || "unit";
    habitXpHint.textContent = `XP earned per ${unit} logged.`;
  }
  habitUnitRow.classList.toggle("hidden", !isDuration);
  habitTracksBooksRow.classList.toggle("hidden", !isDuration);
  if (!isDuration) habitTracksBooksCheckbox.checked = false;
}
habitKindSelect.addEventListener("change", updateXpHint);
habitUnitInput.addEventListener("input", updateXpHint);
updateXpHint();

habitForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("habit-name");
  const { data: userData } = await sb.auth.getUser();
  const { error } = await sb.from("habits").insert({
    user_id: userData.user.id,
    name: nameInput.value.trim(),
    kind: habitKindSelect.value,
    xp_value: parseInt(habitXpInput.value, 10) || 0,
    unit: habitUnitInput.value.trim() || "min",
    tracks_books: habitKindSelect.value === "duration" && habitTracksBooksCheckbox.checked,
  });
  if (error) {
    console.error(error);
    return;
  }
  nameInput.value = "";
  habitXpInput.value = "1";
  habitUnitInput.value = "min";
  habitTracksBooksCheckbox.checked = false;
  loadHabits();
});

// ---------- Bounties ----------

const bountiesActiveList = document.getElementById("bounties-active-list");
const bountiesEmpty = document.getElementById("bounties-empty");
const bountiesCompletedList = document.getElementById("bounties-completed-list");
const bountiesCompletedEmpty = document.getElementById("bounties-completed-empty");
const bountyXpSummaryEl = document.getElementById("bounty-xp-summary");
const bountyForm = document.getElementById("bounty-form");
const todayBountiesList = document.getElementById("today-bounties-list");
const todayBountiesEmpty = document.getElementById("today-bounties-empty");

function bountyMultiplier(bounty, atMs = Date.now()) {
  const createdMs = new Date(bounty.created_at).getTime();
  const decayMs = bounty.decay_days * 24 * 60 * 60 * 1000;
  const start = bounty.multiplier_start;
  if (decayMs <= 0) return 1;
  const t = Math.min(Math.max((atMs - createdMs) / decayMs, 0), 1);
  return start - (start - 1) * t;
}

function bountyCurrentXp(bounty) {
  return Math.round(bounty.base_xp * bountyMultiplier(bounty));
}

async function loadBounties() {
  const { data, error } = await sb
    .from("bounties")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  cachedBounties = data || [];
  renderBounties();
  renderXpSummary();
}

function renderActiveBountyList(container, emptyEl, pending) {
  container.innerHTML = "";
  emptyEl.classList.toggle("hidden", pending.length > 0);

  for (const bounty of pending) {
    const li = document.createElement("li");
    li.className = "list-item";

    const completeBtn = document.createElement("button");
    completeBtn.className = "stepper-btn";
    completeBtn.textContent = "✓";
    completeBtn.title = "Complete";
    completeBtn.addEventListener("click", () => completeBounty(bounty.id));

    const text = document.createElement("div");
    text.className = "item-text";
    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = bounty.title;

    const currentXp = bountyCurrentXp(bounty);
    const multiplier = bountyMultiplier(bounty);
    const atFloor = multiplier <= 1.001;
    const floorAt = new Date(new Date(bounty.created_at).getTime() + bounty.decay_days * 86400000);

    const detail = document.createElement("div");
    detail.className = "item-reason";
    detail.textContent = atFloor
      ? `${currentXp} XP (at floor value)`
      : `${currentXp} XP now (${multiplier.toFixed(1)}×) · floors ${floorAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

    text.append(title, detail);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Abandon";
    deleteBtn.addEventListener("click", () => deleteBounty(bounty.id));

    li.append(completeBtn, text, deleteBtn);
    container.appendChild(li);
  }
}

function renderBounties() {
  const pending = cachedBounties.filter((b) => !b.completed_at);
  const completed = cachedBounties.filter((b) => b.completed_at);

  pending.sort((a, b) => bountyCurrentXp(b) - bountyCurrentXp(a));
  completed.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

  renderActiveBountyList(bountiesActiveList, bountiesEmpty, pending);
  renderActiveBountyList(todayBountiesList, todayBountiesEmpty, pending);

  bountiesCompletedList.innerHTML = "";
  bountiesCompletedEmpty.classList.toggle("hidden", completed.length > 0);

  for (const bounty of completed) {
    const li = document.createElement("li");
    li.className = "list-item done";

    const text = document.createElement("div");
    text.className = "item-text";
    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = bounty.title;
    const detail = document.createElement("div");
    detail.className = "item-reason";
    detail.textContent = `${bounty.awarded_xp} XP · ${new Date(bounty.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    text.append(title, detail);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Remove";
    deleteBtn.addEventListener("click", () => deleteBounty(bounty.id));

    li.append(text, deleteBtn);
    bountiesCompletedList.appendChild(li);
  }

  renderBountyXpSummary();
}

function renderBountyXpSummary() {
  const today = todayStr();
  let todayXp = 0;
  let allTimeXp = 0;
  for (const bounty of cachedBounties) {
    if (!bounty.completed_at) continue;
    allTimeXp += bounty.awarded_xp || 0;
    if (toLocalDateString(new Date(bounty.completed_at)) === today) todayXp += bounty.awarded_xp || 0;
  }
  bountyXpSummaryEl.textContent = `⚡ ${todayXp} XP today · ${allTimeXp} XP all-time`;
}

async function completeBounty(id) {
  const bounty = cachedBounties.find((b) => b.id === id);
  if (!bounty) return;
  const awarded = bountyCurrentXp(bounty);
  const { error } = await sb
    .from("bounties")
    .update({ completed_at: new Date().toISOString(), awarded_xp: awarded })
    .eq("id", id);
  if (error) console.error(error);
  loadBounties();
}

async function deleteBounty(id) {
  const { error } = await sb.from("bounties").delete().eq("id", id);
  if (error) console.error(error);
  loadBounties();
}

bountyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const titleInput = document.getElementById("bounty-title");
  const baseXpInput = document.getElementById("bounty-base-xp");
  const multiplierInput = document.getElementById("bounty-multiplier");
  const decayDaysInput = document.getElementById("bounty-decay-days");
  const { data: userData } = await sb.auth.getUser();
  const { error } = await sb.from("bounties").insert({
    user_id: userData.user.id,
    title: titleInput.value.trim(),
    base_xp: parseInt(baseXpInput.value, 10) || 0,
    multiplier_start: parseFloat(multiplierInput.value) || 1,
    decay_days: parseFloat(decayDaysInput.value) || 1,
  });
  if (error) {
    console.error(error);
    return;
  }
  titleInput.value = "";
  baseXpInput.value = "10";
  multiplierInput.value = "3";
  decayDaysInput.value = "7";
  loadBounties();
});

// ---------- Calendar ----------

const CALENDAR_COLORS = [
  "#2f6b5e", "#b2552f", "#4a6fb5", "#9a4fb5", "#b5924f", "#4fb5a0", "#b54f6e", "#5f8f3e",
];

const calendarHabitPicker = document.getElementById("calendar-habit-picker");
const calendarGrid = document.getElementById("calendar-grid");
const calendarMonthLabel = document.getElementById("calendar-month-label");

let calendarMonth = new Date();
calendarMonth.setDate(1);

function loadHiddenHabitIds() {
  try {
    const raw = localStorage.getItem("intently_hidden_habit_ids");
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveHiddenHabitIds() {
  try {
    localStorage.setItem("intently_hidden_habit_ids", JSON.stringify([...hiddenHabitIds]));
  } catch {
    // ignore storage failures (private browsing, etc.)
  }
}

let hiddenHabitIds = loadHiddenHabitIds();

function colorForHabit(habitId) {
  const index = cachedHabits.findIndex((h) => h.id === habitId);
  return CALENDAR_COLORS[Math.max(0, index) % CALENDAR_COLORS.length];
}

function renderCalendarPicker(habits) {
  calendarHabitPicker.innerHTML = "";
  for (const habit of habits) {
    const li = document.createElement("li");
    li.className = "habit-picker-item" + (habit.active ? "" : " inactive");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !hiddenHabitIds.has(habit.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) hiddenHabitIds.delete(habit.id);
      else hiddenHabitIds.add(habit.id);
      saveHiddenHabitIds();
      renderCalendar();
    });

    const swatch = document.createElement("span");
    swatch.className = "color-swatch";
    swatch.style.background = colorForHabit(habit.id);

    const name = document.createElement("span");
    name.textContent = habit.name;

    li.append(checkbox, swatch, name);
    calendarHabitPicker.appendChild(li);
  }
}

document.getElementById("calendar-select-all").addEventListener("click", () => {
  hiddenHabitIds.clear();
  saveHiddenHabitIds();
  renderCalendarPicker(cachedHabits);
  renderCalendar();
});

document.getElementById("calendar-select-none").addEventListener("click", () => {
  for (const habit of cachedHabits) hiddenHabitIds.add(habit.id);
  saveHiddenHabitIds();
  renderCalendarPicker(cachedHabits);
  renderCalendar();
});

let calendarMonthDates = [];

function buildCalendarDayCell(dateStr, today) {
  const day = Number(dateStr.slice(8, 10));
  const cell = document.createElement("div");
  cell.className = "calendar-day" + (dateStr === today ? " calendar-today" : "");
  cell.addEventListener("click", () => showCalendarDetail([dateStr], formatDayLabel(dateStr)));

  const num = document.createElement("div");
  num.className = "calendar-day-num";
  num.textContent = day;
  cell.appendChild(num);

  const dots = document.createElement("div");
  dots.className = "calendar-dots";
  const visibleHabits = cachedHabits.filter((h) => !hiddenHabitIds.has(h.id));
  for (const habit of visibleHabits) {
    const log = cachedLogs.find((l) => l.habit_id === habit.id && l.for_date === dateStr);
    if (log && log.value > 0) {
      const dot = document.createElement("span");
      dot.className = "calendar-dot";
      dot.style.background = colorForHabit(habit.id);
      dot.title =
        habit.kind === "duration" ? `${habit.name}: ${log.value} ${habit.unit || "min"}` : habit.name;
      dots.appendChild(dot);
    }
  }
  cell.appendChild(dots);
  return cell;
}

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  calendarMonthLabel.textContent = calendarMonth.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  calendarGrid.innerHTML = "";
  for (const wd of ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]) {
    const el = document.createElement("div");
    el.className = "calendar-weekday";
    el.textContent = wd;
    calendarGrid.appendChild(el);
  }
  calendarGrid.appendChild(document.createElement("div")).className = "calendar-weekday";

  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  calendarMonthDates = cells.filter((d) => d !== null);

  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    for (const dateStr of week) {
      if (dateStr === null) {
        const pad = document.createElement("div");
        pad.className = "calendar-day empty";
        calendarGrid.appendChild(pad);
      } else {
        calendarGrid.appendChild(buildCalendarDayCell(dateStr, today));
      }
    }
    const weekDates = week.filter((d) => d !== null);
    const weekBtn = document.createElement("button");
    weekBtn.className = "icon-btn calendar-week-btn";
    weekBtn.textContent = "Σ";
    weekBtn.title = "Week summary";
    weekBtn.addEventListener("click", () =>
      showCalendarDetail(weekDates, formatWeekLabel(weekDates))
    );
    calendarGrid.appendChild(weekBtn);
  }

  const detailEl = document.getElementById("calendar-detail");
  if (!detailEl.classList.contains("hidden") && detailEl.dataset.dates) {
    const dates = JSON.parse(detailEl.dataset.dates);
    showCalendarDetail(dates, detailEl.dataset.label);
  }
}

function formatDayLabel(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatWeekLabel(weekDates) {
  if (weekDates.length === 0) return "Week";
  const fmt = (d) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `Week of ${fmt(weekDates[0])} – ${fmt(weekDates[weekDates.length - 1])}`;
}

function showCalendarDetail(dateStrs, label) {
  const detailEl = document.getElementById("calendar-detail");
  detailEl.dataset.dates = JSON.stringify(dateStrs);
  detailEl.dataset.label = label;

  const visibleHabits = cachedHabits.filter((h) => !hiddenHabitIds.has(h.id));
  const rows = [];
  for (const habit of visibleHabits) {
    let total = 0;
    let daysActive = 0;
    for (const dateStr of dateStrs) {
      const log = cachedLogs.find((l) => l.habit_id === habit.id && l.for_date === dateStr);
      if (log && log.value > 0) {
        total += Number(log.value);
        daysActive += 1;
      }
    }
    if (daysActive === 0) continue;

    let text;
    if (habit.kind === "duration") {
      text = `${total} ${habit.unit || "min"}`;
    } else if (habit.kind === "multi") {
      text = `${total} total`;
    } else {
      text = "done";
    }
    if (dateStrs.length > 1) text += ` · ${daysActive}/${dateStrs.length} days active`;

    rows.push({ habit, text });
  }

  detailEl.innerHTML = "";

  const header = document.createElement("div");
  header.className = "calendar-detail-header";
  const title = document.createElement("strong");
  title.textContent = label;
  const closeBtn = document.createElement("button");
  closeBtn.className = "icon-btn";
  closeBtn.textContent = "✕";
  closeBtn.title = "Close";
  closeBtn.addEventListener("click", () => {
    detailEl.classList.add("hidden");
    delete detailEl.dataset.dates;
    delete detailEl.dataset.label;
  });
  header.append(title, closeBtn);
  detailEl.appendChild(header);

  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Nothing logged.";
    detailEl.appendChild(empty);
  } else {
    const list = document.createElement("ul");
    list.className = "list";
    for (const { habit, text } of rows) {
      const li = document.createElement("li");
      li.className = "list-item";
      const swatch = document.createElement("span");
      swatch.className = "color-swatch";
      swatch.style.background = colorForHabit(habit.id);
      const t = document.createElement("div");
      t.className = "item-text";
      const name = document.createElement("div");
      name.className = "item-title";
      name.textContent = habit.name;
      const detail = document.createElement("div");
      detail.className = "item-reason";
      detail.textContent = text;
      t.append(name, detail);
      li.append(swatch, t);
      list.appendChild(li);
    }
    detailEl.appendChild(list);
  }

  detailEl.classList.remove("hidden");
}

document.getElementById("calendar-prev").addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
});

document.getElementById("calendar-next").addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
});

document.getElementById("calendar-month-summary-btn").addEventListener("click", () => {
  showCalendarDetail(
    calendarMonthDates,
    calendarMonth.toLocaleString(undefined, { month: "long", year: "numeric" })
  );
});

// ---------- Reading (books + reading sessions) ----------

const booksListEl = document.getElementById("books-list");
const booksEmptyEl = document.getElementById("books-empty");
const bookForm = document.getElementById("book-form");

const readingCalendarPicker = document.getElementById("reading-calendar-picker");
const readingCalendarGrid = document.getElementById("reading-calendar-grid");
const readingCalendarMonthLabel = document.getElementById("reading-calendar-month-label");

let cachedBooks = [];
let cachedReadingSessions = [];
let readingCalendarMonth = new Date();
readingCalendarMonth.setDate(1);

const BOOK_STATUS_LABELS = { to_read: "To read", reading: "Reading", finished: "Finished" };
const NEXT_STATUS = { to_read: "reading", reading: "finished", finished: "to_read" };

async function loadBooks() {
  const { data, error } = await sb
    .from("books")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  cachedBooks = data || [];
  renderBooksList();
  renderReadingCalendarPicker();
  renderReadingCalendar();
  renderHabitsToday(cachedHabits, cachedLogs);
}

async function loadReadingSessions() {
  const { data, error } = await sb.from("reading_sessions").select("*");
  if (error) {
    console.error(error);
    return;
  }
  cachedReadingSessions = data || [];
  renderReadingCalendar();
}

function renderBooksList() {
  booksListEl.innerHTML = "";
  booksEmptyEl.classList.toggle("hidden", cachedBooks.length > 0);

  for (const book of cachedBooks) {
    const li = document.createElement("li");
    li.className = "list-item" + (book.status === "finished" ? " done" : "");

    const text = document.createElement("div");
    text.className = "item-text";
    const nameRow = document.createElement("div");
    nameRow.className = "item-title-row";
    const title = document.createElement("span");
    title.className = "item-title";
    title.textContent = book.title;
    const badge = document.createElement("span");
    badge.className = "badge badge-book-" + book.status;
    badge.textContent = BOOK_STATUS_LABELS[book.status];
    nameRow.append(title, badge);
    text.appendChild(nameRow);
    if (book.author) {
      const author = document.createElement("div");
      author.className = "item-reason";
      author.textContent = book.author;
      text.appendChild(author);
    }

    const statusBtn = document.createElement("button");
    statusBtn.className = "link-btn";
    statusBtn.textContent = `Mark ${BOOK_STATUS_LABELS[NEXT_STATUS[book.status]].toLowerCase()}`;
    statusBtn.addEventListener("click", () => setBookStatus(book.id, NEXT_STATUS[book.status]));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Delete";
    deleteBtn.addEventListener("click", () => deleteBook(book.id));

    li.append(text, statusBtn, deleteBtn);
    booksListEl.appendChild(li);
  }
}

async function setBookStatus(id, status) {
  const { error } = await sb.from("books").update({ status }).eq("id", id);
  if (error) console.error(error);
  loadBooks();
}

async function deleteBook(id) {
  const { error } = await sb.from("books").delete().eq("id", id);
  if (error) console.error(error);
  loadBooks();
}

bookForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const titleInput = document.getElementById("book-title");
  const authorInput = document.getElementById("book-author");
  const statusInput = document.getElementById("book-status");
  const { data: userData } = await sb.auth.getUser();
  const { error } = await sb.from("books").insert({
    user_id: userData.user.id,
    title: titleInput.value.trim(),
    author: authorInput.value.trim() || null,
    status: statusInput.value,
  });
  if (error) {
    console.error(error);
    return;
  }
  titleInput.value = "";
  authorInput.value = "";
  statusInput.value = "to_read";
  loadBooks();
});

async function logReadingSession(habitId, bookId, minutes, currentValue) {
  const today = todayStr();
  const { data: userData } = await sb.auth.getUser();
  const { error: sessionErr } = await sb.from("reading_sessions").insert({
    user_id: userData.user.id,
    habit_id: habitId,
    book_id: bookId,
    for_date: today,
    minutes,
  });
  if (sessionErr) {
    console.error(sessionErr);
    return;
  }
  await setHabitValue(habitId, currentValue + minutes);
  loadReadingSessions();
}

function loadHiddenBookIds() {
  try {
    const raw = localStorage.getItem("intently_hidden_book_ids");
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveHiddenBookIds() {
  try {
    localStorage.setItem("intently_hidden_book_ids", JSON.stringify([...hiddenBookIds]));
  } catch {
    // ignore storage failures (private browsing, etc.)
  }
}

let hiddenBookIds = loadHiddenBookIds();

function colorForBook(bookId) {
  const index = cachedBooks.findIndex((b) => b.id === bookId);
  return CALENDAR_COLORS[Math.max(0, index) % CALENDAR_COLORS.length];
}

function renderReadingCalendarPicker() {
  readingCalendarPicker.innerHTML = "";
  for (const book of cachedBooks) {
    const li = document.createElement("li");
    li.className = "habit-picker-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !hiddenBookIds.has(book.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) hiddenBookIds.delete(book.id);
      else hiddenBookIds.add(book.id);
      saveHiddenBookIds();
      renderReadingCalendar();
    });

    const swatch = document.createElement("span");
    swatch.className = "color-swatch";
    swatch.style.background = colorForBook(book.id);

    const name = document.createElement("span");
    name.textContent = book.title;

    li.append(checkbox, swatch, name);
    readingCalendarPicker.appendChild(li);
  }
}

document.getElementById("reading-calendar-select-all").addEventListener("click", () => {
  hiddenBookIds.clear();
  saveHiddenBookIds();
  renderReadingCalendarPicker();
  renderReadingCalendar();
});

document.getElementById("reading-calendar-select-none").addEventListener("click", () => {
  for (const book of cachedBooks) hiddenBookIds.add(book.id);
  saveHiddenBookIds();
  renderReadingCalendarPicker();
  renderReadingCalendar();
});

function renderReadingCalendar() {
  const year = readingCalendarMonth.getFullYear();
  const month = readingCalendarMonth.getMonth();
  readingCalendarMonthLabel.textContent = readingCalendarMonth.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  readingCalendarGrid.innerHTML = "";
  for (const wd of ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]) {
    const el = document.createElement("div");
    el.className = "calendar-weekday";
    el.textContent = wd;
    readingCalendarGrid.appendChild(el);
  }

  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const visibleBooks = cachedBooks.filter((b) => !hiddenBookIds.has(b.id));
  const today = todayStr();

  for (let i = 0; i < startOffset; i++) {
    const pad = document.createElement("div");
    pad.className = "calendar-day empty";
    readingCalendarGrid.appendChild(pad);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const cell = document.createElement("div");
    cell.className = "calendar-day" + (dateStr === today ? " calendar-today" : "");

    const num = document.createElement("div");
    num.className = "calendar-day-num";
    num.textContent = day;
    cell.appendChild(num);

    const dots = document.createElement("div");
    dots.className = "calendar-dots";
    for (const book of visibleBooks) {
      const hasSession = cachedReadingSessions.some(
        (s) => s.book_id === book.id && s.for_date === dateStr
      );
      if (hasSession) {
        const dot = document.createElement("span");
        dot.className = "calendar-dot";
        dot.style.background = colorForBook(book.id);
        dot.title = book.title;
        dots.appendChild(dot);
      }
    }
    cell.appendChild(dots);
    readingCalendarGrid.appendChild(cell);
  }
}

document.getElementById("reading-calendar-prev").addEventListener("click", () => {
  readingCalendarMonth.setMonth(readingCalendarMonth.getMonth() - 1);
  renderReadingCalendar();
});

document.getElementById("reading-calendar-next").addEventListener("click", () => {
  readingCalendarMonth.setMonth(readingCalendarMonth.getMonth() + 1);
  renderReadingCalendar();
});

// ---------- Refresh ----------

function refreshAll() {
  loadIntentions();
  loadHabits();
  loadBounties();
  loadBooks();
  loadReadingSessions();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.error(err));
  });
}
