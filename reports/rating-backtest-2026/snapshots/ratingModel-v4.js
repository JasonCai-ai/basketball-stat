import { DEFAULT_WEIGHTS, mean, std, sigmoid, shrinkWinRate } from './winPrediction.js';

// 候选模型：最近 8 次出场提供技术统计，全季提供可信度与战绩信息。
// 初版概率温度在开发段选择；整体强度收缩来自后续用户反馈，须标为回顾性对照。
export const RATING_CONFIG = Object.freeze({
  version: 'candidate-v4-recent',
  formGames: 8,
  strengthScale: 0.5, // 整体保留一半强度差，战力与胜率同时收缩；不按名次分档。
  boxWeight: 0.80,
  resultsWeight: 0.20,
  eloShare: 0.70,
  recentWeight: 0, // 技术统计已使用近期窗口，不重复叠加近期加成。
  rateShare: 0.50,
  boxFeatureWeights: Object.freeze({ ...DEFAULT_WEIGHTS }),
  priorMinutes: 150,
  priorGames: 3,
  recentHalfLifeDays: 60,
  eloK: 24,
  eloInitial: 1500,
  eloScaleFloor: 100,
  winRateScaleFloor: 0.15,
  boxScaleFloor: 0.35,
  probabilityScale: 2, // 沿用初版开发段标定，不重新放大温度抵消本轮强度收缩。
  powerScale: 1.1,
  powerCenter: 67, // 沿用显示等级刻度；中性强度对应 67，不参与预测。
});

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const daysBetween = (a, b) => Math.max(0, (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const minutesOf = p => Math.max(0, ((p.totalTime || 0) + (p.currentTime || 0)) / 60);
const average = (total, n) => n > 0 ? total / n : 0;
const logit = p => Math.log(p / (1 - p));

export function displayedPower(score, config = RATING_CONFIG) {
  return Math.round(100 * sigmoid(logit(config.powerCenter / 100) + config.powerScale * score));
}

// 标签边界随收缩比例和显示中心一并换算，避免沿用旧刻度的颜色含义。
export function ratingPowerType(value, config = RATING_CONFIG) {
  const boundary = old => Math.round(100 * sigmoid(logit(config.powerCenter / 100) + config.strengthScale * logit(old / 100)));
  if (value >= boundary(70)) return 'danger';
  if (value >= boundary(55)) return 'warning';
  if (value >= boundary(45)) return 'success';
  if (value >= boundary(30)) return 'info';
  return '';
}

// 保留现有页面统计口径（包括展示用四舍五入），模型另用精确分钟。
// 每个历史样本是一场独立比赛，不把同场阵容片段当作更多独立比赛。
export function summarizeRatingHistory(gamesData) {
  const byName = new Map();
  const games = [...gamesData].sort((a, b) => a.date.localeCompare(b.date));
  for (const { date, data } of games) {
    const game = data?.game?.[0];
    if (!game) continue;
    const diff = (game.teamScores?.['红队'] || 0) - (game.teamScores?.['黑队'] || 0);
    for (const player of game.players || []) {
      const minutes = minutesOf(player);
      if (minutes <= 0) continue;
      if (!byName.has(player.name)) byName.set(player.name, {
        name: player.name, numbers: new Set(), history: [],
        gamesPlayed: 0, totalPoints: 0, totalPlusMinus: 0, totalPlayTime: 0,
        totalFouls: 0, wins: 0, losses: 0, results: [],
      });
      const p = byName.get(player.name);
      p.numbers.add(player.number);
      p.gamesPlayed++;
      p.totalPoints += player.score || 0;
      p.totalPlusMinus += player.plusMinus || 0;
      p.totalPlayTime += (player.totalTime || 0) + (player.currentTime || 0);
      p.totalFouls += player.fouls || 0;
      if (diff !== 0) {
        const win = (diff > 0) === (player.team === '红队');
        p[win ? 'wins' : 'losses']++;
        p.results.push(win ? 'W' : 'L');
      }
      p.history.push({ date, minutes, points: player.score || 0, plusMinus: player.plusMinus || 0, fouls: player.fouls || 0 });
    }
  }
  const players = [...byName.values()].map(p => {
    const totalMinutes = p.totalPlayTime / 60;
    const recent = p.history.slice(-5);
    const totals = recent.reduce((a, g) => ({ points: a.points + g.points, plusMinus: a.plusMinus + g.plusMinus, minutes: a.minutes + g.minutes, fouls: a.fouls + g.fouls }), { points: 0, plusMinus: 0, minutes: 0, fouls: 0 });
    let streak = 0;
    for (let i = p.results.length - 1; i >= 0 && p.results[i] === p.results.at(-1); i--) streak++;
    if (p.results.at(-1) === 'L') streak = -streak;
    return {
      ...p,
      number: [...p.numbers].sort((a, b) => a - b).join(', '),
      totalMinutes,
      avgPoints: Number((p.totalPoints / p.gamesPlayed).toFixed(1)),
      avgPlusMinus: Number((p.totalPlusMinus / p.gamesPlayed).toFixed(1)),
      avgPlayTime: Math.round(p.totalPlayTime / p.gamesPlayed / 60),
      avgFouls: Number((p.totalFouls / p.gamesPlayed).toFixed(1)),
      winRate: Number((100 * p.wins / p.gamesPlayed).toFixed(1)),
      streak,
      pointsPerMin: average(p.totalPoints, totalMinutes),
      plusMinusPerMin: average(p.totalPlusMinus, totalMinutes),
      foulsPerMin: average(p.totalFouls, totalMinutes),
      adjustedWinRate: shrinkWinRate(p.wins, p.wins + p.losses),
      recentGamesCount: recent.length,
      recentAvgPoints: average(totals.points, recent.length),
      recentAvgPlusMinus: average(totals.plusMinus, recent.length),
      recentAvgPlayTime: average(totals.minutes, recent.length),
      recentFoulsPerMin: average(totals.fouls, totals.minutes),
    };
  }).sort((a, b) => b.totalPoints - a.totalPoints);
  return { players, games };
}

export function ratingConfidence(games, minutes, config = RATING_CONFIG) {
  return Math.min(average(games, games + config.priorGames), average(minutes, minutes + config.priorMinutes));
}

// 以当场历史更新 Elo 时使用实际参与时间；赛前预测绝不使用待预测比赛的时间。
// 每队合计增减 5*delta，双方总和为 0，不因替补人数多而凭空增加积分。
export function computeParticipationElo(gamesData, config = RATING_CONFIG) {
  const ratings = new Map();
  const get = name => ratings.get(name) ?? config.eloInitial;
  for (const { data } of [...gamesData].sort((a, b) => a.date.localeCompare(b.date))) {
    const game = data?.game?.[0];
    if (!game) continue;
    const sides = ['红队', '黑队'].map(side => (game.players || []).filter(p => p.team === side && minutesOf(p) > 0));
    if (sides.some(team => team.length === 0)) continue;
    const totals = sides.map(team => team.reduce((s, p) => s + minutesOf(p), 0));
    const elos = sides.map((team, i) => team.reduce((s, p) => s + get(p.name) * minutesOf(p) / totals[i], 0));
    const red = game.teamScores?.['红队'] || 0, black = game.teamScores?.['黑队'] || 0;
    const expected = 1 / (1 + 10 ** ((elos[1] - elos[0]) / 400));
    const actual = red === black ? 0.5 : red > black ? 1 : 0;
    const relativeMargin = 100 * Math.abs(red - black) / Math.max(1, red + black);
    const marginFactor = 1 + 0.25 * Math.min(1, relativeMargin / 10);
    const delta = config.eloK * marginFactor * (actual - expected);
    sides.forEach((team, i) => team.forEach(p => ratings.set(p.name, get(p.name) + (i === 0 ? 1 : -1) * delta * 5 * minutesOf(p) / totals[i])));
  }
  return ratings;
}

function distribution(values, floor) {
  return { mean: mean(values), std: Math.max(floor, std(values)) };
}

function normalized(value, distribution) {
  return clamp((value - distribution.mean) / distribution.std, -3, 3);
}

export function buildRatingModel(gamesData, options = {}) {
  const config = { ...RATING_CONFIG, ...options };
  if (!Number.isFinite(config.strengthScale) || config.strengthScale < 0 || config.strengthScale > 1) throw new Error('强度差保留比例须为 0 到 1');
  if (!Number.isFinite(config.powerCenter) || config.powerCenter <= 0 || config.powerCenter >= 100) throw new Error('显示中心须介于 0 与 100 之间');
  if (config.formGames !== null && (!Number.isInteger(config.formGames) || config.formGames < 1)) throw new Error('近期窗口须为正整数或 null');
  const asOf = options.asOf ?? [...gamesData].map(g => g.date).sort().at(-1) ?? '1970-01-01';
  // 调用方仍须仅传训练期比赛；此过滤额外防止误传未来日期。
  const { players, games } = summarizeRatingHistory(gamesData.filter(g => g.date <= asOf));
  const eligible = players.filter(p => p.gamesPlayed >= 3);
  const reference = eligible.length >= 3 ? eligible : players;
  const totalMinutes = players.reduce((s, p) => s + p.totalMinutes, 0);
  const leagueRate = average(players.reduce((s, p) => s + p.totalPoints, 0), totalMinutes);
  const leagueFoulRate = average(players.reduce((s, p) => s + p.totalFouls, 0), totalMinutes);
  const expectedMinutes = mean(reference.map(p => p.totalMinutes / p.gamesPlayed)) || 30;
  const features = (p, recent = false) => {
    // 只替换技术统计的输入；外层 p 的全季场次、分钟和战绩不变。
    if (!recent && config.formGames !== null) {
      const rows = p.history.slice(-config.formGames);
      p = { ...p,
        totalPoints: rows.reduce((s, r) => s + r.points, 0),
        totalMinutes: rows.reduce((s, r) => s + r.minutes, 0),
        totalPlusMinus: rows.reduce((s, r) => s + r.plusMinus, 0),
        totalFouls: rows.reduce((s, r) => s + r.fouls, 0),
        gamesPlayed: rows.length,
      };
    }
    let points = p.totalPoints, minutes = p.totalMinutes, plusMinus = p.totalPlusMinus, fouls = p.totalFouls, count = p.gamesPlayed;
    let sumW2 = 0, latestWeight = 0;
    if (recent) {
      points = minutes = plusMinus = fouls = count = 0;
      for (const g of p.history) {
        const w = 2 ** (-daysBetween(asOf, g.date) / config.recentHalfLifeDays);
        points += g.points * w; minutes += g.minutes * w; plusMinus += g.plusMinus * w; fouls += g.fouls * w; count += w;
        sumW2 += w * w; latestWeight = Math.max(latestWeight, w);
      }
    }
    // 近期与长期使用同一收缩强度，避免仅因近期加权样本较少产生虚假的状态变化。
    const exposure = recent ? p.totalMinutes : minutes;
    return {
      points: average(points, count),
      rate: (average(points, minutes) * exposure + config.priorMinutes * leagueRate) / (exposure + config.priorMinutes),
      plusMinus: average(plusMinus, count),
      minutes: average(minutes, count),
      foulRate: (average(fouls, minutes) * exposure + config.priorMinutes * leagueFoulRate) / (exposure + config.priorMinutes),
      effectiveGames: sumW2 > 0 ? count * count / sumW2 : count,
      latestWeight,
    };
  };
  const vectors = new Map(players.map(p => [p.name, features(p)]));
  const floors = { points: 1, rate: 0.05, plusMinus: 1, minutes: 5, foulRate: 0.01 };
  const distributions = Object.fromEntries(Object.entries(floors).map(([field, floor]) => [field, distribution(reference.map(p => vectors.get(p.name)[field]), floor)]));
  const weights = config.boxFeatureWeights;
  const box = f => (
    weights.avgPoints * ((1 - config.rateShare) * normalized(f.points, distributions.points) + config.rateShare * normalized(f.rate, distributions.rate))
    + weights.avgPlusMinus * normalized(f.plusMinus, distributions.plusMinus)
    - weights.foulsPerMin * normalized(f.foulRate, distributions.foulRate)
    + weights.avgPlayTime * normalized(f.minutes, distributions.minutes)
  );
  const boxDistribution = distribution(reference.map(p => box(vectors.get(p.name))), config.boxScaleFloor);
  const eloRatings = computeParticipationElo(games, config);
  const eloDistribution = distribution(reference.map(p => eloRatings.get(p.name) ?? config.eloInitial), config.eloScaleFloor);
  const winDistribution = distribution(reference.map(p => p.adjustedWinRate), config.winRateScaleFloor);
  const byName = new Map();
  for (const p of players) {
    const confidence = ratingConfidence(p.gamesPlayed, p.totalMinutes, config);
    const boxRaw = box(vectors.get(p.name));
    const boxZ = normalized(boxRaw, boxDistribution);
    const resultZ = config.eloShare * normalized(eloRatings.get(p.name) ?? config.eloInitial, eloDistribution)
      + (1 - config.eloShare) * normalized(p.adjustedWinRate, winDistribution);
    let recentDelta = 0;
    if (config.recentWeight > 0) {
      const recent = features(p, true);
      const recentConfidence = recent.effectiveGames / (recent.effectiveGames + config.priorGames) * recent.latestWeight;
      recentDelta = clamp((box(recent) - boxRaw) / boxDistribution.std, -1, 1) * recentConfidence;
    }
    const technical = confidence * (config.boxWeight * boxZ + config.recentWeight * recentDelta);
    const results = confidence * config.resultsWeight * resultZ;
    const form = config.formGames === null ? p.history : p.history.slice(-config.formGames);
    const formMinutes = form.reduce((s, r) => s + r.minutes, 0);
    byName.set(p.name, { ...p, confidence, technical, results, score: technical + results, recentDelta,
      formGamesPlayed: form.length, formFirstDate: form[0].date, formLastDate: form.at(-1).date,
      formAvgPoints: average(form.reduce((s, r) => s + r.points, 0), form.length),
      formPointsPerMin: average(form.reduce((s, r) => s + r.points, 0), formMinutes),
      formPlusMinusPerMin: average(form.reduce((s, r) => s + r.plusMinus, 0), formMinutes),
      formFoulsPerMin: average(form.reduce((s, r) => s + r.fouls, 0), formMinutes),
      expectedMinutes: confidence * (p.totalMinutes / p.gamesPlayed) + (1 - confidence) * expectedMinutes });
  }
  // 令参考球员的平均潜在强度为 0；新人仍按中性强度处理。
  const center = average(reference.reduce((s, p) => s + byName.get(p.name).score, 0), reference.reduce((s, p) => s + byName.get(p.name).confidence, 0));
  for (const p of byName.values()) {
    p.technical -= p.confidence * center;
    p.unshrunkScore = p.technical + p.results;
    p.unshrunkPower = Math.round(100 * sigmoid(config.powerScale * p.unshrunkScore));
    p.technical *= config.strengthScale;
    p.results *= config.strengthScale;
    p.score = p.technical + p.results;
    p.powerRating = displayedPower(p.score, config);
  }
  return { config, asOf, byName, eloRatings, expectedMinutes, distributions, boxDistribution, eloDistribution, winDistribution };
}

// 输入只有参赛者姓名。未知球员以中性强度、联盟典型时长参与，不看当场表现。
export function predictRatingMatchup(model, redNames, blackNames, options = {}) {
  if (!redNames.length || !blackNames.length) throw new Error('两队均须至少一名球员');
  if (new Set([...redNames, ...blackNames]).size !== redNames.length + blackNames.length) throw new Error('球员名单不能重复');
  const team = names => {
    const rows = names.map(name => model.byName.get(name) ?? { expectedMinutes: model.expectedMinutes, technical: 0, results: 0, unshrunkScore: 0 });
    const sumW = rows.reduce((s, p) => s + p.expectedMinutes, 0);
    const avg = field => rows.reduce((s, p) => s + p[field] * p.expectedMinutes, 0) / sumW;
    return { technical: avg('technical'), results: avg('results'), unshrunkScore: avg('unshrunkScore'), elo: names.reduce((s, name, i) => s + (model.eloRatings.get(name) ?? model.config.eloInitial) * rows[i].expectedMinutes, 0) / sumW };
  };
  const red = team(redNames), black = team(blackNames);
  const scale = options.probabilityScale ?? model.config.probabilityScale;
  const difference = red.technical + red.results - black.technical - black.results;
  const pRed = sigmoid(scale * difference);
  return { pRed, pBlack: 1 - pRed, difference, unshrunkDifference: red.unshrunkScore - black.unshrunkScore,
    breakdown: {
      box: { pRed: sigmoid(scale * (red.technical - black.technical)), redRating: red.technical, blackRating: black.technical },
      elo: { pRed: sigmoid(scale * (red.results - black.results)), redElo: red.elo, blackElo: black.elo },
    } };
}
