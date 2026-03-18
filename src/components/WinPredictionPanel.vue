<template>
  <el-card class="win-prediction-panel" shadow="hover">
    <template #header>
      <div class="card-header">
        <span>比赛胜负预测</span>
        <el-tag type="info">年度数据驱动</el-tag>
      </div>
    </template>
    <el-row :gutter="20">
      <el-col :span="12">
        <div class="team-select">
          <div class="team-label">红队阵容</div>
          <el-select v-model="redTeam" multiple placeholder="选择球员" style="width: 100%">
            <el-option v-for="player in playerList" :key="player.name" :label="player.name" :value="player.name" />
          </el-select>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="team-select">
          <div class="team-label">黑队阵容</div>
          <el-select v-model="blackTeam" multiple placeholder="选择球员" style="width: 100%">
            <el-option v-for="player in playerList" :key="player.name" :label="player.name" :value="player.name" />
          </el-select>
        </div>
      </el-col>
    </el-row>
    <div class="predict-action">
      <el-button type="primary" @click="predictWinRate">预测胜率</el-button>
    </div>
    <div v-if="result" class="result-section">
      <div class="result-title">预测结果</div>
      <el-row :gutter="20">
        <el-col :span="12">
          <div class="team-result">
            <span class="team-name">红队</span>
            <span class="win-rate">胜率：{{ result.redWinRate }}%</span>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="team-result">
            <span class="team-name">黑队</span>
            <span class="win-rate">胜率：{{ result.blackWinRate }}%</span>
          </div>
        </el-col>
      </el-row>
      <div class="factor-section">
        <div>主要影响因素：</div>
        <ul>
          <li v-for="factor in result.factors" :key="factor">{{ factor }}</li>
        </ul>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAnnualStatsStore } from '../stores/annualStatsStore';

const store = useAnnualStatsStore();
const playerList = computed(() => store.playerAnnualStats);
const redTeam = ref([]);
const blackTeam = ref([]);
const result = ref(null);

function predictWinRate() {
  // 获取双方球员年度数据
  const redStats = playerList.value.filter(p => redTeam.value.includes(p.name));
  const blackStats = playerList.value.filter(p => blackTeam.value.includes(p.name));

  // 团队指标
  function calcTeamScore(stats) {
    const totalPoints = stats.reduce((sum, p) => sum + p.avgPoints, 0);
    const totalPlusMinus = stats.reduce((sum, p) => sum + p.avgPlusMinus, 0);
    const totalFouls = stats.reduce((sum, p) => sum + p.avgFouls, 0);
    const avgWinRate = stats.length > 0 ? stats.reduce((sum, p) => sum + p.winRate, 0) / stats.length : 0;
    return {
      totalPoints,
      totalPlusMinus,
      totalFouls,
      avgWinRate
    };
  }

  const redScore = calcTeamScore(redStats);
  const blackScore = calcTeamScore(blackStats);

  // 综合评分
  function calcComposite(s) {
    return s.totalPoints * 0.4 + s.totalPlusMinus * 0.3 - s.totalFouls * 0.2 + s.avgWinRate * 0.1;
  }

  const redComposite = calcComposite(redScore);
  const blackComposite = calcComposite(blackScore);

  // 胜率
  const total = redComposite + blackComposite;
  const redWinRate = total > 0 ? ((redComposite / total) * 100).toFixed(1) : '50.0';
  const blackWinRate = total > 0 ? ((blackComposite / total) * 100).toFixed(1) : '50.0';

  // 主要影响因素
  const factors = [
    `红队场均得分：${redScore.totalPoints.toFixed(1)}`,
    `黑队场均得分：${blackScore.totalPoints.toFixed(1)}`,
    `红队场均正负值：${redScore.totalPlusMinus.toFixed(1)}`,
    `黑队场均正负值：${blackScore.totalPlusMinus.toFixed(1)}`,
    `红队场均犯规：${redScore.totalFouls.toFixed(1)}`,
    `黑队场均犯规：${blackScore.totalFouls.toFixed(1)}`,
    `红队平均胜率：${redScore.avgWinRate.toFixed(1)}%`,
    `黑队平均胜率：${blackScore.avgWinRate.toFixed(1)}%`
  ];

  result.value = {
    redWinRate,
    blackWinRate,
    factors
  };
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
.win-rate {
  font-size: 16px;
  color: #409eff;
}
.factor-section {
  margin-top: 12px;
  font-size: 14px;
}
ul {
  padding-left: 20px;
}
</style>
