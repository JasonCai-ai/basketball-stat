<template>
  <div class="player-annual-stats">
    <div class="toolbar">
      <span class="games-tip">共 {{ store.totalGames }} 场比赛</span>
      <el-input
        v-model="searchText"
        placeholder="搜索球员姓名或号码"
        style="width: 200px;"
        clearable
        :prefix-icon="SearchIcon"
      />
    </div>

    <!-- 列较多，手机端横向滚动 -->
    <el-table
      :data="filteredStats"
      stripe
      border
      size="small"
      :default-sort="{ prop: 'avgPoints', order: 'descending' }"
      style="width: 100%"
    >
      <el-table-column prop="name" label="姓名" width="90" align="center" fixed>
        <template #default="{ row }">
          <el-button type="primary" link @click="showPlayerHistory(row.name)">
            {{ row.name }}
          </el-button>
        </template>
      </el-table-column>

      <el-table-column prop="number" label="号码" width="80" align="center" />

      <el-table-column prop="gamesPlayed" label="参赛场次" width="100" align="center" sortable>
        <template #default="{ row }">
          <el-tag type="info">{{ row.gamesPlayed }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="totalPoints" label="总得分" width="100" align="center" sortable>
        <template #default="{ row }">
          <span class="highlight-points">{{ row.totalPoints }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="avgPoints" label="场均得分" width="110" align="center" sortable>
        <template #default="{ row }">
          <el-tag type="success">{{ row.avgPoints.toFixed(1) }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="avgPlusMinus" label="场均正负值" width="120" align="center" sortable>
        <template #default="{ row }">
          <el-tag :type="getPlusMinusType(row.avgPlusMinus)">
            {{ row.avgPlusMinus > 0 ? '+' : '' }}{{ row.avgPlusMinus }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="avgPlayTime" label="场均时长(分)" width="130" align="center" sortable>
        <template #default="{ row }">
          {{ row.avgPlayTime.toFixed(1) }}
        </template>
      </el-table-column>

      <el-table-column prop="totalFouls" label="总犯规" width="100" align="center" sortable>
        <template #default="{ row }">
          <el-tag type="warning">{{ row.totalFouls }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="avgFouls" label="场均犯规" width="110" align="center" sortable>
        <template #default="{ row }">
          {{ row.avgFouls.toFixed(1) }}
        </template>
      </el-table-column>

      <el-table-column prop="wins" label="胜场" width="80" align="center" sortable>
        <template #default="{ row }">
          <el-tag type="success">{{ row.wins }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="losses" label="负场" width="80" align="center" sortable>
        <template #default="{ row }">
          <el-tag type="danger">{{ row.losses }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="winRate" label="胜率" width="90" align="center" sortable>
        <template #default="{ row }">
          <span :class="{ 'high-win-rate': row.winRate >= 60 }">{{ row.winRate.toFixed(1) }}%</span>
        </template>
      </el-table-column>

      <el-table-column prop="powerRating" label="战力值" width="100" align="center" sortable>
        <template #header>
          <el-tooltip
            effect="dark"
            placement="top"
            content="0-100。50 = 联盟平均；融合技术统计 z-score、Elo、胜率、近期状态与出场置信度。"
          >
            <span>战力值</span>
          </el-tooltip>
        </template>
        <template #default="{ row }">
          <el-tag :type="getPowerType(row.powerRating)" effect="dark">
            {{ row.powerRating }}
          </el-tag>
        </template>
      </el-table-column>

      <!-- 搭子：最夯(最搭) / 最拉(最不搭) 队友，基于全季数据，同场≥3场 -->
      <el-table-column label="搭子" width="120" align="center">
        <template #header>
          <el-tooltip
            effect="dark"
            placement="top"
            content="基于全季历史：同队≥3场，谁跟他最搭(绿)/最不搭(红)"
          >
            <span>搭子 <el-icon class="hint-icon"><InfoFilled /></el-icon></span>
          </el-tooltip>
        </template>
        <template #default="{ row }">
          <div class="chem-cell">
            <el-tooltip
              v-if="getChem(row.name).bestTeammate"
              effect="dark"
              placement="top"
              :content="chemTip('最搭', getChem(row.name).bestTeammate)"
            >
              <el-tag type="success" size="small" effect="light">{{ getChem(row.name).bestTeammate.name }}</el-tag>
            </el-tooltip>
            <el-tooltip
              v-if="getChem(row.name).worstTeammate"
              effect="dark"
              placement="top"
              :content="chemTip('最不搭', getChem(row.name).worstTeammate)"
            >
              <el-tag type="danger" size="small" effect="light">{{ getChem(row.name).worstTeammate.name }}</el-tag>
            </el-tooltip>
            <span v-if="!getChem(row.name).bestTeammate && !getChem(row.name).worstTeammate" class="chem-empty">-</span>
          </div>
        </template>
      </el-table-column>

      <!-- 对手：最夯(最好打) / 最拉(最克我) 对手 -->
      <el-table-column label="对手" width="120" align="center">
        <template #header>
          <el-tooltip
            effect="dark"
            placement="top"
            content="基于全季历史：对位≥3场，他最好打(绿)/最克他(红)"
          >
            <span>对手 <el-icon class="hint-icon"><InfoFilled /></el-icon></span>
          </el-tooltip>
        </template>
        <template #default="{ row }">
          <div class="chem-cell">
            <el-tooltip
              v-if="getChem(row.name).bestOpponent"
              effect="dark"
              placement="top"
              :content="chemTip('最好打', getChem(row.name).bestOpponent)"
            >
              <el-tag type="success" size="small" effect="light">{{ getChem(row.name).bestOpponent.name }}</el-tag>
            </el-tooltip>
            <el-tooltip
              v-if="getChem(row.name).worstOpponent"
              effect="dark"
              placement="top"
              :content="chemTip('最克我', getChem(row.name).worstOpponent)"
            >
              <el-tag type="danger" size="small" effect="light">{{ getChem(row.name).worstOpponent.name }}</el-tag>
            </el-tooltip>
            <span v-if="!getChem(row.name).bestOpponent && !getChem(row.name).worstOpponent" class="chem-empty">-</span>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- 球员历史数据对话框 -->
    <el-dialog
      v-model="showHistoryDialog"
      :title="`${selectedPlayerName} - ${store.currentYear}年度比赛记录`"
      :width="dialogWidth"
      :close-on-click-modal="false"
    >
      <el-table :data="playerHistoryData" stripe border size="small" style="width: 100%">
        <el-table-column prop="date" label="日期" width="120" align="center" />
        <el-table-column prop="number" label="号码" width="70" align="center" />
        <el-table-column prop="team" label="队伍" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.team === '红队' ? 'danger' : 'info'">{{ row.team }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="points" label="得分" width="80" align="center" sortable />
        <el-table-column prop="plusMinus" label="正负值" width="100" align="center" sortable>
          <template #default="{ row }">
            <el-tag :type="getPlusMinusType(row.plusMinus)">
              {{ row.plusMinus > 0 ? '+' : '' }}{{ row.plusMinus }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="playTime" label="时长(分)" width="100" align="center" sortable />
        <el-table-column prop="fouls" label="犯规" width="80" align="center" sortable />
        <el-table-column prop="result" label="结果" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.result === '胜'" type="success">胜</el-tag>
            <el-tag v-else-if="row.result === '负'" type="danger">负</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showHistoryDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAnnualStatsStore } from '../stores/annualStatsStore';
import { Search, InfoFilled } from '@element-plus/icons-vue';

const props = defineProps({
  isMobile: { type: Boolean, default: false },
});

const SearchIcon = Search;
const store = useAnnualStatsStore();

const searchText = ref('');
const showHistoryDialog = ref(false);
const selectedPlayerName = ref('');
const playerHistoryData = ref([]);

const dialogWidth = computed(() => (props.isMobile ? '96%' : '90%'));

// 场次太少（<3）的球员样本不足，不纳入年度统计展示
const MIN_GAMES_SHOWN = 3;

const filteredStats = computed(() => {
  const eligible = store.playerAnnualStats.filter((p) => p.gamesPlayed >= MIN_GAMES_SHOWN);
  if (!searchText.value) return eligible;
  const search = searchText.value.toLowerCase();
  return eligible.filter(
    (p) => p.name.toLowerCase().includes(search) || p.number.toLowerCase().includes(search)
  );
});

const showPlayerHistory = (playerName) => {
  selectedPlayerName.value = playerName;
  playerHistoryData.value = store.getPlayerHistory(playerName);
  showHistoryDialog.value = true;
};

const getPlusMinusType = (value) => {
  const num = parseFloat(value);
  if (num > 0) return 'success';
  if (num < 0) return 'danger';
  return 'info';
};

// 战力值颜色：70+ 强 / 55-69 偏上 / 45-54 平均 / 30-44 偏下 / <30 弱
const getPowerType = (value) => {
  if (value >= 70) return 'danger';
  if (value >= 55) return 'warning';
  if (value >= 45) return 'success';
  if (value >= 30) return 'info';
  return '';
};

// 化学反应：按姓名取该球员的 最夯/最拉 队友与对手（无则返回空对象）
const EMPTY_CHEM = { bestTeammate: null, worstTeammate: null, bestOpponent: null, worstOpponent: null };
const getChem = (name) => store.playerChemistry.get(name) || EMPTY_CHEM;

// 化学反应 tooltip 文案：最搭 · 同场5场 · 胜率80% · 校正净值+8.2
// 校正净值 = 同场时的正负值经 RAPM 对手/队友强度校正后的场均残差
const chemTip = (label, info) => {
  const pm = info.avgPlusMinus > 0 ? `+${info.avgPlusMinus}` : `${info.avgPlusMinus}`;
  return `${label}：${info.name} · 同场${info.games}场 · 胜率${info.winRate}% · 校正净值${pm}`;
};
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 10px;
  flex-wrap: wrap;
}

.games-tip {
  font-size: 14px;
  color: #909399;
}

.highlight-points {
  font-weight: bold;
  color: #E6A23C;
  font-size: 15px;
}

.high-win-rate {
  font-weight: bold;
  color: #67C23A;
}

/* 搭子 / 对手 单元格：上下叠放两个 tag */
.chem-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.chem-empty {
  color: #c0c4cc;
}

.hint-icon {
  font-size: 12px;
  color: #909399;
  vertical-align: -1px;
}
</style>
