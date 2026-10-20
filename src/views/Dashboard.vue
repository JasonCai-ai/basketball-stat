<template>
  <div class="dashboard-container">
    <div class="dashboard-header">
      <div class="header-content">
        <h2>{{ company ? '公司篮球赛' : '篮球比赛统计系统' }}</h2>
        <el-tag
          :type="dbStatus === '数据库已就绪' ? 'success' : 'warning'"
          effect="dark"
          size="small"
          class="db-status"
        >
          {{ dbStatus }}
        </el-tag>
      </div>
      <div class="header-actions">
        <el-button v-if="!company" size="small" @click="router.push('/company')">公司比赛</el-button>
        <el-button size="small" type="warning" @click="goToMatchHistory">
          <el-icon><Calendar /></el-icon> 比分记录
        </el-button>
        <el-button v-if="!company" size="small" type="success" @click="goToAnnualStats">
          <el-icon><TrendCharts /></el-icon> 年度统计
        </el-button>
        <el-button v-if="!company" size="small" type="primary" @click="goToConfig">
          <el-icon><Setting /></el-icon> 球员配置
        </el-button>
        <el-button size="small" type="danger" @click="logout">退出登录</el-button>
      </div>
    </div>
    <div v-if="dbStatus === '数据库已就绪'" class="app-content">
      <CompanyMatchSetup v-if="company" />
      <GameControls v-if="!company || gameStore.matchId" />
      <ExportPanel />
      <template v-if="!company || gameStore.matchId">
        <SubstitutionPanel />
        <TeamSection team="红队" :color="'red'" />
        <TeamSection team="黑队" :color="'blue'" />
        <ScoreDifferenceChart />
        <DetailSection />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, provide } from 'vue';
import { useRouter } from 'vue-router';
import { useDailyGameStore, useCompanyGameStore } from '../stores/gameStore';
import CompanyMatchSetup from '../components/CompanyMatchSetup.vue';
import GameControls from '../components/GameControls.vue';
import ExportPanel from '../components/ExportPanel.vue';
import SubstitutionPanel from '../components/SubstitutionPanel.vue';
import TeamSection from '../components/TeamSection.vue';
import ScoreDifferenceChart from '../components/ScoreDifferenceChart.vue';
import DetailSection from '../components/DetailSection.vue';
import { Setting } from '@element-plus/icons-vue';
import { TrendCharts, Calendar } from '@element-plus/icons-vue';

const router = useRouter();
const props = defineProps({ company: Boolean });
const dbStatus = ref('数据库加载中...');
const gameStore = props.company ? useCompanyGameStore() : useDailyGameStore();
provide('activeGameStore', gameStore);

provide('dbStatus', dbStatus);

onMounted(async () => {
  try {
    await gameStore.initDB();
    await gameStore.loadData();
    dbStatus.value = '数据库已就绪';
  } catch (error) {
    console.error('初始化失败:', error);
    dbStatus.value = '数据库加载失败';
  }
});
onBeforeUnmount(() => { gameStore.pauseGame(); });

const goToConfig = () => {
  router.push('/configuration');
}

const goToAnnualStats = () => {
  router.push('/annual-stats');
}

const goToMatchHistory = () => {
  router.push(props.company ? '/company/history' : '/match-history');
}

const logout = () => {
  localStorage.removeItem('isAuthenticated');
  router.push(props.company ? { path: '/login', query: { redirect: '/company' } } : '/login');
}
</script>

<style scoped>
.dashboard-container {
  padding: 20px;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.header-actions { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 768px) {
  .dashboard-container { padding: 12px; }
  .dashboard-header { align-items: flex-start; flex-direction: column; gap: 12px; }
}

.header-content {
  display: flex;
  align-items: center;
}

h2 {
  margin: 0;
  margin-right: 10px;
}

.db-status {
  margin-left: 10px;
}
</style>
