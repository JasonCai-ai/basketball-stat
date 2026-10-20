<template>
  <div class="substitution-panel" :class="{ 'company-match': gameStore.isCompany }">
    <!-- 红队 -->
    <el-card class="sub-panel">
      <template #header>
        <div class="card-header">
          <el-badge :value="gameStore.teamLabel('红队')" type="danger">球员上下场</el-badge>
        </div>
      </template>
      
      <div class="red-subs">
        <div class="playing-area">
          <div class="area-header">
            <el-tag type="success" size="large">🟢 比赛中</el-tag>
            <el-tag type="info" size="small" v-if="getActivePlayers('红队').length">{{ getActivePlayers('红队').length }}/5</el-tag>
          </div>
          <div class="active-players">
            <el-button
              v-for="player in getActivePlayers('红队')" 
              :key="player.name + player.number"
              class="player-btn active"
              type="success"
              plain
              @click="togglePlayer(player)"
            >
              <el-badge :value="player.number" :hidden="gameStore.isCompany" class="player-badge">
                <span v-if="gameStore.isCompany" class="jersey-number">{{ player.number }}<small>号</small></span>
                <span class="name">{{ player.name }}</span>
                <el-icon class="status"><ArrowDown /></el-icon>
              </el-badge>
            </el-button>
          </div>
        </div>
        <div class="bench-area">
          <div class="area-header">
            <el-tag type="info" size="large">⏸️ 替补席</el-tag>
          </div>
          <div class="bench-players">
            <el-button
              v-for="player in getBenchPlayers('红队')"
              :key="player.name + player.number"
              class="player-btn bench"
              plain
              @click="togglePlayer(player)"
            >
              <el-badge :value="player.number" :hidden="gameStore.isCompany" class="player-badge">
                <span v-if="gameStore.isCompany" class="jersey-number">{{ player.number }}<small>号</small></span>
                <span class="name">{{ player.name }}</span>
                <el-icon class="status"><ArrowUp /></el-icon>
              </el-badge>
            </el-button>
          </div>
        </div>
      </div>
    </el-card>
    
    <!-- 黑队 -->
    <el-card class="sub-panel">
      <template #header>
        <div class="card-header">
          <el-badge :value="gameStore.teamLabel('黑队')" type="primary">球员上下场</el-badge>
        </div>
      </template>
      
      <div class="blue-subs">
        <div class="playing-area">
          <div class="area-header">
            <el-tag type="success" size="large">🟢 比赛中</el-tag>
            <el-tag type="info" size="small" v-if="getActivePlayers('黑队').length">{{ getActivePlayers('黑队').length }}/5</el-tag>
          </div>
          <div class="active-players">
            <el-button
              v-for="player in getActivePlayers('黑队')" 
              :key="player.name + player.number"
              class="player-btn active"
              type="primary"
              plain
              @click="togglePlayer(player)"
            >
              <el-badge :value="player.number" :hidden="gameStore.isCompany" class="player-badge">
                <span v-if="gameStore.isCompany" class="jersey-number">{{ player.number }}<small>号</small></span>
                <span class="name">{{ player.name }}</span>
                <el-icon class="status"><ArrowDown /></el-icon>
              </el-badge>
            </el-button>
          </div>
        </div>
        <div class="bench-area">
          <div class="area-header">
            <el-tag type="info" size="large">⏸️ 替补席</el-tag>
          </div>
          <div class="bench-players">
            <el-button
              v-for="player in getBenchPlayers('黑队')"
              :key="player.name + player.number"
              class="player-btn bench"
              plain
              @click="togglePlayer(player)"
            >
              <el-badge :value="player.number" :hidden="gameStore.isCompany" class="player-badge">
                <span v-if="gameStore.isCompany" class="jersey-number">{{ player.number }}<small>号</small></span>
                <span class="name">{{ player.name }}</span>
                <el-icon class="status"><ArrowUp /></el-icon>
              </el-badge>
            </el-button>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../stores/gameStore';
import { useToastStore } from '../stores/toastStore';
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue';

const gameStore = useGameStore();
const toastStore = useToastStore();
const selectionPlayers = computed(() => gameStore.isCompany
  ? [...gameStore.players].sort((a, b) => Number(a.number) - Number(b.number))
  : gameStore.players);

const getActivePlayers = (team) => {
  return selectionPlayers.value.filter(p => p.team === team && p.isPlaying);
};

const getBenchPlayers = (team) => {
  return selectionPlayers.value.filter(p => p.team === team && !p.isPlaying);
};

const togglePlayer = async (player) => {
  const message = `${gameStore.teamLabel(player.team)} ${player.number}号${player.name} ${player.isPlaying ? '下场' : '上场'}`;
  const result = await gameStore.togglePlayer(player);
  if (result) {
    toastStore.success(message);
  }
};
</script>

<style scoped>
.substitution-panel {
  display: flex;
  gap: 20px;
  margin: 20px 0;
}

.sub-panel {
  flex: 1;
}

.card-header {
  display: flex;
  align-items: center;
}

.area-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.playing-area, .bench-area {
  margin-bottom: 20px;
  padding: 15px;
  border-radius: 4px;
}

.red-subs .playing-area {
  background-color: rgba(255, 68, 68, 0.1);
  border: 1px solid rgba(255, 68, 68, 0.2);
}

.blue-subs .playing-area {
  background-color: rgba(68, 136, 255, 0.1);
  border: 1px solid rgba(68, 136, 255, 0.2);
}

.bench-area {
  background-color: #f8f8f8;
  border: 1px solid #e0e0e0;
}

.active-players, .bench-players {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.player-btn {
  min-width: 130px;
  text-align: left;
  position: relative;
  transition: all 0.3s;
}

.player-badge {
  width: 100%;
  display: flex;
  align-items: center;
}

.company-match .player-btn {
  min-width: 160px;
}

.jersey-number {
  min-width: 38px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}

.jersey-number small {
  margin-left: 2px;
  font-size: 11px;
  font-weight: 400;
}

.name {
  flex-grow: 1;
  margin: 0 5px;
}

.status {
  margin-left: auto;
}

/* 响应式布局 */
@media (max-width: 768px) {
  .substitution-panel {
    flex-direction: column;
  }
  
  .sub-panel {
    width: 100%;
  }
}
</style>
