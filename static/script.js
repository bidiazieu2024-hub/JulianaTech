// Hibrida Prediction Market - script.js

const DEMO_INITIAL_BALANCE = 100;
const DEMO_TOP_UP_THRESHOLD = 5;
const DEMO_TOP_UP_AMOUNT = 100;
const STORAGE_KEY = "hibrida_state_v1";

let state = {
  users: {},
  markets: [],
  lpPool: {
    totalLiquidity: 5000,
    totalShares: 5000
  },
  fees: {
    trade: 0.02 // 2% trading fee to LPs
  }
};

let currentAccount = null;
let activeTradeMarketId = null;
let activeTradeSide = "YES";

// ------- Initialization -------

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  setupNavigation();
  setupMetamask();
  setupTradeModal();
  setupCreateMarketForm();
  setupLpForms();
  renderAll();
});

// ------- State persistence -------

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state = {
          users: parsed.users || {},
          markets: Array.isArray(parsed.markets)
            ? parsed.markets
            : createInitialMarkets(),
          lpPool: parsed.lpPool || { totalLiquidity: 5000, totalShares: 5000 },
          fees: parsed.fees || { trade: 0.02 }
        };
      }
    } catch (err) {
      console.error("Failed to parse stored state, using defaults.", err);
      state.markets = createInitialMarkets();
    }
  }

  if (!state.markets || !Array.isArray(state.markets) || state.markets.length === 0) {
    state.markets = createInitialMarkets();
  }
  if (!state.users) state.users = {};
  if (!state.lpPool) state.lpPool = { totalLiquidity: 5000, totalShares: 5000 };
  if (!state.fees) state.fees = { trade: 0.02 };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save state", err);
  }
}

// ------- Initial markets -------

function createInitialMarkets() {
  return [
    {
      id: "m1",
      question: "Will ETH close above $5,000 on Dec 31, 2025?",
      category: "Crypto",
      resolutionDate: "2025-12-31",
      liquidity: 2000,
      amm: { b: 80, qYes: 0, qNo: 0 },
      crowdVolume: { yes: 0, no: 0 },
      lastPrice: 0.55,
      resolved: false,
      outcome: null
    },
    {
      id: "m2",
      question: "Will the S&P 500 make a new all-time high by June 2025?",
      category: "Macro",
      resolutionDate: "2025-06-30",
      liquidity: 1500,
      amm: { b: 80, qYes: 0, qNo: 0 },
      crowdVolume: { yes: 0, no: 0 },
      lastPrice: 0.62,
      resolved: false,
      outcome: null
    },
    {
      id: "m3",
      question: "Will Bitcoin trade above $150,000 at any point in 2026?",
      category: "Crypto",
      resolutionDate: "2026-12-31",
      liquidity: 1800,
      amm: { b: 80, qYes: 0, qNo: 0 },
      crowdVolume: { yes: 0, no: 0 },
      lastPrice: 0.48,
      resolved: false,
      outcome: null
    },
    {
      id: "m4",
      question: "Will Spain win a major international football trophy by 2026?",
      category: "Sports",
      resolutionDate: "2026-07-31",
      liquidity: 1200,
      amm: { b: 80, qYes: 0, qNo: 0 },
      crowdVolume: { yes: 0, no: 0 },
      lastPrice: 0.41,
      resolved: false,
      outcome: null
    }
  ];
}

// ------- Navigation -------

function setupNavigation() {
  const navLinks = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll(".section");

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = link.getAttribute("data-section");
      if (!targetId) return;

      navLinks.forEach((l) => l.classList.remove("active"));
      sections.forEach((s) => s.classList.remove("active"));

      link.classList.add("active");
      const targetSection = document.getElementById(targetId);
      if (targetSection) targetSection.classList.add("active");
    });
  });
}

// ------- MetaMask / Wallet logic -------

function setupMetamask() {
  const btn = document.getElementById("connectMetamaskBtn");
  const balanceEl = document.getElementById("demoBalance");
  if (!btn) return;

  if (typeof window.ethereum === "undefined") {
    btn.textContent = "Install MetaMask";
    btn.addEventListener("click", () => {
      window.open("https://metamask.io/download/", "_blank");
    });
    if (balanceEl) balanceEl.textContent = "Demo: wallet not connected";
    return;
  }

  btn.addEventListener("click", async () => {
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts"
      });
      const account = accounts && accounts[0];
      if (!account) return;

      handleWalletConnected(account);
    } catch (err) {
      console.error("MetaMask connection error:", err);
      if (err && err.code === 4001) {
        alert("Connection request was rejected.");
      } else {
        alert("Failed to connect to MetaMask. See console for details.");
      }
    }
  });

  // If user switches accounts in MetaMask
  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts && accounts.length > 0) {
        handleWalletConnected(accounts[0]);
      } else {
        currentAccount = null;
        if (balanceEl) balanceEl.textContent = "Demo: connect wallet";
        btn.textContent = "Connect Wallet";
        btn.classList.remove("connected");
      }
    });
  }
}

function handleWalletConnected(account) {
  const btn = document.getElementById("connectMetamaskBtn");
  const balanceEl = document.getElementById("demoBalance");
  const addr = account.toLowerCase();
  currentAccount = addr;

  let user = state.users[addr];

  if (!user) {
    user = {
      balance: DEMO_INITIAL_BALANCE,
      positions: {},
      lpShares: 0
    };
    state.users[addr] = user;
    alert(
      `Welcome to Hibrida.\n\nWe have credited your demo balance with ${DEMO_INITIAL_BALANCE} HBD tokens so you can trade.`
    );
  } else if (user.balance <= DEMO_TOP_UP_THRESHOLD) {
    user.balance = DEMO_TOP_UP_AMOUNT;
    alert(
      `Your demo balance was low, so we topped it back up to ${DEMO_TOP_UP_AMOUNT} HBD for this session.`
    );
  }

  saveState();
  updateWalletUI();

  if (btn) {
    const short = shortenAddress(addr);
    btn.textContent = `Connected · ${short}`;
    btn.classList.add("connected");
  }

  if (balanceEl && user) {
    balanceEl.textContent = `Demo balance: ${user.balance.toFixed(2)} HBD`;
  }

  renderPortfolio();
  renderLp();
}

function updateWalletUI() {
  const balanceEl = document.getElementById("demoBalance");
  const btn = document.getElementById("connectMetamaskBtn");

  if (!currentAccount) {
    if (balanceEl) balanceEl.textContent = "Demo: connect wallet";
    if (btn) {
      btn.textContent = "Connect Wallet";
      btn.classList.remove("connected");
    }
    return;
  }

  const user = state.users[currentAccount];
  if (user && balanceEl) {
    balanceEl.textContent = `Demo balance: ${user.balance.toFixed(2)} HBD`;
  }
}

function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

// ------- Hybrid Market Maker -------

// LMSR-inspired AMM price
function getAmmYesPrice(market) {
  const { qYes, qNo, b } = market.amm;
  if (!b || b <= 0) return 0.5;

  const expYes = Math.exp(qYes / b);
  const expNo = Math.exp(qNo / b);
  if (!isFinite(expYes) || !isFinite(expNo) || expYes + expNo === 0) return 0.5;

  return expYes / (expYes + expNo);
}

// Crowd-sourced price from aggregate positions
function getCrowdYesPrice(marketId) {
  let yesVolume = 0;
  let noVolume = 0;

  Object.values(state.users).forEach((user) => {
    const pos = user.positions && user.positions[marketId];
    if (!pos) return;
    yesVolume += pos.yesStake || 0;
    noVolume += pos.noStake || 0;
  });

  const total = yesVolume + noVolume;
  if (total <= 0) return null;

  return yesVolume / total;
}

// Order-book / last traded price proxy
function getOrderbookYesPrice(market) {
  if (typeof market.lastPrice === "number" && market.lastPrice > 0 && market.lastPrice < 1) {
    return market.lastPrice;
  }
  return null;
}

// Combine into a hybrid price
function getHybridYesPrice(market) {
  if (market.resolved) {
    return market.outcome === "YES" ? 1 : 0;
  }

  const amm = getAmmYesPrice(market);
  const crowd = getCrowdYesPrice(market.id);
  const last = getOrderbookYesPrice(market);

  let price = 0;
  let weight = 0;

  // AMM always contributes
  price += amm * 0.5;
  weight += 0.5;

  if (crowd !== null) {
    price += crowd * 0.3;
    weight += 0.3;
  }

  if (last !== null) {
    price += last * 0.2;
    weight += 0.2;
  }

  if (weight === 0) return 0.5;
  return Math.min(0.99, Math.max(0.01, price / weight));
}

// ------- Rendering helpers -------

function renderAll() {
  renderMarkets();
  renderPortfolio();
  renderLp();
  renderAdmin();
  updateWalletUI();
}

// Markets list on main page
function renderMarkets() {
  const container = document.getElementById("marketsList");
  if (!container) return;

  container.innerHTML = "";

  state.markets.forEach((market) => {
    const yesPrice = getHybridYesPrice(market);
    const noPrice = 1 - yesPrice;

    const yesPct = (yesPrice * 100).toFixed(1);
    const noPct = (noPrice * 100).toFixed(1);

    const card = document.createElement("article");
    card.className = "market-card";

    const ringDeg = yesPrice * 360;

    card.innerHTML = `
      <div class="market-header">
        <div class="market-labels">
          <span class="market-category">${market.category}</span>
          <span class="market-liquidity">Liquidity: ${market.liquidity.toFixed(0)} HBD</span>
        </div>
        <h3 class="market-question">${market.question}</h3>
        <div class="market-meta">
          <span>Resolves: ${market.resolutionDate}</span>
          ${
            market.resolved
              ? `<span class="market-status resolved">Resolved: ${market.outcome}</span>`
              : `<span class="market-status open">Open</span>`
          }
        </div>
      </div>
      <div class="market-body">
        <div class="market-gauge" style="--yes-deg: ${ringDeg}deg;">
          <div class="market-gauge-inner">
            <span class="market-gauge-yes">${yesPct}% YES</span>
            <span class="market-gauge-no">${noPct}% NO</span>
          </div>
        </div>
        <div class="market-prices">
          <div class="price-pill yes-pill">
            <span class="label">Buy YES</span>
            <span class="value">${yesPrice.toFixed(2)} HBD</span>
          </div>
          <div class="price-pill no-pill">
            <span class="label">Buy NO</span>
            <span class="value">${noPrice.toFixed(2)} HBD</span>
          </div>
        </div>
      </div>
      <div class="market-footer">
        <button class="btn btn-primary trade-btn" data-market-id="${market.id}" ${
      market.resolved ? "disabled" : ""
    }>
          Trade
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll(".trade-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const marketId = btn.getAttribute("data-market-id");
      openTradeModal(marketId);
    });
  });
}

// Portfolio section
function renderPortfolio() {
  const container = document.getElementById("portfolioContent");
  const addrEl = document.getElementById("portfolioAddress");
  const balEl = document.getElementById("portfolioBalance");

  if (!container) return;

  container.innerHTML = "";

  if (!currentAccount) {
    container.innerHTML =
      '<p class="muted">Connect your wallet to see open positions and P&L.</p>';
    if (addrEl) addrEl.textContent = "Not connected";
    if (balEl) balEl.textContent = "—";
    return;
  }

  const user = state.users[currentAccount];
  if (!user) return;

  if (addrEl) addrEl.textContent = shortenAddress(currentAccount);
  if (balEl) balEl.textContent = `${user.balance.toFixed(2)} HBD`;

  const positions = user.positions || {};
  const marketIds = Object.keys(positions);

  if (marketIds.length === 0) {
    container.innerHTML =
      '<p class="muted">No open positions yet. Go to Markets and place your first trade.</p>';
    return;
  }

  const table = document.createElement("table");
  table.className = "portfolio-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Market</th>
      <th>YES Shares</th>
      <th>NO Shares</th>
      <th>Est. Value</th>
      <th>Status</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  marketIds.forEach((marketId) => {
    const pos = positions[marketId];
    const market = state.markets.find((m) => m.id === marketId);
    if (!market) return;

    let status = "Open";
    let estValue = 0;

    if (market.resolved) {
      status = `Resolved: ${market.outcome}`;
      if (market.outcome === "YES") {
        estValue = pos.yesShares;
      } else if (market.outcome === "NO") {
        estValue = pos.noShares;
      }
    } else {
      const yesPrice = getHybridYesPrice(market);
      const noPrice = 1 - yesPrice;
      estValue = pos.yesShares * yesPrice + pos.noShares * noPrice;
    }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${market.question}</td>
      <td>${pos.yesShares.toFixed(2)}</td>
      <td>${pos.noShares.toFixed(2)}</td>
      <td>${estValue.toFixed(2)} HBD</td>
      <td>${status}</td>
    `;
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

// LP section
function renderLp() {
  const poolStatsEl = document.getElementById("lpPoolStats");
  const userStatsEl = document.getElementById("lpUserStats");

  if (poolStatsEl) {
    poolStatsEl.innerHTML = `
      <div class="stat-row">
        <span>Total Pool Liquidity</span>
        <span>${state.lpPool.totalLiquidity.toFixed(2)} HBD</span>
      </div>
      <div class="stat-row">
        <span>Total LP Shares</span>
        <span>${state.lpPool.totalShares.toFixed(2)}</span>
      </div>
      <div class="stat-row">
        <span>Trading Fee</span>
        <span>${(state.fees.trade * 100).toFixed(1)}%</span>
      </div>
    `;
  }

  if (!userStatsEl) return;

  if (!currentAccount) {
    userStatsEl.innerHTML =
      '<p class="muted">Connect your wallet to deposit liquidity and earn fees.</p>';
    return;
  }

  const user = state.users[currentAccount];
  const userShares = user.lpShares || 0;
  let shareOfPool = 0;

  if (userShares > 0 && state.lpPool.totalShares > 0) {
    shareOfPool = (userShares / state.lpPool.totalShares) * 100;
  }

  userStatsEl.innerHTML = `
    <div class="stat-row">
      <span>Your LP Shares</span>
      <span>${userShares.toFixed(2)}</span>
    </div>
    <div class="stat-row">
      <span>Your Share of Pool</span>
      <span>${shareOfPool.toFixed(2)}%</span>
    </div>
  `;
}

// Admin section: create + resolve markets
function renderAdmin() {
  const listEl = document.getElementById("adminMarketList");
  if (!listEl) return;

  listEl.innerHTML = "";

  state.markets.forEach((market) => {
    const yesPrice = getHybridYesPrice(market);
    const noPrice = 1 - yesPrice;

    const item = document.createElement("div");
    item.className = "admin-market-item";

    item.innerHTML = `
      <div class="admin-market-main">
        <h4>${market.question}</h4>
        <div class="admin-market-meta">
          <span>${market.category}</span>
          <span>Resolves: ${market.resolutionDate}</span>
          <span>Status: ${
            market.resolved ? "Resolved (" + market.outcome + ")" : "Open"
          }</span>
        </div>
        ${
          market.resolved
            ? ""
            : `<div class="admin-market-prices">
                 <span>YES: ${yesPrice.toFixed(2)} HBD</span>
                 <span>NO: ${noPrice.toFixed(2)} HBD</span>
               </div>`
        }
      </div>
      <div class="admin-market-actions">
        ${
          market.resolved
            ? ""
            : `<button class="btn btn-secondary admin-resolve" data-market-id="${market.id}" data-outcome="YES">Resolve YES</button>
               <button class="btn btn-secondary admin-resolve" data-market-id="${market.id}" data-outcome="NO">Resolve NO</button>`
        }
      </div>
   `;

    listEl.appendChild(item);
  });

  listEl.querySelectorAll(".admin-resolve").forEach((btn) => {
    btn.addEventListener("click", () => {
      const marketId = btn.getAttribute("data-market-id");
      const outcome = btn.getAttribute("data-outcome");
      if (!marketId || !outcome) return;

      const confirmed = confirm(
        `Resolve this market as ${outcome}? This will settle all positions.`
      );
      if (!confirmed) return;

      resolveMarket(marketId, outcome);
    });
  });
}

// ------- Trade Modal -------

function setupTradeModal() {
  const modal = document.getElementById("tradeModal");
  if (!modal) return;

  const overlay = modal.querySelector(".modal-overlay");
  const closeBtn = modal.querySelector(".modal-close");
  const yesBtn = modal.querySelector("#tradeYesBtn");
  const noBtn = modal.querySelector("#tradeNoBtn");
  const amountInput = modal.querySelector("#tradeAmount");
  const submitBtn = modal.querySelector("#tradeSubmit");

  function close() {
    modal.classList.remove("active");
    activeTradeMarketId = null;
  }

  if (overlay) overlay.addEventListener("click", close);
  if (closeBtn) {
    closeBtn.addEventListener("click", close);
  }
  // footer cancel buttons share the .modal-close class as well
  modal.querySelectorAll(".modal-close").forEach((btn) => {
    btn.addEventListener("click", close);
  });

  if (yesBtn) {
    yesBtn.addEventListener("click", () => {
      activeTradeSide = "YES";
      yesBtn.classList.add("active");
      if (noBtn) noBtn.classList.remove("active");
      updateTradePreview();
    });
  }

  if (noBtn) {
    noBtn.addEventListener("click", () => {
      activeTradeSide = "NO";
      noBtn.classList.add("active");
      if (yesBtn) yesBtn.classList.remove("active");
      updateTradePreview();
    });
  }

  if (amountInput) {
    amountInput.addEventListener("input", updateTradePreview);
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", (e) => {
      e.preventDefault();
      executeTrade();
    });
  }
}

function openTradeModal(marketId) {
  const modal = document.getElementById("tradeModal");
  if (!modal) return;

  const titleEl = modal.querySelector("#tradeMarketTitle");
  const priceEl = modal.querySelector("#tradePriceInfo");
  const amountInput = modal.querySelector("#tradeAmount");
  const yesBtn = modal.querySelector("#tradeYesBtn");
  const noBtn = modal.querySelector("#tradeNoBtn");

  const market = state.markets.find((m) => m.id === marketId);
  if (!market) return;

  activeTradeMarketId = marketId;
  activeTradeSide = "YES";

  if (titleEl) titleEl.textContent = market.question;

  const yesPrice = getHybridYesPrice(market);
  const noPrice = 1 - yesPrice;
  if (priceEl) {
    priceEl.textContent = `Current price · YES: ${yesPrice.toFixed(
      2
    )} HBD · NO: ${noPrice.toFixed(2)} HBD`;
  }

  if (amountInput) {
    amountInput.value = "";
  }

  if (yesBtn && noBtn) {
    yesBtn.classList.add("active");
    noBtn.classList.remove("active");
  }

  updateTradePreview();
  modal.classList.add("active");
}

function updateTradePreview() {
  const modal = document.getElementById("tradeModal");
  if (!modal || !activeTradeMarketId) return;

  const amountInput = modal.querySelector("#tradeAmount");
  const previewEl = modal.querySelector("#tradePreview");
  const market = state.markets.find((m) => m.id === activeTradeMarketId);
  if (!market || !amountInput || !previewEl) return;

  const raw = parseFloat(amountInput.value);
  if (!raw || raw <= 0) {
    previewEl.textContent =
      "Enter a stake to see estimated shares and payout. Trading fee: " +
      (state.fees.trade * 100).toFixed(1) +
      "%.";
    return;
  }

  const fee = raw * state.fees.trade;
  const stake = raw - fee;

  const yesPrice = getHybridYesPrice(market);
  const noPrice = 1 - yesPrice;

  const price = activeTradeSide === "YES" ? yesPrice : noPrice;
  const shares = stake / price;
  const potentialPayout = shares; // each share pays 1 HBD if side wins

  previewEl.textContent = `You will spend ${raw.toFixed(
    2
  )} HBD (fee: ${fee.toFixed(
    2
  )}). Estimated ${shares.toFixed(
    2
  )} ${activeTradeSide} shares · Max payout ${potentialPayout.toFixed(
    2
  )} HBD if your side wins.`;
}

function executeTrade() {
  if (!currentAccount) {
    alert("Connect your wallet before trading.");
    return;
  }

  const modal = document.getElementById("tradeModal");
  if (!modal || !activeTradeMarketId) return;

  const amountInput = modal.querySelector("#tradeAmount");
  if (!amountInput) return;

  const raw = parseFloat(amountInput.value);
  if (!raw || raw <= 0) {
    alert("Enter a valid stake amount.");
    return;
  }

  const user = state.users[currentAccount];
  if (!user) return;

  if (raw > user.balance + 1e-8) {
    alert("Insufficient demo balance for this trade.");
    return;
  }

  const market = state.markets.find((m) => m.id === activeTradeMarketId);
  if (!market || market.resolved) {
    alert("This market is not open for trading.");
    return;
  }

  const fee = raw * state.fees.trade;
  const stake = raw - fee;

  const yesPriceBefore = getHybridYesPrice(market);
  const noPriceBefore = 1 - yesPriceBefore;
  const price = activeTradeSide === "YES" ? yesPriceBefore : noPriceBefore;
  const shares = stake / price;

  // Deduct from user and allocate fee to LP pool
  user.balance -= raw;
  state.lpPool.totalLiquidity += fee;
  state.lpPool.totalShares += fee; // simple 1:1 mapping for demo

  // Update user position
  if (!user.positions) user.positions = {};
  if (!user.positions[market.id]) {
    user.positions[market.id] = {
      yesShares: 0,
      noShares: 0,
      yesStake: 0,
      noStake: 0
    };
  }

  const pos = user.positions[market.id];

  if (activeTradeSide === "YES") {
    pos.yesShares += shares;
    pos.yesStake += stake;
    market.amm.qYes += stake;
    market.crowdVolume.yes += stake;
  } else {
    pos.noShares += shares;
    pos.noStake += stake;
    market.amm.qNo += stake;
    market.crowdVolume.no += stake;
  }

  market.lastPrice = yesPriceBefore;

  saveState();
  renderAll();

  alert(
    `Trade executed: bought ${shares.toFixed(
      2
    )} ${activeTradeSide} shares in "${market.question}".`
  );

  modal.classList.remove("active");
  activeTradeMarketId = null;
}

// ------- Market resolution & payouts -------

function resolveMarket(marketId, outcome) {
  const market = state.markets.find((m) => m.id === marketId);
  if (!market || market.resolved) return;

  market.resolved = true;
  market.outcome = outcome === "YES" ? "YES" : "NO";

  let totalPayout = 0;

  Object.keys(state.users).forEach((addr) => {
    const user = state.users[addr];
    const pos = user.positions && user.positions[marketId];
    if (!pos) return;

    let payout = 0;

    if (market.outcome === "YES") {
      payout = pos.yesShares; // each share pays 1 HBD
    } else if (market.outcome === "NO") {
      payout = pos.noShares;
    }

    if (payout > 0) {
      user.balance += payout;
      totalPayout += payout;
    }

    // Close position for this market
    pos.yesShares = 0;
    pos.noShares = 0;
    pos.yesStake = 0;
    pos.noStake = 0;
  });

  // Simple LP pool accounting: pool funds part of payouts for the demo
  state.lpPool.totalLiquidity = Math.max(
    0,
    state.lpPool.totalLiquidity - totalPayout * 0.5
  );

  saveState();
  renderAll();
  alert(
    `Market "${market.question}" resolved as ${market.outcome}. Total payouts: ${totalPayout.toFixed(
      2
    )} HBD.`
  );
}

// ------- Create Market & LP forms -------

function setupCreateMarketForm() {
  const form = document.getElementById("createMarketForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const questionInput = document.getElementById("createQuestion");
    const categoryInput = document.getElementById("createCategory");
    const dateInput = document.getElementById("createResolutionDate");
    const probInput = document.getElementById("createInitialProb");

    const question = questionInput.value.trim();
    const category = categoryInput.value.trim() || "Custom";
    const resolutionDate = dateInput.value || "TBD";
    let initialProb = parseFloat(probInput.value);

    if (!question) {
      alert("Please enter a market question.");
      return;
    }

    if (isNaN(initialProb) || initialProb <= 0 || initialProb >= 100) {
      initialProb = 50;
    }

    const yesPrice = initialProb / 100;
    const market = {
      id: "m" + Date.now(),
      question,
      category,
      resolutionDate,
      liquidity: 1000,
      amm: { b: 80, qYes: yesPrice * 100, qNo: (1 - yesPrice) * 100 },
      crowdVolume: { yes: 0, no: 0 },
      lastPrice: yesPrice,
      resolved: false,
      outcome: null
    };

    state.markets.push(market);
    saveState();
    renderMarkets();
    renderAdmin();

    form.reset();
    alert("New market created.");
  });
}

function setupLpForms() {
  const depositForm = document.getElementById("lpDepositForm");
  const withdrawBtn = document.getElementById("lpWithdrawBtn");

  if (depositForm) {
    depositForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!currentAccount) {
        alert("Connect your wallet before providing liquidity.");
        return;
      }

      const amountInput = document.getElementById("lpAmount");
      const raw = parseFloat(amountInput.value);
      if (!raw || raw <= 0) {
        alert("Enter a valid amount.");
        return;
      }

      const user = state.users[currentAccount];
      if (!user || raw > user.balance + 1e-8) {
        alert("Insufficient balance.");
        return;
      }

      user.balance -= raw;

      const sharesToMint =
        state.lpPool.totalShares === 0 || state.lpPool.totalLiquidity === 0
          ? raw
          : (raw / state.lpPool.totalLiquidity) * state.lpPool.totalShares;

      state.lpPool.totalLiquidity += raw;
      state.lpPool.totalShares += sharesToMint;

      user.lpShares = (user.lpShares || 0) + sharesToMint;

      saveState();
      renderLp();
      renderPortfolio();
      alert(
        `Added ${raw.toFixed(
          2
        )} HBD to the LP pool and received ${sharesToMint.toFixed(
          2
        )} LP shares.`
      );

      amountInput.value = "";
    });
  }

  if (withdrawBtn) {
    withdrawBtn.addEventListener("click", () => {
      if (!currentAccount) {
        alert("Connect your wallet first.");
        return;
      }

      const user = state.users[currentAccount];
      const userShares = user.lpShares || 0;
      if (userShares <= 0) {
        alert("You do not have any LP shares to withdraw.");
        return;
      }

      if (state.lpPool.totalShares <= 0 || state.lpPool.totalLiquidity <= 0) {
        alert("LP pool is empty.");
        return;
      }

      const shareFraction = userShares / state.lpPool.totalShares;
      const amountOut = shareFraction * state.lpPool.totalLiquidity;

      state.lpPool.totalLiquidity -= amountOut;
      state.lpPool.totalShares -= userShares;
      user.lpShares = 0;
      user.balance += amountOut;

      saveState();
      renderLp();
      renderPortfolio();

      alert(
        `Withdrew ${amountOut.toFixed(
          2
        )} HBD from the LP pool and burned your LP shares.`
      );
    });
  }
}
