/* rewards.js — the ONLY place that adds cash. Amounts are validated, capped and de-duplicated by key. */
(function (CT) {
  'use strict';

  var CONFIG = {
    levelBase: 100, levelPerId: 10,   // first completion: base + id * perId
    replayFactor: 0.4,                // replays pay less
    safeBonus: 60, fastBonus: 60, noLossBonus: 40,
    newStar: 80,
    chapterBonus: 20,                 // per chapter (harder levels pay more)
    maxSingle: 100000
  };
  var sessionKeys = {};

  function valid(n) { return typeof n === 'number' && isFinite(n) && n >= 0; }

  CT.Rewards = {
    CONFIG: CONFIG,

    /**
     * Grants `amount` once per `key`. persist=true remembers the key across restarts (missions, achievements);
     * persist=false remembers it for this session (one level attempt).
     */
    grant: function (key, amount, persist) {
      if (!key || !valid(amount)) return 0;
      amount = Math.min(CONFIG.maxSingle, Math.floor(amount));
      if (sessionKeys[key] || CT.Storage.hasRewardKey(key)) return 0;
      sessionKeys[key] = true;
      if (persist) CT.Storage.setRewardKey(key);
      if (amount > 0) CT.Storage._addCoins(amount);
      return amount;
    },

    /** Reward breakdown for a finished delivery. */
    levelBreakdown: function (level, r, save) {
      var C = CONFIG, lines = [];
      var base = C.levelBase + level.id * C.levelPerId + (level.chapter || 0) * C.chapterBonus;
      if (!save.firstTime) base = Math.round(base * C.replayFactor);
      lines.push({ label: save.firstTime ? 'Delivery' : 'Replay delivery', amount: base });
      if (r.safe) lines.push({ label: 'Safe driving bonus', amount: C.safeBonus });
      if (r.fast) lines.push({ label: 'Fast delivery bonus', amount: C.fastBonus });
      if (r.lost === 0) lines.push({ label: 'No cargo lost', amount: C.noLossBonus });
      if (save.newStars > 0) lines.push({ label: save.newStars + ' new star' + (save.newStars > 1 ? 's' : ''), amount: save.newStars * C.newStar });
      var total = lines.reduce(function (s, l) { return s + l.amount; }, 0);
      return { lines: lines, total: total };
    }
  };
})(window.CT);
