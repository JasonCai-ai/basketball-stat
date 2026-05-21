<template>
  <el-card class="win-prediction-panel" shadow="hover">
    <template #header>
      <div class="card-header">
        <span>比赛胜负预测</span>
        <el-tooltip
          effect="dark"
          placement="top"
          content="技术统计模型（z-score 标准化）+ 历史 Elo 模型加权融合，输出为 sigmoid/Elo 期望胜率"
        >
          <el-tag type="info">混合模型 · 年度数据驱动</el-tag>
        </el-tooltip>
      </div>
    </template>

    <el-row :gutter="20">
      <el-col :xs="24" :md="12">
        <div class="team-select">
          <div class="team-label red-label">
            红队阵容
            <span class="team-count">已选 {{ redTeam.length }} 人</span>
          </div>
          <div class="chip-list">
            <span
              v-for="player in playerList"
              :key="player.name"
              class="chip"
              :class="{
                'chip-red': redTeam.includes(player.name),
                'chip-disabled': blackTeam.includes(player.name),
              }"
              @click="toggle('red', player.name)"
            >
              {{ player.name }}
              <small>{{ player.gamesPlayed }}场</small>
            </span>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :md="12">
        <div class="team-select">
          <div class="team-label black-label">
            黑队阵容
            <span class="team-count">已选 {{ blackTeam.length }} 人</span>
          </div>
          <div class="chip-list">
            <span
              v-for="player in playerList"
              :key="player.name"
              class="chip"
              :class="{
                'chip-black': blackTeam.includes(player.name),
                'chip-disabled': redTeam.includes(player.name),
              }"
              @click="toggle('black', player.name)"
            >
              {{ player.name }}
              <small>{{ player.gamesPlayed }}场</small>
            </span>
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="sim-config">
      <span class="cfg-label">全场目标分</span>
      <el-input-number v-model="targetScore" :min="20" :max="400" :step="20" size="small" controls-position="right" />
      <span class="cfg-label">最长时长(分)</span>
      <el-input-number v-model="maxMinutes" :min="10" :max="240" :step="10" size="small" controls-position="right" />
      <span class="cfg-hint dim">默认 4 节 × 35 = 140 分 / 一般时长 100 分钟</span>
    </div>

    <div class="predict-action">
      <el-button type="primary" @click="predictWinRate">预测胜率 & 模拟得分</el-button>
      <el-button @click="resetTeams">清空</el-button>
    </div>

    <div v-if="result" class="result-section">
      <div class="result-title">预测结果</div>

      <el-row :gutter="20">
        <el-col :span="12">
          <div class="team-result">
            <span class="team-name red">红队</span>
            <span class="win-rate red">{{ result.redWinRate }}%</span>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="team-result">
            <span class="team-name black">黑队</span>
            <span class="win-rate black">{{ result.blackWinRate }}%</span>
          </div>
        </el-col>
      </el-row>

      <div class="bar">
        <div class="bar-red" :style="{ width: result.redWinRate + '%' }"></div>
        <div class="bar-black" :style="{ width: result.blackWinRate + '%' }"></div>
      </div>

      <div class="model-breakdown">
        <div class="breakdown-row">
          <span class="breakdown-label">技术统计模型</span>
          <span>红 {{ result.box.redPct }}% / 黑 {{ result.box.blackPct }}%</span>
        </div>
        <div class="breakdown-row">
          <span class="breakdown-label">历史 Elo 模型</span>
          <span>
            红 {{ result.elo.redPct }}% / 黑 {{ result.elo.blackPct }}%
            <span class="dim">（{{ result.elo.redElo }} vs {{ result.elo.blackElo }}）</span>
          </span>
        </div>
      </div>

      <div class="sim-section">
        <div class="sim-title">
          得分模拟
          <span class="dim">（{{ result.sim.target }} 分制 · 最长 {{ result.sim.maxMinutes }} 分钟 · 2000 次蒙特卡洛）</span>
        </div>

        <div class="sim-score">
          <span class="sim-team red">红队</span>
          <span class="sim-num red">{{ result.sim.expectedRed }}</span>
          <span class="sim-sep">—</span>
          <span class="sim-num black">{{ result.sim.expectedBlack }}</span>
          <span class="sim-team black">黑队</span>
        </div>
        <div class="sim-meta">
          预计 {{ result.sim.expectedMinutes }} 分钟结束 ·
          红队 {{ result.sim.redRate }} 分/分钟 · 黑队 {{ result.sim.blackRate }} 分/分钟
        </div>

        <div class="sim-outcome">
          <div class="outcome-row">
            <span>红队先到 {{ result.sim.target }} 分</span>
            <span class="outcome-pct red">{{ result.sim.redReachedPct }}%</span>
          </div>
          <div class="outcome-row">
            <span>黑队先到 {{ result.sim.target }} 分</span>
            <span class="outcome-pct black">{{ result.sim.blackReachedPct }}%</span>
          </div>
          <div class="outcome-row">
            <span>时间到（{{ result.sim.maxMinutes }} 分钟）按比分决胜</span>
            <span class="outcome-pct dim">{{ result.sim.timeUpPct }}%</span>
          </div>
        </div>

        <div class="sim-trajectory">
          <div class="sim-subtitle">样例比赛进程</div>
          <div v-for="m in result.sim.milestones" :key="m.label + m.minute" class="ms-row">
            <span class="ms-time">{{ m.minute }}'</span>
            <span class="ms-label">{{ m.label }}</span>
            <span class="ms-score">
              <span class="red">{{ m.red }}</span>
              <span class="sim-sep">—</span>
              <span class="black">{{ m.black }}</span>
            </span>
          </div>
        </div>
      </div>

      <div v-if="result.warnings.length" class="warnings">
        <el-alert
          v-for="w in result.warnings"
          :key="w"
          :title="w"
          type="warning"
          :closable="false"
          show-icon
          style="margin-top: 8px"
        />
      </div>

      <div class="factor-section">
        <el-collapse>
          <el-collapse-item title="影响因素详情" name="factors">
            <ul>
              <li v-for="factor in result.factors" :key="factor">{{ factor }}</li>
            </ul>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { useAnnualStatsStore } from '../stores/annualStatsStore';
import { combinedWinProbability, simulateMatchup } from '../utils/winPrediction';

const store = useAnnualStatsStore();
const playerList = computed(() => store.playerAnnualStats);
const redTeam = ref([]);
const blackTeam = ref([]);
const result = ref(null);
const targetScore = ref(140);
const maxMinutes = ref(100);

function resetTeams() {
  redTeam.value = [];
  blackTeam.value = [];
  result.value = null;
}

function toggle(team, name) {
  const self = team === 'red' ? redTeam : blackTeam;
  const other = team === 'red' ? blackTeam : redTeam;
  if (other.value.includes(name)) return; // 在对方队伍里，不可点
  const i = self.value.indexOf(name);
  if (i >= 0) self.value.splice(i, 1);
  else self.value.push(name);
}

function predictWinRate() {
  if (redTeam.value.length === 0 || blackTeam.value.length === 0) {
    ElMessage.warning('请为两支队伍各选至少一名球员');
    return;
  }
  const overlap = redTeam.value.filter(n => blackTeam.value.includes(n));
  if (overlap.length > 0) {
    ElMessage.error(`球员 ${overlap.join('、')} 不能同时出现在两队`);
    return;
  }
  if (!store.leagueStats) {
    ElMessage.error('联盟统计未就绪，请稍后再试');
    return;
  }

  const redStats = playerList.value.filter(p => redTeam.value.includes(p.name));
  const blackStats = playerList.value.filter(p => blackTeam.value.includes(p.name));

  const { pRed, pBlack, breakdown } = combinedWinProbability(
    redStats,
    blackStats,
    store.leagueStats,
    store.playerEloRatings,
  );

  const warnings = [];
  const lowSample = [...redStats, ...blackStats].filter(p => p.gamesPlayed < 3);
  if (lowSample.length > 0) {
    warnings.push(`${lowSample.map(p => p.name).join('、')} 出场样本不足 3 场，预测置信度较低`);
  }
  if (redStats.length !== blackStats.length) {
    warnings.push(`两队人数不一致（${redStats.length} vs ${blackStats.length}），已按人均能力归一化`);
  }

  const factors = [
    `红队人均得分/分钟：${perMin(redStats, 'pointsPerMin')}（黑队 ${perMin(blackStats, 'pointsPerMin')}）`,
    `红队人均正负值/分钟：${perMin(redStats, 'plusMinusPerMin')}（黑队 ${perMin(blackStats, 'plusMinusPerMin')}）`,
    `红队人均犯规/分钟：${perMin(redStats, 'foulsPerMin')}（黑队 ${perMin(blackStats, 'foulsPerMin')}）`,
    `红队贝叶斯调整胜率：${adjPct(redStats)}%（黑队 ${adjPct(blackStats)}%）`,
  ];

  // 得分模拟
  const sim = simulateMatchup(redStats, blackStats, {
    target: targetScore.value,
    maxMinutes: maxMinutes.value,
  });

  // 一场样例的关键节点（每 25% 目标分一个节点）
  const milestones = buildMilestones(sim.sampleTrajectory, targetScore.value);

  result.value = {
    redWinRate: (pRed * 100).toFixed(1),
    blackWinRate: (pBlack * 100).toFixed(1),
    box: {
      redPct: (breakdown.box.pRed * 100).toFixed(1),
      blackPct: ((1 - breakdown.box.pRed) * 100).toFixed(1),
    },
    elo: {
      redPct: (breakdown.elo.pRed * 100).toFixed(1),
      blackPct: ((1 - breakdown.elo.pRed) * 100).toFixed(1),
      redElo: breakdown.elo.redElo.toFixed(0),
      blackElo: breakdown.elo.blackElo.toFixed(0),
    },
    sim: {
      target: targetScore.value,
      maxMinutes: maxMinutes.value,
      expectedRed: sim.expectedRedScore.toFixed(1),
      expectedBlack: sim.expectedBlackScore.toFixed(1),
      expectedMinutes: sim.expectedMinutes.toFixed(1),
      redReachedPct: (sim.redReachedPct * 100).toFixed(1),
      blackReachedPct: (sim.blackReachedPct * 100).toFixed(1),
      timeUpPct: (sim.timeUpPct * 100).toFixed(1),
      redRate: sim.rates.red.toFixed(2),
      blackRate: sim.rates.black.toFixed(2),
      milestones,
      finalRed: sim.sampleTrajectory[sim.sampleTrajectory.length - 1].red,
      finalBlack: sim.sampleTrajectory[sim.sampleTrajectory.length - 1].black,
      finalMinute: sim.sampleTrajectory[sim.sampleTrajectory.length - 1].minute,
    },
    factors,
    warnings,
  };
}

function buildMilestones(traj, target) {
  // 按 4 节切分：1节末=25%目标分，2节末=50%，3节末=75%，4节末=100%
  const ms = [];
  const thresholds = [1, 2, 3, 4].map(q => Math.round(target * q / 4));
  const labels = ['1节结束', '2节结束', '3节结束', '4节结束'];
  let idx = 0;
  for (const point of traj) {
    while (idx < thresholds.length && Math.max(point.red, point.black) >= thresholds[idx]) {
      ms.push({
        label: labels[idx],
        minute: point.minute,
        red: point.red,
        black: point.black,
      });
      idx++;
    }
    if (idx >= thresholds.length) break;
  }
  if (ms.length === 0 || ms[ms.length - 1].minute < traj[traj.length - 1].minute) {
    const last = traj[traj.length - 1];
    ms.push({
      label: last.red >= target || last.black >= target ? '比赛结束' : '时间到',
      minute: last.minute,
      red: last.red,
      black: last.black,
    });
  }
  return ms;
}

function perMin(players, field) {
  if (players.length === 0) return '0.000';
  const m = players.reduce((s, p) => s + p[field], 0) / players.length;
  return m.toFixed(3);
}

function adjPct(players) {
  if (players.length === 0) return '0.0';
  const m = players.reduce((s, p) => s + p.adjustedWinRate, 0) / players.length;
  return (m * 100).toFixed(1);
}
</script>

<style scoped>
.win-prediction-panel {
  margin-bottom: 24px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}
.team-select {
  margin-bottom: 16px;
}
.team-label {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.red-label { color: #f56c6c; }
.black-label { color: #303133; }
.team-count {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
}
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  background: #fafafa;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  min-height: 40px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 14px;
  font-size: 13px;
  color: #303133;
  cursor: pointer;
  user-select: none;
  transition: all .15s;
}
.chip:hover:not(.chip-disabled) {
  border-color: #c0c4cc;
  background: #f5f7fa;
}
.chip small {
  font-size: 11px;
  color: #909399;
}
.chip-red {
  background: #f56c6c;
  border-color: #f56c6c;
  color: #fff;
}
.chip-red small { color: #fde2e2; }
.chip-black {
  background: #303133;
  border-color: #303133;
  color: #fff;
}
.chip-black small { color: #c0c4cc; }
.chip-disabled {
  opacity: .35;
  cursor: not-allowed;
}
.predict-action {
  margin: 16px 0;
  text-align: center;
}
.sim-config {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 6px;
}
.cfg-label {
  font-size: 13px;
  color: #606266;
}
.sim-section {
  margin-top: 16px;
  padding: 14px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}
.sim-title {
  font-size: 15px;
  font-weight: bold;
  margin-bottom: 12px;
}
.sim-score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 8px 0;
}
.sim-team {
  font-size: 13px;
  color: #909399;
}
.sim-team.red { color: #f56c6c; }
.sim-team.black { color: #303133; }
.sim-num {
  font-size: 32px;
  font-weight: bold;
  min-width: 60px;
  text-align: center;
}
.sim-num.red { color: #f56c6c; }
.sim-num.black { color: #303133; }
.sim-sep {
  color: #c0c4cc;
}
.sim-meta {
  text-align: center;
  font-size: 12px;
  color: #909399;
  margin-bottom: 12px;
}
.sim-outcome {
  font-size: 13px;
  color: #606266;
  background: #fafafa;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 12px;
}
.outcome-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
}
.outcome-pct {
  font-weight: bold;
}
.outcome-pct.red { color: #f56c6c; }
.outcome-pct.black { color: #303133; }
.outcome-pct.dim { color: #909399; }
.sim-trajectory {
  font-size: 13px;
}
.sim-subtitle {
  color: #909399;
  margin-bottom: 6px;
}
.ms-row {
  display: flex;
  gap: 10px;
  padding: 3px 0;
  align-items: baseline;
}
.ms-time {
  color: #909399;
  width: 36px;
  font-variant-numeric: tabular-nums;
}
.ms-label {
  flex: 1;
}
.ms-score {
  font-variant-numeric: tabular-nums;
}
.ms-score .red { color: #f56c6c; font-weight: bold; }
.ms-score .black { color: #303133; font-weight: bold; }
.result-section {
  margin-top: 24px;
  background: #f7f7fa;
  border-radius: 8px;
  padding: 16px;
}
.result-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 12px;
}
.team-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 8px;
}
.team-name {
  font-size: 16px;
  font-weight: bold;
}
.team-name.red { color: #f56c6c; }
.team-name.black { color: #303133; }
.win-rate {
  font-size: 22px;
  font-weight: bold;
}
.win-rate.red { color: #f56c6c; }
.win-rate.black { color: #303133; }
.bar {
  display: flex;
  height: 14px;
  border-radius: 7px;
  overflow: hidden;
  margin: 12px 0 16px;
  background: #e4e7ed;
}
.bar-red { background: #f56c6c; }
.bar-black { background: #303133; }
.model-breakdown {
  font-size: 13px;
  color: #606266;
  background: #fff;
  border-radius: 6px;
  padding: 10px 12px;
}
.breakdown-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}
.breakdown-label {
  color: #909399;
}
.dim {
  color: #c0c4cc;
}
.factor-section {
  margin-top: 12px;
  font-size: 14px;
}
ul {
  padding-left: 20px;
}
</style>
