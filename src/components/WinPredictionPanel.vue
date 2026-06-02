<template>
  <el-card class="win-prediction-panel" shadow="hover">
    <template #header>
      <div class="card-header">
        <span>比赛胜负预测</span>
        <el-tag type="info">年度数据驱动</el-tag>
      </div>
    </template>
    <div class="signup-captain-section">
      <div class="signup-captain-header">
        <div>
          <div class="section-title">报名名单队长</div>
          <div class="section-subtitle">结合当前报名名单，按战力分批后在同批次里随机抽两位队长。</div>
        </div>
        <el-button
          type="warning"
          :loading="isPickingCaptains"
          :disabled="selectedSignupPlayers.length < 2"
          @click="pickBalancedCaptains"
        >
          随机选队长
        </el-button>
      </div>

      <div class="signup-tags">
        <el-tag type="info">报名人数 {{ selectedSignupPlayers.length }}</el-tag>
        <el-tag type="success">年度 {{ statsYear }} 数据</el-tag>
      </div>

      <el-empty v-if="selectedSignupPlayers.length < 2" description="报名名单至少需要 2 人才可选队长" />

      <div v-else-if="captainPair" class="captain-result">
        <div class="captain-result-meta">
          <el-tag type="warning">{{ captainPair.bucketLabel }}</el-tag>
          <el-tag type="info">战力差 {{ captainPair.powerGap }}</el-tag>
          <el-tag :type="captainPair.hasFallback ? 'warning' : 'success'">
            {{ captainPair.hasFallback ? '含默认战力 50' : '全部使用年度战力' }}
          </el-tag>
        </div>

        <div class="captain-cards">
          <div class="captain-card captain-card-red">
            <div class="captain-label">队长 A</div>
            <div class="captain-name">{{ captainPair.first.name }}</div>
            <div class="captain-number">{{ captainPair.first.number }} 号</div>
            <div class="captain-power">战力 {{ captainPair.first.powerRating }}</div>
          </div>

          <div class="captain-vs">VS</div>

          <div class="captain-card captain-card-blue">
            <div class="captain-label">队长 B</div>
            <div class="captain-name">{{ captainPair.second.name }}</div>
            <div class="captain-number">{{ captainPair.second.number }} 号</div>
            <div class="captain-power">战力 {{ captainPair.second.powerRating }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="signupPlayerStats.length" class="signup-roster-section">
      <div class="section-title">报名名单</div>
      <div class="signup-roster-list">
        <div
          v-for="player in signupPlayerStats"
          :key="player.name"
          class="signup-roster-item"
          :class="signupSelectionClass(player.name)"
        >
          <div class="signup-player-main">
            <span class="signup-player-number">{{ player.number }}</span>
            <span class="signup-player-name">{{ player.name }}</span>
          </div>
          <div class="signup-player-meta">
            <span class="signup-player-power">战力 {{ player.powerRating }}</span>
            <el-tag v-if="redTeam.includes(player.name)" type="danger" size="small">红队</el-tag>
            <el-tag v-else-if="blackTeam.includes(player.name)" type="primary" size="small">黑队</el-tag>
            <el-tag v-else type="info" size="small">未分队</el-tag>
          </div>
        </div>
      </div>
    </div>

    <div class="candidate-pool-section">
      <div class="candidate-pool-header">
        <div>
          <div class="section-title">球员候选池</div>
          <div class="section-subtitle">在这里把球员临时分到红队或黑队做胜率预测。</div>
        </div>
        <div class="signup-tags candidate-pool-tags">
          <el-tag type="warning">{{ candidatePoolSourceLabel }}</el-tag>
          <el-tag type="info">候选 {{ predictionCandidates.length }} 人</el-tag>
        </div>
      </div>

      <div class="signup-roster-list">
        <div
          v-for="player in predictionCandidates"
          :key="`candidate-${player.name}`"
          class="signup-roster-item"
          :class="signupSelectionClass(player.name)"
        >
          <div class="signup-player-main">
            <span class="signup-player-number">{{ player.number }}</span>
            <span class="signup-player-name">{{ player.name }}</span>
          </div>
          <div class="signup-player-meta">
            <span class="signup-player-power">战力 {{ player.powerRating }}</span>
            <el-tag v-if="redTeam.includes(player.name)" type="danger" size="small">红队</el-tag>
            <el-tag v-else-if="blackTeam.includes(player.name)" type="primary" size="small">黑队</el-tag>
            <el-tag v-else type="info" size="small">待选</el-tag>
          </div>
          <div class="signup-player-actions">
            <el-button size="small" type="danger" plain @click="assignPlayerToTeam(player.name, 'red')">红队</el-button>
            <el-button size="small" type="primary" plain @click="assignPlayerToTeam(player.name, 'black')">黑队</el-button>
            <el-button size="small" :disabled="!isAssigned(player.name)" @click="removeFromPrediction(player.name)">移除</el-button>
          </div>
        </div>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :span="12">
        <div class="team-select">
          <div class="team-label">红队阵容</div>
          <div class="selected-team-panel selected-team-panel-red">
            <el-empty v-if="!redTeamPlayers.length" description="从报名名单分配到红队" :image-size="80" />
            <div v-else class="selected-team-tags">
              <el-tag
                v-for="player in redTeamPlayers"
                :key="`red-${player.name}`"
                type="danger"
                class="selected-team-tag"
                closable
                @close="removeFromPrediction(player.name)"
              >
                {{ player.number }}号 {{ player.name }}
              </el-tag>
            </div>
          </div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="team-select">
          <div class="team-label">黑队阵容</div>
          <div class="selected-team-panel selected-team-panel-blue">
            <el-empty v-if="!blackTeamPlayers.length" description="从报名名单分配到黑队" :image-size="80" />
            <div v-else class="selected-team-tags">
              <el-tag
                v-for="player in blackTeamPlayers"
                :key="`black-${player.name}`"
                type="primary"
                class="selected-team-tag"
                closable
                @close="removeFromPrediction(player.name)"
              >
                {{ player.number }}号 {{ player.name }}
              </el-tag>
            </div>
          </div>
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
import { ref, computed, watch } from 'vue';
import { useAnnualStatsStore } from '../stores/annualStatsStore';
import { useGameStore } from '../stores/gameStore';
import { useToastStore } from '../stores/toastStore';

const store = useAnnualStatsStore();
const gameStore = useGameStore();
const toastStore = useToastStore();
const POWER_BUCKET_SIZE = 8;

const playerList = computed(() => store.playerAnnualStats);
const selectedSignupPlayers = computed(() => {
  return gameStore.players.slice().sort((a, b) => {
    const numberDiff = (Number(a.number) || 0) - (Number(b.number) || 0);
    if (numberDiff !== 0) return numberDiff;
    return (a.name || '').localeCompare(b.name || '');
  });
});
const signupPlayerStats = computed(() => {
  const statsByName = new Map(playerList.value.map(player => [player.name, player]));
  return selectedSignupPlayers.value.map(player => {
    const stats = statsByName.get(player.name);
    return {
      ...player,
      powerRating: stats?.powerRating ?? 50,
    };
  });
});
const predictionCandidates = computed(() => {
  if (signupPlayerStats.value.length) return signupPlayerStats.value;

  return playerList.value.map(player => ({
    name: player.name,
    number: player.number,
    powerRating: player.powerRating ?? 50,
  }));
});
const candidatePoolSourceLabel = computed(() => signupPlayerStats.value.length ? '来源：报名名单' : '来源：年度球员池');
const statsYear = computed(() => store.currentYear || new Date().getFullYear());
const redTeam = ref([]);
const blackTeam = ref([]);
const result = ref(null);
const captainPair = ref(null);
const isPickingCaptains = ref(false);
const redTeamPlayers = computed(() => predictionCandidates.value.filter(player => redTeam.value.includes(player.name)));
const blackTeamPlayers = computed(() => predictionCandidates.value.filter(player => blackTeam.value.includes(player.name)));

watch(predictionCandidates, (candidates) => {
  const allowedNames = new Set(candidates.map(player => player.name));
  redTeam.value = redTeam.value.filter(name => allowedNames.has(name));
  blackTeam.value = blackTeam.value.filter(name => allowedNames.has(name));
}, { immediate: true });

function isAssigned(playerName) {
  return redTeam.value.includes(playerName) || blackTeam.value.includes(playerName);
}

function assignPlayerToTeam(playerName, team) {
  if (team === 'red') {
    if (!redTeam.value.includes(playerName)) {
      redTeam.value = [...redTeam.value, playerName];
    }
    blackTeam.value = blackTeam.value.filter(name => name !== playerName);
    return;
  }

  if (!blackTeam.value.includes(playerName)) {
    blackTeam.value = [...blackTeam.value, playerName];
  }
  redTeam.value = redTeam.value.filter(name => name !== playerName);
}

function removeFromPrediction(playerName) {
  redTeam.value = redTeam.value.filter(name => name !== playerName);
  blackTeam.value = blackTeam.value.filter(name => name !== playerName);
}

function signupSelectionClass(playerName) {
  if (redTeam.value.includes(playerName)) return 'signup-roster-item-red';
  if (blackTeam.value.includes(playerName)) return 'signup-roster-item-blue';
  return 'signup-roster-item-idle';
}

async function pickBalancedCaptains() {
  if (selectedSignupPlayers.value.length < 2) {
    toastStore.warning('报名名单至少先选 2 人');
    return;
  }

  isPickingCaptains.value = true;

  try {
    const statsByName = new Map(
      playerList.value.map(player => [player.name, player.powerRating])
    );
    const enrichedPlayers = selectedSignupPlayers.value.map(player => {
      const powerRating = statsByName.get(player.name);
      return {
        ...player,
        powerRating: typeof powerRating === 'number' ? powerRating : 50,
        usedFallback: typeof powerRating !== 'number',
      };
    });

    const knownPlayers = enrichedPlayers.filter(player => !player.usedFallback);
    const sourcePlayers = knownPlayers.length >= 2 ? knownPlayers : enrichedPlayers;

    const bucketMap = new Map();
    sourcePlayers.forEach((player) => {
      const bucketIndex = Math.floor(player.powerRating / POWER_BUCKET_SIZE);
      if (!bucketMap.has(bucketIndex)) {
        bucketMap.set(bucketIndex, []);
      }
      bucketMap.get(bucketIndex).push(player);
    });

    const eligibleBuckets = Array.from(bucketMap.entries()).filter(([, players]) => players.length >= 2);
    if (eligibleBuckets.length === 0) {
      toastStore.warning('当前报名名单不足以生成队长组合');
      return;
    }

    const randomBucket = eligibleBuckets[Math.floor(Math.random() * eligibleBuckets.length)];
    const [bucketIndex, bucketPlayers] = randomBucket;
    const shuffledPlayers = bucketPlayers.slice().sort(() => Math.random() - 0.5);
    const [first, second] = shuffledPlayers;
    const bucketStart = bucketIndex * POWER_BUCKET_SIZE;
    const bucketEnd = bucketStart + POWER_BUCKET_SIZE - 1;

    captainPair.value = {
      first,
      second,
      powerGap: Math.abs(first.powerRating - second.powerRating),
      hasFallback: first.usedFallback || second.usedFallback,
      bucketLabel: `战力批次 ${bucketStart}-${bucketEnd}`,
    };
    toastStore.success(`已生成队长：${first.name} 和 ${second.name}`);
  } catch (error) {
    console.error('生成队长失败:', error);
    toastStore.error(`生成队长失败: ${error.message || '未知错误'}`);
  } finally {
    isPickingCaptains.value = false;
  }
}

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
.signup-captain-section {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  background: linear-gradient(180deg, #fffaf2 0%, #fff 100%);
}
.signup-captain-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}
.section-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 4px;
}
.section-subtitle {
  color: #606266;
  font-size: 13px;
}
.signup-roster-section {
  margin-bottom: 20px;
}
.candidate-pool-section {
  margin-bottom: 20px;
}
.candidate-pool-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}
.candidate-pool-tags {
  margin-bottom: 0;
}
.signup-roster-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.signup-roster-item {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #fff;
  transition: all 0.2s ease;
}
.signup-roster-item-red {
  border-color: #f56c6c;
  background: #fff1f0;
  box-shadow: inset 0 0 0 1px rgba(245, 108, 108, 0.18);
}
.signup-roster-item-blue {
  border-color: #409eff;
  background: #f0f7ff;
  box-shadow: inset 0 0 0 1px rgba(64, 158, 255, 0.18);
}
.signup-roster-item-idle {
  opacity: 0.88;
}
.signup-player-main {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.signup-player-number {
  min-width: 28px;
  height: 28px;
  line-height: 28px;
  text-align: center;
  border-radius: 999px;
  background: #f3f4f6;
  font-weight: 700;
  color: #374151;
}
.signup-player-name {
  font-weight: 700;
  color: #1f2937;
}
.signup-player-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.signup-player-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.signup-player-power {
  font-size: 13px;
  color: #6b7280;
}
.signup-tags {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.captain-result {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.captain-result-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.captain-cards {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}
.captain-card {
  min-width: 220px;
  padding: 20px;
  border-radius: 16px;
  color: white;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
}
.captain-card-red {
  background: linear-gradient(135deg, #f56c6c, #fb8c62);
}
.captain-card-blue {
  background: linear-gradient(135deg, #409eff, #36cfc9);
}
.captain-label {
  font-size: 13px;
  opacity: 0.9;
  margin-bottom: 8px;
}
.captain-name {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}
.captain-number,
.captain-power {
  margin-top: 8px;
  font-size: 15px;
}
.captain-vs {
  font-size: 20px;
  font-weight: 700;
  color: #909399;
}
.team-select {
  margin-bottom: 16px;
}
.team-label {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 8px;
}
.selected-team-panel {
  min-height: 120px;
  border-radius: 12px;
  border: 1px dashed #dcdfe6;
  padding: 12px;
  background: #fff;
}
.selected-team-panel-red {
  background: linear-gradient(180deg, #fff7f7 0%, #fff 100%);
}
.selected-team-panel-blue {
  background: linear-gradient(180deg, #f5f9ff 0%, #fff 100%);
}
.selected-team-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.selected-team-tag {
  margin: 0;
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
@media (max-width: 768px) {
  .signup-captain-header {
    flex-direction: column;
  }

  .captain-cards {
    flex-direction: column;
  }

  .signup-player-actions {
    flex-wrap: wrap;
  }

  .candidate-pool-header {
    flex-direction: column;
  }
}
</style>
