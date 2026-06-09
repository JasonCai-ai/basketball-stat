<template>
  <div class="match-team-stats">
    <h3 class="team-title" :class="titleClass">{{ title }}</h3>

    <!-- PC 与手机统一用表格；手机端列宽超出时横向滚动 -->
    <el-table
      :data="players"
      stripe
      border
      size="small"
      style="width: 100%;"
    >
      <el-table-column prop="name" label="姓名" width="90" align="center" fixed="left" />
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

      <!-- 搭子：最夯(最搭) / 最拉(最不搭) 队友，基于全季数据，同场≥3场 -->
      <el-table-column label="搭子" width="120" align="center">
        <template #header>
          <el-tooltip effect="dark" placement="top" content="基于全季历史：同队≥3场，谁跟他最搭(绿)/最不搭(红)">
            <span>搭子 <el-icon class="hint-icon"><InfoFilled /></el-icon></span>
          </el-tooltip>
        </template>
        <template #default="{ row }">
          <div class="chem-cell">
            <el-tooltip
              v-if="row.chemistry && row.chemistry.bestTeammate"
              effect="dark"
              placement="top"
              :content="chemTip('最搭', row.chemistry.bestTeammate)"
            >
              <el-tag type="success" size="small" effect="light">{{ row.chemistry.bestTeammate.name }}</el-tag>
            </el-tooltip>
            <el-tooltip
              v-if="row.chemistry && row.chemistry.worstTeammate"
              effect="dark"
              placement="top"
              :content="chemTip('最不搭', row.chemistry.worstTeammate)"
            >
              <el-tag type="danger" size="small" effect="light">{{ row.chemistry.worstTeammate.name }}</el-tag>
            </el-tooltip>
            <span v-if="!hasTeammate(row)" class="chem-empty">-</span>
          </div>
        </template>
      </el-table-column>

      <!-- 对手：最夯(最好打) / 最拉(最克我) 对手 -->
      <el-table-column label="对手" width="120" align="center">
        <template #header>
          <el-tooltip effect="dark" placement="top" content="基于全季历史：对位≥3场，他最好打(绿)/最克他(红)">
            <span>对手 <el-icon class="hint-icon"><InfoFilled /></el-icon></span>
          </el-tooltip>
        </template>
        <template #default="{ row }">
          <div class="chem-cell">
            <el-tooltip
              v-if="row.chemistry && row.chemistry.bestOpponent"
              effect="dark"
              placement="top"
              :content="chemTip('最好打', row.chemistry.bestOpponent)"
            >
              <el-tag type="success" size="small" effect="light">{{ row.chemistry.bestOpponent.name }}</el-tag>
            </el-tooltip>
            <el-tooltip
              v-if="row.chemistry && row.chemistry.worstOpponent"
              effect="dark"
              placement="top"
              :content="chemTip('最克我', row.chemistry.worstOpponent)"
            >
              <el-tag type="danger" size="small" effect="light">{{ row.chemistry.worstOpponent.name }}</el-tag>
            </el-tooltip>
            <span v-if="!hasOpponent(row)" class="chem-empty">-</span>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { InfoFilled } from '@element-plus/icons-vue';

defineProps({
  title: { type: String, required: true },
  titleClass: { type: String, default: '' },
  players: { type: Array, default: () => [] },
});

// 获取正负值标签类型
const getPlusMinusType = (value) => {
  const num = parseFloat(value);
  if (num > 0) return 'success';
  if (num < 0) return 'danger';
  return 'info';
};

// 化学反应 tooltip 文案：最搭 · 同场5场 · 胜率80% · 场均+8.2
const chemTip = (label, info) => {
  const pm = info.avgPlusMinus > 0 ? `+${info.avgPlusMinus}` : `${info.avgPlusMinus}`;
  return `${label}：${info.name} · 同场${info.games}场 · 胜率${info.winRate}% · 场均${pm}`;
};

const hasTeammate = (row) =>
  row.chemistry && (row.chemistry.bestTeammate || row.chemistry.worstTeammate);
const hasOpponent = (row) =>
  row.chemistry && (row.chemistry.bestOpponent || row.chemistry.worstOpponent);
</script>

<style scoped>
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
