<template>
  <div class="score-difference-chart">
    <div class="chart-header">
      <h3>{{ title }}</h3>
      <div class="chart-info">
        <span>最大分差: {{ gameData && !hasScoreDetails ? '—' : timeline.maxDifference }}分</span>
        <span>{{ gameData ? '最终分差' : '当前分差' }}: {{ currentDifference }}分</span>
      </div>
      <div class="chart-filters">
        <el-switch v-model="showPauses" aria-label="显示暂停标记" active-text="暂停标记" style="--el-switch-on-color: #f59e0b" />
        <el-switch v-model="showSubstitutions" aria-label="显示换人标记" active-text="换人标记" style="--el-switch-on-color: #16a34a" />
      </div>
      <p class="chart-hint">悬停预览，点击锁定时刻；详情显示比分、分差和在场名单。</p>
    </div>
    <el-empty v-if="gameData && !hasScoreDetails" description="暂无得分明细，无法绘制比分走势" :image-size="80" />
    <div v-show="!gameData || hasScoreDetails" class="chart-layout">
      <div class="chart-stage">
        <div ref="chartContainer" class="chart-container"></div>
        <div v-if="focusPosition" class="chart-focus" aria-hidden="true">
          <div class="focus-time" :style="{ left: `${focusPosition.x}px` }"></div>
          <div v-if="showHomeScore && showAwayScore" class="focus-gap" :style="{ left: `${focusPosition.x}px`, top: `${Math.min(focusPosition.homeY, focusPosition.awayY)}px`, height: `${Math.abs(focusPosition.homeY - focusPosition.awayY)}px` }"></div>
          <i v-if="showHomeScore" class="focus-dot home-color" :style="{ left: `${focusPosition.x}px`, top: `${focusPosition.homeY}px` }"></i>
          <i v-if="showAwayScore" class="focus-dot away-color" :style="{ left: `${focusPosition.x}px`, top: `${focusPosition.awayY}px` }"></i>
        </div>
      </div>
      <aside class="event-details" aria-label="比赛时刻详情">
        <div class="detail-toolbar">
          <h4>{{ detailHeading }}</h4>
          <div v-if="selection" class="detail-actions">
            <button type="button" class="lock-button" :class="{ locked: isLocked }" :aria-pressed="isLocked" @click="isLocked = !isLocked">{{ isLocked ? '解除锁定' : '锁定此刻' }}</button>
            <button type="button" class="clear-button" aria-label="清除时刻选择" @click="clearSelection">×</button>
          </div>
        </div>
        <p class="detail-time">{{ detailTime }}<span v-if="selection" class="selection-state">{{ isLocked ? '已锁定' : '预览' }}</span></p>
        <div class="detail-scoreboard" aria-label="所选时刻比分">
          <div class="team-score home-text"><span>{{ teamLabel('红队') }}</span><strong>{{ displayedDetail.home }}</strong></div>
          <span class="score-colon">:</span>
          <div class="team-score away-text"><span>{{ teamLabel('黑队') }}</span><strong>{{ displayedDetail.away }}</strong></div>
        </div>
        <div class="detail-gap" :class="gapTeam ? (gapTeam === '红队' ? 'home-gap' : 'away-gap') : 'tied-gap'">
          <span>{{ gapTeam ? `${teamLabel(gapTeam)}领先` : '双方战平' }}</span>
          <strong>分差 {{ selectedDifference }} 分</strong>
        </div>
        <p v-if="!selection" class="selection-help">将鼠标移到曲线或事件节点查看详情；点击可锁定，方便对照走势。</p>
        <p v-else-if="displayedDetail.events.length > 1" class="selection-help">合并 {{ displayedDetail.events.length }} 条记录，比分和名单取最后时刻。</p>
        <div class="detail-tabs" role="group" aria-label="详情内容">
          <button type="button" :aria-pressed="detailTab === 'lineup' || !displayedDetail.events.length" @click="detailTab = 'lineup'">在场名单 {{ displayedDetail.lineup['红队'].length + displayedDetail.lineup['黑队'].length }}</button>
          <button type="button" :aria-pressed="detailTab === 'events' && !!displayedDetail.events.length" :disabled="!displayedDetail.events.length" @click="detailTab = 'events'">事件记录 {{ displayedDetail.events.length }}</button>
        </div>
        <div class="detail-scroll">
          <section v-if="displayedDetail.events.length" v-show="detailTab === 'events'" class="detail-events">
            <h5>事件记录</h5>
            <div v-for="(event, index) in displayedDetail.events" :key="`${event.timestamp}-${index}`" class="detail-event">
              <div class="event-time">{{ formatTime(event.timestamp) }} {{ periodLabel(event) }}</div>
              <div v-if="event.type === 'game-pause'" class="pause-text">比赛暂停</div>
              <div v-else class="event-description">
                <span :class="event.team === '红队' ? 'home-text' : 'away-text'">{{ teamLabel(event.team) }}</span>
                <span class="event-player"><b v-if="hasNumber(event)">{{ event.number }}号</b> {{ event.player }}</span>
                <span :class="event.type === 'sub-out' ? 'out-text' : 'in-text'">{{ event.type === 'score' ? `${Number(event.value) >= 0 ? '+' : ''}${event.value}分` : (event.type === 'sub-in' ? '上场' : '下场') }}</span>
              </div>
            </div>
          </section>
          <section v-show="detailTab === 'lineup' || !displayedDetail.events.length" class="detail-lineups">
            <h5>{{ selection ? (displayedDetail.events.length > 1 ? '本组最后时刻在场' : '当时在场名单') : '最后记录的在场名单' }}</h5>
            <div v-for="side in ['红队', '黑队']" :key="side" class="lineup-team">
              <h6 :class="side === '红队' ? 'home-text' : 'away-text'">{{ teamLabel(side) }} <span>{{ displayedDetail.lineup[side].length }}人</span></h6>
              <div v-if="displayedDetail.lineup[side].length" class="lineup-players">
                <span v-for="player in displayedDetail.lineup[side]" :key="`${player.number}-${player.name}`" class="lineup-player"><b v-if="hasNumber(player)">{{ player.number }}号</b>{{ player.name }}</span>
              </div>
              <p v-else class="no-lineup">暂无在场记录</p>
            </div>
            <p class="lineup-note">在场名单按现有换人记录还原。</p>
          </section>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, onMounted, watch, onBeforeUnmount } from 'vue';
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
const timeline = computed(() => buildScoreTimeline(sourceDetails.value, sourcePlayers.value, sourceStartTime.value));
// Carry the score through non-scoring events so their focus dots sit exactly on the curves.
const curvePoints = computed(() => {
  const scoreTimes = new Set(timeline.value.scores.map(point => point.timestamp));
  const samples = new Map();
  for (const marker of [...timeline.value.pauses, ...timeline.value.substitutions]) {
    if (!scoreTimes.has(marker.timestamp)) samples.set(marker.timestamp, { ...marker, event: null, sample: true });
  }
  return [...timeline.value.scores, ...samples.values()].sort((a, b) => a.timestamp - b.timestamp);
});
const teamLabel = side => sourceTeamNames.value[side] || side;
const hasScoreDetails = computed(() => sourceDetails.value.some(detail => detail.type === 'score'));
const formatTime = timestamp => new Date(timestamp).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
const periodLabel = event => event?.period ? `第${event.period}节` : '';
const hasNumber = player => player.number !== '' && player.number != null;
const chartContainer = ref(null);
const showPauses = ref(true);
const showSubstitutions = ref(true);
const showHomeScore = ref(true);
const showAwayScore = ref(true);
const selection = shallowRef(null);
const isLocked = ref(false);
const detailTab = ref('lineup');
const focusPosition = shallowRef(null);
let chartInstance = null;
let resizeObserver = null;
const currentDifference = computed(() => Math.abs((sourceScores.value['红队'] || 0) - (sourceScores.value['黑队'] || 0)));
const displayedDetail = computed(() => selection.value || {
  timestamp: timeline.value.scores.at(-1)?.timestamp,
  startTime: timeline.value.scores.at(-1)?.timestamp,
  home: sourceScores.value['红队'] || 0,
  away: sourceScores.value['黑队'] || 0,
  events: [],
  lineup: timeline.value.scores.at(-1)?.lineup || { '红队': [], '黑队': [] }
});
const selectedDifference = computed(() => Math.abs(displayedDetail.value.home - displayedDetail.value.away));
const gapTeam = computed(() => displayedDetail.value.home === displayedDetail.value.away ? null : (displayedDetail.value.home > displayedDetail.value.away ? '红队' : '黑队'));
const detailHeading = computed(() => selection.value ? ({ score: '比分时刻', pause: '暂停详情', substitution: '换人详情' })[selection.value.kind] : (props.gameData ? '全场概览' : '比赛概览'));
const detailTime = computed(() => {
  const detail = displayedDetail.value;
  if (detail.timestamp == null) return '等待比赛记录';
  const range = detail.startTime !== detail.timestamp ? `${formatTime(detail.startTime)} — ${formatTime(detail.timestamp)}` : formatTime(detail.timestamp);
  return `${range} ${periodLabel(detail.events.at(-1))}`;
});

function clearSelection() {
  selection.value = null;
  isLocked.value = false;
  detailTab.value = 'lineup';
  focusPosition.value = null;
}

function positionFocus() {
  if (!chartInstance || !selection.value) { focusPosition.value = null; return; }
  const detail = selection.value;
  const [x, homeY] = chartInstance.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [detail.timestamp, detail.home]);
  const [, awayY] = chartInstance.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [detail.timestamp, detail.away]);
  focusPosition.value = [x, homeY, awayY].every(Number.isFinite) ? { x, homeY, awayY } : null;
}

function scoreDetail(point) {
  return { ...point, kind: 'score', startTime: point.timestamp, events: point.event ? [point.event] : [] };
}

function detailFromEvent(params) {
  if (params.data?.group) return { ...params.data.group, kind: params.seriesName === '暂停' ? 'pause' : 'substitution' };
  if (params.data?.point) return scoreDetail(params.data.point);
  return null;
}

function preview(detail) {
  if (!detail || isLocked.value) return;
  selection.value = detail;
  positionFocus();
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
    chartInstance.on('mousemove', params => preview(detailFromEvent(params)));
    chartInstance.on('updateAxisPointer', ({ axesInfo = [] }) => {
      if (isLocked.value) return;
      const axis = axesInfo.find(info => info.axisDim === 'x' && info.axisIndex === 0);
      if (!axis || !curvePoints.value.length) return;
      const nearest = curvePoints.value.reduce((best, point) => Math.abs(point.timestamp - axis.value) < Math.abs(best.timestamp - axis.value) ? point : best);
      preview(scoreDetail(nearest));
    });
    chartInstance.on('click', params => {
      const detail = detailFromEvent(params);
      if (!detail) return;
      const same = selection.value?.kind === detail.kind && selection.value?.timestamp === detail.timestamp;
      selection.value = detail;
      isLocked.value = !(isLocked.value && same);
      positionFocus();
    });
    chartInstance.getZr().on('click', event => {
      if (!event.target && selection.value && chartInstance.containPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY])) isLocked.value = !isLocked.value;
    });
  }
  updateChart();
}

function updateChart() {
  if (!chartInstance) return;
  const { minTime, maxTime, maxPoint } = timeline.value;
  const plotWidth = Math.max(chartInstance.getWidth() - 88, 1);
  const markerSeries = (name, markers, symbol, color) => ({
    name, type: 'scatter', xAxisIndex: 1, yAxisIndex: 1,
    symbol, symbolSize: data => data[2] > 1 ? 22 : 15,
    itemStyle: { color, opacity: 1 },
    label: { show: true, color: symbol === 'triangle' ? '#422006' : '#fff', fontSize: 10, formatter: params => params.value[2] > 1 ? params.value[2] : '' },
    emphasis: { scale: 1.25 },
    tooltip: { trigger: 'item', showContent: false },
    data: groupTimelineMarkers(markers, minTime, maxTime, plotWidth).map(group => ({ value: [group.timestamp, name, group.events.length], group })),
    z: 5
  });
  const scoreSeries = (side, field, color, areaColor) => ({
    name: teamLabel(side) + '得分', type: 'line',
    data: curvePoints.value.map(point => ({ value: [point.timestamp, point[field]], point, symbol: point.sample ? 'none' : 'circle' })),
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
      label: { formatter: `最大分差: ${timeline.value.maxDifference}分`, position: 'middle', align: maxPoint.timestamp > (minTime + maxTime) / 2 ? 'right' : 'left', color: '#fff', backgroundColor: '#6b7280', padding: [4, 8], borderRadius: 4, rotate: 0 },
      data: [[{ coord: [maxPoint.timestamp, maxPoint.home] }, { coord: [maxPoint.timestamp, maxPoint.away] }]]
    } : undefined
  });
  chartInstance.setOption({
    animationDuration: 250,
    animationDurationUpdate: 150,
    tooltip: { trigger: 'axis', showContent: false, axisPointer: { type: 'none' } },
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
        axisPointer: { snap: true }, axisLabel: { formatter: value => timeline.value.scores.length ? formatTime(value) : '比赛开始', rotate: 40, hideOverlap: true } },
      { type: 'time', gridIndex: 1, min: minTime, max: maxTime, show: false, axisPointer: { show: false } }
    ],
    yAxis: [
      { type: 'value', name: '得分', minInterval: 1, splitLine: { lineStyle: { color: '#e5e7eb' } } },
      { type: 'category', gridIndex: 1, data: ['换人', '暂停'], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#6b7280', fontSize: 11 }, splitLine: { show: false }, axisPointer: { show: false } }
    ],
    series: [
      scoreSeries('红队', 'home', '#ef4444', '239,68,68'),
      scoreSeries('黑队', 'away', '#3b82f6', '59,130,246'),
      markerSeries('暂停', timeline.value.pauses, 'triangle', '#f59e0b'),
      markerSeries('换人', timeline.value.substitutions, 'circle', '#16a34a')
    ]
  }, { notMerge: true });
  if (selection.value) {
    const { kind, timestamp } = selection.value;
    if ((kind === 'pause' && !showPauses.value) || (kind === 'substitution' && !showSubstitutions.value)) clearSelection();
    else if (kind === 'score') {
      const point = curvePoints.value.find(point => point.timestamp === timestamp);
      if (point) selection.value = scoreDetail(point);
      else clearSelection();
    } else {
      const marker = (kind === 'pause' ? timeline.value.pauses : timeline.value.substitutions).find(marker => marker.timestamp === timestamp);
      if (marker) selection.value = { ...selection.value, home: marker.home, away: marker.away, lineup: marker.lineup };
      else clearSelection();
    }
  }
  positionFocus();
}

watch(() => props.gameData, clearSelection);
watch(
  () => [timeline.value, sourceScores.value, sourceTeamNames.value, showPauses.value, showSubstitutions.value, showHomeScore.value, showAwayScore.value],
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
.score-difference-chart { container-type: inline-size; background: white; border-radius: 8px; padding: 16px; box-shadow: 0 2px 8px rgb(0 0 0 / 10%); margin-bottom: 20px; }
.chart-header { margin-bottom: 12px; }
.chart-header h3 { margin: 0 0 8px; font-size: 16px; color: #1f2937; }
.chart-info { display: flex; gap: 16px; flex-wrap: wrap; font-size: 14px; color: #6b7280; }
.chart-filters { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 8px; }
.chart-hint { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: #6b7280; }
.chart-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
.chart-stage { min-width: 0; position: relative; }
.chart-container { width: 100%; height: 520px; }
.chart-focus { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.focus-time { position: absolute; top: 66px; bottom: 65px; border-left: 1px dashed #64748b; }
.focus-gap { position: absolute; border-left: 2px solid #475569; }
.focus-dot { position: absolute; width: 9px; height: 9px; border: 2px solid white; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 1px rgb(0 0 0 / 15%); }
.home-color { background: #ef4444; }
.away-color { background: #3b82f6; }
.home-text { color: #dc2626; }
.away-text { color: #2563eb; }
.event-details { min-width: 0; box-sizing: border-box; display: flex; flex-direction: column; padding: 16px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; color: #334155; }
.detail-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 27px; }
.detail-toolbar h4 { margin: 0; font-size: 15px; color: #1e293b; }
.detail-actions { display: flex; gap: 6px; align-items: center; }
.lock-button, .clear-button { cursor: pointer; border: 1px solid #cbd5e1; border-radius: 5px; background: white; color: #475569; font: inherit; font-size: 12px; padding: 4px 6px; }
.lock-button.locked { color: #1d4ed8; border-color: #93c5fd; background: #eff6ff; }
.clear-button { font-size: 18px; line-height: 17px; }
.detail-time { margin: 6px 0 12px; color: #64748b; font-size: 12px; line-height: 1.6; }
.selection-state { margin-left: 8px; font-size: 11px; color: #475569; }
.detail-scoreboard { display: grid; grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1fr); gap: 6px; align-items: end; text-align: center; }
.team-score { display: flex; flex-direction: column; gap: 5px; }
.team-score span { font-size: 12px; overflow-wrap: anywhere; }
.team-score strong { font-size: 32px; line-height: 1.2; font-variant-numeric: tabular-nums; }
.score-colon { font-size: 24px; line-height: 1.6; color: #94a3b8; }
.detail-gap { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-radius: 6px; padding: 8px 10px; margin-top: 12px; font-size: 12px; }
.detail-gap strong { white-space: nowrap; font-size: 15px; }
.home-gap { color: #b91c1c; background: #fef2f2; }
.away-gap { color: #1d4ed8; background: #eff6ff; }
.tied-gap { color: #475569; background: #e2e8f0; }
.selection-help { margin: 10px 0 0; color: #64748b; font-size: 12px; line-height: 1.6; }
.detail-tabs { display: flex; gap: 4px; margin-top: 10px; padding: 3px; border-radius: 6px; background: #e2e8f0; }
.detail-tabs button { flex: 1; cursor: pointer; border: 0; border-radius: 4px; background: transparent; padding: 5px 2px; font: inherit; font-size: 12px; line-height: 1.5; color: #64748b; }
.detail-tabs button[aria-pressed="true"] { background: white; color: #1e293b; box-shadow: 0 1px 3px rgb(0 0 0 / 8%); }
.detail-tabs button:disabled { cursor: default; color: #94a3b8; }
.detail-scroll { min-height: 0; overflow-y: auto; max-height: 360px; margin-top: 12px; padding-right: 4px; scrollbar-gutter: stable; }
.detail-scroll h5 { font-size: 12px; color: #475569; margin: 0 0 10px; }
.detail-events { padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; }
.detail-event + .detail-event { margin-top: 10px; }
.event-time { font-size: 11px; color: #64748b; margin-bottom: 3px; }
.event-description { display: flex; flex-wrap: wrap; gap: 3px 6px; font-size: 12px; line-height: 1.5; }
.event-player b { font-variant-numeric: tabular-nums; }
.pause-text { font-size: 12px; color: #b45309; }
.in-text { color: #15803d; }
.out-text { color: #64748b; }
.lineup-team + .lineup-team { margin-top: 12px; }
.lineup-team h6 { display: flex; justify-content: space-between; gap: 8px; margin: 0 0 7px; font-size: 12px; }
.lineup-team h6 span { font-weight: normal; color: #64748b; }
.lineup-players { display: flex; flex-wrap: wrap; gap: 5px; }
.lineup-player { display: inline-flex; gap: 5px; align-items: center; border: 1px solid #e2e8f0; background: white; border-radius: 4px; padding: 3px 6px; font-size: 12px; }
.lineup-player b { font-size: 11px; color: #64748b; font-variant-numeric: tabular-nums; }
.no-lineup, .lineup-note { margin: 6px 0 0; font-size: 11px; line-height: 1.5; color: #64748b; }
.lineup-note { margin-top: 12px; }
@container (min-width: 1000px) {
  .chart-layout { grid-template-columns: minmax(0, 1fr) 320px; }
  .event-details { height: 520px; }
  .detail-scroll { flex: 1; max-height: none; }
}
@media (max-width: 600px) {
  .score-difference-chart { padding: 12px; }
  .chart-filters { gap: 16px; }
  .chart-container { height: 440px; }
}
</style>
