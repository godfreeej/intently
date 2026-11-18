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

// ---------- Intentions (plan for tomorrow) ----------

const intentionsList = document.getElementById("intentions-list");
const intentionForm = document.getElementById("intention-form");

async function loadIntentions() {
  const { data, error } = await sb
    .from("intentions")
    .select("*")
    .eq("for_date", tomorrowStr())
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  renderIntentions(data || []);
}

function renderIntentions(items) {
  intentionsList.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "list-item" + (item.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.done;
    checkbox.addEventListener("change", () => toggleIntentionDone(item.id, checkbox.checked));

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

    li.append(checkbox, text, deleteBtn);
    intentionsList.appendChild(li);
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
    .select("*")
    .eq("completed", true);
  if (logsErr) {
    console.error(logsErr);
    return;
  }

  renderHabitsToday(habits || [], logs || []);
  renderHabitsManage(habits || []);
}

function computeStreak(habitId, logs) {
  const completedDates = new Set(
    logs.filter((l) => l.habit_id === habitId).map((l) => l.for_date)
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

function renderHabitsToday(habits, logs) {
  const active = habits.filter((h) => h.active);
  habitsTodayList.innerHTML = "";
  habitsEmpty.classList.toggle("hidden", active.length > 0);

  const today = todayStr();
  const doneToday = new Set(
    logs.filter((l) => l.for_date === today).map((l) => l.habit_id)
  );

  for (const habit of active) {
    const li = document.createElement("li");
    li.className = "list-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = doneToday.has(habit.id);
    checkbox.addEventListener("change", () => toggleHabitToday(habit.id, checkbox.checked));

    const text = document.createElement("div");
    text.className = "item-text";
    const name = document.createElement("div");
    name.className = "item-title";
    name.textContent = habit.name;
    const streak = document.createElement("div");
    streak.className = "item-reason";
    const streakCount = computeStreak(habit.id, logs);
    streak.textContent = streakCount > 0 ? `🔥 ${streakCount} day streak` : "No current streak";
    text.append(name, streak);

    li.append(checkbox, text);
    habitsTodayList.appendChild(li);
  }
}

async function toggleHabitToday(habitId, completed) {
  const today = todayStr();
  const { data: userData } = await sb.auth.getUser();
  const { error } = await sb
    .from("habit_logs")
    .upsert(
      { habit_id: habitId, for_date: today, completed, user_id: userData.user.id },
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
    const name = document.createElement("div");
    name.className = "item-title";
    name.textContent = habit.name;
    text.appendChild(name);

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

habitForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("habit-name");
  const { data: userData } = await sb.auth.getUser();
  const { error } = await sb.from("habits").insert({
    user_id: userData.user.id,
    name: nameInput.value.trim(),
  });
  if (error) {
    console.error(error);
    return;
  }
  nameInput.value = "";
  loadHabits();
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
