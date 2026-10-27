<template>
  <main class="company-history">
    <header>
      <h1>公司赛 · 历史比分</h1>
      <div class="actions">
        <el-button @click="router.push('/company')">返回实时统计</el-button>
        <el-select v-model="year" aria-label="年份" @change="load" style="width: 115px">
          <el-option v-for="item in years" :key="item" :label="`${item}年`" :value="item" />
        </el-select>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </header>
    <p>公司赛记录单独保存。标记“本机归档”的记录仅保存在当前浏览器；“已发布”记录可在其他设备查看。</p>
    <el-alert v-if="errorMessage" :title="errorMessage" type="warning" :closable="false" />
    <div v-loading="loading" class="matches">
      <el-empty v-if="!loading && !matches.length" description="暂无公司赛记录，比赛结束后点击“结束并归档”" />
      <el-card v-for="match in matches" :key="match.id" shadow="hover">
        <div class="match-meta">{{ match.date }} <el-tag v-if="match.isTest" size="small" type="warning" effect="dark">测试赛</el-tag> <el-tag size="small" :type="match.source === '已发布' ? 'success' : 'info'">{{ match.source }}</el-tag></div>
        <button class="scoreline" @click="selected = match">
          <span>{{ match.home }}</span><strong>{{ match.homeScore }} : {{ match.awayScore }}</strong><span>{{ match.away }}</span>
        </button>
        <div class="actions"><el-button size="small" @click="selected = match">球员数据</el-button><el-button size="small" @click="downloadCompanyMatch(match.data)">导出 JSON</el-button></div>
      </el-card>
    </div>
    <el-dialog :model-value="!!selected" :title="selected ? `${selected.home} VS ${selected.away}${selected.isTest ? '（测试赛）' : ''}` : ''" width="94%" top="4vh" @close="selected = null">
      <template v-if="selected">
        <el-alert v-if="selected.isTest" title="测试赛：仅用于功能验证，非正式比赛成绩。" type="warning" :closable="false" show-icon />
        <h2 class="detail-score">{{ selected.homeScore }} : {{ selected.awayScore }}</h2>
        <el-alert v-if="selected.data.game[0].timingCorrections?.length" title="上场时间已扣除中场休息（第二节末次得分至第三节切换）。" type="info" :closable="false" />
        <MatchTeamStats v-for="(side, index) in ['红队', '黑队']" :key="side" :title="index === 0 ? selected.home : selected.away" :title-class="index === 0 ? 'red-title' : 'black-title'" :players="playersFor(side)" show-number show-exact-time :show-performance="false" />
      </template>
    </el-dialog>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useCompanyGameStore } from '../stores/gameStore';
import { companyDataUrl, matchSummary, downloadCompanyMatch } from '../utils/companyMatches';
import MatchTeamStats from '../components/MatchTeamStats.vue';
const router = useRouter();
const store = useCompanyGameStore();
const currentYear = new Date().getFullYear();
const year = ref(currentYear);
const years = Array.from({ length: Math.max(1, currentYear - 2026 + 1) }, (_, i) => currentYear - i);
const matches = ref([]);
const loading = ref(false);
const errorMessage = ref('');
const selected = ref(null);
async function load() {
  loading.value = true;
  errorMessage.value = '';
  selected.value = null;
  const records = new Map();
  try {
    for (const archive of await store.listArchives()) {
      const summary = matchSummary({ ...archive, source: '本机归档' });
      if (summary.date.startsWith(`${year.value}-`)) records.set(summary.matchId, summary);
    }
  } catch (error) { errorMessage.value = `本机记录读取失败：${error.message}`; }
  try {
    const response = await fetch(companyDataUrl(year.value), { cache: 'no-store' });
    if (!response.ok && response.status !== 404) throw new Error('比赛目录加载失败');
    const manifest = response.status === 404 ? [] : await response.json();
    const files = Array.isArray(manifest) ? manifest : manifest?.files;
    const removedMatchIds = Array.isArray(manifest) ? [] : (manifest?.removedMatchIds || []);
    if (!Array.isArray(files) || !Array.isArray(removedMatchIds) || removedMatchIds.some(id => typeof id !== 'string')) throw new Error('比赛目录格式不正确');
    const removed = new Set(removedMatchIds);
    for (const id of removed) records.delete(id);
    const results = await Promise.allSettled(files.map(async file => {
      if (typeof file !== 'string' || !/^[\w.-]+\.json$/.test(file)) throw new Error('比赛文件名不正确');
      const result = await fetch(companyDataUrl(year.value, file), { cache: 'no-store' });
      if (!result.ok) throw new Error(`无法加载 ${file}`);
      return matchSummary({ id: file, source: '已发布', data: await result.json() });
    }));
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const match = result.value;
        if (removed.has(match.matchId)) continue;
        // 本机可能保留赛后修正，优先显示本机版本。
        const local = records.get(match.matchId);
        if (local && (local.data.game[0].revision || 0) >= (match.data.game[0].revision || 0)) {
          local.isTest = local.isTest || match.isTest;
          local.data.game[0].isTest = local.isTest;
        } else {
          records.set(match.matchId, match);
        }
      } else { errorMessage.value = '部分已发布记录加载失败，请刷新重试'; }
    }
  } catch (error) { errorMessage.value = `已发布记录加载失败：${error.message}`; }
  matches.value = [...records.values()].sort((a, b) => (b.data.game[0].gameStartTime || 0) - (a.data.game[0].gameStartTime || 0));
  loading.value = false;
}
function playersFor(side) {
  return selected.value.players.filter(p => p.team === side).map(p => ({
    ...p, playTime: (p.totalTime || 0) + (p.currentTime || 0),
    playMinutes: Math.round(((p.totalTime || 0) + (p.currentTime || 0)) / 60)
  })).sort((a, b) => Number(a.number) - Number(b.number));
}
onMounted(load);
</script>

<style scoped>
.company-history { max-width: 1100px; margin: auto; padding: 24px; }
header, .actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
header { justify-content: space-between; }
h1 { font-size: 24px; }
p, .match-meta { color: #606266; line-height: 1.7; }
.matches { display: grid; gap: 16px; margin-top: 20px; min-height: 150px; }
.scoreline { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; padding: 24px 0; background: transparent; border: 0; cursor: pointer; font: inherit; color: #303133; }
.scoreline span { flex: 1; text-align: center; overflow-wrap: anywhere; }
.scoreline strong { font-size: 30px; white-space: nowrap; }
.detail-score { display: block; text-align: center; }
.detail-score::before { content: none; }
@media (max-width: 600px) { .company-history { padding: 12px; } .scoreline { gap: 8px; } .scoreline strong { font-size: 24px; } }
</style>
