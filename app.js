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
const KIND_BADGE = { once: ["badge-once", "Daily"], multi: ["badge-multi", "Flexible"], duration: ["badge-duration", "Timed"] };

function habitBadge(kind) {
  const [cls, label] = KIND_BADGE[kind] || KIND_BADGE.once;
  const badge = document.createElement("span");
  badge.className = "badge " + cls;
  badge.textContent = label;
  return badge;
}

function xpForLog(habit, value) {
  return value * (habit.xp_value || 0);
}

function renderXpSummary(habits, logs) {
  const today = todayStr();
  const habitById = new Map(habits.map((h) => [h.id, h]));
  let todayXp = 0;
  let allTimeXp = 0;
  for (const log of logs) {
    const habit = habitById.get(log.habit_id);
    if (!habit) continue;
    const xp = xpForLog(habit, log.value);
    allTimeXp += xp;
    if (log.for_date === today) todayXp += xp;
  }
  xpSummaryEl.textContent = `⚡ ${todayXp} XP today · ${allTimeXp} XP all-time`;
}

function renderHabitsToday(habits, logs) {
  const active = habits
    .filter((h) => h.active)
    .sort((a, b) => (KIND_RANK[a.kind] ?? 0) - (KIND_RANK[b.kind] ?? 0));
  habitsTodayList.innerHTML = "";
  habitsEmpty.classList.toggle("hidden", active.length > 0);
  renderXpSummary(habits, logs);

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
    } else {
      control.classList.add("duration-control");

      const totalEl = document.createElement("span");
      totalEl.className = "duration-total";
      totalEl.textContent = `${currentValue} min`;

      const resetBtn = document.createElement("button");
      resetBtn.className = "icon-btn";
      resetBtn.textContent = "✕";
      resetBtn.title = "Reset today";
      resetBtn.addEventListener("click", () => setHabitValue(habit.id, 0));

      const totalRow = document.createElement("div");
      totalRow.className = "duration-total-row";
      totalRow.append(totalEl, resetBtn);

      const minutesInput = document.createElement("input");
      minutesInput.type = "number";
      minutesInput.min = "1";
      minutesInput.className = "duration-input";
      minutesInput.placeholder = "min";

      const addBtn = document.createElement("button");
      addBtn.className = "stepper-btn";
      addBtn.textContent = "+";
      addBtn.addEventListener("click", () => {
        const minutes = parseInt(minutesInput.value, 10);
        if (!minutes || minutes <= 0) return;
        setHabitValue(habit.id, currentValue + minutes);
        minutesInput.value = "";
      });

      const entryRow = document.createElement("div");
      entryRow.className = "duration-entry";
      entryRow.append(minutesInput, addBtn);

      control.append(totalRow, entryRow);
    }

    const text = document.createElement("div");
    text.className = "item-text";
    const nameRow = document.createElement("div");
    nameRow.className = "item-title-row";
    const name = document.createElement("span");
    name.className = "item-title";
    name.textContent = habit.name;
    nameRow.append(name, habitBadge(habit.kind));
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
    nameRow.append(name, habitBadge(habit.kind));
    text.appendChild(nameRow);
    const xpLine = document.createElement("div");
    xpLine.className = "item-reason";
    xpLine.textContent =
      habit.kind === "duration" ? `${habit.xp_value} XP / min` : `${habit.xp_value} XP`;
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

const XP_HINTS = {
  once: "XP earned each day you complete it.",
  multi: "XP earned each time you tick it up.",
  duration: "XP earned per minute logged.",
};

function updateXpHint() {
  habitXpHint.textContent = XP_HINTS[habitKindSelect.value] || "";
}
habitKindSelect.addEventListener("change", updateXpHint);
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
  });
  if (error) {
    console.error(error);
    return;
  }
  nameInput.value = "";
  habitXpInput.value = "1";
  loadHabits();
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

  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const visibleHabits = cachedHabits.filter((h) => !hiddenHabitIds.has(h.id));
  const today = todayStr();

  for (let i = 0; i < startOffset; i++) {
    const pad = document.createElement("div");
    pad.className = "calendar-day empty";
    calendarGrid.appendChild(pad);
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
    for (const habit of visibleHabits) {
      const log = cachedLogs.find((l) => l.habit_id === habit.id && l.for_date === dateStr);
      if (log && log.value > 0) {
        const dot = document.createElement("span");
        dot.className = "calendar-dot";
        dot.style.background = colorForHabit(habit.id);
        dot.title = habit.name;
        dots.appendChild(dot);
      }
    }
    cell.appendChild(dots);
    calendarGrid.appendChild(cell);
  }
}

document.getElementById("calendar-prev").addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
});

document.getElementById("calendar-next").addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
});

// ---------- Refresh ----------

function refreshAll() {
  loadIntentions();
  loadHabits();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.error(err));
  });
}
