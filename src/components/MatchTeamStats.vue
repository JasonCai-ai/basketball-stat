<template>
  <div class="match-team-stats">
    <h3 class="team-title" :class="titleClass">{{ title }}</h3>

    <!-- 桌面端：完整表格 -->
    <el-table
      v-if="!isMobile"
      :data="players"
      stripe
      border
      size="small"
      style="width: 100%;"
    >
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

    <!-- 移动端：卡片布局，无需横向滚动 -->
    <div v-else class="player-cards">
      <div v-for="p in players" :key="p.number + p.name" class="player-card">
        <div class="pc-head">
          <span class="pc-num">{{ p.number }}</span>
          <span class="pc-name">{{ p.name }}</span>
          <el-tooltip
            v-if="p.performance"
            effect="dark"
            placement="top"
            :content="p.performance.desc"
          >
            <el-tag
              :type="p.performance.type"
              :effect="p.performance.effect"
              size="small"
              class="pc-perf"
            >
              {{ p.performance.text }}
            </el-tag>
          </el-tooltip>
        </div>
        <div class="pc-stats">
          <span class="pc-stat">
            <em>{{ p.score }}</em>得分
          </span>
          <span class="pc-stat">
            正负
            <el-tag :type="getPlusMinusType(p.plusMinus)" size="small" effect="plain">
              {{ p.plusMinus > 0 ? '+' : '' }}{{ p.plusMinus }}
            </el-tag>
          </span>
          <span class="pc-stat"><em>{{ p.playMinutes }}</em>分钟</span>
          <span class="pc-stat"><em>{{ p.fouls }}</em>犯规</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  titleClass: { type: String, default: '' },
  players: { type: Array, default: () => [] },
  isMobile: { type: Boolean, default: false },
});

// 获取正负值标签类型
const getPlusMinusType = (value) => {
  const num = parseFloat(value);
  if (num > 0) return 'success';
  if (num < 0) return 'danger';
  return 'info';
};
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

/* 移动端卡片 */
.player-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
}

.pc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.pc-num {
  min-width: 28px;
  height: 24px;
  padding: 0 6px;
  border-radius: 6px;
  background: #f0f2f5;
  color: #606266;
  font-weight: bold;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pc-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  flex: 1;
}

.pc-perf {
  flex-shrink: 0;
}

.pc-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
  color: #909399;
}

.pc-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pc-stat em {
  font-style: normal;
  font-weight: bold;
  font-size: 15px;
  color: #303133;
}
</style>
