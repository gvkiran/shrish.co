const STORAGE_KEY = "shrish-accounting-transactions-v1";
const RULES_KEY = "shrish-accounting-rules-v1";
const COLUMNS_KEY = "shrish-accounting-columns-v1";

const DEFAULT_RULES = [
  {
    id: "zelle-sales",
    keyword: "ZELLE|QUICKPAY|PARTNERFI_TO_CHASE",
    direction: "in",
    account: "income",
    category: "Sales - Shrish Mango",
  },
  {
    id: "jgj-vendor",
    keyword: "JGJ",
    direction: "out",
    account: "expense",
    category: "Vendor Payments - JGJ",
  },
  {
    id: "zelle-vendor",
    keyword: "ZELLE|QUICKPAY|CHASE_TO_PARTNERFI",
    direction: "out",
    account: "expense",
    category: "Vendor Payments - Zelle",
  },
  {
    id: "bank-fee",
    keyword: "FEE",
    direction: "out",
    account: "expense",
    category: "Bank Fees",
  },
  {
    id: "debit-card",
    keyword: "DEBIT_CARD",
    direction: "out",
    account: "expense",
    category: "Operating Expenses - Card",
  },
  {
    id: "ach-credit",
    keyword: "ACH_CREDIT",
    direction: "in",
    account: "income",
    category: "Sales - ACH",
  },
  {
    id: "atm-deposit",
    keyword: "ATM",
    direction: "in",
    account: "income",
    category: "Cash / ATM Deposit",
  },
];

const COLUMN_DEFS = [
  { key: "date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "type", label: "Chase Type" },
  { key: "amount", label: "Amount" },
  { key: "account", label: "Account" },
  { key: "category", label: "Category" },
  { key: "business", label: "Business" },
  { key: "payee", label: "Customer / Vendor" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
];

const ACCOUNT_OPTIONS = ["income", "expense", "asset", "equity"];
const CATEGORY_OPTIONS = [
  "Sales - Shrish Mango",
  "Sales - ACH",
  "Vendor Payments - JGJ",
  "Vendor Payments - Zelle",
  "Cost of Goods Sold",
  "Packaging & Supplies",
  "Shipping & Delivery",
  "Advertising & Events",
  "Operating Expenses - Card",
  "Bank Fees",
  "Cash / ATM Deposit",
  "Owner Contribution",
  "Owner Draw",
  "Transfer",
  "Needs CPA Review",
];

let transactions = loadJson(STORAGE_KEY, []);
let rules = loadJson(RULES_KEY, DEFAULT_RULES);
let visibleColumns = loadJson(COLUMNS_KEY, Object.fromEntries(COLUMN_DEFS.map((column) => [column.key, true])));

const fileInput = document.querySelector("#fileInput");
const yearFilter = document.querySelector("#yearFilter");
const reviewFilter = document.querySelector("#reviewFilter");
const searchInput = document.querySelector("#searchInput");
const transactionCount = document.querySelector("#transactionCount");
const transactionsTable = document.querySelector("#transactionsTable");
const columnChooser = document.querySelector("#columnChooser");
const rulesList = document.querySelector("#rulesList");
const ruleForm = document.querySelector("#ruleForm");

fileInput.addEventListener("change", handleFile);
yearFilter.addEventListener("change", render);
reviewFilter.addEventListener("change", render);
searchInput.addEventListener("input", render);
document.querySelector("#exportExcel").addEventListener("click", exportExcelWorkbook);
document.querySelector("#printReport").addEventListener("click", () => window.print());
document.querySelector("#clearData").addEventListener("click", clearLocalData);
ruleForm.addEventListener("submit", addRule);

render();

async function handleFile(event) {
  const [file] = event.target.files;
  if (!file) return;

  const csv = await file.text();
  const rows = parseCsv(csv);
  transactions = rows.map(normalizeChaseRow).filter(Boolean);
  saveTransactions();
  render();
}

function normalizeChaseRow(row, index) {
  const amount = toNumber(row.Amount);
  const date = parseDate(row["Posting Date"]);
  if (!date || Number.isNaN(amount)) return null;

  const base = {
    id: `${date.toISOString().slice(0, 10)}-${index}-${Math.abs(amount).toFixed(2)}`,
    date: date.toISOString().slice(0, 10),
    description: row.Description || "",
    type: row.Type || "",
    details: row.Details || "",
    amount,
    account: amount >= 0 ? "income" : "expense",
    category: "Needs CPA Review",
    payee: "",
    notes: "",
    business: true,
    review: true,
    manual: false,
    source: "Chase",
  };

  return applyRules(base);
}

function applyRules(transaction) {
  const text = `${transaction.description} ${transaction.type} ${transaction.details}`.toUpperCase();
  const direction = transaction.amount >= 0 ? "in" : "out";
  const match = rules.find((rule) => {
    const directionMatches = rule.direction === "any" || rule.direction === direction;
    const keywordMatches = new RegExp(rule.keyword, "i").test(text);
    return directionMatches && keywordMatches;
  });

  if (!match) return transaction;

  return {
    ...transaction,
    account: match.account,
    category: match.category,
    payee: inferPayee(transaction.description, match.category),
    review: needsReview(match.category),
  };
}

function needsReview(category) {
  return [
    "Cash / ATM Deposit",
    "Operating Expenses - Card",
    "Vendor Payments - Zelle",
    "Needs CPA Review",
  ].includes(category);
}

function inferPayee(description, category) {
  if (category.includes("JGJ")) return "JGJ";
  if (category.includes("Mango")) return "Zelle Customer";
  const cleaned = description
    .replace(/ZELLE PAYMENT (FROM|TO)/i, "")
    .replace(/JPM[A-Z0-9]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 48);
}

function render() {
  renderYearOptions();
  renderColumnChooser();
  renderRules();
  const filtered = getFilteredTransactions();
  const summary = summarize(filtered);
  renderKpis(summary);
  renderProfitLoss(summary);
  renderMonthlyTrend(summary.months);
  renderTransactions(filtered);
}

function renderYearOptions() {
  const selected = yearFilter.value || "all";
  const years = [...new Set(transactions.map((row) => row.date.slice(0, 4)))].sort();
  yearFilter.innerHTML = [
    `<option value="all">All dates</option>`,
    ...years.map((year) => `<option value="${year}">${year}</option>`),
  ].join("");
  yearFilter.value = years.includes(selected) ? selected : "all";
}

function renderColumnChooser() {
  columnChooser.innerHTML = COLUMN_DEFS.map((column) => `
    <label>
      <input type="checkbox" data-column="${column.key}" ${visibleColumns[column.key] ? "checked" : ""}>
      ${escapeHtml(column.label)}
    </label>
  `).join("");

  columnChooser.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      visibleColumns[input.dataset.column] = input.checked;
      saveJson(COLUMNS_KEY, visibleColumns);
      renderTransactions(getFilteredTransactions());
    });
  });
}

function renderRules() {
  rulesList.innerHTML = rules.map((rule) => `
    <div class="rule-row">
      <span>${escapeHtml(rule.keyword)}</span>
      <span>${escapeHtml(rule.direction)}</span>
      <span>${escapeHtml(rule.account)}</span>
      <strong>${escapeHtml(rule.category)}</strong>
      <button type="button" data-rule="${rule.id}">Remove</button>
    </div>
  `).join("");

  rulesList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      rules = rules.filter((rule) => rule.id !== button.dataset.rule);
      saveJson(RULES_KEY, rules);
      transactions = transactions.map(reapplyAutomaticRules);
      saveTransactions();
      render();
    });
  });
}

function renderKpis(summary) {
  document.querySelector("#kpiIncome").textContent = money(summary.income);
  document.querySelector("#kpiExpenses").textContent = money(summary.expenses);
  document.querySelector("#kpiProfit").textContent = money(summary.profit);
  document.querySelector("#kpiReview").textContent = summary.reviewCount.toLocaleString();
}

function renderProfitLoss(summary) {
  document.querySelector("#reportPeriod").textContent = getPeriodLabel();
  const rows = [
    ["Income", summary.income, "total"],
    ...Object.entries(summary.incomeCategories).sort(sortByValueDesc).map(([label, value]) => [label, value, "subtle"]),
    ["Expenses", summary.expenses, "total"],
    ...Object.entries(summary.expenseCategories).sort(sortByValueDesc).map(([label, value]) => [label, value, "subtle"]),
    ["Net Profit", summary.profit, "total"],
  ];

  document.querySelector("#plReport").innerHTML = rows.map(([label, value, tone]) => `
    <div class="pl-row ${tone}">
      <span>${escapeHtml(label)}</span>
      <span class="money">${money(value)}</span>
    </div>
  `).join("");
}

function renderMonthlyTrend(months) {
  const entries = Object.entries(months).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...entries.flatMap(([, month]) => [month.income, month.expenses]));
  const empty = document.querySelector("#emptyState").content.cloneNode(true);

  if (!entries.length) {
    document.querySelector("#monthlyTrend").innerHTML = "";
    document.querySelector("#monthlyTrend").append(empty);
    return;
  }

  document.querySelector("#monthlyTrend").innerHTML = entries.map(([month, values]) => `
    <div class="month-row">
      <header>
        <strong>${escapeHtml(month)}</strong>
        <span>${money(values.income - values.expenses)}</span>
      </header>
      <div class="bars">
        <div class="bar income"><span style="width:${Math.max(3, (values.income / max) * 100)}%"></span></div>
        <div class="bar expense"><span style="width:${Math.max(3, (values.expenses / max) * 100)}%"></span></div>
      </div>
    </div>
  `).join("");
}

function renderTransactions(rows) {
  transactionCount.textContent = `${rows.length.toLocaleString()} rows`;
  const columns = COLUMN_DEFS.filter((column) => visibleColumns[column.key]);
  transactionsTable.querySelector("thead").innerHTML = `
    <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>
  `;

  transactionsTable.querySelector("tbody").innerHTML = rows.map((row) => `
    <tr data-id="${row.id}">
      ${columns.map((column) => `<td>${renderCell(row, column.key)}</td>`).join("")}
    </tr>
  `).join("");

  transactionsTable.querySelectorAll("select,input").forEach((field) => {
    field.addEventListener("change", updateTransactionField);
    field.addEventListener("input", updateTransactionField);
  });
}

function renderCell(row, key) {
  if (key === "amount") return `<span class="money">${money(row.amount)}</span>`;
  if (key === "account") return selectField(row, "account", ACCOUNT_OPTIONS);
  if (key === "category") return selectField(row, "category", getCategoryOptions());
  if (key === "business") {
    return `<input type="checkbox" data-id="${row.id}" data-field="business" ${row.business ? "checked" : ""}>`;
  }
  if (key === "payee") return inputField(row, "payee", row.payee);
  if (key === "notes") return inputField(row, "notes", row.notes);
  if (key === "status") {
    return `
      <label class="inline-check">
        <input type="checkbox" data-id="${row.id}" data-field="review" ${row.review ? "checked" : ""}>
        <span class="status-pill ${row.review ? "status-review" : "status-ready"}">${row.review ? "Review" : "Ready"}</span>
      </label>
    `;
  }
  return escapeHtml(row[key] || "");
}

function selectField(row, field, options) {
  return `
    <select data-id="${row.id}" data-field="${field}">
      ${options.map((option) => `<option value="${escapeHtml(option)}" ${row[field] === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
    </select>
  `;
}

function inputField(row, field, value) {
  return `<input data-id="${row.id}" data-field="${field}" value="${escapeHtml(value || "")}">`;
}

function updateTransactionField(event) {
  const field = event.target.dataset.field;
  const id = event.target.dataset.id;
  if (!field || !id) return;

  transactions = transactions.map((row) => {
    if (row.id !== id) return row;
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    const next = { ...row, [field]: value, manual: true };
    if (field === "category" || field === "account") {
      next.review = needsReview(next.category);
    }
    return next;
  });
  saveTransactions();
  render();
}

function getFilteredTransactions() {
  const selectedYear = yearFilter.value || "all";
  const status = reviewFilter.value;
  const query = searchInput.value.trim().toLowerCase();

  return transactions.filter((row) => {
    if (selectedYear !== "all" && !row.date.startsWith(selectedYear)) return false;
    if (status === "review" && !row.review) return false;
    if (status === "business" && !row.business) return false;
    if (!query) return true;
    return [row.description, row.type, row.category, row.payee, row.notes].some((value) => String(value).toLowerCase().includes(query));
  });
}

function summarize(rows) {
  const summary = {
    income: 0,
    expenses: 0,
    profit: 0,
    reviewCount: rows.filter((row) => row.review).length,
    incomeCategories: {},
    expenseCategories: {},
    months: {},
  };

  rows.forEach((row) => {
    const month = row.date.slice(0, 7);
    summary.months[month] ||= { income: 0, expenses: 0 };

    if (row.account === "income" && row.amount > 0) {
      summary.income += row.amount;
      summary.months[month].income += row.amount;
      summary.incomeCategories[row.category] = (summary.incomeCategories[row.category] || 0) + row.amount;
    }

    if (row.account === "expense" && row.amount < 0) {
      const expense = Math.abs(row.amount);
      summary.expenses += expense;
      summary.months[month].expenses += expense;
      summary.expenseCategories[row.category] = (summary.expenseCategories[row.category] || 0) + expense;
    }
  });

  summary.profit = summary.income - summary.expenses;
  return summary;
}

function addRule(event) {
  event.preventDefault();
  const rule = {
    id: crypto.randomUUID(),
    keyword: document.querySelector("#ruleKeyword").value.trim(),
    direction: document.querySelector("#ruleDirection").value,
    account: document.querySelector("#ruleAccount").value,
    category: document.querySelector("#ruleCategory").value.trim(),
  };

  rules = [rule, ...rules];
  saveJson(RULES_KEY, rules);
  transactions = transactions.map(reapplyAutomaticRules);
  saveTransactions();
  event.target.reset();
  render();
}

function reapplyAutomaticRules(row) {
  if (row.manual) return row;
  return applyRules({ ...row, category: "Needs CPA Review", review: true });
}

function exportExcelWorkbook() {
  const rows = getFilteredTransactions();
  const summary = summarize(rows);
  const html = `
    <html>
      <head><meta charset="utf-8"></head>
      <body>
        <h1>SHRISH CPA Report</h1>
        <p>${escapeHtml(getPeriodLabel())}</p>
        ${tableHtml("Profit and Loss", [
          ["Line", "Amount"],
          ["Income", summary.income],
          ["Expenses", summary.expenses],
          ["Net Profit", summary.profit],
        ])}
        ${tableHtml("Income Categories", [["Category", "Amount"], ...Object.entries(summary.incomeCategories)])}
        ${tableHtml("Expense Categories", [["Category", "Amount"], ...Object.entries(summary.expenseCategories)])}
        ${tableHtml("Transactions", [
          ["Date", "Description", "Type", "Amount", "Account", "Category", "Business", "Payee", "Needs Review", "Notes"],
          ...rows.map((row) => [row.date, row.description, row.type, row.amount, row.account, row.category, row.business ? "Yes" : "No", row.payee, row.review ? "Yes" : "No", row.notes]),
        ])}
      </body>
    </html>
  `;
  download(`shrish-cpa-report-${new Date().toISOString().slice(0, 10)}.xls`, html, "application/vnd.ms-excel");
}

function tableHtml(title, rows) {
  return `
    <h2>${escapeHtml(title)}</h2>
    <table border="1">
      ${rows.map((row, index) => `
        <tr>${row.map((cell) => index === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
      `).join("")}
    </table>
  `;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function clearLocalData() {
  if (!confirm("Clear imported transactions and local edits from this browser?")) return;
  transactions = [];
  localStorage.removeItem(STORAGE_KEY);
  render();
}

function saveTransactions() {
  saveJson(STORAGE_KEY, transactions);
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...data] = rows.filter((csvRow) => csvRow.some((cell) => cell.trim()));
  return data.map((csvRow) => Object.fromEntries(headers.map((header, index) => [header.trim(), csvRow[index] || ""])));
}

function parseDate(value) {
  const [month, day, year] = String(value).split("/").map(Number);
  if (!month || !day || !year) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function toNumber(value) {
  return Number(String(value).replace(/[$,]/g, ""));
}

function getCategoryOptions() {
  const categories = new Set(CATEGORY_OPTIONS);
  transactions.forEach((row) => categories.add(row.category));
  rules.forEach((rule) => categories.add(rule.category));
  return [...categories].sort();
}

function getPeriodLabel() {
  const selectedYear = yearFilter.value || "all";
  if (selectedYear !== "all") return `Calendar year ${selectedYear}`;
  if (!transactions.length) return "No file imported";
  const dates = transactions.map((row) => row.date).sort();
  return `${dates[0]} through ${dates[dates.length - 1]}`;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function sortByValueDesc(a, b) {
  return b[1] - a[1];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
