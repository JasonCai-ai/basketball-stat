// 当场表现评语
// 根据球员单场数据（得分 / 正负值 / 犯规 / 出场时间），结合全场所有上场球员的
// 整体分布做标准化（z-score），再映射到网络热梗评语（夯爆了 / 拉完了 / 燃尽了 等）。
// 用全场分布而非绝对阈值，能自动适配不同比赛的比分尺度与强度。
// 若传入 rapmMap，则正负值会按 RAPM 做"对手/队友强度校正"：打强阵、克强敌才算夯。

import { rapmExpectedPlusMinus } from './winPrediction';

function average(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function stdDev(arr, mean) {
  if (arr.length === 0) return 0;
  const variance = average(arr.map((v) => (v - mean) ** 2));
  return Math.sqrt(variance);
}

// 由综合表现 z 值与个人数据映射出评语
function pickLabel(z, info, maxMinutes) {
  // 燃尽了：出场时间拉满（接近全场最高）且效率不佳 / 犯规多，拼到油尽灯枯
  const heavyMinutes = maxMinutes > 0 && info.minutes >= 0.85 * maxMinutes;
  if (heavyMinutes && z < 0.3 && (info.fouls >= 4 || info.plusMinus < 0)) {
    return { text: '燃尽了', type: 'warning', effect: 'dark', desc: '出场时间拉满，拼到油尽灯枯' };
  }

  if (z >= 1.3) return { text: '夯爆了', type: 'success', effect: 'dark', desc: '全场最佳级别的统治级发挥' };
  if (z >= 0.7) return { text: '起飞了', type: 'success', effect: 'light', desc: '打得非常出色' };
  if (z >= 0.25) return { text: '有点东西', type: 'primary', effect: 'light', desc: '发挥不错，有贡献' };
  if (z >= -0.25) return { text: '还行吧', type: 'info', effect: 'light', desc: '中规中矩的一场' };
  if (z >= -0.7) return { text: '划水了', type: 'warning', effect: 'light', desc: '存在感一般' };
  if (z >= -1.3) return { text: '拉了', type: 'danger', effect: 'light', desc: '发挥低迷' };
  return { text: '拉完了', type: 'danger', effect: 'dark', desc: '打得稀烂' };
}

// 计算全场每名球员的“当场表现”评语
// players: [{ name, number, team, score, plusMinus, fouls, playMinutes }]
// 返回 Map<key, label>，key 由 buildKey 生成
export function buildKey(p) {
  return `${p.team}-${p.number}-${p.name}`;
}

export function evaluatePerformances(players, rapmMap = null) {
  const map = new Map();
  if (!players || players.length === 0) return map;

  // 全场在场阵容（含分钟），用于 RAPM 强度校正
  const onCourt = players.map((p) => ({
    name: p.name,
    team: p.team,
    minutes: p.playMinutes || 0,
  }));

  const enriched = players.map((p) => {
    const minutes = p.playMinutes || 0;
    // 残差正负值 = 实际 − RAPM 应得（无 rapmMap 时应得为 0，退化为原始正负值）
    const expected = rapmMap
      ? rapmExpectedPlusMinus({ name: p.name, team: p.team }, onCourt, rapmMap)
      : 0;
    const adjPlusMinus = (p.plusMinus || 0) - expected;
    // 综合表现分：得分为主，（校正后）正负值次之，犯规为负向，作为原始打分
    const value = (p.score || 0) * 1.0 + adjPlusMinus * 0.8 - (p.fouls || 0) * 1.2;
    return { p, minutes, fouls: p.fouls || 0, plusMinus: p.plusMinus || 0, value };
  });

  const values = enriched.map((e) => e.value);
  const mean = average(values);
  const std = stdDev(values, mean) || 1; // 避免除以 0（所有人数据相同时）
  const maxMinutes = Math.max(...enriched.map((e) => e.minutes), 0);

  enriched.forEach((e) => {
    const z = (e.value - mean) / std;
    map.set(buildKey(e.p), pickLabel(z, e, maxMinutes));
  });

  return map;
}
