<template>
  <div class="match-history-page">
    <el-container>
      <el-header height="60px" class="page-header">
        <h1>历史比分记录</h1>
        <div class="header-actions">
          <el-button size="small" @click="goBack">返回主页</el-button>
          <el-select
            v-model="selectedYear"
            placeholder="选择年份"
            @change="handleYearChange"
            style="width: 130px;"
          >
            <el-option
              v-for="year in availableYears"
              :key="year"
              :label="`${year}年`"
              :value="year"
            />
          </el-select>
          <el-button
            type="primary"
            :loading="store.loading"
            @click="refreshData"
            :icon="RefreshIcon"
          >
            刷新数据
          </el-button>
        </div>
      </el-header>

      <el-main class="history-main">
        <!-- 加载状态 -->
        <div v-if="store.loading" class="loading-container">
          <el-icon class="is-loading" :size="50">
            <Loading />
          </el-icon>
          <p>正在加载 {{ selectedYear }} 年赛程...</p>
        </div>

        <!-- 比赛列表 -->
        <div v-else-if="matchList.length > 0" class="match-list">
          <div
            v-for="match in matchList"
            :key="match.date"
            class="match-card"
            @click="showMatchDetail(match)"
          >
            <div class="match-date">{{ formatDate(match.date) }}</div>
            <div class="match-body">
              <div class="teams">
                <div class="team-row" :class="{ winner: match.winner === '红队' }">
                  <span class="team-dot red"></span>
                  <span class="team-name">红队</span>
                  <span class="team-score">{{ match.redScore }}</span>
                  <el-icon v-if="match.winner === '红队'" class="win-arrow"><CaretLeft /></el-icon>
                </div>
                <div class="team-row" :class="{ winner: match.winner === '黑队' }">
                  <span class="team-dot black"></span>
                  <span class="team-name">黑队</span>
                  <span class="team-score">{{ match.blackScore }}</span>
                  <el-icon v-if="match.winner === '黑队'" class="win-arrow"><CaretLeft /></el-icon>
                </div>
              </div>
              <div class="match-status">
                <span class="status-text">已结束</span>
                <span class="status-sub">{{ match.playerCount }}人参与</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <el-empty
          v-else
          description="暂无比赛记录"
          :image-size="200"
        >
          <el-button type="primary" @click="refreshData">加载数据</el-button>
        </el-empty>
      </el-main>
    </el-container>

    <!-- 比赛详情对话框 -->
    <el-dialog
      v-model="showDetailDialog"
      :title="detailTitle"
      width="92%"
      top="5vh"
      :close-on-click-modal="false"
    >
      <div v-if="selectedMatch" class="detail-content">
        <!-- 比分概览 -->
        <div class="detail-score">
          <div class="detail-team" :class="{ winner: selectedMatch.winner === '红队' }">
            <span class="detail-team-name red">红队</span>
            <span class="detail-team-score">{{ selectedMatch.redScore }}</span>
          </div>
          <span class="detail-vs">VS</span>
          <div class="detail-team" :class="{ winner: selectedMatch.winner === '黑队' }">
            <span class="detail-team-score">{{ selectedMatch.blackScore }}</span>
            <span class="detail-team-name black">黑队</span>
          </div>
        </div>

        <!-- 比赛合照 -->
        <div v-if="matchPhotos.length" class="match-photos">
          <h3 class="team-title photo-title">比赛合照</h3>
          <div class="photo-grid">
            <el-image
              v-for="(url, i) in matchPhotos"
              :key="url"
              :src="url"
              :preview-src-list="matchPhotos"
              :initial-index="i"
              fit="cover"
              class="photo-thumb"
              preview-teleported
              hide-on-click-modal
              loading="lazy"
            >
              <template #error>
                <div class="photo-error">图片加载失败</div>
              </template>
            </el-image>
          </div>
        </div>

        <!-- 红队球员数据 -->
        <h3 class="team-title red-title">红队球员数据</h3>
        <el-table :data="redPlayers" stripe border size="small" style="width: 100%;">
          <el-table-column type="index" label="#" width="44" align="center" />
          <el-table-column prop="number" label="号码" width="60" align="center" />
          <el-table-column prop="name" label="姓名" min-width="90" align="center" />
          <el-table-column prop="score" label="得分" width="70" align="center" sortable>
            <template #default="{ row }">
              <span class="highlight-points">{{ row.score }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="plusMinus" label="正负值" width="90" align="center" sortable>
            <template #default="{ row }">
              <el-tag :type="getPlusMinusType(row.plusMinus)">
                {{ row.plusMinus > 0 ? '+' : '' }}{{ row.plusMinus }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="playMinutes" label="时长(分)" width="90" align="center" sortable />
          <el-table-column prop="fouls" label="犯规" width="70" align="center" sortable />
          <el-table-column label="当场表现" width="110" align="center">
            <template #default="{ row }">
              <el-tooltip
                v-if="row.performance"
                effect="dark"
                placement="top"
                :content="row.performance.desc"
              >
                <el-tag :type="row.performance.type" :effect="row.performance.effect">
                  {{ row.performance.text }}
                </el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>

        <!-- 黑队球员数据 -->
        <h3 class="team-title black-title">黑队球员数据</h3>
        <el-table :data="blackPlayers" stripe border size="small" style="width: 100%;">
          <el-table-column type="index" label="#" width="44" align="center" />
          <el-table-column prop="number" label="号码" width="60" align="center" />
          <el-table-column prop="name" label="姓名" min-width="90" align="center" />
          <el-table-column prop="score" label="得分" width="70" align="center" sortable>
            <template #default="{ row }">
              <span class="highlight-points">{{ row.score }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="plusMinus" label="正负值" width="90" align="center" sortable>
            <template #default="{ row }">
              <el-tag :type="getPlusMinusType(row.plusMinus)">
                {{ row.plusMinus > 0 ? '+' : '' }}{{ row.plusMinus }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="playMinutes" label="时长(分)" width="90" align="center" sortable />
          <el-table-column prop="fouls" label="犯规" width="70" align="center" sortable />
          <el-table-column label="当场表现" width="110" align="center">
            <template #default="{ row }">
              <el-tooltip
                v-if="row.performance"
                effect="dark"
                placement="top"
                :content="row.performance.desc"
              >
                <el-tag :type="row.performance.type" :effect="row.performance.effect">
                  {{ row.performance.text }}
                </el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <template #footer>
        <el-button @click="showDetailDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAnnualStatsStore } from '../stores/annualStatsStore';
import { ElMessage } from 'element-plus';
import { Refresh, Loading, CaretLeft } from '@element-plus/icons-vue';
import { evaluatePerformances, buildKey } from '../utils/performance';

const router = useRouter();
const RefreshIcon = Refresh;

const store = useAnnualStatsStore();
const selectedYear = ref(new Date().getFullYear());
const showDetailDialog = ref(false);
const selectedMatch = ref(null);

// 可选年份（从2024到当前年份）
const availableYears = computed(() => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let year = 2024; year <= currentYear; year++) {
    years.push(year);
  }
  return years.reverse();
});

// 比赛列表（按日期倒序，最新在前）
const matchList = computed(() => {
  return [...store.gamesData]
    .map((game) => {
      const gameInfo = game.data?.game?.[0] || {};
      const teamScores = gameInfo.teamScores || {};
      const players = gameInfo.players || [];
      const redScore = teamScores['红队'] || 0;
      const blackScore = teamScores['黑队'] || 0;
      const winner = redScore > blackScore ? '红队' : (blackScore > redScore ? '黑队' : null);
      const playerCount = players.filter(
        (p) => (p.totalTime || 0) + (p.currentTime || 0) > 0
      ).length;
      return { date: game.date, redScore, blackScore, winner, playerCount, players };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
});

// 详情对话框标题
const detailTitle = computed(() => {
  if (!selectedMatch.value) return '';
  return `${formatDate(selectedMatch.value.date)} 比赛详情`;
});

// 全场上场球员（含队伍、整理后的数据），作为表现评估的统一样本
const playedPlayers = computed(() => {
  if (!selectedMatch.value) return [];
  return selectedMatch.value.players
    .map((p) => {
      const playTime = (p.totalTime || 0) + (p.currentTime || 0);
      return {
        name: p.name,
        number: p.number,
        team: p.team,
        score: p.score || 0,
        plusMinus: p.plusMinus || 0,
        playMinutes: Math.round(playTime / 60),
        fouls: p.fouls || 0,
        playTime,
      };
    })
    .filter((p) => p.playTime > 0);
});

// 基于全场分布计算每名球员的"当场表现"评语
const performanceMap = computed(() => evaluatePerformances(playedPlayers.value));

// 将某队的球员数据整理为表格数据（按得分倒序），并附上当场表现评语
const buildPlayers = (team) => {
  return playedPlayers.value
    .filter((p) => p.team === team)
    .map((p) => ({ ...p, performance: performanceMap.value.get(buildKey(p)) }))
    .sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
};

const redPlayers = computed(() => buildPlayers('红队'));
const blackPlayers = computed(() => buildPlayers('黑队'));

// 当前比赛的合照 URL 列表
const matchPhotos = computed(() => {
  if (!selectedMatch.value) return [];
  return store.getGamePhotos(selectedMatch.value.date);
});

// 返回主页
const goBack = () => {
  router.push('/dashboard');
};

// 切换年份
const handleYearChange = async (year) => {
  try {
    await store.loadYearData(year);
  } catch (error) {
    ElMessage.error(`加载 ${year} 年数据失败: ${error.message}`);
  }
};

// 刷新数据
const refreshData = async () => {
  try {
    await store.loadYearData(selectedYear.value);
    ElMessage.success('数据刷新成功');
  } catch (error) {
    ElMessage.error(`数据刷新失败: ${error.message}`);
  }
};

// 显示比赛详情
const showMatchDetail = (match) => {
  selectedMatch.value = match;
  showDetailDialog.value = true;
};

// 格式化日期：2025-06-17 -> 2025年6月17日 周二
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const formatDate = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${y}年${m}月${d}日 ${weekdays[date.getDay()]}`;
};

// 获取正负值标签类型
const getPlusMinusType = (value) => {
  const num = parseFloat(value);
  if (num > 0) return 'success';
  if (num < 0) return 'danger';
  return 'info';
};

// 初始化
onMounted(async () => {
  // 若已有数据则直接复用，避免重复加载
  if (store.gamesData.length === 0) {
    await handleYearChange(selectedYear.value);
  }
});
</script>

<style scoped>
.match-history-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.page-header {
  background: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
  color: #303133;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.history-main {
  padding: 20px;
  overflow-y: auto;
}

.loading-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 400px;
  color: white;
  font-size: 18px;
}

.match-list {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.match-card {
  background: white;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  transition: transform 0.15s, box-shadow 0.15s;
}

.match-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px 0 rgba(0, 0, 0, 0.18);
}

.match-date {
  background: #f5f7fa;
  padding: 8px 16px;
  font-size: 13px;
  color: #909399;
  border-bottom: 1px solid #ebeef5;
}

.match-body {
  display: flex;
  align-items: center;
  padding: 14px 16px;
}

.teams {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.team-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.team-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}

.team-dot.red {
  background: #F56C6C;
}

.team-dot.black {
  background: #303133;
}

.team-name {
  font-size: 16px;
  color: #606266;
  width: 48px;
}

.team-score {
  font-size: 20px;
  font-weight: bold;
  color: #909399;
}

.team-row.winner .team-name {
  color: #303133;
  font-weight: bold;
}

.team-row.winner .team-score {
  color: #303133;
}

.win-arrow {
  color: #F56C6C;
}

.match-status {
  width: 110px;
  text-align: center;
  border-left: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-text {
  font-size: 15px;
  color: #303133;
}

.status-sub {
  font-size: 12px;
  color: #c0c4cc;
}

/* 详情对话框 */
.detail-score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 10px 0 20px;
}

.detail-team {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-team-name {
  font-size: 18px;
  font-weight: bold;
}

.detail-team-name.red {
  color: #F56C6C;
}

.detail-team-name.black {
  color: #303133;
}

.detail-team-score {
  font-size: 34px;
  font-weight: bold;
  color: #c0c4cc;
}

.detail-team.winner .detail-team-score {
  color: #409EFF;
}

.detail-vs {
  font-size: 14px;
  color: #909399;
}

.team-title {
  margin: 18px 0 10px;
  font-size: 16px;
  padding-left: 10px;
  border-left: 4px solid;
}

.red-title {
  color: #F56C6C;
  border-color: #F56C6C;
}

.black-title {
  color: #303133;
  border-color: #303133;
}

.highlight-points {
  font-weight: bold;
  color: #E6A23C;
  font-size: 15px;
}

/* 比赛合照 */
.photo-title {
  color: #409EFF;
  border-color: #409EFF;
}

.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.photo-thumb {
  width: 160px;
  height: 120px;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  background: #f5f7fa;
  transition: transform 0.15s;
}

.photo-thumb:hover {
  transform: scale(1.03);
}

.photo-error {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 12px;
  color: #c0c4cc;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    height: auto !important;
    padding: 15px;
    gap: 12px;
  }

  .page-header h1 {
    font-size: 20px;
  }

  .header-actions {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .detail-score {
    gap: 14px;
  }

  .detail-team-score {
    font-size: 28px;
  }
}
</style>
