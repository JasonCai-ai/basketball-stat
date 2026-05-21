// 胜率预测算法工具
// 设计：
// 1. 用人均（而非求和）特征消除阵容人数偏差
// 2. 用 z-score 标准化对齐不同量纲
// 3. 用 sigmoid 映射避免负数破坏百分比
// 4. 对小样本胜率做贝叶斯收缩
// 5. 用 Elo 利用历史 lineup 结果作为第二信号
// 6. 最终胜率 = α × 技术统计模型 + (1-α) × Elo 模型

export const DEFAULT_WEIGHTS = {
  pointsPerMin: 0.4,
  plusMinusPerMin: 0.4,
  foulsPerMin: 0.2,
};

export const DEFAULT_OPTS = {
  alpha: 0.5,        // 技术统计模型权重，剩余给 Elo
  scale: 2.0,        // 技术统计差异 -> 胜率 的 sigmoid 温度
  eloInitial: 1500,
  eloK: 24,
  bayesPrior: 0.5,   // 胜率先验：均值 50%
  bayesStrength: 5,  // 先验等效场次
};

export function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function std(values, m) {
  if (values.length === 0) return 0;
  const mu = m ?? mean(values);
  const variance = mean(values.map(v => (v - mu) ** 2));
  return Math.sqrt(variance);
}

export function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

// z-score：std 为 0 时返回 0，避免 NaN
export function zScore(value, mu, sigma) {
  if (!sigma || sigma === 0) return 0;
  return (value - mu) / sigma;
}

// 贝叶斯收缩：把样本胜率往先验拉，场次越少拉得越多
// (wins + prior * strength) / (games + strength)
export function shrinkWinRate(wins, games, prior = DEFAULT_OPTS.bayesPrior, strength = DEFAULT_OPTS.bayesStrength) {
  return (wins + prior * strength) / (games + strength);
}

// 联盟统计：用于 z-score 标准化
// 优先用 minGames 及以上样本，不够时回退到全体
export function computeLeagueStats(players, minGames = 3) {
  const eligible = players.filter(p => p.gamesPlayed >= minGames);
  const sample = eligible.length >= 3 ? eligible : players;

  const fields = ['pointsPerMin', 'plusMinusPerMin', 'foulsPerMin', 'adjustedWinRate'];
  const stats = {};
  for (const f of fields) {
    const values = sample.map(p => p[f] ?? 0);
    const mu = mean(values);
    const sigma = std(values, mu);
    stats[f] = { mean: mu, std: sigma };
  }
  return stats;
}

// 跑一遍历史比赛，按时间顺序更新每个球员的 Elo
// gamesData: [{ date, data: { game: [{ players, teamScores }] } }]
// 返回 Map<playerName, eloRating>
export function computeEloRatings(gamesData, opts = {}) {
  const initial = opts.initial ?? DEFAULT_OPTS.eloInitial;
  const K = opts.K ?? DEFAULT_OPTS.eloK;
  const ratings = new Map();

  const getElo = (name) => {
    if (!ratings.has(name)) ratings.set(name, initial);
    return ratings.get(name);
  };

  for (const game of gamesData) {
    const gameInfo = game?.data?.game?.[0];
    if (!gameInfo) continue;
    const players = gameInfo.players || [];
    const teamScores = gameInfo.teamScores || {};
    const redScore = teamScores['红队'] ?? 0;
    const blackScore = teamScores['黑队'] ?? 0;
    if (redScore === blackScore) continue; // 平局对 Elo 无意义，跳过

    const active = players.filter(p => ((p.totalTime || 0) + (p.currentTime || 0)) > 0);
    const red = active.filter(p => p.team === '红队');
    const black = active.filter(p => p.team === '黑队');
    if (red.length === 0 || black.length === 0) continue;

    const redElo = mean(red.map(p => getElo(p.name)));
    const blackElo = mean(black.map(p => getElo(p.name)));

    const expectedRed = 1 / (1 + Math.pow(10, (blackElo - redElo) / 400));
    const actualRed = redScore > blackScore ? 1 : 0;
    const delta = K * (actualRed - expectedRed);

    for (const p of red) ratings.set(p.name, getElo(p.name) + delta);
    for (const p of black) ratings.set(p.name, getElo(p.name) - delta);
  }

  return ratings;
}

// 单球员技术统计能力评分（已 z-score 化的加权和）
export function playerBoxRating(player, leagueStats, weights = DEFAULT_WEIGHTS) {
  const zP  = zScore(player.pointsPerMin,     leagueStats.pointsPerMin.mean,     leagueStats.pointsPerMin.std);
  const zPM = zScore(player.plusMinusPerMin,  leagueStats.plusMinusPerMin.mean,  leagueStats.plusMinusPerMin.std);
  const zF  = zScore(player.foulsPerMin,      leagueStats.foulsPerMin.mean,      leagueStats.foulsPerMin.std);
  return weights.pointsPerMin * zP + weights.plusMinusPerMin * zPM - weights.foulsPerMin * zF;
}

// 团队评分：取人均，消除阵容人数偏差
export function teamBoxRating(players, leagueStats, weights = DEFAULT_WEIGHTS) {
  if (players.length === 0) return 0;
  return mean(players.map(p => playerBoxRating(p, leagueStats, weights)));
}

export function teamEloRating(players, eloRatings, initial = DEFAULT_OPTS.eloInitial) {
  if (players.length === 0) return initial;
  return mean(players.map(p => eloRatings.get(p.name) ?? initial));
}

// 综合胜率：技术统计 sigmoid + Elo 期望胜率，按 α 加权
export function combinedWinProbability(red, black, leagueStats, eloRatings, opts = {}) {
  const alpha   = opts.alpha   ?? DEFAULT_OPTS.alpha;
  const scale   = opts.scale   ?? DEFAULT_OPTS.scale;
  const initial = opts.initial ?? DEFAULT_OPTS.eloInitial;
  const weights = opts.weights ?? DEFAULT_WEIGHTS;

  const redBox   = teamBoxRating(red,   leagueStats, weights);
  const blackBox = teamBoxRating(black, leagueStats, weights);
  const pBox = sigmoid(scale * (redBox - blackBox));

  const redElo   = teamEloRating(red,   eloRatings, initial);
  const blackElo = teamEloRating(black, eloRatings, initial);
  const pElo = 1 / (1 + Math.pow(10, (blackElo - redElo) / 400));

  const pRed = alpha * pBox + (1 - alpha) * pElo;

  return {
    pRed,
    pBlack: 1 - pRed,
    breakdown: {
      box: { redRating: redBox, blackRating: blackBox, pRed: pBox },
      elo: { redElo, blackElo, pRed: pElo },
    },
  };
}
