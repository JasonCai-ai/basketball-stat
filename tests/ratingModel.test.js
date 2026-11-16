import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildRatingModel, computeParticipationElo, predictRatingMatchup, ratingConfidence, summarizeRatingHistory, RATING_CONFIG, displayedPower, ratingPowerType, blendPerformanceFeatures } from '../src/utils/ratingModel.js';
import { rostersForPrediction, runBacktest } from '../scripts/backtestRatings.mjs';

const close = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const player = (name, team, minutes = 40, score = 10, plusMinus = 0) => ({ name, number: name, team, totalTime: minutes * 60, currentTime: 0, score, plusMinus, fouls: 2 });
const game = (date, players, red = 100, black = 90) => ({ date, data: { game: [{ players, teamScores: { '红队': red, '黑队': black } }] } });
const fixture = () => Array.from({ length: 6 }, (_, i) => game(`2026-01-${String(i + 1).padStart(2, '0')}`, [player('甲', '红队', 40, 20, 5), player('乙', '红队', 20, 5, 0), player('丙', '黑队', 40, 10, -5), player('丁', '黑队', 20, 10, 0)]));

test('参与度 Elo 依时长分配，双方总和为零，输入顺序不改变结果', () => {
  const data = fixture();
  const elo = computeParticipationElo(data);
  close([...elo.values()].reduce((s, e) => s + e - 1500, 0), 0);
  close(elo.get('甲') - 1500, 2 * (elo.get('乙') - 1500));
  const reversed = computeParticipationElo([...data].reverse());
  for (const [name, value] of elo) close(value, reversed.get(name));
});

test('场数与分钟共同限制可信度，两场超过 100 分钟仍不满可信度', () => {
  assert.ok(ratingConfidence(2, 107) <= 0.4);
  assert.ok(ratingConfidence(20, 1000) > ratingConfidence(2, 107));
  assert.equal(ratingConfidence(0, 0), 0);
});

test('整体收缩同时压紧实际强度与预测倾向，保持排序且不重新升温', () => {
  const data = fixture();
  const original = buildRatingModel(data, { strengthScale: 1 });
  const shrunk = buildRatingModel(data, { strengthScale: 0.5 });
  const neutral = buildRatingModel(data, { strengthScale: 0 });
  const ordered = model => [...model.byName.values()].sort((a, b) => b.score - a.score).map(p => p.name);
  assert.deepEqual(ordered(original), ordered(shrunk));
  for (const [name, p] of shrunk.byName) {
    close(p.score, original.byName.get(name).score / 2);
    assert.ok(Math.abs(p.powerRating - RATING_CONFIG.powerCenter) <= Math.abs(original.byName.get(name).powerRating - RATING_CONFIG.powerCenter));
  }
  const before = predictRatingMatchup(original, ['甲', '乙'], ['丙', '丁']);
  const after = predictRatingMatchup(shrunk, ['甲', '乙'], ['丙', '丁']);
  close(after.difference, before.difference / 2);
  assert.ok(Math.abs(after.pRed - 0.5) < Math.abs(before.pRed - 0.5));
  close(predictRatingMatchup(neutral, ['甲', '乙'], ['丙', '丁']).pRed, 0.5);
  assert.throws(() => buildRatingModel(data, { strengthScale: 2 }), /保留比例/);
});

test('显示中心抬高不改变内部强度和胜率，颜色边界同步换算', () => {
  const data = fixture();
  const oldDisplay = buildRatingModel(data, { powerCenter: 50 });
  const newDisplay = buildRatingModel(data, { powerCenter: 67 });
  for (const [name, p] of newDisplay.byName) close(p.score, oldDisplay.byName.get(name).score);
  close(predictRatingMatchup(newDisplay, ['甲', '乙'], ['丙', '丁']).pRed, predictRatingMatchup(oldDisplay, ['甲', '乙'], ['丙', '丁']).pRed);
  assert.equal(displayedPower(0), 67);
  assert.equal(ratingPowerType(80), 'danger');
  assert.equal(ratingPowerType(67), 'success');
  assert.throws(() => buildRatingModel(data, { powerCenter: 100 }), /显示中心/);
});

test('相同表现重复出现不产生虚假近期状态，缺席不凭空改变长期产出', () => {
  const data = fixture();
  const model = buildRatingModel(data);
  const stale = buildRatingModel(data, { asOf: '2026-04-06' });
  for (const [name, p] of model.byName) {
    close(p.recentDelta, 0);
    close(stale.byName.get(name).recentDelta, 0);
    close(p.confidence, stale.byName.get(name).confidence);
    close(p.score, stale.byName.get(name).score);
  }
});

test('近期特征只用最近8次实际出场，全季场次和分钟继续提供可信度', () => {
  const data = Array.from({ length: 12 }, (_, i) => game(`2026-01-${String(i + 1).padStart(2, '0')}`, [
    player('甲', '红队', 40, i < 4 ? 0 : 20, i < 4 ? -20 : 5),
    player('乙', '红队', 20, 5, 0), player('丙', '黑队', 40, 10, -5), player('丁', '黑队', 20, 10, 0),
  ]));
  data.push(game('2026-01-13', [player('甲', '红队', 0, 0), player('丙', '黑队')]));
  const before = JSON.stringify(data);
  const p = buildRatingModel(data).byName.get('甲');
  assert.equal(p.gamesPlayed, 12);
  assert.equal(p.formGamesPlayed, 8);
  assert.equal(p.formFirstDate, '2026-01-05');
  assert.equal(p.formLastDate, '2026-01-12');
  assert.equal(p.formAvgPoints, 20);
  close(p.formPointsPerMin, 0.5);
  close(p.confidence, ratingConfidence(12, 480));
  close(p.formConfidence, ratingConfidence(8, 320));
  close(p.effectiveFormShare, 0.6 * p.formConfidence / p.confidence);
  assert.ok(p.confidence > ratingConfidence(8, 320));
  assert.equal(p.recentDelta, 0);
  const wholeSeason = buildRatingModel(data, { formGames: null }).byName.get('甲');
  close(wholeSeason.formAvgPoints, 160 / 12);
  assert.equal(JSON.stringify(data), before);
  assert.throws(() => buildRatingModel(data, { formGames: 0 }), /近期窗口/);
  assert.throws(() => buildRatingModel(data, { formShare: 1.1 }), /近期混合比例/);
});

test('近期基础60%、全季40%，近期不可靠的部分回到个人全季而非中性值', () => {
  const fields = ['points', 'rate', 'plusMinus', 'minutes', 'foulRate'];
  const season = Object.fromEntries(fields.map(field => [field, 2]));
  const form = Object.fromEntries(fields.map(field => [field, 10]));
  const equalConfidence = blendPerformanceFeatures(season, form, .9, .9, .6);
  close(equalConfidence.effectiveFormShare, .6);
  for (const value of Object.values(equalConfidence.values)) close(value, 6.8);
  const weakRecent = blendPerformanceFeatures(season, form, .9, .3, .6);
  close(weakRecent.effectiveFormShare, .2);
  for (const value of Object.values(weakRecent.values)) close(value, 3.6);
  assert.deepEqual(blendPerformanceFeatures(season, form, .9, 0, .6).values, season);
});

test('混合端点保留全季表现，同一批样本不重复降低可信度', () => {
  const data = fixture();
  const seasonOnly = buildRatingModel(data, { formShare: 0 });
  const sameSample = buildRatingModel(data, { formShare: 1 });
  const noWindow = buildRatingModel(data, { formGames: null });
  for (const [name, p] of seasonOnly.byName) {
    close(p.score, sameSample.byName.get(name).score);
    close(p.score, noWindow.byName.get(name).score);
    close(p.confidence, sameSample.byName.get(name).confidence);
  }
});

test('未来比赛不进入 asOf 模型，未知球员中性，交换两队胜率互补', () => {
  const data = fixture();
  const past = buildRatingModel(data, { asOf: '2026-01-06' });
  const future = game('2026-12-01', [player('甲', '红队', 100, 999, 999), player('未来球员', '黑队')], 1000, 1);
  const guarded = buildRatingModel([...data, future], { asOf: '2026-01-06' });
  assert.deepEqual([...past.byName].map(([name, p]) => [name, p.score]), [...guarded.byName].map(([name, p]) => [name, p.score]));
  close(predictRatingMatchup(past, ['陌生甲'], ['陌生乙']).pRed, 0.5);
  const red = ['甲', '乙'], black = ['丙', '丁'];
  close(predictRatingMatchup(past, red, black).pRed + predictRatingMatchup(past, black, red).pRed, 1);
  assert.throws(() => predictRatingMatchup(past, ['甲'], ['甲']), /重复/);
  assert.throws(() => predictRatingMatchup(past, [], ['甲']), /至少/);
});

test('回测名单不依赖待预测场次的得分、时长和正负值，DNP 保留', () => {
  const original = game('2026-01-07', [player('甲', '红队'), player('乙', '红队', 0), player('丙', '黑队')]);
  const modified = structuredClone(original);
  modified.data.game[0].players.forEach(p => { p.totalTime = 999999; p.score = 99999; p.plusMinus = -9999; });
  assert.deepEqual(rostersForPrediction(original), rostersForPrediction(modified));
  assert.deepEqual(rostersForPrediction(original)[0], ['甲', '乙']);
});

test('原始数据不变，基础展示统计保留 DNP、平局和连胜口径', () => {
  const data = [game('2026-01-01', [player('甲', '红队'), player('DNP', '黑队', 0)]), game('2026-01-02', [player('甲', '红队')], 100, 100)];
  const before = JSON.stringify(data);
  const summary = summarizeRatingHistory(data);
  assert.equal(summary.players.length, 1);
  assert.equal(summary.players[0].gamesPlayed, 2);
  assert.equal(summary.players[0].wins, 1);
  assert.equal(summary.players[0].winRate, 50);
  assert.equal(summary.players[0].streak, 1);
  assert.equal(JSON.stringify(data), before);
  const empty = buildRatingModel([]);
  close(predictRatingMatchup(empty, ['新甲'], ['新乙']).pRed, 0.5);
});

test('真实数据回放与旧版聚合一致；沿用原温度且明确反馈后的回顾性口径', async () => {
  const result = await runBacktest();
  assert.equal(result.protocol.legacySummaryParity, true);
  const total = Object.keys(JSON.parse(fs.readFileSync(new URL('../public/data/2026/basketball_files_config.json', import.meta.url)))).length;
  assert.equal(result.protocol.totalGames, total);
  assert.equal(result.protocol.development, total - 18);
  assert.equal(result.protocol.holdout, 10);
  assert.equal(result.calibration.selectedScale, RATING_CONFIG.probabilityScale);
  assert.match(result.protocol.holdoutCaveat, /NOT an independent/);
  const initial = JSON.parse(fs.readFileSync(new URL('../reports/rating-backtest-2026/initial-candidate-results.json', import.meta.url)));
  const previousSnapshot = JSON.parse(fs.readFileSync(new URL('../reports/rating-backtest-2026/previous-candidate-results.json', import.meta.url)));
  const recentSnapshot = JSON.parse(fs.readFileSync(new URL('../reports/rating-backtest-2026/recent-candidate-results.json', import.meta.url)));
  const diagnosis = JSON.parse(fs.readFileSync(new URL('../reports/rating-backtest-2026/player-diagnosis.json', import.meta.url)));
  const agreedExperiment = diagnosis.outcomes.find(v => v.label === '近8场产出+战绩减半');
  for (const row of result.forecasts) {
    assert.ok(row.trainMaxDate < row.date);
    assert.ok(row.newP > 0 && row.newP < 1);
    assert.ok(row.oldP > 0 && row.oldP < 1);
    const previous = initial.forecasts.find(p => p.date === row.date);
    if (previous) close(row.initialCandidateP, previous.newP);
    const v3 = previousSnapshot.forecasts.find(p => p.date === row.date);
    if (v3) close(row.previousCandidateP, v3.newP);
    const experiment = agreedExperiment.forecasts.find(p => p.date === row.date);
    if (experiment) close(row.recentCandidateP, experiment.p);
    const v4 = recentSnapshot.forecasts.find(p => p.date === row.date);
    if (v4) close(row.recentCandidateP, v4.newP);
  }
  for (const expected of agreedExperiment.focusedPlayers) {
    const row = result.rankings.all.find(p => p.name === expected.name);
    assert.equal(row.previousPower, expected.power);
    assert.equal(row.previousRank, expected.rank);
  }
  for (const row of result.rankings.all) {
    assert.ok(row.newPower >= 0 && row.newPower <= 100);
    assert.ok(row.recentConfidence <= row.confidence + 1e-12);
    assert.ok(row.effectiveRecentShare >= 0 && row.effectiveRecentShare <= .6);
  }
});
