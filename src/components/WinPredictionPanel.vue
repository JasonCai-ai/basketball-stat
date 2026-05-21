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
      <el-col :span="12">
        <div class="team-select">
          <div class="team-label red-label">红队阵容</div>
          <el-select
            v-model="redTeam"
            multiple
            placeholder="选择球员"
            style="width: 100%"
          >
            <el-option
              v-for="player in playerList"
              :key="player.name"
              :label="`${player.name}（${player.gamesPlayed}场）`"
              :value="player.name"
              :disabled="blackTeam.includes(player.name)"
            />
          </el-select>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="team-select">
          <div class="team-label black-label">黑队阵容</div>
          <el-select
            v-model="blackTeam"
            multiple
            placeholder="选择球员"
            style="width: 100%"
          >
            <el-option
              v-for="player in playerList"
              :key="player.name"
              :label="`${player.name}（${player.gamesPlayed}场）`"
              :value="player.name"
              :disabled="redTeam.includes(player.name)"
            />
          </el-select>
        </div>
      </el-col>
    </el-row>

    <div class="predict-action">
      <el-button type="primary" @click="predictWinRate">预测胜率</el-button>
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
import { combinedWinProbability } from '../utils/winPrediction';

const store = useAnnualStatsStore();
const playerList = computed(() => store.playerAnnualStats);
const redTeam = ref([]);
const blackTeam = ref([]);
const result = ref(null);

function resetTeams() {
  redTeam.value = [];
  blackTeam.value = [];
  result.value = null;
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
    factors,
    warnings,
  };
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
}
.red-label { color: #f56c6c; }
.black-label { color: #303133; }
.predict-action {
  margin: 16px 0;
  text-align: center;
}
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
