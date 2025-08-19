const PRINTERS = [
  { name: "Creality Ender-3 (V2/Neo)", powerW: 120 },
  { name: "Prusa i3 MK3S+", powerW: 100 },
  { name: "Prusa MINI+", powerW: 80 },
  { name: "Anycubic Kobra", powerW: 120 },
  { name: "Creality CR-10", powerW: 150 },
  { name: "Bambu Lab P1P", powerW: 250 },
  { name: "Bambu Lab X1 Carbon", powerW: 300 },
  { name: "Anycubic i3 Mega", powerW: 120 },
  { name: "Artillery Sidewinder X1", powerW: 200 },
  { name: "Elegoo Neptune 3", powerW: 120 }
];

function $(id) {
  return document.getElementById(id);
}
function num(id) {
  return parseFloat($(id).value) || 0;
}
function fmtMoney(n) {
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

function populatePrinters() {
  const sel = $("printerType");
  sel.innerHTML = "";

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Select a printer…";
  ph.disabled = true;
  ph.hidden = true;
  ph.selected = true;
  sel.appendChild(ph);

  PRINTERS.forEach((p, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = p.name;
    sel.appendChild(opt);
  });

  const oth = document.createElement("option");
  oth.value = "other";
  oth.textContent = "Other (enter power manually)";
  sel.appendChild(oth);

  $("avgPower").value = "";
  $("avgPower").readOnly = true;
}

function setupPrinterChange() {
  $("printerType").addEventListener("change", (e) => {
    const val = e.target.value;
    const avgPower = $("avgPower");

    if (val === "" || val === undefined) {
      avgPower.value = "";
      avgPower.readOnly = true;
      return;
    }

    if (val === "other") {
      avgPower.readOnly = false;
      if (!avgPower.value) avgPower.focus();
      return;
    }

    const idx = parseInt(val, 10);
    const p = PRINTERS[idx];
    if (p) {
      avgPower.value = p.powerW;
      avgPower.readOnly = true;
    } else {
      avgPower.value = "";
      avgPower.readOnly = true;
    }
  });
}

function validateAndParseGcode(file) {
  if (!GCODE.isGcodeFilename(file?.name)) {
    alert("Please upload a valid G-code file (.gcode, .gco, .g).");
    return;
  }

  GCODE.parseFile(file).then(({ printTimeHours, filamentGrams }) => {
    if (printTimeHours != null && !Number.isNaN(printTimeHours)) {
      $("printTimeHours").value = Number(printTimeHours.toFixed(2));
    }
    if (filamentGrams != null && !Number.isNaN(filamentGrams)) {
      $("filamentUsedGrams").value = Number(filamentGrams.toFixed(2));
    }
  }).catch((err) => {
    console.error("G-code parse error:", err);
    alert("Could not parse the G-code file. You can still enter values manually.");
  });
}

function setupGcodeUpload() {
  $("gcodeFile").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    validateAndParseGcode(file);
  });
}

function calculateTotalsEUR() {
  const filamentG = num("filamentUsedGrams");
  const filamentCostPerKg = num("filamentCostPerKg");
  const hours = num("printTimeHours");
  const avgPowerW = num("avgPower");
  const kwhRate = num("electricityCost");
  const wear = num("machineWearCost");
  const laborMins = num("handsOnLaborMins");
  const laborPerHour = num("laborCostPerHour");
  const marginPct = num("profitMargin");

  const zeroFields = [];
  if (filamentG === 0) zeroFields.push("Filament used (g)");
  if (filamentCostPerKg === 0) zeroFields.push("Filament cost per kg");
  if (hours === 0) zeroFields.push("Print time (hours)");
  if (kwhRate === 0) zeroFields.push("Electricity cost (per kWh)");
  if (avgPowerW === 0) zeroFields.push("Average power (W)");
  if (zeroFields.length) {
    const ok = confirm(`Some inputs are zero or missing:\n• ${zeroFields.join("\n• ")}\n\nContinue anyway?`);
    if (!ok) return null;
  }

  const filamentCost = (filamentG / 1000) * filamentCostPerKg;
  const electricityCost = (avgPowerW * hours) / 1000 * kwhRate;
  const laborCost = laborPerHour * (laborMins / 60);
  const wearCost = wear;

  const subtotal = filamentCost + electricityCost + laborCost + wearCost;
  const total = subtotal * (1 + (marginPct / 100));
  return total;
}

// FX logic
let cachedRateEURUSD = null;
let lastRateTime = 0;
const RATE_TTL_MS = 10 * 60 * 1000;

function abortableFetch(url, ms = 5000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
}

async function fetchFromFrankfurter() {
  const res = await abortableFetch("https://api.frankfurter.app/latest?from=EUR&to=USD");
  if (!res.ok) throw new Error("Frankfurter not ok");
  const data = await res.json();
  return data?.rates?.USD;
}

async function fetchFromExchangerateHost() {
  const res = await abortableFetch("https://api.exchangerate.host/latest?base=EUR&symbols=USD");
  if (!res.ok) throw new Error("exchangerate.host not ok");
  const data = await res.json();
  return data?.rates?.USD;
}

async function fetchFromERAPI() {
  const res = await abortableFetch("https://open.er-api.com/v6/latest/EUR");
  if (!res.ok) throw new Error("ER-API not ok");
  const data = await res.json();
  return data?.rates?.USD;
}

async function getEURtoUSDRate() {
  const now = Date.now();
  if (cachedRateEURUSD && (now - lastRateTime) < RATE_TTL_MS) {
    return cachedRateEURUSD;
  }

  const sources = [fetchFromFrankfurter, fetchFromExchangerateHost, fetchFromERAPI];
  for (const src of sources) {
    try {
      const rate = await src();
      if (rate) {
        cachedRateEURUSD = rate;
        lastRateTime = now;
        return rate;
      }
    } catch (e) {
      console.warn("FX source failed:", e.message);
    }
  }
  throw new Error("All FX sources failed");
}

async function onCalculate() {
  $("fxStatus").textContent = "";

  const totalEUR = calculateTotalsEUR();
  if (totalEUR == null) return;

  $("outTotalEUR").textContent = `€ ${fmtMoney(totalEUR)}`;
  $("outTotalUSD").textContent = "—";

  try {
    $("fxStatus").textContent = "Fetching live FX…";
    const rate = await getEURtoUSDRate();
    const usd = totalEUR * rate;
    $("outTotalUSD").textContent = `$ ${fmtMoney(usd)}`;
    $("fxStatus").textContent = `Live rate: 1€ = ${rate.toFixed(4)}$`;
  } catch (err) {
    console.error(err);
    $("fxStatus").textContent = "Could not fetch live FX. Showing EUR only.";
  }
}

function onExportPdf() {
  if ($("outTotalEUR").textContent.trim() === "—") {
    const proceed = confirm("You haven't calculated a total yet. Export anyway?");
    if (!proceed) return;
  }

  $("psTotalEUR").textContent = $("outTotalEUR").textContent || "—";
  $("psTotalUSD").textContent = $("outTotalUSD").textContent || "—";

  $("psPrinter").textContent = $("printerType").selectedOptions[0]?.textContent || "—";
  $("psFilament").textContent = $("filamentUsedGrams").value
    ? `${$("filamentUsedGrams").value} g`
    : "—";
  $("psTime").textContent = $("printTimeHours").value
    ? `${$("printTimeHours").value} h`
    : "—";

  $("psTimestamp").textContent = `Generated: ${new Date().toLocaleString()}`;

  window.print();
}

function setupCalculate() {
  $("btnCalculate").addEventListener("click", onCalculate);
  $("btnExportPdf").addEventListener("click", onExportPdf);
}

function boot() {
  populatePrinters();
  setupPrinterChange();
  setupGcodeUpload();
  setupCalculate();
}

document.addEventListener("DOMContentLoaded", boot);
