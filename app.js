const TYPES = {
  protege: "Protege",
  entradas: "Entradas",
  saidas: "Sa\u00eddas",
};

const RASPA_PRODUCTS = [
  { id: "trevo", name: "Trevo", price: 2.5 },
  { id: "roda", name: "Roda", price: 5 },
  { id: "soOuro", name: "S\u00f3 Ouro", price: 2.5 },
  { id: "cacaTesouro", name: "Ca\u00e7a ao Tesouro", price: 10 },
  { id: "vip", name: "VIP", price: 20 },
];

const FECHAMENTO_STORAGE_KEY = "fechamento-app-v2";
const RASPA_STORAGE_KEY = "raspadinha-dia-v1";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const state = {
  activeView: "fechamento",
  activeType: "protege",
  today: todayLocal(),
  entries: loadArray(FECHAMENTO_STORAGE_KEY),
  editingId: null,
  raspa: loadRaspa(),
};

const amountInput = document.querySelector("#amountInput");
const noteInput = document.querySelector("#noteInput");
const form = document.querySelector("#entryForm");
const submitButton = document.querySelector("#submitButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const toast = document.querySelector("#toast");
const raspaProducts = document.querySelector("#raspaProducts");
const raspaRedeemInput = document.querySelector("#raspaRedeemInput");

purgeOldEntries();
render();

document.querySelectorAll(".switch-button").forEach((button) => {
  button.addEventListener("click", () => {
    refreshDayIfNeeded();
    state.activeView = button.dataset.view;
    render();
  });
});

document.querySelectorAll(".category-tab").forEach((button) => {
  button.addEventListener("click", () => {
    refreshDayIfNeeded();
    state.activeType = button.dataset.type;
    renderFechamento();
    focusAmountInput();
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  refreshDayIfNeeded();
  const amount = parseAmount(amountInput.value);

  if (!amount || amount <= 0) {
    showToast("Digite um valor v\u00e1lido.");
    amountInput.focus();
    return;
  }

  const note = noteInput.value.trim();
  const wasEditing = Boolean(state.editingId);

  if (wasEditing) {
    state.entries = state.entries.map((entry) =>
      entry.id === state.editingId
        ? { ...entry, type: state.activeType, amount, note, updatedAt: new Date().toISOString() }
        : entry,
    );
  } else {
    state.entries.unshift({
      id: crypto.randomUUID(),
      type: state.activeType,
      amount,
      note,
      date: state.today,
      createdAt: new Date().toISOString(),
    });
  }

  saveFechamento();
  resetForm();
  renderFechamento();
  showToast(wasEditing ? "Lan\u00e7amento atualizado." : "Lan\u00e7amento feito.");
  focusAmountInput();
});

document.querySelector("#historyList").addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete]");
  const editButton = event.target.closest("[data-edit]");
  if (!deleteButton && !editButton) return;
  refreshDayIfNeeded();

  if (editButton) {
    startEdit(editButton.dataset.edit);
    return;
  }

  const ok = confirm("Apagar este lan\u00e7amento?");
  if (!ok) return;

  if (state.editingId === deleteButton.dataset.delete) resetForm();
  state.entries = state.entries.filter((entry) => entry.id !== deleteButton.dataset.delete);
  saveFechamento();
  renderFechamento();
  showToast("Lan\u00e7amento apagado.");
});

cancelEditButton.addEventListener("click", () => {
  resetForm();
  renderFechamento();
  focusAmountInput();
});

document.querySelector("#clearDayButton").addEventListener("click", () => {
  refreshDayIfNeeded();
  const entries = entriesForActiveTab();
  if (!entries.length) {
    showToast("Esta aba j\u00e1 est\u00e1 vazia.");
    return;
  }

  const ok = confirm(`Limpar ${entries.length} lan\u00e7amento(s) de ${TYPES[state.activeType]} de hoje?`);
  if (!ok) return;

  const ids = new Set(entries.map((entry) => entry.id));
  if (state.editingId && ids.has(state.editingId)) resetForm();
  state.entries = state.entries.filter((entry) => !ids.has(entry.id));
  saveFechamento();
  renderFechamento();
  showToast("Aba limpa.");
});

amountInput.addEventListener("blur", () => {
  const value = parseAmount(amountInput.value);
  amountInput.value = value ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
});

amountInput.addEventListener("input", () => {
  amountInput.value = amountInput.value.replace(/\./g, ",");
});

amountInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;

  event.preventDefault();
  form.requestSubmit();
});

raspaProducts.addEventListener("input", (event) => {
  const input = event.target.closest("[data-raspa-field]");
  if (!input) return;
  refreshDayIfNeeded();

  input.value = onlyDigits(input.value);
  const product = input.dataset.product;
  const field = input.dataset.raspaField;
  state.raspa.products[product][field] = Number(input.value || 0);
  saveRaspa();
  updateRaspaTotals();
});

raspaProducts.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const input = event.target.closest("[data-raspa-field]");
  if (!input) return;

  event.preventDefault();
  focusNextRaspaInput(input);
});

raspaRedeemInput.addEventListener("input", () => {
  refreshDayIfNeeded();
  raspaRedeemInput.value = raspaRedeemInput.value.replace(/\./g, ",");
  state.raspa.redeem = parseAmount(raspaRedeemInput.value);
  saveRaspa();
  updateRaspaTotals();
});

raspaRedeemInput.addEventListener("blur", () => {
  raspaRedeemInput.value = state.raspa.redeem
    ? state.raspa.redeem.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
    : "";
});

raspaRedeemInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;

  event.preventDefault();
  focusRaspaCashCard();
});

document.querySelector("#clearRaspaButton").addEventListener("click", () => {
  refreshDayIfNeeded();
  const ok = confirm("Limpar a raspadinha de hoje?");
  if (!ok) return;

  state.raspa = createEmptyRaspa(state.today);
  saveRaspa();
  renderRaspadinha();
  showToast("Raspadinha limpa.");
});

window.addEventListener("focus", () => {
  if (refreshDayIfNeeded()) render();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && refreshDayIfNeeded()) render();
});

function render() {
  renderViewSwitch();
  renderFechamento();
  renderRaspadinha();
}

function renderViewSwitch() {
  document.querySelectorAll(".switch-button").forEach((button) => {
    const isActive = button.dataset.view === state.activeView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  document.querySelectorAll(".app-view").forEach((view) => {
    const isActive = view.id === `${state.activeView}View`;
    view.classList.toggle("is-active", isActive);
    view.hidden = !isActive;
  });
}

function renderFechamento() {
  const totals = totalsForSelectedDate();
  const counts = countsForSelectedDate();
  submitButton.textContent = state.editingId ? "Atualizar" : "Lan\u00e7ar";
  cancelEditButton.hidden = !state.editingId;

  document.querySelectorAll(".category-tab").forEach((button) => {
    const type = button.dataset.type;
    const isActive = type === state.activeType;
    button.classList.toggle("is-active", isActive);
    button.innerHTML = `
      <span class="tab-label">${TYPES[type]}</span>
      <span class="tab-meta">${counts[type]} - ${currency.format(totals[type])}</span>
    `;
    button.setAttribute("aria-pressed", String(isActive));
  });

  const activeLabel = TYPES[state.activeType];
  document.querySelector("#amountLabel").textContent = `Valor em ${activeLabel}`;
  document.querySelector("#historyTitle").textContent = `${activeLabel} de hoje`;

  const finalTotal = totals.entradas + totals.protege - totals.saidas;
  document.querySelector("#finalTotal").textContent = currency.format(finalTotal);

  const list = document.querySelector("#historyList");
  const entries = entriesForActiveTab();
  if (!entries.length) {
    list.innerHTML = `<div class="empty-state">Nenhum lan\u00e7amento em ${activeLabel} neste dia.</div>`;
    return;
  }

  list.innerHTML = entries
    .map((entry) => {
      const isNegative = entry.type === "saidas";
      const sign = isNegative ? "-" : "+";
      const note = entry.note ? ` - ${escapeHtml(entry.note)}` : "";
      const time = formatTime(entry.createdAt);
      return `
        <article class="history-item">
          <div class="history-main">
            <strong>${time}</strong>
            <span>${activeLabel}${note}</span>
          </div>
          <div class="history-side">
            <div class="history-value ${isNegative ? "is-negative" : ""}">${sign}${currency.format(entry.amount)}</div>
          </div>
          <div class="history-actions">
            <button class="action-button edit-button" type="button" data-edit="${entry.id}" aria-label="Editar lan\u00e7amento">Editar</button>
            <button class="action-button delete-button" type="button" data-delete="${entry.id}" aria-label="Apagar lan\u00e7amento">Apagar</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRaspadinha() {
  raspaProducts.innerHTML = RASPA_PRODUCTS.map((product, index) => {
    const item = state.raspa.products[product.id];
    return `
      <article class="raspa-row">
        <div class="raspa-name">
          <strong>${product.name}</strong>
          <span>${currency.format(product.price)}</span>
        </div>
        <input class="qty-input" data-raspa-order="${index}" data-product="${product.id}" data-raspa-field="start" type="text" inputmode="numeric" enterkeyhint="next" value="${item.start || ""}" aria-label="${product.name} in\u00edcio do dia" />
        <input class="qty-input" data-raspa-order="${index + RASPA_PRODUCTS.length}" data-product="${product.id}" data-raspa-field="end" type="text" inputmode="numeric" enterkeyhint="next" value="${item.end || ""}" aria-label="${product.name} final do dia" />
      </article>
    `;
  }).join("");

  raspaRedeemInput.value = state.raspa.redeem
    ? state.raspa.redeem.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
    : "";
  updateRaspaTotals();
}

function updateRaspaTotals() {
  const totals = calculateRaspaTotals();
  document.querySelector("#raspaSalesTotal").textContent = currency.format(totals.sales);
  document.querySelector("#raspaRedeemTotal").textContent = currency.format(totals.redeem);
  document.querySelector("#raspaCommissionTotal").textContent = currency.format(totals.commission);
  document.querySelector("#raspaCashTotal").textContent = currency.format(totals.cash);
}

function calculateRaspaTotals() {
  const sales = RASPA_PRODUCTS.reduce((total, product) => {
    const item = state.raspa.products[product.id];
    return total + (Number(item.start || 0) - Number(item.end || 0)) * product.price;
  }, 0);
  const redeem = Number(state.raspa.redeem || 0);

  return {
    sales,
    redeem,
    cash: sales - redeem,
    commission: sales * 0.05,
  };
}

function entriesForSelectedDate() {
  return state.entries.filter((entry) => entry.date === state.today);
}

function entriesForActiveTab() {
  return entriesForSelectedDate().filter((entry) => entry.type === state.activeType);
}

function totalsForSelectedDate() {
  return entriesForSelectedDate().reduce(
    (totals, entry) => {
      totals[entry.type] += entry.amount;
      return totals;
    },
    { protege: 0, entradas: 0, saidas: 0 },
  );
}

function countsForSelectedDate() {
  return entriesForSelectedDate().reduce(
    (counts, entry) => {
      counts[entry.type] += 1;
      return counts;
    },
    { protege: 0, entradas: 0, saidas: 0 },
  );
}

function startEdit(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;

  state.editingId = id;
  state.activeType = entry.type;
  amountInput.value = entry.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  noteInput.value = entry.note || "";
  renderFechamento();
  showToast("Editando lan\u00e7amento.");
  focusAmountInput();
}

function resetForm() {
  state.editingId = null;
  amountInput.value = "";
  noteInput.value = "";
}

function parseAmount(value) {
  if (!value) return 0;
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return Number(normalized);
}

function onlyDigits(value) {
  return value.replace(/\D/g, "");
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function loadArray(key) {
  try {
    const current = JSON.parse(localStorage.getItem(key));
    return Array.isArray(current) ? current : [];
  } catch {
    return [];
  }
}

function loadRaspa() {
  try {
    const current = JSON.parse(localStorage.getItem(RASPA_STORAGE_KEY));
    if (current?.date === todayLocal() && current.products) return normalizeRaspa(current);
  } catch {
    return createEmptyRaspa(todayLocal());
  }

  return createEmptyRaspa(todayLocal());
}

function normalizeRaspa(data) {
  const empty = createEmptyRaspa(data.date || todayLocal());
  return {
    date: data.date,
    redeem: Number(data.redeem || 0),
    products: RASPA_PRODUCTS.reduce((products, product) => {
      products[product.id] = {
        start: Number(data.products?.[product.id]?.start || 0),
        end: Number(data.products?.[product.id]?.end || 0),
      };
      return products;
    }, empty.products),
  };
}

function createEmptyRaspa(date) {
  return {
    date,
    redeem: 0,
    products: RASPA_PRODUCTS.reduce((products, product) => {
      products[product.id] = { start: 0, end: 0 };
      return products;
    }, {}),
  };
}

function todayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function saveFechamento() {
  localStorage.setItem(FECHAMENTO_STORAGE_KEY, JSON.stringify(state.entries));
}

function saveRaspa() {
  localStorage.setItem(RASPA_STORAGE_KEY, JSON.stringify(state.raspa));
}

function purgeOldEntries() {
  const todaysEntries = state.entries.filter((entry) => entry.date === state.today);
  if (todaysEntries.length !== state.entries.length) {
    state.entries = todaysEntries;
    saveFechamento();
  }

  if (state.raspa.date !== state.today) {
    state.raspa = createEmptyRaspa(state.today);
    saveRaspa();
  }
}

function refreshDayIfNeeded() {
  const today = todayLocal();
  if (today === state.today) return false;

  state.today = today;
  state.entries = [];
  state.raspa = createEmptyRaspa(today);
  resetForm();
  saveFechamento();
  saveRaspa();
  showToast("Novo dia iniciado.");
  return true;
}

function focusAmountInput() {
  amountInput.scrollIntoView({ block: "center", behavior: "smooth" });
  requestAnimationFrame(() => amountInput.focus({ preventScroll: true }));
}

function focusNextRaspaInput(currentInput) {
  const orderedInputs = [...document.querySelectorAll("[data-raspa-order]")]
    .sort((a, b) => Number(a.dataset.raspaOrder) - Number(b.dataset.raspaOrder));
  const index = orderedInputs.indexOf(currentInput);
  const nextInput = orderedInputs[index + 1] || raspaRedeemInput;

  nextInput.scrollIntoView({ block: "center", behavior: "smooth" });
  requestAnimationFrame(() => nextInput.focus({ preventScroll: true }));
}

function focusRaspaCashCard() {
  raspaRedeemInput.value = state.raspa.redeem
    ? state.raspa.redeem.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
    : "";
  raspaRedeemInput.blur();

  const cashCard = document.querySelector("#raspaCashCard");
  cashCard.scrollIntoView({ block: "start", behavior: "smooth" });
  requestAnimationFrame(() => cashCard.focus({ preventScroll: true }));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}
