<template>
  <div class="score-difference-chart">
    <div class="chart-header">
      <h3>{{ title }}</h3>
      <div class="chart-info">
        <span class="max-diff-label">
          最大分差: {{ gameData && !hasScoreDetails ? '—' : maxDifference }}分
        </span>
        <span class="current-diff-label">
          {{ gameData ? '最终分差' : '当前分差' }}: {{ currentDifference }}分
        </span>
      </div>
    </div>
    <el-empty v-if="gameData && !hasScoreDetails" description="暂无得分明细，无法绘制比分走势" :image-size="80" />
    <div v-show="!gameData || hasScoreDetails" ref="chartContainer" class="chart-container"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue';
import { useGameStore } from '../stores/gameStore';
import * as echarts from 'echarts';

const props = defineProps({
  gameData: { type: Object, default: null },
  title: { type: String, default: '实时比分走势' }
});
const gameStore = useGameStore();
const sourceDetails = computed(() => props.gameData ? (props.gameData.details || []) : gameStore.gameDetails);
const sourceScores = computed(() => props.gameData ? (props.gameData.game?.[0]?.teamScores || {}) : gameStore.teamScores);
const sourceTeamNames = computed(() => props.gameData ? (props.gameData.game?.[0]?.teamNames || {}) : gameStore.teamNames);
const teamLabel = side => sourceTeamNames.value[side] || side;
const hasScoreDetails = computed(() => sourceDetails.value.some(detail => detail.type === 'score'));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const chartContainer = ref(null);
let chartInstance = null;
let resizeObserver = null;
const maxDifference = ref(0);
const currentDifference = computed(() => Math.abs((sourceScores.value['红队'] || 0) - (sourceScores.value['黑队'] || 0)));

const calculateScoreData = () => {
  // 从 gameDetails 中提取得分事件
  const scoreEvents = sourceDetails.value
    .filter(d => d.type === 'score')
    .sort((a, b) => a.timestamp - b.timestamp);

  const timeData = [];
  const redScores = [];
  const blueScores = [];
  const scorePlayers = []; // 存储每个时间点的得分球员
  let redScore = 0;
  let blueScore = 0;
  let maxDiff = 0;

  // 遍历所有得分事件，分别累计两队得分
  scoreEvents.forEach(event => {
    if (event.team === '红队') {
      redScore += event.value;
    } else if (event.team === '黑队') {
      blueScore += event.value;
    }

    const timestamp = new Date(event.timestamp).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    
    timeData.push(timestamp);
    redScores.push(redScore);
    blueScores.push(blueScore);
    scorePlayers.push({
      player: event.player,
      number: event.number,
      team: event.team,
      points: event.value
    });

    // 更新最大分差
    const diff = Math.abs(redScore - blueScore);
    maxDiff = Math.max(maxDiff, diff);
  });
  maxDifference.value = maxDiff;

  return { timeData, redScores, blueScores, scorePlayers };
};

const initChart = () => {
  if (!chartContainer.value || chartContainer.value.clientWidth === 0) return;

  chartInstance = chartInstance || echarts.init(chartContainer.value);
  updateChart();
};

const updateChart = () => {
  if (!chartInstance) return;

  const { timeData, redScores, blueScores, scorePlayers } = calculateScoreData();
  // 找出最大分差的点
  let maxDiffIndex = 0;
  let maxDiff = 0;
  
  for (let i = 0; i < Math.min(redScores.length, blueScores.length); i++) {
    const diff = Math.abs(redScores[i] - blueScores[i]);
    if (diff > maxDiff) {
      maxDiff = diff;
      maxDiffIndex = i;
    }
  }

  const redMarkPoint = [];
  const blueMarkPoint = [];
  
  if (redScores.length > 0 && maxDiffIndex >= 0 && maxDiffIndex < redScores.length) {
    const leadingTeam = redScores[maxDiffIndex] > blueScores[maxDiffIndex] ? 'red' : 'blue';
    
    if (leadingTeam === 'red') {
      redMarkPoint.push({
        name: '最大分差点',
        coord: [maxDiffIndex, redScores[maxDiffIndex]],
        value: `${redScores[maxDiffIndex]}`,
        itemStyle: { color: '#ef4444' }
      });
      blueMarkPoint.push({
        name: '最大分差点',
        coord: [maxDiffIndex, blueScores[maxDiffIndex]],
        value: `${blueScores[maxDiffIndex]}`,
        itemStyle: { color: '#3b82f6' }
      });
    } else {
      blueMarkPoint.push({
        name: '最大分差点',
        coord: [maxDiffIndex, blueScores[maxDiffIndex]],
        value: `${blueScores[maxDiffIndex]}`,
        itemStyle: { color: '#3b82f6' }
      });
      redMarkPoint.push({
        name: '最大分差点',
        coord: [maxDiffIndex, redScores[maxDiffIndex]],
        value: `${redScores[maxDiffIndex]}`,
        itemStyle: { color: '#ef4444' }
      });
    }
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: function(params) {
        if (!params.length) return '';
        let result = escapeHtml(params[0].axisValue) + '<br/>';
        
        // 获取当前时间点的索引
        const dataIndex = params[0].dataIndex;
        
        // 如果有得分球员信息，显示
        if (scorePlayers && scorePlayers[dataIndex]) {
          const playerInfo = scorePlayers[dataIndex];
          const points = `${playerInfo.points >= 0 ? '+' : ''}${playerInfo.points}`;
          result += `<span style="font-weight: bold; color: ${playerInfo.team === '红队' ? '#ef4444' : '#3b82f6'};">${escapeHtml(teamLabel(playerInfo.team))} ${escapeHtml(playerInfo.player)}(${escapeHtml(playerInfo.number)}号) ${escapeHtml(points)}分</span><br/>`;
        }
        
        params.forEach(param => {
          result += `${param.marker}${escapeHtml(param.seriesName)}: ${escapeHtml(param.value)}分<br/>`;
        });
        return result;
      }
    },
    legend: {
      top: 10
    },
    xAxis: {
      type: 'category',
      data: timeData.length > 0 ? timeData : ['比赛开始'],
      axisLabel: {
        rotate: 45,
        interval: timeData.length > 10 ? Math.floor(timeData.length / 5) - 1 : 0
      }
    },
    yAxis: {
      type: 'value',
      name: '得分',
      axisLabel: {
        formatter: '{value}'
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#e5e7eb'
        }
      }
    },
    series: [
      {
        name: teamLabel('红队') + '得分',
        type: 'line',
        data: redScores.length > 0 ? redScores : [0],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2,
          color: '#ef4444'
        },
        itemStyle: {
          color: '#ef4444'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(239, 68, 68, 0.3)' },
            { offset: 1, color: 'rgba(239, 68, 68, 0.1)' }
          ])
        },
        markPoint: redMarkPoint.length > 0 ? {
          symbol: 'pin',
          symbolSize: 50,
          data: redMarkPoint,
          label: {
            formatter: '{c}',
            color: '#000'
          }
        } : null,
        markLine: (redScores.length > 0 && maxDiffIndex >= 0) ? {
          lineStyle: {
            type: 'dashed',
            width: 2,
            color: '#9ca3af'
          },
          label: {
            formatter: `最大分差: ${maxDifference.value}分`,
            position: 'middle',
            color: '#fff',
            backgroundColor: '#6b7280',
            padding: [4, 8],
            borderRadius: 4,
            rotate: 0
          },
          data: [
            [
              { coord: [maxDiffIndex, redScores[maxDiffIndex]] },
              { coord: [maxDiffIndex, blueScores[maxDiffIndex]] }
            ]
          ]
        } : null
      },
      {
        name: teamLabel('黑队') + '得分',
        type: 'line',
        data: blueScores.length > 0 ? blueScores : [0],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2,
          color: '#3b82f6'
        },
        itemStyle: {
          color: '#3b82f6'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0.1)' }
          ])
        },
        markPoint: blueMarkPoint.length > 0 ? {
          symbol: 'pin',
          symbolSize: 50,
          data: blueMarkPoint,
          label: {
            formatter: '{c}',
            color: '#000'
          }
        } : null
      }
    ],
    grid: {
      left: '10%',
      right: '10%',
      bottom: '15%',
      top: '15%',
      containLabel: true
    }
  };

  chartInstance.setOption(option, { notMerge: true });
};

watch(
  () => [sourceDetails.value, sourceScores.value, sourceTeamNames.value],
  () => {
    updateChart();
  },
  { deep: true, flush: 'post' }
);

onMounted(() => {
  initChart();
  resizeObserver = new ResizeObserver(() => {
    if (!chartInstance) initChart();
    chartInstance?.resize();
  });
  resizeObserver.observe(chartContainer.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (chartInstance) {
    chartInstance.dispose();
  }
});
</script>

<style scoped>
.score-difference-chart {
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.chart-header {
  margin-bottom: 16px;
}

.chart-header h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #1f2937;
}

.chart-info {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.max-diff-label,
.current-diff-label {
  font-size: 14px;
  color: #6b7280;
}

.chart-container {
  width: 100%;
  height: 500px;
}

@media (max-width: 600px) {
  .score-difference-chart { padding: 12px; }
  .chart-container { height: 340px; }
}
</style>
