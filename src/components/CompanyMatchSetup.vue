<template>
  <el-card class="company-setup">
    <template #header><strong>公司赛对阵</strong></template>
    <p>按队名载入完整篮球名单，再点击名单中的球员安排上场（每队最多 5 人）。</p>
    <div class="match-selector">
      <label>主队
        <el-select v-model="homeId" placeholder="选择主队" aria-label="选择主队">
          <el-option v-for="team in teams" :key="team.id" :label="team.name" :value="team.id" :disabled="team.id === awayId" />
        </el-select>
      </label>
      <span>VS</span>
      <label>客队
        <el-select v-model="awayId" placeholder="选择客队" aria-label="选择客队">
          <el-option v-for="team in teams" :key="team.id" :label="team.name" :value="team.id" :disabled="team.id === homeId" />
        </el-select>
      </label>
      <el-button type="primary" :disabled="!homeId || !awayId || homeId === awayId || store.isGameRunning" :loading="busy" @click="loadTeams">载入对战名单 / 新建比赛</el-button>
      <el-button type="success" :disabled="!store.matchId" :loading="busy" @click="archive">结束并归档</el-button>
    </div>
    <div class="roster-previews">
      <div v-for="(team, index) in previews" :key="index" class="roster-preview">
        <strong>{{ team?.name || (index === 0 ? '待选主队' : '待选客队') }}<span v-if="team"> · {{ team.players.length }} 人</span></strong>
        <p v-if="team">{{ team.players.map(p => `${p.number}号 ${p.name}`).join('、') }}</p>
      </div>
    </div>
    <el-alert v-if="store.matchId" :title="`当前比赛：${store.teamLabel('红队')} VS ${store.teamLabel('黑队')}`" type="success" :closable="false" />
    <p class="hint">归档后在“比分记录”查看。记录保存在当前浏览器，可导出 JSON 备份；新建比赛前请先归档当前比赛。</p>
  </el-card>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import teams from '../data/companyTeams.json';
import { useGameStore } from '../stores/gameStore';
const store = useGameStore();
const homeId = ref(teams.find(t => t.name === store.teamLabel('红队'))?.id || '');
const awayId = ref(teams.find(t => t.name === store.teamLabel('黑队'))?.id || '');
const busy = ref(false);
const previews = computed(() => [homeId.value, awayId.value].map(id => teams.find(t => t.id === id)));
watch(() => store.matchId, () => {
  homeId.value = teams.find(t => t.name === store.teamLabel('红队'))?.id || '';
  awayId.value = teams.find(t => t.name === store.teamLabel('黑队'))?.id || '';
});
async function loadTeams() {
  busy.value = true;
  try {
    if (await store.setupCompanyMatch(...previews.value)) ElMessage.success('双方名单已载入，请安排首发球员');
  } catch (error) { ElMessage.error(error.message); }
  finally { busy.value = false; }
}
async function archive() {
  try {
    await ElMessageBox.confirm('结束当前比赛并保存到公司赛比分记录？再次归档会更新这场记录。', '结束比赛', { type: 'info', confirmButtonText: '确定', cancelButtonText: '取消' });
    busy.value = true;
    await store.archiveMatch();
    ElMessage.success('已保存到公司赛比分记录');
  } catch (error) { if (error instanceof Error) ElMessage.error(error.message); }
  finally { busy.value = false; }
}
</script>

<style scoped>
.company-setup { margin-bottom: 20px; }
.company-setup p { color: #606266; line-height: 1.7; }
.match-selector { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
.match-selector label { display: flex; align-items: center; gap: 8px; }
.match-selector .el-select { width: 190px; }
.roster-previews { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 18px 0; }
.roster-preview { background: #f5f7fa; padding: 14px; border-radius: 8px; }
.hint { font-size: 13px; }
@media (max-width: 650px) { .roster-previews { grid-template-columns: 1fr; } }
</style>
