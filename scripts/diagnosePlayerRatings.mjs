// 离线敏感性检查，不写入球员数据或修改生产模型。专家预期仅用于对照，不参与评分。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { rostersForPrediction, metrics } from './backtestRatings.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const baselinePath = path.join(root, 'reports/rating-backtest-2026/snapshots/ratingModel-v3.js');
const { buildRatingModel, RATING_CONFIG } = await import(pathToFileURL(baselinePath).href);
const directory = path.join(root, 'public/data/2026');
const config = JSON.parse(fs.readFileSync(path.join(directory, 'basketball_files_config.json')));
const dataHash = createHash('sha256');
const games = Object.entries(config).sort(([a], [b]) => a.localeCompare(b)).map(([date, filename]) => {
  const bytes = fs.readFileSync(path.join(directory, filename));
  dataHash.update(date).update(filename).update(bytes);
  return { date, data: JSON.parse(bytes) };
});
const original = JSON.stringify(games);
const names = ['胡麟', '日康', '廖程', '张铖'];
const minutes = p => ((p.totalTime || 0) + (p.currentTime || 0)) / 60;
const hash = text => createHash('sha256').update(text).digest('hex');
const beforeModel = fs.readFileSync(baselinePath, 'utf8');
const beforeProduction = fs.readFileSync(path.join(root, 'src/utils/ratingModel.js'), 'utf8');

// 试验性特征窗口：只替换技术统计特征的输入窗口，可信度与战绩仍用全季历史。
// 在内存中派生独立实验模块，断言插入点唯一，避免改动候选模型或混淆主报告。
const marker = '  const features = (p, recent = false) => {';
if (beforeModel.split(marker).length !== 2) throw new Error('模型结构已变化，须重新审查试验插入点');
const experimentalSource = beforeModel
  .replace("from './winPrediction.js'", 'from ' + JSON.stringify(pathToFileURL(path.join(path.dirname(baselinePath), 'winPrediction.js')).href))
  .replace(marker, marker + `
    if (!recent && options.formGames) {
      const rows = p.history.slice(-options.formGames);
      p = { ...p, totalPoints: rows.reduce((s,r) => s+r.points,0),
        totalMinutes: rows.reduce((s,r) => s+r.minutes,0),
        totalPlusMinus: rows.reduce((s,r) => s+r.plusMinus,0),
        totalFouls: rows.reduce((s,r) => s+r.fouls,0), gamesPlayed: rows.length };
    }
  `);
const experimental = await import('data:text/javascript;base64,' + Buffer.from(experimentalSource).toString('base64'));

function relativeTeamBaseline(input) {
  return input.map(g => {
    const out = structuredClone(g), info = out.data.game[0];
    for (const side of ['红队', '黑队']) {
      const players = info.players.filter(p => p.team === side);
      const duration = players.reduce((s, p) => s + minutes(p), 0) / 5;
      const diff = info.teamScores[side] - info.teamScores[side === '红队' ? '黑队' : '红队'];
      for (const p of players) if (duration > 0 && minutes(p) > 0) p.plusMinus -= diff * minutes(p) / duration;
    }
    return out;
  });
}

function periodSummary(rows) {
  const n = rows.length, time = rows.reduce((s, r) => s + r.minutes, 0);
  return { games: n, avgPoints: rows.reduce((s, r) => s + r.points, 0) / n,
    pointsPer40: rows.reduce((s, r) => s + r.points, 0) / time * 40,
    avgPlusMinus: rows.reduce((s, r) => s + r.plusMinus, 0) / n,
    avgMinutes: time / n, foulsPer40: rows.reduce((s, r) => s + r.fouls, 0) / time * 40 };
}

const current = buildRatingModel(games);
const context = new Map(names.map(name => [name, { onPM: 0, onMinutes: 0, offPM: 0, offMinutes: 0, relativePM: 0, games: 0 }]));
for (const { data } of games) {
  const info = data.game[0];
  for (const name of names) {
    const p = info.players.find(p => p.name === name);
    if (!p || minutes(p) <= 0) continue;
    const total = info.players.filter(q => q.team === p.team).reduce((s, q) => s + minutes(q), 0) / 5;
    const diff = info.teamScores[p.team] - info.teamScores[p.team === '红队' ? '黑队' : '红队'];
    const s = context.get(name);
    s.onPM += p.plusMinus; s.onMinutes += minutes(p);
    s.offPM += diff - p.plusMinus; s.offMinutes += Math.max(0, total - minutes(p));
    s.relativePM += p.plusMinus - diff * minutes(p) / total; s.games++;
  }
}
const profiles = names.map(name => {
  const p = current.byName.get(name), s = context.get(name);
  return { name, currentPower: p.powerRating, confidence: p.confidence, wins: p.wins, losses: p.losses,
    elo: current.eloRatings.get(name), lastDate: p.history.at(-1).date,
    season: periodSummary(p.history), last8: periodSummary(p.history.slice(-8)), last5: periodSummary(p.history.slice(-5)),
    context: { relativePMPerGame: s.relativePM / s.games,
      onPMPer40: s.onPM / s.onMinutes * 40, offPMPer40: s.offPM / s.offMinutes * 40,
      onOffPer40: (s.onPM / s.onMinutes - s.offPM / s.offMinutes) * 40 },
  };
});

const w = RATING_CONFIG.boxFeatureWeights;
const variants = [
  { label: '当前候选', options: {} },
  { label: '战绩权重减半', options: { boxWeight: .8, resultsWeight: .2 } },
  { label: '增强近期加成', options: { recentWeight: .4, recentHalfLifeDays: 30 } },
  { label: '近8场产出+战绩减半', options: { formGames: 8, boxWeight: .8, resultsWeight: .2, recentWeight: 0 } },
  { label: '近5场产出+战绩减半', options: { formGames: 5, boxWeight: .8, resultsWeight: .2, recentWeight: 0 } },
  { label: '得分偏重+战绩减半', options: { boxWeight: .8, resultsWeight: .2, boxFeatureWeights: { ...w, avgPoints: w.avgPoints + .2, avgPlusMinus: w.avgPlusMinus - .2 } } },
  { label: '同队基线修正+战绩减半', relativeTeam: true, options: { boxWeight: .8, resultsWeight: .2 } },
  { label: '同队基线修正+近8场+战绩减半', relativeTeam: true, options: { formGames: 8, boxWeight: .8, resultsWeight: .2, recentWeight: 0 } },
];
const outcomes = variants.map(variant => {
  const prepare = input => variant.relativeTeam ? relativeTeamBaseline(input) : input;
  const model = experimental.buildRatingModel(prepare(games), variant.options);
  const all = [...model.byName.values()], forecasts = [];
  for (let i = 8; i < games.length; i++) {
    const training = games.slice(0, i), target = games[i];
    if (training.some(g => g.date >= target.date)) throw new Error('训练时间越界');
    const m = experimental.buildRatingModel(prepare(training), { ...variant.options, asOf: target.date });
    const [red, black] = rostersForPrediction(target);
    const p = experimental.predictRatingMatchup(m, red, black).pRed;
    const scores = target.data.game[0].teamScores;
    forecasts.push({ date: target.date, p, actual: Number(scores['红队'] > scores['黑队']), margin: scores['红队'] - scores['黑队'] });
  }
  return { ...variant,
    focusedPlayers: names.map(name => { const p = model.byName.get(name); return { name, power: p.powerRating, rank: 1 + all.filter(q => q.powerRating > p.powerRating).length }; }),
    top4: [...all].sort((a, b) => b.score - a.score).slice(0, 4).map(p => ({ name: p.name, power: p.powerRating })),
    retrospective31: metrics(forecasts, 'p'), retrospectiveLast10: metrics(forecasts.slice(-10), 'p'), forecasts,
  };
});
if (JSON.stringify(games) !== original || fs.readFileSync(path.join(root, 'src/utils/ratingModel.js'), 'utf8') !== beforeProduction) throw new Error('诊断改变了数据或主模型');
const output = { asOf: games.at(-1).date, totalGames: games.length,
  baselineVersion: 'candidate-v3-shrunk',
  note: 'Exploratory retrospective comparisons after expert feedback. Focused targets are calibration opinions, not verified labels. No independent validation, no production model edits.',
  aliasAssumption: '用户张城按数据中的张铖理解',
  expertExpectations: { 胡麟: { rankAround: 33 }, 日康: { powerAround: 64 }, 廖程: { powerAround: 67, reason: '近期进步明显' }, 张铖: { powerAround: 63 } },
  contextCaveat: '同队基线与在场/不在场差均未控制具体队友对手，不是因果贡献，也不是 RAPM。只用于敏感性检查。',
  sourceSHA256: hash(beforeModel), experimentSourceSHA256: hash(experimentalSource), dataSHA256: dataHash.digest('hex'),
  profiles, outcomes,
};
const filename = path.join(root, 'reports/rating-backtest-2026/player-diagnosis.json');
fs.writeFileSync(filename, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, filename), profiles, outcomes: outcomes.map(({ forecasts, ...rest }) => rest) }, null, 2));
