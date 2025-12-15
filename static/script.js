// Hibrida – Hybrid Prediction Market Demo
// ---------------------------------------
// - MetaMask login + per-wallet demo balance in localStorage
// - Hybrid "crowdsourced + LP" pricing for YES/NO
// - Market creation, buy YES / buy NO, resolution and payouts
// - All logic is client-side only (for classroom demo)

/* ------------------------------------------------------------------ */
/* CONFIG & STATE                                                     */
/* ------------------------------------------------------------------ */

const INITIAL_DEMO_BALANCE = 100; // HBDA
const TRADING_FEE_RATE = 0.02; // 2% fee -> LP pool
const STORAGE_KEY_USERS = "hibrida_users_v1";
const STORAGE_KEY_MARKETS = "hibrida_markets_v1";
const STORAGE_KEY_POOL = "hibrida_lp_pool_v1";

const state = {
  account: null,
  users: {}, // address -> { address, balance, positions }
  markets: [],
  pool: {
    totalLiquidity: 2000, // global LP liquidity backing all markets
    feeRate: TRADING_FEE_RATE,
  },
};

/* ------------------------------------------------------------------ */
/* HELPERS: STORAGE                                                   */
/* ------------------------------------------------------------------ */

function loadState() {
  try {
    const usersRaw = localStorage.getItem(STORAGE_KEY_USERS);
    const marketsRaw = localStorage.getItem(STORAGE_KEY_MARKETS);
    const poolRaw = localStorage.getItem(STORAGE_KEY_POOL);

    state.users = usersRaw ? JSON.parse(usersRaw) : {};

    if (marketsRaw) {
      state.markets = JSON.parse(marketsRaw);
    } else {
      // Seed with a few demo markets
      state.markets = [
        {
          id: "m1",
          question: "Will ETH trade above $5,000 by 31 Dec 2025?",
          category: "Crypto",
          resolvesAt: "2025-12-31",
          status: "open",
          outcome: null,
          totalYes: 40,
          totalNo: 60,
          baseLiquidity: 300,
        },
        {
          id: "m2",
          question: "Will Spain's unemployment rate fall below 10% in 2026?",
          category: "Macro",
          resolvesAt: "2026-12-31",
          status: "open",
          outcome: null,
          totalYes: 55,
          totalNo: 45,
          baseLiquidity: 250,
        },
        {
          id: "m3",
          question: "Will Barcelona win La Liga this season?",
          category: "Sports",
          resolvesAt: "2025-06-01",
          status: "open",
          outcome: null,
          totalYes: 60,
          totalNo: 40,
          baseLiquidity: 220,
        },
      ];
    }

    if (poolRaw) {
      state.pool = JSON.parse(poolRaw);
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(state.users));
  localStorage.setItem(STORAGE_KEY_MARKETS, JSON.stringify(state.markets));
  localStorage.setItem(STORAGE_KEY_POOL, JSON.stringify(state.pool));
}

/* ------------------------------------------------------------------ */
/* HELPERS: PRICING (HYBRID ENGINE)                                   */
/* ------------------------------------------------------------------ */

// Simple hybrid pricing:
// - Crowd component: totalYes / (totalYes + totalNo)
// - LP component: baseLiquidity gives a gravity toward 50/50
// - Combined into YES price, then NO = 1 - YES
function getMarketPrices(market) {
  const yes = market.totalYes;
  const no = market.totalNo;
  const base = market.baseLiquidity || 1;

  const traded = yes + no;
  const crowdProb = traded > 0 ? yes / traded : 0.5;

  // LP component: symmetric 50/50 anchored by base liquidity
  const lpWeight = base;
  const crowdWeight = traded || 1;

  const combined =
    (crowdProb * crowdWeight + 0.5 * lpWeight) / (crowdWeight + lpWeight);

  const priceYes = Math.min(Math.max(combined, 0.05), 0.95);
  const priceNo = 1 - priceYes;

  return {
    yes: priceYes,
    no: priceNo,
  };
}

/* ------------------------------------------------------------------ */
/* HELPERS: UI UTILITIES                                              */
/* ------------------------------------------------------------------ */

function $(selector) {
  return document.querySelector(selector);
}

function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function formatPct(x) {
  return (x * 100).toFixed(1) + "%";
}

function formatAmount(x) {
  return Number(x).toFixed(2);
}

/* ------------------------------------------------------------------ */
/* USER & ACCOUNT MANAGEMENT                                          */
/* ------------------------------------------------------------------ */

function getOrCreateUser(address) {
  if (!state.users[address]) {
    state.users[address] = {
      address,
      balance: INITIAL_DEMO_BALANCE,
      positions: {}, // marketId -> { yes, no, settled }
    };
  }
  return state.users[address];
}

function updateBalanceDisplay() {
  const el = $("#demoBalance");
  if (!el) return;
  if (!state.account) {
    el.textContent = "–";
    return;
  }
  const user = state.users[state.account];
  el.textContent = user ? formatAmount(user.balance) : "0.00";
}

/* ------------------------------------------------------------------ */
/* RENDER: MARKETS, PORTFOLIO, LP                                     */
/* ------------------------------------------------------------------ */

function render() {
  renderMarkets();
  renderPortfolio();
  renderLP();
  updateBalanceDisplay();
}

function renderMarkets() {
  const container = $("#marketsContainer");
  if (!container) return;

  container.innerHTML = "";

  state.markets.forEach((mkt) => {
    const prices = getMarketPrices(mkt);
    const yesPct = formatPct(prices.yes);

    const resolvedBadge =
      mkt.status === "resolved"
        ? `<div class="badge-resolved">Resolved: ${
            mkt.outcome === "yes" ? "YES" : "NO"
          }</div>`
        : "";

    const disabledAttr = mkt.status === "resolved" ? "disabled" : "";
    const cardClasses = ["card"];
    if (mkt.status === "resolved") cardClasses.push("resolved");

    const html = `
      <article class="${cardClasses.join(" ")}" data-market-id="${mkt.id}">
        ${resolvedBadge}
        <div class="card-header">
          <div>
            <h3 class="card-title">${mkt.question}</h3>
          </div>
          <span class="card-tag">${mkt.category}</span>
        </div>

        <div class="card-meta">
          <span class="card-meta-pill">Resolves: ${mkt.resolvesAt}</span>
          <span class="card-meta-pill">Liquidity: ${formatAmount(
            mkt.baseLiquidity
          )} HBDA</span>
          <span class="card-meta-pill">Volume: ${formatAmount(
            mkt.totalYes + mkt.totalNo
          )} shares</span>
        </div>

        <div class="card-body">
          <div class="prob-box">
            <div class="prob-label">Implied probability (YES)</div>
            <div class="prob-main">
              <span class="prob-value">${yesPct}</span>
              <span class="prob-sub">NO: ${formatPct(prices.no)}</span>
            </div>
            <div class="prob-sub">
              Hybrid signal = crowd positions + LP-anchored AMM
            </div>
            <div class="prob-bar">
              <div class="prob-bar-fill" style="width: ${prices.yes * 100}%;"></div>
            </div>
          </div>

          <div class="trade-box">
            <div class="trade-label">Trade ticket</div>
            <div class="trade-toggle">
              <button type="button"
                class="trade-side-btn active"
                data-side="yes"
              >YES</button>
              <button type="button"
                class="trade-side-btn"
                data-side="no"
              >NO</button>
            </div>

            <div class="trade-input-row">
              <input type="number"
                min="1"
                step="1"
                placeholder="Stake in HBDA"
                class="trade-amount-input"
                ${disabledAttr}
              />
            </div>

            <div class="trade-hint">
              <span>Price YES: ${formatAmount(prices.yes)}</span>
              <span>Fee: ${(TRADING_FEE_RATE * 100).toFixed(1)}%</span>
            </div>

            <div class="trade-actions">
              <button class="btn btn-primary btn-xs trade-submit-btn"
                ${disabledAttr}
              >
                Buy <span class="trade-side-label">YES</span>
              </button>

              <button class="btn btn-secondary btn-xs resolve-btn"
                ${
                  mkt.status === "resolved" ? "disabled" : ""
                } title="Demo: resolve market manually">
                Resolve (oracle)
              </button>
            </div>
          </div>
        </div>
      </article>
    `;

    container.insertAdjacentHTML("beforeend", html);
  });
}

function renderPortfolio() {
  const container = $("#portfolioContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!state.account) {
    container.innerHTML =
      '<div class="panel"><p class="section-subtitle">Connect MetaMask to view positions.</p></div>';
    return;
  }

  const user = state.users[state.account];
  const positions = user.positions || {};

  const marketIds = Object.keys(positions);
  if (marketIds.length === 0) {
    container.innerHTML =
      '<div class="panel"><p class="section-subtitle">No positions yet. Trade a market to see it here.</p></div>';
    return;
  }

  marketIds.forEach((id) => {
    const pos = positions[id];
    const mkt = state.markets.find((m) => m.id === id);
    if (!mkt) return;

    const prices = getMarketPrices(mkt);
    const totalYes = pos.yes || 0;
    const totalNo = pos.no || 0;

    const isResolved = mkt.status === "resolved";
    const outcomeLabel =
      mkt.status === "resolved"
        ? `Resolved: ${mkt.outcome === "yes" ? "YES" : "NO"}`
        : "Open";

    const canClaim =
      isResolved && !pos.settled && (totalYes > 0 || totalNo > 0);

    const cardHtml = `
      <article class="card" data-portfolio-market-id="${mkt.id}">
        <div class="card-header">
          <div>
            <h3 class="card-title">${mkt.question}</h3>
            <div class="card-meta" style="margin-top:0.35rem;">
              <span class="card-meta-pill">${outcomeLabel}</span>
              <span class="card-meta-pill">YES: ${totalYes.toFixed(
                2
              )} | NO: ${totalNo.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div class="card-body">
          <div class="prob-box">
            <div class="prob-label">Current hybrid price</div>
            <div class="prob-main">
              <span class="prob-value">${formatPct(prices.yes)}</span>
              <span class="prob-sub">YES share value at resolution: 1 HBDA</span>
            </div>
            <div class="prob-bar">
              <div class="prob-bar-fill" style="width:${prices.yes * 100}%"></div>
            </div>
          </div>

          <div class="trade-box">
            <div class="trade-label">Position summary</div>
            <div class="position-row">
              <span>YES shares</span>
              <strong>${totalYes.toFixed(2)}</strong>
            </div>
            <div class="position-row">
              <span>NO shares</span>
              <strong>${totalNo.toFixed(2)}</strong>
            </div>
            <div class="position-row">
              <span>Status</span>
              <strong>${pos.settled ? "Settled" : outcomeLabel}</strong>
            </div>

            <div class="trade-actions" style="margin-top:0.6rem;">
              <button
                class="btn btn-primary btn-xs claim-btn"
                ${canClaim ? "" : "disabled"}
              >
                Claim payout
              </button>
            </div>
          </div>
        </div>
      </article>
    `;

    container.insertAdjacentHTML("beforeend", cardHtml);
  });
}

function renderLP() {
  const total = state.pool.totalLiquidity;
  const feeRate = state.pool.feeRate;
  const totalEl = $("#lpTotalLiquidity");
  const feeEl = $("#lpFeeRate");

  if (totalEl) totalEl.textContent = `${formatAmount(total)} HBDA`;
  if (feeEl) feeEl.textContent = `${(feeRate * 100).toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */
/* TRADING, MARKET CREATION & RESOLUTION                              */
/* ------------------------------------------------------------------ */

function requireConnectedAccount() {
  if (!state.account) {
    toast("Please connect MetaMask first.");
    return null;
  }
  return state.account;
}

function handleTrade(marketId, side, stakeRaw) {
  const account = requireConnectedAccount();
  if (!account) return;

  const stake = Number(stakeRaw);
  if (!Number.isFinite(stake) || stake <= 0) {
    toast("Enter a positive stake amount.");
    return;
  }

  const user = getOrCreateUser(account);
  if (user.balance < stake) {
    toast("Insufficient demo balance.");
    return;
  }

  const market = state.markets.find((m) => m.id === marketId);
  if (!market || market.status !== "open") {
    toast("Market is not open for trading.");
    return;
  }

  const prices = getMarketPrices(market);
  const price = side === "yes" ? prices.yes : prices.no;

  // Fee taken from stake
  const fee = stake * TRADING_FEE_RATE;
  const netStake = stake - fee;

  // Shares purchased = netStake / price
  const shares = netStake / price;

  // Update user balance
  user.balance -= stake;

  // Update user position
  if (!user.positions[marketId]) {
    user.positions[marketId] = { yes: 0, no: 0, settled: false };
  }
  user.positions[marketId][side] += shares;
  user.positions[marketId].settled = false;

  // Update market crowd totals
  if (side === "yes") {
    market.totalYes += shares;
  } else {
    market.totalNo += shares;
  }

  // Fees flow into global LP pool
  state.pool.totalLiquidity += fee;

  persistState();
  render();
  toast(
    `Bought ${shares.toFixed(2)} ${side.toUpperCase()} shares for ${formatAmount(
      stake
    )} HBDA (incl. fees).`
  );
}

function handleResolveMarket(marketId) {
  const market = state.markets.find((m) => m.id === marketId);
  if (!market || market.status === "resolved") return;

  const outcome = prompt(
    `Resolve market:\n"${market.question}"\n\nType "yes" or "no" as the winning outcome:`
  );
  if (!outcome) return;

  const normalized = outcome.trim().toLowerCase();
  if (normalized !== "yes" && normalized !== "no") {
    toast('Outcome must be "yes" or "no".');
    return;
  }

  market.status = "resolved";
  market.outcome = normalized;

  persistState();
  render();
  toast(`Market resolved. Winning outcome: ${normalized.toUpperCase()}.`);
}

// Payout: handle only for connected user (demo)
function handleClaimPayout(marketId) {
  const account = requireConnectedAccount();
  if (!account) return;

  const user = getOrCreateUser(account);
  const pos = user.positions[marketId];
  if (!pos || pos.settled) {
    toast("No unsettled position to claim.");
    return;
  }

  const market = state.markets.find((m) => m.id === marketId);
  if (!market || market.status !== "resolved") {
    toast("Market is not resolved yet.");
    return;
  }

  const winningShares =
    market.outcome === "yes" ? pos.yes || 0 : pos.no || 0;

  if (winningShares <= 0) {
    pos.settled = true;
    persistState();
    render();
    toast("No winning shares in this market. Position settled.");
    return;
  }

  const payout = winningShares * 1; // 1 HBDA per winning share
  user.balance += payout;

  // Zero out the paid side
  if (market.outcome === "yes") {
    pos.yes = 0;
  } else {
    pos.no = 0;
  }
  pos.settled = true;

  // LP pool pays out from its liquidity
  state.pool.totalLiquidity = Math.max(
    0,
    state.pool.totalLiquidity - payout
  );

  persistState();
  render();
  toast(`Payout claimed: ${formatAmount(payout)} HBDA.`);
}

function handleCreateMarket(event) {
  event.preventDefault();

  const account = requireConnectedAccount();
  if (!account) return;

  const question = $("#marketQuestion").value.trim();
  const category = $("#marketCategory").value.trim() || "Other";
  const resolvesAt = $("#marketResolveDate").value;
  const liquidity = Number($("#marketLiquidity").value);

  if (!question || !resolvesAt || !Number.isFinite(liquidity) || liquidity <= 0) {
    toast("Please fill in all fields with valid values.");
    return;
  }

  const id = "m" + Date.now().toString(36);

  const market = {
    id,
    question,
    category,
    resolvesAt,
    status: "open",
    outcome: null,
    totalYes: 0,
    totalNo: 0,
    baseLiquidity: liquidity,
  };

  state.markets.unshift(market);
  state.pool.totalLiquidity += liquidity; // treat as protocol-seeded

  $("#createMarketForm").reset();
  persistState();
  render();
  toast("Market created successfully.");
}

/* ------------------------------------------------------------------ */
/* NAVIGATION                                                         */
/* ------------------------------------------------------------------ */

function setupNavigation() {
  const links = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll(".section");

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = link.getAttribute("data-section");

      links.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      sections.forEach((s) => {
        s.classList.toggle("active", s.id === targetId);
      });
    });
  });
}

/* ------------------------------------------------------------------ */
/* METAMASK / WALLET CONNECTION                                      */
/* ------------------------------------------------------------------ */

async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    toast("MetaMask not detected. Please install MetaMask.");
    window.open("https://metamask.io/download/", "_blank");
    return;
  }

  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    const account = accounts[0];
    state.account = account;

    // Initialize user with demo balance if first time
    const user = getOrCreateUser(account);

    state.users[account] = user;
    persistState();

    const btn = $("#connectButton");
    if (btn) {
      btn.textContent = "Connected";
      btn.classList.add("connected");
    }

    updateBalanceDisplay();
    render();
    toast("Wallet connected. Demo balance loaded.");
  } catch (err) {
    console.error("MetaMask connection error:", err);
    if (err && err.code === 4001) {
      toast("Connection request rejected.");
    } else {
      toast("Failed to connect wallet.");
    }
  }
}

/* ------------------------------------------------------------------ */
/* EVENT WIRING                                                       */
/* ------------------------------------------------------------------ */

function setupEventHandlers() {
  const connectBtn = $("#connectButton");
  if (connectBtn) {
    connectBtn.addEventListener("click", connectWallet);
  }

  const createForm = $("#createMarketForm");
  if (createForm) {
    createForm.addEventListener("submit", handleCreateMarket);
  }

  // Delegate trade / resolve events in markets grid
  const marketsContainer = $("#marketsContainer");
  if (marketsContainer) {
    marketsContainer.addEventListener("click", (e) => {
      const card = e.target.closest("[data-market-id]");
      if (!card) return;
      const marketId = card.getAttribute("data-market-id");

      // Side toggle
      if (e.target.classList.contains("trade-side-btn")) {
        const sideBtns = card.querySelectorAll(".trade-side-btn");
        sideBtns.forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");

        const side = e.target.getAttribute("data-side");
        const label = card.querySelector(".trade-side-label");
        if (label) label.textContent = side.toUpperCase();
        return;
      }

      // Submit trade
      if (e.target.classList.contains("trade-submit-btn")) {
        const sideBtn = card.querySelector(".trade-side-btn.active");
        const side = sideBtn ? sideBtn.getAttribute("data-side") : "yes";
        const amountInput = card.querySelector(".trade-amount-input");
        const stake = amountInput ? amountInput.value : "0";
        handleTrade(marketId, side, stake);
        return;
      }

      // Resolve
      if (e.target.classList.contains("resolve-btn")) {
        handleResolveMarket(marketId);
        return;
      }
    });
  }

  // Delegate claim payout in portfolio
  const portfolioContainer = $("#portfolioContainer");
  if (portfolioContainer) {
    portfolioContainer.addEventListener("click", (e) => {
      if (!e.target.classList.contains("claim-btn")) return;
      const card = e.target.closest("[data-portfolio-market-id]");
      if (!card) return;
      const marketId = card.getAttribute("data-portfolio-market-id");
      handleClaimPayout(marketId);
    });
  }
}

/* ------------------------------------------------------------------ */
/* INIT                                                               */
/* ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  // Reset demo state on every page load
  localStorage.removeItem(STORAGE_KEY_USERS);
  localStorage.removeItem(STORAGE_KEY_MARKETS);
  localStorage.removeItem(STORAGE_KEY_POOL);

  loadState();
  setupNavigation();
  setupEventHandlers();
  render();
});

