const API_URL = "https://script.google.com/macros/s/AKfycby7vD3vJzVU0MwjemAAxhgitY2PtYjqZl6b-06RE_cKQdCmCv_kds3D5yPR4GDQwUmepg/exec";
const PLAYER_KEY = "task-tracker-player";
const REQUIRED_API_VERSION = "one-sheet-v3";

const state = {
    players: [],
    player: localStorage.getItem(PLAYER_KEY) || "",
    tasks: [],
    saving: new Set(),
};

const playerChips = document.querySelector("#playerChips");
const tasksNode = document.querySelector("#tasks");
const statusNode = document.querySelector("#status");
const completedCountNode = document.querySelector("#completedCount");
const taskTemplate = document.querySelector("#taskTemplate");

init();

async function init() {

    try {
        setStatus("Загружаем игроков...");
        const data = await apiRequest({ action: "players" });
        state.players = normalizePlayers(data.players || []);

        renderPlayers();

        if (state.players.length === 0) {
            setStatus("В таблице пока нет игроков.");
            return;
        }

        if (!state.players.includes(state.player)) {
            state.player = state.players[0];
        }

        renderPlayers();
        await loadPlayer(state.player);
    } catch (error) {
        showError(error.message);
    }
}

function renderPlayers() {
    playerChips.innerHTML = "";

    if (state.players.length === 0) {
        playerChips.innerHTML = '<button class="player-chip" type="button" disabled>Нет игроков</button>';
        return;
    }

    for (const player of state.players) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "player-chip";
        chip.textContent = player;
        chip.dataset.player = player;
        chip.setAttribute("role", "option");
        chip.setAttribute("aria-selected", String(player === state.player));
        chip.classList.toggle("is-active", player === state.player);
        chip.addEventListener("click", () => selectPlayer(player));
        playerChips.append(chip);
    }
}

function normalizePlayers(players) {
    const cleaned = [...new Set(players.map((player) => String(player || "").trim()).filter(Boolean))];
    return cleaned.filter((player) => !isSheetName(player));
}

function isSheetName(value) {
    return /^sheet\d*$/i.test(String(value).trim()) || /^лист\d*$/i.test(String(value).trim());
}

async function selectPlayer(player) {
    if (state.player === player) return;

    state.player = player;
    localStorage.setItem(PLAYER_KEY, state.player);
    renderPlayers();
    await loadPlayer(state.player);
}

async function loadPlayer(player) {
    try {
        setStatus(`Загружаем задания для ${player}...`);
        tasksNode.innerHTML = "";
        const data = await apiRequest({ action: "state", player });
        state.tasks = data.tasks || [];
        localStorage.setItem(PLAYER_KEY, player);
        renderTasks();
        setStatus(state.tasks.length ? "" : "Для этого игрока пока нет заданий.");
    } catch (error) {
        showError(error.message);
    }
}

function renderTasks() {
    tasksNode.innerHTML = "";

    for (const task of state.tasks) {
        const row = taskTemplate.content.firstElementChild.cloneNode(true);
        const checkbox = row.querySelector("input");
        const number = row.querySelector(".task-number");
        const text = row.querySelector(".task-text");

        row.dataset.taskId = task.id;
        row.classList.toggle("is-done", Boolean(task.done));
        checkbox.checked = Boolean(task.done);
        checkbox.disabled = state.saving.has(task.id);
        number.textContent = `#${task.number || task.id}`;
        text.textContent = task.text;

        checkbox.addEventListener("change", () => toggleTask(task.id, checkbox.checked));
        row.addEventListener("click", (event) => {
            if (event.target === checkbox || event.target.closest(".task-check")) return;
            if (checkbox.disabled) return;

            checkbox.checked = !checkbox.checked;
            toggleTask(task.id, checkbox.checked);
        });
        tasksNode.append(row);
    }

    updateCounter();
}

async function toggleTask(taskId, done) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const previous = task.done;
    task.done = done;
    state.saving.add(taskId);
    renderTasks();

    try {
        await apiRequest({
            action: "saveTask",
            player: state.player,
            taskId,
            done,
        });
        setStatus("");
    } catch (error) {
        task.done = previous;
        showError(error.message);
    } finally {
        state.saving.delete(taskId);
        renderTasks();
    }
}

function updateCounter() {
    completedCountNode.textContent = String(state.tasks.filter((task) => task.done).length);
}

function apiRequest(params) {
    return new Promise((resolve, reject) => {
        const callbackName = `taskTrackerCallback_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}`;
        const script = document.createElement("script");
        const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error("Google Apps Script не ответил вовремя."));
        }, 15000);

        window[callbackName] = (data) => {
            cleanup();

            if (!data || data.ok === false) {
                reject(new Error(data?.error || "Не удалось получить данные из Google Apps Script."));
                return;
            }

            resolve(data);
        };

        script.onerror = () => {
            cleanup();
            reject(new Error("Не удалось подключиться к Google Apps Script."));
        };

        const url = new URL(API_URL);
        for (const [key, value] of Object.entries({ ...params, callback: callbackName })) {
            url.searchParams.set(key, value);
        }

        script.src = url.toString();
        document.body.append(script);

        function cleanup() {
            window.clearTimeout(timeout);
            delete window[callbackName];
            script.remove();
        }
    });
}

function setStatus(message) {
    statusNode.textContent = message;
    statusNode.classList.remove("error");
}

function showError(message) {
    statusNode.textContent = message;
    statusNode.classList.add("error");
}
