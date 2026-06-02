<template>
  <div class="player-management">
    <!-- 球员添加表单 -->
    <el-card class="add-player-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span><el-icon><Plus /></el-icon> 添加球员</span>
        </div>
      </template>
      
      <el-form :model="playerForm" :rules="rules" ref="playerFormRef" @submit.prevent="addPlayer" class="player-form">
        <div class="form-row">
          <el-form-item prop="team" class="form-item team-item">
            <el-select 
            size="large"
              v-model="playerForm.team" 
              placeholder="选择队伍"
              @keyup.enter="submitForm"
            >
              <el-option 
                label="红队" 
                value="红队">
                <template #prefix>
                  <el-icon color="#F56C6C"><Basketball /></el-icon>
                </template>
                红队
              </el-option>
              <el-option 
                label="黑队" 
                value="黑队">
                <template #prefix>
                  <el-icon color="#409EFF"><Basketball /></el-icon>
                </template>
                黑队
              </el-option>
            </el-select>
          </el-form-item>
          
          <el-form-item prop="name" class="form-item name-item">
            <el-input 
              v-model="playerForm.name" 
              placeholder="球员姓名" 
              clearable 
              @keyup.enter="submitForm"
              prefix-icon="User"
            />
          </el-form-item>
          
          <el-form-item prop="number" class="form-item number-item">
            <el-input 
              v-model="playerForm.number" 
              placeholder="号码" 
              clearable
              @keyup.enter="submitForm"
              prefix-icon="InfoFilled"
            />
          </el-form-item>
          
          <el-button 
            type="primary" 
            @click="submitForm" 
            :disabled="!playerForm.name || !playerForm.number || !playerForm.team"
            :loading="isSubmitting"
          >
            <el-icon><Plus /></el-icon> 添加
          </el-button>
        </div>
        
        <el-alert
          v-if="errorMessage"
          :title="errorMessage"
          type="error"
          closable
          show-icon
          class="error-alert"
          @close="errorMessage = ''"
        />
      </el-form>
    </el-card>
    
    <!-- 已选球员展示 -->
    <div class="selected-players-container">
      <el-card class="captain-picker-card" shadow="hover">
        <template #header>
          <div class="card-header captain-card-header">
            <span><el-icon><UserFilled /></el-icon> 报名名单队长</span>
            <el-button
              type="warning"
              size="small"
              :loading="isPickingCaptains"
              :disabled="selectedSignupPlayers.length < 2"
              @click="pickBalancedCaptains"
            >
              随机选队长
            </el-button>
          </div>
        </template>

        <div class="captain-picker-body">
          <p class="captain-tip">
            先按战力分批，再从同一批次里随机挑两位队长，当前按 {{ currentStatsYear }} 年年度战力计算。
          </p>

          <el-empty v-if="selectedSignupPlayers.length < 2" description="至少先选择 2 名报名球员" />

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

          <el-empty v-else description="点击“随机选队长”生成一组战力接近的队长" />
        </div>
      </el-card>

      <!-- 红队已选球员 -->
      <el-card class="selected-players-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <span>
              <el-icon color="#F56C6C"><Basketball /></el-icon>
              红队已选球员 ({{ redTeamPlayers.length }})
            </span>
          </div>
        </template>
        
        <el-empty v-if="redTeamPlayers.length === 0" description="暂无已选球员">
          <template #image>
            <el-icon class="empty-icon"><User /></el-icon>
          </template>
        </el-empty>
        
        <div class="player-tags" v-else>
          <el-tag
            v-for="player in redTeamPlayers"
            :key="`red-${player.number}`"
            class="player-tag"
            closable
            :disable-transitions="false"
            type="danger"
            @close="onRemovePlayer(player)"
            effect="light"
          >
            <span class="tag-number">{{ player.number }}</span> {{ player.name }}
          </el-tag>
        </div>
      </el-card>
      
      <!-- 黑队已选球员 -->
      <el-card class="selected-players-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <span>
              <el-icon color="#409EFF"><Basketball /></el-icon>
              黑队已选球员 ({{ blackTeamPlayers.length }})
            </span>
          </div>
        </template>
        
        <el-empty v-if="blackTeamPlayers.length === 0" description="暂无已选球员">
          <template #image>
            <el-icon class="empty-icon"><User /></el-icon>
          </template>
        </el-empty>
        
        <div class="player-tags" v-else>
          <el-tag
            v-for="player in blackTeamPlayers"
            :key="`black-${player.number}`"
            class="player-tag"
            closable
            :disable-transitions="false"
            type="primary"
            @close="onRemovePlayer(player)"
            effect="light"
          >
            <span class="tag-number">{{ player.number }}</span> {{ player.name }}
          </el-tag>
        </div>
      </el-card>
    </div>
    
    <!-- 预设球员池 -->
    <el-card class="player-pool-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span><el-icon><UserFilled /></el-icon> 预设球员池</span>
          <span class="player-count">
            共 {{ gameStore.presetPlayers.length }} 名球员
          </span>
        </div>
      </template>
      
      <el-empty v-if="gameStore.presetPlayers.length === 0" description="没有可用的预设球员">
        <template #image>
          <el-icon class="empty-icon"><User /></el-icon>
        </template>
      </el-empty>
      
      <div class="pool-players" v-else>
        <el-card
          v-for="player in gameStore.presetPlayers" 
          :key="player.id"
          class="player-card"
          :class="{ 'player-card-disabled': isPlayerSelected(player.id) }"
          shadow="hover"
        >
          <div class="player-card-content">
            <div class="player-badge">{{ player.number }}</div>
            <div class="player-name">{{ player.name }}</div>
            <div class="pool-actions">
              <el-tooltip :content="isPlayerSelected(player.id) ? '已选择' : '添加到红队'" placement="top" :show-after="300">
                <el-button 
                  circle
                  size="small" 
                  type="danger" 
                  @click="addPresetPlayer(player.id, '红队')"
                  :disabled="isPlayerSelected(player.id)"
                >
                  <el-icon><Plus v-if="!isPlayerSelected(player.id)" /><Check v-else /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="isPlayerSelected(player.id) ? '已选择' : '添加到黑队'" placement="top" :show-after="300">
                <el-button 
                  circle
                  size="small" 
                  type="primary" 
                  @click="addPresetPlayer(player.id, '黑队')"
                  :disabled="isPlayerSelected(player.id)"
                >
                  <el-icon><Plus v-if="!isPlayerSelected(player.id)" /><Check v-else /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </div>
        </el-card>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { useGameStore } from '../stores/gameStore';
import { useToastStore } from '../stores/toastStore';
import { useAnnualStatsStore } from '../stores/annualStatsStore';
import { User, UserFilled, Plus, Basketball, InfoFilled, Delete, Check } from '@element-plus/icons-vue';

const gameStore = useGameStore();
const toastStore = useToastStore();
const annualStatsStore = useAnnualStatsStore();
const POWER_BUCKET_SIZE = 8;

const playerFormRef = ref(null);
const isSubmitting = ref(false);
const isPickingCaptains = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const captainPair = ref(null);
const currentStatsYear = new Date().getFullYear();

const playerForm = reactive({
  name: '',
  number: '',
  team: '红队'
});

// 计算属性：获取红队球员
const redTeamPlayers = computed(() => {
  return gameStore.players.filter(player => player.team === '红队')
    .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
});

// 计算属性：获取黑队球员
const blackTeamPlayers = computed(() => {
  return gameStore.players.filter(player => player.team === '黑队')
    .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
});

const selectedSignupPlayers = computed(() => {
  return gameStore.players.slice().sort((a, b) => {
    const teamCompare = (a.team || '').localeCompare(b.team || '');
    if (teamCompare !== 0) return teamCompare;
    return (Number(a.number) || 0) - (Number(b.number) || 0);
  });
});

const rules = {
  name: [
    { required: true, message: '请输入球员姓名', trigger: 'blur' },
    { min: 1, max: 20, message: '长度在 1 到 20 个字符', trigger: 'blur' }
  ],
  number: [
    { required: true, message: '请输入球员号码', trigger: 'blur' },
    { pattern: /^[0-9]{1,2}$/, message: '请输入0-99之间的号码', trigger: 'blur' }
  ],
  team: [
    { required: true, message: '请选择队伍', trigger: 'change' }
  ]
};

const submitForm = () => {
  if (playerFormRef.value) {
    playerFormRef.value.validate(async (valid) => {
      if (valid) {
        await addPlayer();
      }
    });
  } else {
    addPlayer();
  }
};

const addPlayer = async () => {
  if (!playerForm.name.trim() || !playerForm.number.trim() || !playerForm.team) {
    errorMessage.value = '请输入姓名、号码和队伍！';
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const result = await gameStore.addPlayer(
      playerForm.name.trim(),
      playerForm.number.trim(),
      playerForm.team
    );

    if (result.success) {
      playerForm.name = '';
      playerForm.number = '';
      // 保留所选队伍不重置
      successMessage.value = `✅ 已添加${playerForm.team === '红队' ? '红' : '黑'}队球员: ${result.player?.name || ''}`;
      toastStore.success(successMessage.value);
      
      // 延迟关闭成功消息
      setTimeout(() => {
        successMessage.value = '';
      }, 5000); // 延长显示时间到5秒
    } else {
      errorMessage.value = result.message;
    }
  } catch (error) {
    errorMessage.value = '添加球员失败: ' + (error.message || '未知错误');
  } finally {
    isSubmitting.value = false;
  }
};

const addPresetPlayer = async (presetId, team) => {
  errorMessage.value = '';
  successMessage.value = '';
  
  try {
    const result = await gameStore.addPresetPlayer(presetId, team);
    if (!result.success) {
      errorMessage.value = result.message;
      toastStore.error(result.message);
    } else {
      // 设置更明显的成功消息
      const presetName = gameStore.presetPlayers.find(p => p.id === presetId)?.name || '';
      successMessage.value = `✅ 已添加${team === '红队' ? '红' : '黑'}队球员: ${presetName}`;
      toastStore.success(successMessage.value);
      
      // 延迟关闭成功消息
      setTimeout(() => {
        successMessage.value = '';
      }, 5000); // 延长显示时间到5秒
    }
  } catch (error) {
    errorMessage.value = '添加预设球员失败: ' + (error.message || '未知错误');
    toastStore.error(errorMessage.value);
  }
};

const pickBalancedCaptains = async () => {
  if (selectedSignupPlayers.value.length < 2) {
    toastStore.warning('至少先选择 2 名报名球员');
    return;
  }

  isPickingCaptains.value = true;
  errorMessage.value = '';

  try {
    if (!annualStatsStore.playerAnnualStats.length || annualStatsStore.currentYear !== currentStatsYear) {
      await annualStatsStore.loadYearData(currentStatsYear);
    }

    const statsByName = new Map(
      annualStatsStore.playerAnnualStats.map(player => [player.name, player.powerRating])
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
      toastStore.warning('当前名单不足以生成队长组合');
      return;
    }

    const randomBucket = eligibleBuckets[Math.floor(Math.random() * eligibleBuckets.length)];
    const [bucketIndex, bucketPlayers] = randomBucket;
    const shuffledPlayers = bucketPlayers.slice().sort(() => Math.random() - 0.5);
    const [first, second] = shuffledPlayers;
    const bucketStart = bucketIndex * POWER_BUCKET_SIZE;
    const bucketEnd = bucketStart + POWER_BUCKET_SIZE - 1;

    const randomPair = {
      first,
      second,
      powerGap: Math.abs(first.powerRating - second.powerRating),
      hasFallback: first.usedFallback || second.usedFallback,
      bucketLabel: `战力批次 ${bucketStart}-${bucketEnd}`,
    };

    captainPair.value = randomPair;
    toastStore.success(`已生成队长：${randomPair.first.name} 和 ${randomPair.second.name}`);
  } catch (error) {
    console.error('生成队长失败:', error);
    toastStore.error(`生成队长失败: ${error.message || '未知错误'}`);
  } finally {
    isPickingCaptains.value = false;
  }
};

// 移除球员
const onRemovePlayer = async (player) => {
  try {
    await gameStore.removePlayer(player);
    const selectedNames = new Set(gameStore.players.map(item => item.name));
    if (captainPair.value) {
      const { first, second } = captainPair.value;
      if (!selectedNames.has(first.name) || !selectedNames.has(second.name)) {
        captainPair.value = null;
      }
    }
  } catch (error) {
    errorMessage.value = '移除球员失败: ' + (error.message || '未知错误');
    toastStore.error(errorMessage.value);
  }
};

const isPlayerSelected = (presetId) => {
  return gameStore.players.some(player => player.presetId === presetId);
};
</script>

<style scoped>
.player-management {
  margin-bottom: 20px;
  position: relative;
}

.global-success-alert {
  margin-bottom: 15px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
}

.error-alert {
  margin-top: 15px;
  border-radius: 4px;
}

.add-player-card, .player-pool-card, .selected-players-card {
  margin-bottom: 15px;
  border-radius: 8px;
  transition: all 0.3s;
}

.captain-picker-card {
  grid-column: 1 / -1;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 5px;
}

.player-form {
  width: 100%;
}

.form-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.form-item {
  margin-bottom: 0;
}

.team-item, .name-item, .number-item {
  width: 200px;
  flex: 0 0 auto;
}

.team-item {
  width: 100px;
  flex: 0 0 auto;
}

.team-item :deep(.el-select) {
  width: 100%;
}

.team-item :deep(.el-input__wrapper) {
  box-sizing: border-box;
  height: 40px;
  line-height: 40px;
}

.form-row :deep(.el-input__wrapper),
.form-row :deep(.el-select .el-input__wrapper) {
  height: 40px;
  line-height: 40px;
  padding: 0 11px;
}

.player-count {
  font-size: 0.9em;
  color: #909399;
}

.pool-players {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
  margin-top: 10px;
}

.player-card {
  transition: all 0.3s;
  border: 1px solid #EBEEF5;
}

.player-card-disabled {
  opacity: 0.6;
  background-color: #f8f8f8;
}

.player-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
}

.player-card-disabled:hover {
  transform: none;
  box-shadow: none;
}

.player-card-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.player-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background-color: #F2F6FC;
  border-radius: 50%;
  font-weight: bold;
  color: #606266;
}

.player-name {
  flex: 1;
  white-space: nowrap;
  font-weight: 500;
}

.pool-actions {
  display: flex;
  margin-left: auto;
}

.empty-icon {
  font-size: 40px;
  color: #C0C4CC;
}

/* 已选球员展示区样式 */
.selected-players-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  margin-bottom: 15px;
}

.captain-card-header {
  gap: 12px;
}

.captain-picker-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.captain-tip {
  margin: 0;
  color: #606266;
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

.player-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 5px;
}

.player-tag {
  margin-right: 0;
  margin-bottom: 0;
  font-size: 14px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
}

.tag-number {
  font-weight: bold;
  margin-right: 5px;
  font-size: 1em;
  color: inherit;
  opacity: 0.8;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
  }
  
  .name-item, .number-item, .team-item {
    width: 100%;
  }
  
  .pool-players {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
  
  .selected-players-container {
    grid-template-columns: 1fr;
  }

  .captain-cards {
    flex-direction: column;
  }
}
</style> 