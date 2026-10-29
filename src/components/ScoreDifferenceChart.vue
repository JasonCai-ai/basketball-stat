<template>
  <div class="score-difference-chart">
    <div class="chart-header">
      <h3>{{ title }}</h3>
      <div class="chart-info">
        <span>最大分差: {{ gameData && !hasScoreDetails ? '—' : maxDifference }}分</span>
        <span>{{ gameData ? '最终分差' : '当前分差' }}: {{ currentDifference }}分</span>
      </div>
      <div class="chart-filters">
        <el-switch v-model="showPauses" aria-label="显示暂停标记" active-text="暂停标记" style="--el-switch-on-color: #f59e0b" />
        <el-switch v-model="showSubstitutions" aria-label="显示换人标记" active-text="换人标记" style="--el-switch-on-color: #16a34a" />
      </div>
      <p class="chart-hint">悬停查看事件和在场名单；密集节点合并显示数量，名单按记录还原。</p>
    </div>
    <el-empty v-if="gameData && !hasScoreDetails" description="暂无得分明细，无法绘制比分走势" :image-size="80" />
    <div v-show="!gameData || hasScoreDetails" ref="chartContainer" class="chart-container"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue';
import { useGameStore } from '../stores/gameStore';
import { buildScoreTimeline, groupTimelineMarkers } from '../utils/scoreTimeline';
import * as echarts from 'echarts';

const props = defineProps({
  gameData: { type: Object, default: null },
  title: { type: String, default: '实时比分走势' }
});
const gameStore = useGameStore();
const sourceDetails = computed(() => props.gameData ? (props.gameData.details || []) : gameStore.gameDetails);
const sourceScores = computed(() => props.gameData ? (props.gameData.game?.[0]?.teamScores || {}) : gameStore.teamScores);
const sourceTeamNames = computed(() => props.gameData ? (props.gameData.game?.[0]?.teamNames || {}) : gameStore.teamNames);
const sourcePlayers = computed(() => (props.gameData ? (props.gameData.game?.[0]?.players || []) : gameStore.players)
  .map(({ name, number, team, isPlaying }) => ({ name, number, team, isPlaying })));
const sourceStartTime = computed(() => props.gameData?.game?.[0]?.gameStartTime || 0);
const teamLabel = side => sourceTeamNames.value[side] || side;
const hasScoreDetails = computed(() => sourceDetails.value.some(detail => detail.type === 'score'));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const formatTime = timestamp => new Date(timestamp).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
const playerLabel = player => `${player.name ?? player.player ?? ''}${player.number !== '' && player.number != null ? `（${player.number}号）` : ''}`;
const periodLabel = event => event?.period ? `第${event.period}节` : '';
const chartContainer = ref(null);
const showPauses = ref(true);
const showSubstitutions = ref(true);
const showHomeScore = ref(true);
const showAwayScore = ref(true);
let chartInstance = null;
let resizeObserver = null;
const maxDifference = ref(0);
const currentDifference = computed(() => Math.abs((sourceScores.value['红队'] || 0) - (sourceScores.value['黑队'] || 0)));

function lineupHtml(lineup, title = '当时在场') {
  return `<div style="border-top:1px solid #e5e7eb;margin-top:8px;padding-top:8px"><b>${title}</b>${['红队', '黑队'].map(side =>
    `<div style="margin-top:5px;color:${side === '红队' ? '#ef4444' : '#3b82f6'}">${escapeHtml(teamLabel(side))}</div><div>${lineup[side].length ? lineup[side].map(player => escapeHtml(playerLabel(player))).join('、') : '暂无在场记录'}</div>`
  ).join('')}</div>`;
}

function eventTooltip(params) {
  const group = params.data.group;
  const title = params.seriesName;
  const range = group.startTime === group.timestamp ? formatTime(group.timestamp) : `${formatTime(group.startTime)} — ${formatTime(group.timestamp)}`;
  const rows = group.events.map(event => {
    const description = event.type === 'game-pause' ? '比赛暂停' : `${teamLabel(event.team)} ${playerLabel(event)} ${event.type === 'sub-in' ? '上场' : '下场'}`;
    return `<div style="margin-top:5px">${escapeHtml(formatTime(event.timestamp))} ${escapeHtml(periodLabel(event))}<br/><b>${escapeHtml(description)}</b></div>`;
  }).join('');
  return `<b>${escapeHtml(title)}${group.events.length > 1 ? ` · ${group.events.length}条记录` : ''}</b><div>${escapeHtml(range)}</div>${rows}${lineupHtml(group.lineup, group.events.length > 1 ? '本组最后时刻在场' : '事件后在场')}`;
}

function initChart() {
  if (!chartContainer.value || chartContainer.value.clientWidth === 0) return;
  if (!chartInstance) {
    chartInstance = echarts.init(chartContainer.value);
    chartInstance.on('legendselectchanged', ({ selected }) => {
      showPauses.value = selected['暂停'] !== false;
      showSubstitutions.value = selected['换人'] !== false;
      showHomeScore.value = selected[teamLabel('红队') + '得分'] !== false;
      showAwayScore.value = selected[teamLabel('黑队') + '得分'] !== false;
    });
  }
  updateChart();
}

function updateChart() {
  if (!chartInstance) return;
  const timeline = buildScoreTimeline(sourceDetails.value, sourcePlayers.value, sourceStartTime.value);
  maxDifference.value = timeline.maxDifference;
  const plotWidth = Math.max(chartInstance.getWidth() - 88, 1);
  const { minTime, maxTime, maxPoint } = timeline;
  const markerSeries = (name, markers, symbol, color) => ({
    name, type: 'scatter', xAxisIndex: 1, yAxisIndex: 1,
    symbol, symbolSize: data => data[2] > 1 ? 22 : 15,
    itemStyle: { color, opacity: 1 },
    label: { show: true, color: symbol === 'triangle' ? '#422006' : '#fff', fontSize: 10, formatter: params => params.value[2] > 1 ? params.value[2] : '' },
    emphasis: { scale: 1.25 },
    tooltip: { trigger: 'item', formatter: eventTooltip },
    data: groupTimelineMarkers(markers, minTime, maxTime, plotWidth).map(group => ({ value: [group.timestamp, name, group.events.length], group })),
    z: 5
  });
  const scoreSeries = (side, field, color, areaColor) => ({
    name: teamLabel(side) + '得分', type: 'line',
    data: timeline.scores.map(point => ({ value: [point.timestamp, point[field]], point })),
    smooth: true, symbol: 'circle', symbolSize: 6,
    lineStyle: { width: 2, color }, itemStyle: { color },
    areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: `rgba(${areaColor},0.3)` }, { offset: 1, color: `rgba(${areaColor},0.1)` }
    ]) },
    markPoint: maxPoint ? {
      symbol: 'pin', symbolSize: 45,
      data: [{ name: '最大分差点', coord: [maxPoint.timestamp, maxPoint[field]], value: maxPoint[field], point: maxPoint }],
      label: { formatter: '{c}', color: '#000' }
    } : undefined,
    markLine: side === '红队' && maxPoint ? {
      symbol: ['none', 'none'], lineStyle: { type: 'dashed', width: 2, color: '#9ca3af' },
      label: { formatter: `最大分差: ${timeline.maxDifference}分`, position: 'middle', align: maxPoint.timestamp > (minTime + maxTime) / 2 ? 'right' : 'left', color: '#fff', backgroundColor: '#6b7280', padding: [4, 8], borderRadius: 4, rotate: 0 },
      data: [[{ coord: [maxPoint.timestamp, maxPoint.home] }, { coord: [maxPoint.timestamp, maxPoint.away] }]]
    } : undefined
  });
  chartInstance.setOption({
    animationDuration: 250,
    animationDurationUpdate: 150,
    tooltip: {
      trigger: 'axis', confine: true, enterable: true,
      extraCssText: `max-width:min(420px,85vw);max-height:${Math.max(chartInstance.getHeight() - 160, 100)}px;overflow-y:auto;white-space:normal;overflow-wrap:anywhere;`,
      // Keep tooltips below the event lanes so they do not intercept adjacent markers.
      position(point, params, element, rect, size) {
        return [Math.max(4, Math.min(point[0] + 12, size.viewSize[0] - size.contentSize[0] - 4)),
          Math.max(124, Math.min(point[1] + 16, size.viewSize[1] - size.contentSize[1] - 6))];
      },
      formatter(params) {
        const point = (Array.isArray(params) ? params : [params]).find(param => param.data?.point)?.data.point;
        if (!point) return '';
        let text = `<b>${escapeHtml(formatTime(point.timestamp))} ${escapeHtml(periodLabel(point.event))}</b>`;
        if (point.event) {
          const event = point.event;
          const points = `${Number(event.value) >= 0 ? '+' : ''}${event.value}`;
          text += `<div style="font-weight:bold;color:${event.team === '红队' ? '#ef4444' : '#3b82f6'}">${escapeHtml(teamLabel(event.team))} ${escapeHtml(playerLabel(event))} ${escapeHtml(points)}分</div>`;
        }
        text += `<div>${escapeHtml(teamLabel('红队'))}: ${point.home}分　${escapeHtml(teamLabel('黑队'))}: ${point.away}分</div>`;
        return text + lineupHtml(point.lineup);
      }
    },
    legend: {
      top: 6, left: 'center',
      selected: { '暂停': showPauses.value, '换人': showSubstitutions.value,
        [teamLabel('红队') + '得分']: showHomeScore.value, [teamLabel('黑队') + '得分']: showAwayScore.value },
      data: [{ name: teamLabel('红队') + '得分', icon: 'circle' }, { name: teamLabel('黑队') + '得分', icon: 'circle' }, { name: '暂停', icon: 'triangle' }, { name: '换人', icon: 'circle' }]
    },
    grid: [
      { left: 60, right: 28, top: 144, bottom: 65 },
      { left: 60, right: 28, top: 66, height: 46 }
    ],
    xAxis: [
      { type: 'time', min: minTime, max: maxTime, splitNumber: chartInstance.getWidth() < 600 ? 3 : 6,
        axisPointer: { snap: true }, axisLabel: { formatter: value => timeline.scores.length ? formatTime(value) : '比赛开始', rotate: 40, hideOverlap: true } },
      { type: 'time', gridIndex: 1, min: minTime, max: maxTime, show: false, axisPointer: { show: false } }
    ],
    yAxis: [
      { type: 'value', name: '得分', minInterval: 1, splitLine: { lineStyle: { color: '#e5e7eb' } } },
      { type: 'category', gridIndex: 1, data: ['换人', '暂停'], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#6b7280', fontSize: 11 }, splitLine: { show: false }, axisPointer: { show: false } }
    ],
    series: [
      scoreSeries('红队', 'home', '#ef4444', '239,68,68'),
      scoreSeries('黑队', 'away', '#3b82f6', '59,130,246'),
      markerSeries('暂停', timeline.pauses, 'triangle', '#f59e0b'),
      markerSeries('换人', timeline.substitutions, 'circle', '#16a34a')
    ]
  }, { notMerge: true });
}

watch(
  () => [sourceDetails.value, sourceScores.value, sourceTeamNames.value, sourcePlayers.value, sourceStartTime.value, showPauses.value, showSubstitutions.value, showHomeScore.value, showAwayScore.value],
  updateChart,
  { deep: true, flush: 'post' }
);

onMounted(() => {
  initChart();
  resizeObserver = new ResizeObserver(() => {
    if (!chartInstance) initChart();
    else { chartInstance.resize(); updateChart(); }
  });
  resizeObserver.observe(chartContainer.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chartInstance?.dispose();
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
.chart-header { margin-bottom: 12px; }
.chart-header h3 { margin: 0 0 8px; font-size: 16px; color: #1f2937; }
.chart-info { display: flex; gap: 16px; flex-wrap: wrap; font-size: 14px; color: #6b7280; }
.chart-filters { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 8px; }
.chart-hint { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: #6b7280; }
.chart-container { width: 100%; height: 520px; }
@media (max-width: 600px) {
  .score-difference-chart { padding: 12px; }
  .chart-filters { gap: 16px; }
  .chart-container { height: 440px; }
}
</style>
