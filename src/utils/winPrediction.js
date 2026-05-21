// 胜率预测算法工具
// 设计：
// 1. 用人均（而非求和）特征消除阵容人数偏差
// 2. 用 z-score 标准化对齐不同量纲
// 3. 用 sigmoid 映射避免负数破坏百分比
// 4. 对小样本胜率做贝叶斯收缩
// 5. 用 Elo 利用历史 lineup 结果作为第二信号
// 6. 最终胜率 = α × 技术统计模型 + (1-α) × Elo 模型

export const DEFAULT_WEIGHTS = {
  avgPoints: 0.47,      // 场均得分（不除时长，避免低出场球员被噪声抬高）
  avgPlusMinus: 0.36,   // 场均正负值
  foulsPerMin: 0.18,    // 犯规仍按每分钟（反映"鲁莽程度"与上场时长无关）
  avgPlayTime: 0.23,    // 场均分钟：体现体力 + 队长用脚投票的能力评估
};

export const DEFAULT_OPTS = {
  alpha: 0.5,        // 技术统计模型权重，剩余给 Elo
  scale: 2.0,        // 技术统计差异 -> 胜率 的 sigmoid 温度
  eloInitial: 1500,
  eloK: 24,
  bayesPrior: 0.5,   // 胜率先验：均值 50%
  bayesStrength: 5,  // 先验等效场次
  mpgFloor: 5,       // MPG 权重下限（避免 0 分钟球员被完全忽略）
  mpgCap: 30,        // MPG 权重上限（避免主力独大）
  powerConfFullMin: 100, // 战力值置信度满分线（总分钟数）
  powerScale: 1.1,   // 战力值 sigmoid 温度
};

// 战力值三层权重：技术统计 / Elo / 胜率
export const POWER_WEIGHTS = {
  box: 0.40,
  elo: 0.40,
  winRate: 0.14,    // 0.20 × 0.70
};

export function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// 加权平均：weights 与 values 等长；权重全 0 时退化为算术均值
export function weightedMean(values, weights) {
  if (values.length === 0) return 0;
  let sumW = 0, sumWV = 0;
  for (let i = 0; i < values.length; i++) {
    const w = weights[i] ?? 1;
    sumW += w;
    sumWV += w * values[i];
  }
  if (sumW === 0) return mean(values);
  return sumWV / sumW;
}

// 球员 MPG 权重：[floor, cap] 截断后作为团队加权平均权重
export function mpgWeight(player, opts = {}) {
  const floor = opts.floor ?? DEFAULT_OPTS.mpgFloor;
  const cap   = opts.cap   ?? DEFAULT_OPTS.mpgCap;
  const mpg = player.avgPlayTime ?? 0;
  return Math.max(floor, Math.min(mpg, cap));
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

  const fields = ['avgPoints', 'avgPlusMinus', 'pointsPerMin', 'plusMinusPerMin', 'foulsPerMin', 'adjustedWinRate', 'avgPlayTime'];
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
// 得分和正负值用场均（avgPoints / avgPlusMinus）—— 反映"这场打成什么样"，不被低出场噪声放大
// 犯规仍用每分钟 —— "鲁莽程度"与上场时长无关，按率比较公平
export function playerBoxRating(player, leagueStats, weights = DEFAULT_WEIGHTS) {
  const wP  = weights.avgPoints    ?? 0;
  const wPM = weights.avgPlusMinus ?? 0;
  const wF  = weights.foulsPerMin  ?? 0;
  const wM  = weights.avgPlayTime  ?? 0;

  const zP  = leagueStats.avgPoints
    ? zScore(player.avgPoints ?? 0, leagueStats.avgPoints.mean, leagueStats.avgPoints.std)
    : 0;
  const zPM = leagueStats.avgPlusMinus
    ? zScore(player.avgPlusMinus ?? 0, leagueStats.avgPlusMinus.mean, leagueStats.avgPlusMinus.std)
    : 0;
  const zF  = zScore(player.foulsPerMin, leagueStats.foulsPerMin.mean, leagueStats.foulsPerMin.std);
  const zM  = leagueStats.avgPlayTime
    ? zScore(player.avgPlayTime ?? 0, leagueStats.avgPlayTime.mean, leagueStats.avgPlayTime.std)
    : 0;

  return wP * zP + wPM * zPM - wF * zF + wM * zM;
}

// 团队评分：按 MPG 加权平均，让常打的人权重更高（兼顾样本可信度与"上场预期"）
export function teamBoxRating(players, leagueStats, weights = DEFAULT_WEIGHTS) {
  if (players.length === 0) return 0;
  const ratings = players.map(p => playerBoxRating(p, leagueStats, weights));
  const w = players.map(p => mpgWeight(p));
  return weightedMean(ratings, w);
}

export function teamEloRating(players, eloRatings, initial = DEFAULT_OPTS.eloInitial) {
  if (players.length === 0) return initial;
  const elos = players.map(p => eloRatings.get(p.name) ?? initial);
  const w = players.map(p => mpgWeight(p));
  return weightedMean(elos, w);
}

// 球队进攻 / 被进攻效率（每分钟）
// 假设场上 onCourt 人。avg(pointsPerMin)×N = 球队每分钟得分；
// plusMinusPerMin 本身就是"球员在场时球队净胜分/分钟"，平均后即球队每分钟净胜分。
// 采用 MPG 加权平均，使预测的"团队每分钟产出"与团队评分口径一致。
export function teamRates(players, onCourt = 5) {
  if (players.length === 0) return { offense: 0, defenseAllowed: 0 };
  const w = players.map(p => mpgWeight(p));
  const avgPts = weightedMean(players.map(p => p.pointsPerMin), w);
  const avgPM  = weightedMean(players.map(p => p.plusMinusPerMin), w);
  const offense = onCourt * avgPts;
  const defenseAllowed = Math.max(0.1, offense - avgPM);
  return { offense: Math.max(0.1, offense), defenseAllowed };
}

// 单球员战力值 0-100
// 公式：技术统计 + Elo 偏移 + 胜率偏移 三层加权 → 总分钟数置信度收缩 → sigmoid 映射
// 设计：50 = 联盟平均；新人数据被收缩到 50 附近，老球员可拉开差距；与预测模型同源
export function playerPowerRating(player, leagueStats, eloRatings, opts = {}) {
  const initial = opts.initial ?? DEFAULT_OPTS.eloInitial;
  const scale   = opts.powerScale ?? DEFAULT_OPTS.powerScale;
  const fullMin = opts.confFullMin ?? DEFAULT_OPTS.powerConfFullMin;
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const pw      = opts.powerWeights ?? POWER_WEIGHTS;

  const totalMin = player.totalMinutes ?? 0;
  const conf = Math.min(1, totalMin / fullMin);

  const boxZ = playerBoxRating(player, leagueStats, weights);
  const elo = (eloRatings && typeof eloRatings.get === 'function')
    ? (eloRatings.get(player.name) ?? initial)
    : initial;
  const eloDelta = (elo - initial) / 200; // 200 Elo ≈ 1 个"档次"

  // 胜率偏移：100%→+1, 50%→0, 0%→-1（adjustedWinRate 已贝叶斯收缩，新人 ≈ 0）
  const winRateOffset = ((player.adjustedWinRate ?? 0.5) - 0.5) * 2;

  const combined = (pw.box * boxZ + pw.elo * eloDelta + pw.winRate * winRateOffset) * conf;
  return Math.round(100 * sigmoid(scale * combined));
}

function normalSample() {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Poisson 采样（Knuth 算法 + 正态近似回退）
function poissonSample(lambda) {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normalSample()));
}

// Monte Carlo 得分模拟
// 规则：先到 target 分（默认 140 = 4 节 × 35）胜出；若 maxMinutes 内都未到，按当前比分判胜
export function simulateMatchup(red, black, opts = {}) {
  const target     = opts.target     ?? 140;
  const maxMinutes = opts.maxMinutes ?? 100;
  const trials     = opts.trials     ?? 2000;
  const onCourt    = opts.onCourt    ?? 5;

  const r = teamRates(red, onCourt);
  const b = teamRates(black, onCourt);
  // 红队每分钟期望得分 = 红队进攻 与 黑队被进攻 的均值（标准 pace-and-efficiency）
  const redRate   = (r.offense + b.defenseAllowed) / 2;
  const blackRate = (b.offense + r.defenseAllowed) / 2;

  let redWins = 0, blackWins = 0, ties = 0;
  let redReached = 0, blackReached = 0, timeUp = 0;
  let sumRed = 0, sumBlack = 0, sumMin = 0;
  let sample = null;

  for (let t = 0; t < trials; t++) {
    let redScore = 0, blackScore = 0, minute = 0;
    const traj = [{ minute: 0, red: 0, black: 0 }];
    let endedBy = 'time';
    while (minute < maxMinutes) {
      minute++;
      redScore   += poissonSample(redRate);
      blackScore += poissonSample(blackRate);
      traj.push({ minute, red: redScore, black: blackScore });
      if (redScore >= target || blackScore >= target) {
        endedBy = redScore >= target && blackScore >= target
          ? (redScore > blackScore ? 'red' : (blackScore > redScore ? 'black' : 'time'))
          : (redScore >= target ? 'red' : 'black');
        break;
      }
    }
    if (endedBy === 'red') redReached++;
    else if (endedBy === 'black') blackReached++;
    else timeUp++;

    if (redScore > blackScore) redWins++;
    else if (blackScore > redScore) blackWins++;
    else ties++;

    sumRed += redScore; sumBlack += blackScore; sumMin += minute;
    if (t === 0) sample = traj;
  }

  return {
    redWinPct:    redWins / trials,
    blackWinPct:  blackWins / trials,
    tiePct:       ties / trials,
    redReachedPct:   redReached / trials,
    blackReachedPct: blackReached / trials,
    timeUpPct:       timeUp / trials,
    expectedRedScore:   sumRed / trials,
    expectedBlackScore: sumBlack / trials,
    expectedMinutes:    sumMin / trials,
    rates: {
      red: redRate, black: blackRate,
      redOff: r.offense, redDef: r.defenseAllowed,
      blackOff: b.offense, blackDef: b.defenseAllowed,
    },
    sampleTrajectory: sample,
    config: { target, maxMinutes, trials },
  };
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
