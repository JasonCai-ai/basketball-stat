import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRatingModel, summarizeRatingHistory, predictRatingMatchup, RATING_CONFIG } from '../src/utils/ratingModel.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const logit = p => Math.log(Math.max(1e-9, p) / Math.max(1e-9, 1 - p));
const sigmoid = x => 1 / (1 + Math.exp(-x));
const average = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const hash = text => createHash('sha256').update(text).digest('hex');

// 最终导出的名单作为给定条件，包括 DNP。这里只取姓名和队伍，绝不读取当场分钟。
export function rostersForPrediction(game) {
  const players = game.data.game[0].players;
  return ['红队', '黑队'].map(side => [...new Set(players.filter(p => p.team === side).map(p => p.name))]);
}

export function metrics(rows, field, slope = null) {
  const brier = average(rows.map(r => (r[field] - r.actual) ** 2));
  const logLoss = -average(rows.map(r => r.actual * Math.log(Math.max(1e-9, r[field])) + (1 - r.actual) * Math.log(Math.max(1e-9, 1 - r[field]))));
  const accuracy = average(rows.map(r => Math.abs(r[field] - 0.5) < 1e-12 ? 0.5 : Number((r[field] > 0.5) === Boolean(r.actual))));
  const result = { games: rows.length, accuracy, brier, logLoss };
  if (slope !== null) {
    result.marginMAE = average(rows.map(r => Math.abs(slope * logit(r[field]) - r.margin)));
    result.marginRMSE = Math.sqrt(average(rows.map(r => (slope * logit(r[field]) - r.margin) ** 2)));
  }
  return result;
}

function fitMarginSlope(rows, field) {
  const xy = rows.reduce((s, r) => s + logit(r[field]) * r.margin, 0);
  const xx = rows.reduce((s, r) => s + logit(r[field]) ** 2, 0);
  return Math.max(0, Math.min(40, xy / (xx + 10)));
}

function bootstrapDifference(rows) {
  let seed = 20261116;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  const samples = [];
  for (let i = 0; i < 5000; i++) {
    const resample = Array.from({ length: rows.length }, () => rows[Math.floor(random() * rows.length)]);
    samples.push(average(resample.map(r => (r.newP - r.actual) ** 2 - (r.oldP - r.actual) ** 2)));
  }
  samples.sort((a, b) => a - b);
  return { metric: 'new minus old Brier; negative is better', lower: samples[125], upper: samples[4875], samples: 5000, unit: 'whole game', caveat: 'small sample; temporal dependence is not modeled' };
}

function compareRanks(players, legacy, config) {
  const league = legacy.computeLeagueStats(players);
  const rows = players.map(p => ({ name: p.name, games: p.gamesPlayed, minutes: p.totalMinutes,
    oldPower: legacy.playerPowerRating(p, league, config.oldElo),
    newPower: config.model.byName.get(p.name).powerRating,
    initialCandidatePower: config.initialModel.byName.get(p.name).powerRating,
    previousPower: config.previousModel.byName.get(p.name).powerRating,
    v3Power: config.v3Model.byName.get(p.name).powerRating,
    recentConfidence: config.model.byName.get(p.name).formConfidence,
    effectiveRecentShare: config.model.byName.get(p.name).effectiveFormShare,
    formGames: config.model.byName.get(p.name).formGamesPlayed,
    formFirstDate: config.model.byName.get(p.name).formFirstDate,
    formLastDate: config.model.byName.get(p.name).formLastDate,
    confidence: config.model.byName.get(p.name).confidence,
    newScore: config.model.byName.get(p.name).score,
  }));
  const rank = subset => subset.map(p => ({ ...p,
    oldRank: 1 + subset.filter(q => q.oldPower > p.oldPower).length,
    previousRank: 1 + subset.filter(q => q.previousPower > p.previousPower).length,
    newRank: 1 + subset.filter(q => q.newPower > p.newPower).length,
  })).map(p => ({ ...p, rankChange: p.oldRank - p.newRank, previousRankChange: p.previousRank - p.newRank })).sort((a, b) => a.newRank - b.newRank || b.newScore - a.newScore || a.name.localeCompare(b.name, 'zh-CN'));
  return { regular: rank(rows.filter(p => p.games >= 5)), all: rank(rows) };
}

function checkLegacySummaryParity(games, legacy, baseline) {
  const source = execFileSync('git', ['show', `${baseline}:src/stores/annualStatsStore.js`], { cwd: root, encoding: 'utf8' });
  const start = source.indexOf('  const basePlayerAnnualStats = computed(() => {');
  const end = source.indexOf('\n  const totalGames = computed', start);
  if (start < 0 || end < 0) throw new Error('无法提取基线年度统计，拒绝使用不确定的旧模型');
  const body = source.slice(start, end).replace('  const basePlayerAnnualStats = computed(() => {', '').replace(/\}\);\s*$/, '');
  const run = new Function('gamesData', 'playerRapmRatings', 'shrinkWinRate', body);
  const oldPlayers = run({ value: games }, { value: new Map() }, legacy.shrinkWinRate);
  const current = new Map(summarizeRatingHistory(games).players.map(p => [p.name, p]));
  for (const p of oldPlayers) for (const [key, value] of Object.entries(p)) {
    if (key === 'rapm') continue; // 旧战力及旧预测均不读取 RAPM。
    const actual = current.get(p.name)?.[key];
    if (typeof value === 'number' ? Math.abs(actual - value) > 1e-9 : actual !== value) throw new Error(`基线聚合不一致: ${p.name}.${key}`);
  }
  return true;
}

export async function runBacktest({ year = 2026, baseline = 'd8b2579', warmup = 8, holdout = 10 } = {}) {
  const directory = path.join(root, 'public/data', String(year));
  const configBytes = fs.readFileSync(path.join(directory, 'basketball_files_config.json'));
  const manifest = JSON.parse(configBytes);
  const dataHashes = [];
  const games = Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)).map(([date, filename]) => {
    const bytes = fs.readFileSync(path.join(directory, filename));
    dataHashes.push({ date, filename, sha256: hash(bytes) });
    return { date, data: JSON.parse(bytes) };
  });
  if (games.length <= warmup + holdout) throw new Error('比赛数量不足以划分开发段与验证段');
  if (games.some(g => (g.data.game[0].teamScores['红队'] || 0) === (g.data.game[0].teamScores['黑队'] || 0))) throw new Error('本轮二分类回测不支持平局，请显式定义平局口径');
  const baselineCommit = execFileSync('git', ['rev-parse', `${baseline}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  const legacySource = execFileSync('git', ['show', `${baseline}:src/utils/winPrediction.js`], { cwd: root, encoding: 'utf8' });
  const legacy = await import(`data:text/javascript;base64,${Buffer.from(legacySource).toString('base64')}`);
  const snapshotPath = path.join(root, 'reports/rating-backtest-2026/snapshots/ratingModel-v3.js');
  const previous = await import(pathToFileURL(snapshotPath).href);
  const recentSnapshotPath = path.join(root, 'reports/rating-backtest-2026/snapshots/ratingModel-v4.js');
  const recentVersion = await import(pathToFileURL(recentSnapshotPath).href);
  const parity = checkLegacySummaryParity(games, legacy, baselineCommit);
  const forecasts = [];
  for (let i = warmup; i < games.length; i++) {
    const target = games[i];
    const training = games.slice(0, i);
    if (training.some(g => g.date >= target.date)) throw new Error('日期切分存在未来数据泄漏');
    const players = summarizeRatingHistory(training).players;
    const byName = new Map(players.map(p => [p.name, p]));
    const ls = legacy.computeLeagueStats(players);
    const oldElo = legacy.computeEloRatings(training);
    const [redNames, blackNames] = rostersForPrediction(target);
    // 老版对陌生球员采用训练期联盟平均技术统计、初始 Elo，与新版中性处理对齐。
    const neutral = name => ({ name, gamesPlayed: 0, totalMinutes: 0, adjustedWinRate: 0.5,
      ...Object.fromEntries(Object.entries(ls).map(([field, value]) => [field, value.mean])),
    });
    const oldP = legacy.combinedWinProbability(redNames.map(name => byName.get(name) ?? neutral(name)), blackNames.map(name => byName.get(name) ?? neutral(name)), ls, oldElo).pRed;
    const model = buildRatingModel(training, { asOf: target.date });
    const candidate = predictRatingMatchup(model, redNames, blackNames, { probabilityScale: 1 });
    const previousModel = previous.buildRatingModel(training, { asOf: target.date });
    const previousCandidateP = previous.predictRatingMatchup(previousModel, redNames, blackNames).pRed;
    const initialModel = previous.buildRatingModel(training, { asOf: target.date, strengthScale: 1, powerCenter: 50 });
    const initialCandidateP = previous.predictRatingMatchup(initialModel, redNames, blackNames).pRed;
    const recentModel = recentVersion.buildRatingModel(training, { asOf: target.date });
    const recentCandidateP = recentVersion.predictRatingMatchup(recentModel, redNames, blackNames).pRed;
    // 以下赛果只用于评分，不参与任何特征或参赛时长推断。
    const scores = target.data.game[0].teamScores;
    const redWins = training.filter(g => g.data.game[0].teamScores['红队'] > g.data.game[0].teamScores['黑队']).length;
    forecasts.push({ date: target.date, partition: i < games.length - holdout ? 'development' : 'holdout', trainGames: training.length, trainMaxDate: training.at(-1).date,
      redNames, blackNames, unknownPlayers: [...redNames, ...blackNames].filter(name => !byName.has(name)),
      actual: Number(scores['红队'] > scores['黑队']), margin: scores['红队'] - scores['黑队'],
      oldP, initialCandidateP, previousCandidateP, recentCandidateP, newDifference: candidate.difference, newP: candidate.pRed, chanceP: 0.5, historicalSideP: (redWins + 1) / (training.length + 2),
    });
  }
  const development = forecasts.filter(r => r.partition === 'development');
  const validation = forecasts.filter(r => r.partition === 'holdout');
  // 初版开发段使用固定小网格。本轮强度收缩来自用户反馈，温度固定沿用 2；
  // 不重新升温抵消收缩。网格仅保留为开发段诊断，最后 10 场已不再是独立验证。
  const scaleGrid = [0.5, 1, 1.5, 2];
  const calibration = scaleGrid.map(scale => ({ scale, ...metrics(development.map(r => ({ ...r, candidate: sigmoid(scale * r.newDifference) })), 'candidate') }));
  calibration.sort((a, b) => a.brier - b.brier || a.scale - b.scale);
  const selectedScale = RATING_CONFIG.probabilityScale;
  for (const row of forecasts) row.newP = sigmoid(selectedScale * row.newDifference);
  const oldSlope = fitMarginSlope(development, 'oldP'), newSlope = fitMarginSlope(development, 'newP');
  const previousSlope = fitMarginSlope(development, 'previousCandidateP');
  const recentSlope = fitMarginSlope(development, 'recentCandidateP');
  for (const row of forecasts) { row.oldMargin = oldSlope * logit(row.oldP); row.newMargin = newSlope * logit(row.newP); }
  const partitions = {};
  for (const [name, rows] of Object.entries({ development, holdout: validation, combined: forecasts })) {
    partitions[name] = { from: rows[0].date, to: rows.at(-1).date,
      old: metrics(rows, 'oldP', oldSlope), initialCandidate: metrics(rows, 'initialCandidateP'), previousCandidate: metrics(rows, 'previousCandidateP', previousSlope), recentCandidate: metrics(rows, 'recentCandidateP', recentSlope), candidate: metrics(rows, 'newP', newSlope),
      chance: metrics(rows, 'chanceP', 0), historicalSide: metrics(rows, 'historicalSideP'),
    };
  }
  const players = summarizeRatingHistory(games).players;
  const model = buildRatingModel(games, { asOf: games.at(-1).date, probabilityScale: selectedScale });
  const previousModel = previous.buildRatingModel(games, { asOf: games.at(-1).date });
  const recentModel = recentVersion.buildRatingModel(games, { asOf: games.at(-1).date });
  const initialModel = previous.buildRatingModel(games, { asOf: games.at(-1).date, strengthScale: 1, powerCenter: 50 });
  const rankings = compareRanks(players, legacy, { oldElo: legacy.computeEloRatings(games), model, previousModel: recentModel, initialModel, v3Model: previousModel });
  return {
    protocol: { year, totalGames: games.length, warmup, development: development.length, holdout, baselineCommit,
      legacySourceSHA256: hash(legacySource), legacySummaryParity: parity,
      candidateSourceSHA256: hash(fs.readFileSync(path.join(root, 'src/utils/ratingModel.js'))),
      candidateDependencySHA256: hash(fs.readFileSync(path.join(root, 'src/utils/winPrediction.js'))),
      previousSourceSHA256: hash(fs.readFileSync(snapshotPath)),
      previousDependencySHA256: hash(fs.readFileSync(path.join(path.dirname(snapshotPath), 'winPrediction.js'))),
      recentSourceSHA256: hash(fs.readFileSync(recentSnapshotPath)),
      backtestSourceSHA256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
      manifestSHA256: hash(configBytes), config: model.config, dataHashes,
      roster: 'Conditional on the final exported roster, including DNP; no claim that signup rosters were archived before tipoff.',
      features: 'Only games dated strictly before target. Target scores/minutes/plus-minus are never prediction inputs. Unknown players are neutral.',
      featureWindow: { appearances: model.config.formGames, definition: 'last 8 appearances per player, not last 8 league games', nominalRecentShare: model.config.formShare,
        effectiveRecentShare: '0.6 * min(1, recent confidence / season confidence); remainder returns to personal season features',
        confidence: 'min(games/(games+3), minutes/(minutes+150)), computed separately for season and recent window; season confidence applied once externally',
        seasonUse: 'personal performance baseline, confidence, Elo, win rate, exposure expectation and league rate prior', extraRecentBonus: false, teamBaselineCorrection: false },
      margin: 'Auxiliary zero-intercept margin calibration on development only, ridge=10; not the UI Monte Carlo score simulator.',
      holdoutCaveat: 'The original last 10 games and individual rankings have informed user feedback and model choice. This recent-form revision is retrospective, NOT an independent holdout validation.',
      strengthReview: { scale: RATING_CONFIG.strengthScale, source: 'user feedback after reviewing Nov 16 close game', initialResults: 'initial-candidate-results.json', probabilityTemperature: 'frozen at initial development calibration; not re-optimized' },
      dataVersionCaveat: 'Replay uses the current corrected historical files, not the exact data versions available on each original date.',
      rapm: 'Existing full-game RAPM remains excluded; no stint RAPM added in this candidate.',
    }, calibration: { grid: calibration, selectedScale, objective: 'fixed original development calibration; no reselection after expert feedback', oldMarginSlope: oldSlope, previousMarginSlope: previousSlope, recentMarginSlope: recentSlope, newMarginSlope: newSlope },
    partitions, holdoutBrierDifference95CI: bootstrapDifference(validation), rankings, forecasts,
  };
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const decimal = (x, digits = 4) => x.toFixed(digits);
const percent = x => `${(100 * x).toFixed(1)}%`;
function htmlReport(result) {
  const { protocol: p, partitions, rankings, forecasts } = result;
  const metricRows = Object.entries(partitions).flatMap(([partition, values]) => ['old', 'initialCandidate', 'previousCandidate', 'recentCandidate', 'candidate', 'chance', 'historicalSide'].map(model => {
    const m = values[model];
    return `<tr><td>${escape(partition === 'holdout' ? '原留出段（回顾性）' : partition)}</td><td>${escape(({old:'线上旧版', initialCandidate:'初版候选 v2', previousCandidate:'历史收缩 v3', recentCandidate:'上版近期 v4', candidate:'本版混合 v5', chance:'50% 基线', historicalSide:'历史红黑胜率'})[model])}</td><td>${m.games}</td><td>${percent(m.accuracy)}</td><td>${decimal(m.brier)}</td><td>${decimal(m.logLoss)}</td><td>${m.marginMAE === undefined ? '—' : decimal(m.marginMAE, 2)}</td></tr>`;
  })).join('');
  const rankingTable = rows => `<table><thead><tr><th>球员</th><th>场次</th><th>上版排名</th><th>本版排名</th><th>名次变化（＋为上升）</th><th>线上旧战力</th><th>初版 v2</th><th>历史 v3</th><th>上版 v4</th><th>本版 v5</th><th>全季可信度</th><th>近期可信度</th><th>近期实际占比</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escape(r.name)}</td><td>${r.games}</td><td>${r.previousRank}</td><td>${r.newRank}</td><td>${r.previousRankChange > 0 ? '+' : ''}${r.previousRankChange}</td><td>${r.oldPower}</td><td>${r.initialCandidatePower}</td><td>${r.v3Power}</td><td>${r.previousPower}</td><td>${r.newPower}</td><td>${percent(r.confidence)}</td><td>${percent(r.recentConfidence)}</td><td>${percent(r.effectiveRecentShare)}</td></tr>`).join('')}</tbody></table>`;
  const validation = partitions.holdout;
  const improved = validation.candidate.brier < validation.old.brier;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>战力模型本地回测 ${p.year}</title><style>body{font:16px/1.7 system-ui,sans-serif;max-width:1180px;margin:36px auto;padding:0 20px;color:#17243a;background:#f7f9fc}h1,h2{line-height:1.3}table{border-collapse:collapse;width:100%;background:white;margin:16px 0;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:9px 12px;border-bottom:1px solid #dce3ed;white-space:nowrap}th{background:#e9eff8}th:first-child,td:first-child{text-align:left}.scroll{overflow:auto}.note{padding:16px;background:#fff3d8;border-radius:8px}code{background:#e9eff8;padding:2px 6px}details{margin:24px 0}a{color:#205bc5}</style>
  <h1>战力模型本地回测 · ${p.year}</h1><p>旧版基线 <code>${escape(p.baselineCommit.slice(0, 8))}</code>；候选 <code>${escape(p.config.version)}</code>。本报告为回测记录，部署状态以 GitHub Pages 为准。</p>
  <p class="note">本轮回顾性对照：混合候选 v5 在原留出段的 Brier ${improved ? '低于' : '未优于'}旧版（${decimal(validation.candidate.brier)} vs ${decimal(validation.old.brier)}），命中率 ${percent(validation.candidate.accuracy)} vs ${percent(validation.old.accuracy)}。${improved ? '样本仍不足以确认稳定提升。' : '本段未优于线上旧版，继续保留本地试验。'} 全部 31 场 Brier：本版 ${decimal(partitions.combined.candidate.brier)}、上版 v4 ${decimal(partitions.combined.recentCandidate.brier)}、线上旧版 ${decimal(partitions.combined.old.brier)}。实际部署状态以 GitHub Pages 的对应提交为准。</p>
  <p>${p.totalGames} 场为回顾性分析。前 ${p.warmup} 场积累历史，中间 ${p.development} 场开发，最后 ${p.holdout} 场原作为时间留出段。本轮窗口选择已经参考这些比赛、球员排名及近期进步反馈，因此该段不再是独立验证。内部强度差统一保留 ${percent(p.config.strengthScale)}，沿用初版温度，不以重新标定抵消收缩。<a href="initial-candidate-report.html">初版原报告</a>已保留。已知最终导出名单，但不使用待预测比赛的实际时长、得分或正负值。无法证明名单在赛前已固定。开发段及混合段指标含参数选择影响，本轮结果均只作回顾性对照。</p>
  <h2>复核后采用的调整</h2><p>本轮技术统计基础混合为近期 ${percent(p.config.formShare)}、个人全季 ${percent(1-p.config.formShare)}，再单独折扣近期样本可信度。近期取每人最近 ${p.config.formGames} 次出场；全季与近期分别计算场数和分钟的可信度，近期实际占比 = 60% × min(1, 近期可信度 / 全季可信度)。折扣部分回到该球员全季表现，而不是联盟平均水平。技术统计与全季战绩的外层权重仍为 80% / 20%，整体全季可信度仅应用一次。沿用强度差 50%、显示中心 ${p.config.powerCenter} 与概率温度 2，不再调刻度。未加入同队基线修正或按姓名调分。</p><ol><li>技术统计先统一尺度；得分兼顾场均与向联盟均值收缩的每分钟产出，保留此前时长减权。</li><li>Elo 和胜率合并为一个战绩分量；设置尺度下限，避免小方差被强行放大。</li><li>Elo 按历史当场参与时间更新，两队合计变动零和，分差修正封顶。预测只用此前比赛的平均时间。</li><li>近期与个人全季表现混合，近期独立样本保护，不额外叠加近期奖励。</li><li>置信度同时受独立场次和分钟数约束；新人采用中性强度。</li><li>分段 RAPM 未加入本候选。比分模拟仍独立估算，不把它当作新战力模型的胜率。</li></ol>
  <h2>预测效果</h2><p>Brier、对数损失和分差 MAE 越低越好。50% 预测只表示不知道谁赢，命中率按 0.5 计。historicalSide 是仅用此前红黑胜负的基线。分差使用同一开发段、相同方法分别标定，不是原页面随机比分模拟。</p><div class="scroll"><table><thead><tr><th>区间</th><th>模型</th><th>场次</th><th>命中率</th><th>Brier</th><th>对数损失</th><th>分差 MAE</th></tr></thead><tbody>${metricRows}</tbody></table></div>
  <p>沿用初版开发段的胜率温度（本轮未重新选择）：${result.calibration.selectedScale}。原留出段新－旧 Brier 差的配对逐场 bootstrap 95% 区间：[${decimal(result.holdoutBrierDifference95CI.lower)}, ${decimal(result.holdoutBrierDifference95CI.upper)}]。该区间仅描述已知样本，不是独立验证；仅 ${p.holdout} 场，不宜将点估计视为稳定提升；区间也未建模比赛间时间相关性。</p>
  <h2>全部球员排名对比</h2><p>截至 ${escape(forecasts.at(-1).date)}，在同一组 ${rankings.all.length} 人内排名。相同整数战力并列，后续名次跳号；战力是相对强度指数，不是个人赢球概率。表中可信度是样本权重系数，不是准确率或统计置信区间。新旧刻度有变化，不能仅凭新旧分数差判断能力变化。</p><div class="scroll">${rankingTable(rankings.all)}</div>
  <details><summary>常规球员（至少 5 场）</summary><div class="scroll">${rankingTable(rankings.regular)}</div></details>
  <h2>逐场预测</h2><div class="scroll"><table><thead><tr><th>日期</th><th>区间</th><th>训练场次</th><th>线上旧红胜率</th><th>初版 v2 红胜率</th><th>历史 v3 红胜率</th><th>上版 v4 红胜率</th><th>本版 v5 红胜率</th><th>实际红胜</th><th>旧预测分差</th><th>新预测分差</th><th>实际分差</th><th>陌生球员</th></tr></thead><tbody>${forecasts.map(r => `<tr><td>${r.date}</td><td>${r.partition}</td><td>${r.trainGames}</td><td>${percent(r.oldP)}</td><td>${percent(r.initialCandidateP)}</td><td>${percent(r.previousCandidateP)}</td><td>${percent(r.recentCandidateP)}</td><td>${percent(r.newP)}</td><td>${r.actual ? '是' : '否'}</td><td>${decimal(r.oldMargin, 1)}</td><td>${decimal(r.newMargin, 1)}</td><td>${r.margin}</td><td>${escape(r.unknownPlayers.join('、')) || '—'}</td></tr>`).join('')}</tbody></table></div>
  <p>版本快照：<a href="recent-candidate-report.html">上版 v4 报告</a>；<a href="previous-candidate-report.html">历史 v3 报告</a>；<a href="initial-candidate-report.html">初版 v2 报告</a>。缺席较久的球员仍使用其最近出场记录，不自动假设能力下降或进步。</p><h2>复现与限制</h2><p><code>npm run backtest:ratings -- --year=${p.year}</code>。完整参数、训练日期、预测、排名和源数据 SHA-256 见同目录 <a href="results.json">results.json</a>。旧版聚合字段已逐一与基线源码核对，误差阈值 1e-9。</p><p>只有 ${p.totalGames} 场、${rankings.all.length} 人，多项信号相关、分队可能刻意平衡、历史导出名单可能包含临场变更；预测只在给定名单条件下成立。历史修正版用于回放，无法还原原比赛日的数据版本。回测不证明因果贡献，也不能补出投篮效率、助攻或防守技术统计。原始比赛 JSON 未改动。</p><p>旧版原预测只融合技术统计与 Elo，没有直接使用页面战力值；候选预测与候选战力共用潜在强度。因此这是产品计算流程对比，并不把两套页面战力值误称为赢球概率。分差标定偏保守，另列零分差基线。</p><details><summary>候选参数</summary><pre>${escape(JSON.stringify(p.config, null, 2))}</pre></details></html>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const year = Number(process.argv.find(a => a.startsWith('--year='))?.split('=')[1] ?? 2026);
  const result = await runBacktest({ year });
  const output = path.join(root, 'reports', `rating-backtest-${year}`);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'report.html'), htmlReport(result));
  console.log(JSON.stringify({ calibration: result.calibration, partitions: result.partitions, interval: result.holdoutBrierDifference95CI, top10: result.rankings.regular.slice(0, 10), report: path.relative(root, path.join(output, 'report.html')) }, null, 2));
}
