import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useAnnualStatsStore = defineStore('annualStats', () => {
  const loading = ref(false);
  const currentYear = ref(new Date().getFullYear());
  const gamesData = ref([]);
  const filesConfig = ref({});
  
  // 获取文件配置（每次都从CDN拉取最新数据）
  async function fetchFilesConfig(year) {
    const timestamp = Date.now();
    const configUrl = `https://jasoncai-ai.github.io/basketball-stat/data/${year}/basketball_files_config.json?t=${timestamp}`;
    
    try {
      console.log('从网络获取配置:', configUrl);
      const response = await fetch(configUrl, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`获取配置失败: ${response.status}`);
      }
      
      const config = await response.json();
      filesConfig.value = config;
      
      return config;
    } catch (error) {
      console.error('获取文件配置失败:', error);
      throw error;
    }
  }

  // 获取单个比赛数据（每次都从CDN拉取最新数据）
  async function fetchGameData(year, date, filename) {
    const timestamp = Date.now();
    const dataUrl = `https://jasoncai-ai.github.io/basketball-stat/data/${year}/${filename}?t=${timestamp}`;
    
    try {
      console.log('从网络获取比赛数据:', dataUrl);
      const response = await fetch(dataUrl, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`获取比赛数据失败: ${response.status}`);
      }
      
      const gameData = await response.json();
      
      return { date, data: gameData };
    } catch (error) {
      console.error(`获取比赛数据失败 (${date}):`, error);
      return { date, data: null, error: error.message };
    }
  }

  // 加载年度所有数据
  async function loadYearData(year) {
    loading.value = true;
    currentYear.value = year;
    gamesData.value = [];

    try {
      const config = await fetchFilesConfig(year);
      
      if (!config || Object.keys(config).length === 0) {
        throw new Error('没有找到比赛数据');
      }

      const dates = Object.keys(config).sort();
      const promises = dates.map(date => 
        fetchGameData(year, date, config[date])
      );
      
      const results = await Promise.all(promises);
      gamesData.value = results.filter(r => r.data !== null);
      
      console.log(`成功加载 ${gamesData.value.length} 场比赛数据`);
      
    } catch (error) {
      console.error('加载年度数据失败:', error);
      throw error;
    } finally {
      loading.value = false;
    }
  }

  // 计算球员年度统计
  const playerAnnualStats = computed(() => {
    const statsMap = new Map();

    gamesData.value.forEach((game, index) => {
      const gameInfo = game.data?.game?.[0] || {};
      const players = gameInfo.players || [];
      const teamScores = gameInfo.teamScores || {};
      
      if (!players || players.length === 0) {
        console.warn(`第 ${index + 1} 场比赛没有球员数据`);
        return;
      }

      const redScore = teamScores['红队'] || 0;
      const blackScore = teamScores['黑队'] || 0;
      const winningTeam = redScore > blackScore ? '红队' : (blackScore > redScore ? '黑队' : null);

      players.forEach(player => {
        // 使用姓名作为唯一标识，合并不同号码
        const key = player.name;
        
        // 计算上场时间判断是否 DNP
        const playTime = (player.totalTime || 0) + (player.currentTime || 0);
        const isDNP = playTime === 0;
        
        if (!statsMap.has(key)) {
          statsMap.set(key, {
            name: player.name,
            numbers: new Set([player.number]), // 收集所有使用过的号码
            gamesPlayed: 0,
            totalPoints: 0,
            totalPlusMinus: 0,
            totalPlayTime: 0,
            totalFouls: 0,
            wins: 0,
            losses: 0
          });
        }

        const stats = statsMap.get(key);
        stats.numbers.add(player.number); // 添加号码
        stats.gamesPlayed += 1;
        stats.totalPoints += player.score || 0;
        stats.totalPlusMinus += player.plusMinus || 0;
        stats.totalPlayTime += playTime;
        stats.totalFouls += player.fouls || 0;
        
        // 只有实际上场的球员才计算胜负场
        if (!isDNP && winningTeam) {
          if (player.team === winningTeam) {
            stats.wins += 1;
          } else {
            stats.losses += 1;
          }
        }
      });
    });

    return Array.from(statsMap.values()).map(stats => ({
      name: stats.name,
      number: Array.from(stats.numbers).sort((a, b) => a - b).join(', '), // 显示所有号码
      gamesPlayed: stats.gamesPlayed,
      totalPoints: stats.totalPoints,
      avgPoints: parseFloat((stats.totalPoints / stats.gamesPlayed).toFixed(1)),
      avgPlusMinus: parseFloat((stats.totalPlusMinus / stats.gamesPlayed).toFixed(1)),
      avgPlayTime: Math.round(stats.totalPlayTime / stats.gamesPlayed / 60), // 直接转换为分钟
      totalFouls: stats.totalFouls,
      avgFouls: parseFloat((stats.totalFouls / stats.gamesPlayed).toFixed(1)),
      wins: stats.wins,
      losses: stats.losses,
      winRate: parseFloat(stats.gamesPlayed > 0 ? ((stats.wins / stats.gamesPlayed) * 100).toFixed(1) : '0.0')
    })).sort((a, b) => b.totalPoints - a.totalPoints);
  });

  const totalGames = computed(() => gamesData.value.length);

  // 获取单个球员的年度历史数据（按日期排列）
  const getPlayerHistory = computed(() => {
    return (playerName) => {
      const history = [];
      
      gamesData.value.forEach((game) => {
        const gameInfo = game.data?.game?.[0] || {};
        const players = gameInfo.players || [];
        const teamScores = gameInfo.teamScores || {};
        
        const redScore = teamScores['红队'] || 0;
        const blackScore = teamScores['黑队'] || 0;
        const winningTeam = redScore > blackScore ? '红队' : (blackScore > redScore ? '黑队' : null);
        
        // 查找该球员在本场比赛的数据
        const playerData = players.find(p => p.name === playerName);
        
        if (playerData) {
          const playTime = (playerData.totalTime || 0) + (playerData.currentTime || 0);
          const isDNP = playTime === 0;
          
          let result = '-';
          if (!isDNP && winningTeam) {
            result = playerData.team === winningTeam ? '胜' : '负';
          }
          
          history.push({
            date: game.date,
            number: playerData.number,
            team: playerData.team,
            points: playerData.score || 0,
            plusMinus: playerData.plusMinus || 0,
            playTime: Math.round(playTime / 60), // 转换为分钟
            fouls: playerData.fouls || 0,
            result: result
          });
        }
      });
      
      // 按日期排序
      return history.sort((a, b) => a.date.localeCompare(b.date));
    };
  });

  return {
    loading,
    currentYear,
    gamesData,
    filesConfig,
    playerAnnualStats,
    totalGames,
    getPlayerHistory,
    loadYearData
  };
});
