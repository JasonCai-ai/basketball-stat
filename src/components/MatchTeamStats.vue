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
      <el-table-column type="index" label="#" width="44" align="center" fixed="left" />
      <el-table-column prop="number" label="号码" width="60" align="center" fixed="left" />
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
    </el-table>
  </div>
</template>

<script setup>
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
</style>
