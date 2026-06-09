import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  computeLeagueStats,
  computeEloRatings,
  computeRapmRatings,
  rapmExpectedPlusMinus,
  shrinkWinRate,
  playerPowerRating,
} from '../utils/winPrediction';

export const useAnnualStatsStore = defineStore('annualStats', () => {
  const loading = ref(false);
  const currentYear = ref(new Date().getFullYear());
  const gamesData = ref([]);
  const filesConfig = ref({});
  // 比赛合照配置：{ "YYYY-MM-DD": ["photos/xxx.jpg", ...] }，路径相对于 data/{year}/
  const photosConfig = ref({});

  const CDN_BASE = 'https://jasoncai-ai.github.io/basketball-stat/data';

  // 化学反应（最夯/最拉 队友与对手）：两人至少同场这么多次才纳入候选
  const MIN_CHEMISTRY_GAMES = 3;
  
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

  // 获取比赛合照配置（可选，缺失属正常情况，不影响主流程）
  async function fetchPhotosConfig(year) {
    const timestamp = Date.now();
    const configUrl = `${CDN_BASE}/${year}/basketball_photos_config.json?t=${timestamp}`;

    try {
      const response = await fetch(configUrl, { cache: 'no-cache' });
      if (!response.ok) {
        photosConfig.value = {};
        return {};
      }
      const config = await response.json();
      photosConfig.value = config || {};
      return photosConfig.value;
    } catch (error) {
      console.warn('获取照片配置失败（忽略）:', error);
      photosConfig.value = {};
      return {};
    }
  }

  // 加载年度所有数据
  async function loadYearData(year) {
    loading.value = true;
    currentYear.value = year;
    gamesData.value = [];
    photosConfig.value = {};

    try {
      // 照片配置与比赛数据并行获取；照片缺失不应阻断比赛数据加载
      const [config] = await Promise.all([
        fetchFilesConfig(year),
        fetchPhotosConfig(year),
      ]);
      
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

  // 球员 RAPM（正则化调整正负值）：基于全季比赛岭回归得出，Map<球员名, rapm>
  // 仅依赖 gamesData，无循环依赖；供战力值 / 当场表现 / 搭配克制 共用
  const playerRapmRatings = computed(() => computeRapmRatings(gamesData.value));

  // 球员年度基础统计（不含战力值，作为内部计算源）
  // 单独抽出来：leagueStats 需要它，而带战力值的版本又需要 leagueStats，避免循环依赖
  const basePlayerAnnualStats = computed(() => {
    const statsMap = new Map();
    const sortedGames = [...gamesData.value].sort((a, b) => a.date.localeCompare(b.date));

    sortedGames.forEach((game, index) => {
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
        // 计算上场时间判断是否 DNP
        const playTime = (player.totalTime || 0) + (player.currentTime || 0);
        const isDNP = playTime === 0;
        
        // DNP球员不纳入年度统计
        if (isDNP) {
          return;
        }
        
        // 使用姓名作为唯一标识，合并不同号码
        const key = player.name;
        
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
            losses: 0,
            recentGames: []
          });
        }

        const stats = statsMap.get(key);
        stats.numbers.add(player.number); // 添加号码
        stats.gamesPlayed += 1;
        stats.totalPoints += player.score || 0;
        stats.totalPlusMinus += player.plusMinus || 0;
        stats.totalPlayTime += playTime;
        stats.totalFouls += player.fouls || 0;
        
        // 计算胜负场
        if (winningTeam) {
          if (player.team === winningTeam) {
            stats.wins += 1;
          } else {
            stats.losses += 1;
          }
        }

        stats.recentGames.push({
          points: player.score || 0,
          plusMinus: player.plusMinus || 0,
          playTime,
          fouls: player.fouls || 0,
        });
        if (stats.recentGames.length > 5) {
          stats.recentGames.shift();
        }
      });
    });

    const rapmMap = playerRapmRatings.value;
    return Array.from(statsMap.values()).map(stats => {
      const totalMinutes = stats.totalPlayTime / 60;
      const safeMin = totalMinutes > 0 ? totalMinutes : 0;
      const decided = stats.wins + stats.losses; // 排除平局
      const recentGamesCount = stats.recentGames.length;
      const recentTotals = stats.recentGames.reduce((acc, game) => {
        acc.points += game.points;
        acc.plusMinus += game.plusMinus;
        acc.playTime += game.playTime;
        acc.fouls += game.fouls;
        return acc;
      }, { points: 0, plusMinus: 0, playTime: 0, fouls: 0 });
      const recentMinutes = recentTotals.playTime / 60;
      return {
        name: stats.name,
        number: Array.from(stats.numbers).sort((a, b) => a - b).join(', '),
        gamesPlayed: stats.gamesPlayed,
        totalPoints: stats.totalPoints,
        avgPoints: parseFloat((stats.totalPoints / stats.gamesPlayed).toFixed(1)),
        avgPlusMinus: parseFloat((stats.totalPlusMinus / stats.gamesPlayed).toFixed(1)),
        avgPlayTime: Math.round(stats.totalPlayTime / stats.gamesPlayed / 60),
        totalFouls: stats.totalFouls,
        avgFouls: parseFloat((stats.totalFouls / stats.gamesPlayed).toFixed(1)),
        wins: stats.wins,
        losses: stats.losses,
        winRate: parseFloat(stats.gamesPlayed > 0 ? ((stats.wins / stats.gamesPlayed) * 100).toFixed(1) : '0.0'),
        // 预测专用字段：精确分钟、人均效率、贝叶斯调整胜率
        totalMinutes,
        pointsPerMin:     safeMin > 0 ? stats.totalPoints     / safeMin : 0,
        plusMinusPerMin:  safeMin > 0 ? stats.totalPlusMinus  / safeMin : 0,
        foulsPerMin:      safeMin > 0 ? stats.totalFouls      / safeMin : 0,
        adjustedWinRate:  shrinkWinRate(stats.wins, decided),
        recentGamesCount,
        recentAvgPoints: recentGamesCount > 0 ? recentTotals.points / recentGamesCount : 0,
        recentAvgPlusMinus: recentGamesCount > 0 ? recentTotals.plusMinus / recentGamesCount : 0,
        recentAvgPlayTime: recentGamesCount > 0 ? recentTotals.playTime / recentGamesCount / 60 : 0,
        recentFoulsPerMin: recentMinutes > 0 ? recentTotals.fouls / recentMinutes : 0,
        // RAPM：供战力值 z-score 用（联盟分布由 computeLeagueStats 统计）
        rapm: rapmMap.get(stats.name) ?? 0,
      };
    }).sort((a, b) => b.totalPoints - a.totalPoints);
  });

  const totalGames = computed(() => gamesData.value.length);

  // 获取某场比赛的合照完整 URL 列表（无照片则返回空数组）
  const getGamePhotos = computed(() => {
    return (date) => {
      const entry = photosConfig.value[date];
      if (!entry) return [];
      const list = Array.isArray(entry) ? entry : [entry];
      return list
        .filter(Boolean)
        .map((path) => `${CDN_BASE}/${currentYear.value}/${path}`);
    };
  });

  // 预测模型用：联盟级 mean/std，用于 z-score 标准化
  const leagueStats = computed(() => computeLeagueStats(basePlayerAnnualStats.value));

  // 预测模型用：球员 Elo（按时间顺序遍历历史比赛得出）
  const playerEloRatings = computed(() => computeEloRatings(gamesData.value));

  // 对外暴露的球员年度统计：在基础统计上叠加战力值 (0-100)
  const playerAnnualStats = computed(() => {
    const ls = leagueStats.value;
    const elo = playerEloRatings.value;
    return basePlayerAnnualStats.value.map(p => ({
      ...p,
      powerRating: playerPowerRating(p, ls, elo),
    }));
  });

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

  // 球员"化学反应"：基于全季数据，算出每名球员的
  //   最夯/最拉 队友（同队时表现最好/最差）与 最夯/最拉 对手（最好打/最克我）
  // 综合分 score = 胜率*100 + 场均正负值*3（胜率为主，正负值微调），均取该球员本人视角
  // 返回 Map<球员名, { bestTeammate, worstTeammate, bestOpponent, worstOpponent }>
  //   每个值为 { name, games, winRate, avgPlusMinus, score } 或 null（无达标候选）
  const playerChemistry = computed(() => {
    // pairStats: Map<P名, Map<Q名, { games, wins, sumPM }>>
    const teammate = new Map();
    const opponent = new Map();

    const ensure = (root, p, q) => {
      if (!root.has(p)) root.set(p, new Map());
      const inner = root.get(p);
      if (!inner.has(q)) inner.set(q, { name: q, games: 0, wins: 0, sumPM: 0 });
      return inner.get(q);
    };

    const rapmMap = playerRapmRatings.value;

    gamesData.value.forEach((game) => {
      const gameInfo = game.data?.game?.[0] || {};
      const teamScores = gameInfo.teamScores || {};
      const redScore = teamScores['红队'] || 0;
      const blackScore = teamScores['黑队'] || 0;
      const winningTeam = redScore > blackScore ? '红队' : (blackScore > redScore ? '黑队' : null);

      // 只取真正上场的球员
      const played = (gameInfo.players || []).filter(
        (p) => (p.totalTime || 0) + (p.currentTime || 0) > 0
      );

      // 本场在场阵容（含分钟），用于 RAPM 强度校正
      const onCourt = played.map((p) => ({
        name: p.name,
        team: p.team,
        minutes: ((p.totalTime || 0) + (p.currentTime || 0)) / 60,
      }));
      // 预算每名球员的"残差正负值"= 实际 − RAPM 应得（打强阵/克强敌才算数）
      const adjPM = new Map();
      played.forEach((p) => {
        const expected = rapmExpectedPlusMinus({ name: p.name, team: p.team }, onCourt, rapmMap);
        adjPM.set(p.name, (p.plusMinus || 0) - expected);
      });

      played.forEach((P) => {
        const pWon = winningTeam ? (P.team === winningTeam ? 1 : 0) : null;
        played.forEach((Q) => {
          if (P.name === Q.name) return;
          const root = P.team === Q.team ? teammate : opponent;
          const rec = ensure(root, P.name, Q.name);
          rec.games += 1;
          rec.sumPM += adjPM.get(P.name) || 0;
          if (pWon !== null) rec.wins += pWon; // 平局不计入胜，但 games 已计入
        });
      });
    });

    // 把一名球员的某类关系（队友/对手）里达标的候选，挑出 score 最高/最低
    const pickExtremes = (innerMap) => {
      const candidates = [];
      if (innerMap) {
        innerMap.forEach((rec) => {
          if (rec.games < MIN_CHEMISTRY_GAMES) return;
          const winRate = rec.wins / rec.games;
          const avgPlusMinus = rec.sumPM / rec.games;
          const score = winRate * 100 + avgPlusMinus * 3;
          candidates.push({
            name: rec.name,
            games: rec.games,
            winRate: parseFloat((winRate * 100).toFixed(1)),
            avgPlusMinus: parseFloat(avgPlusMinus.toFixed(1)),
            score,
          });
        });
      }
      if (candidates.length === 0) return { best: null, worst: null };
      let best = candidates[0];
      let worst = candidates[0];
      candidates.forEach((c) => {
        if (c.score > best.score) best = c;
        if (c.score < worst.score) worst = c;
      });
      // 仅一个候选时，最夯=最拉=同一人，避免重复展示则 worst 置空
      return { best, worst: candidates.length > 1 ? worst : null };
    };

    const names = new Set([...teammate.keys(), ...opponent.keys()]);
    const result = new Map();
    names.forEach((name) => {
      const mate = pickExtremes(teammate.get(name));
      const opp = pickExtremes(opponent.get(name));
      result.set(name, {
        bestTeammate: mate.best,
        worstTeammate: mate.worst,
        bestOpponent: opp.best,
        worstOpponent: opp.worst,
      });
    });
    return result;
  });

  return {
    loading,
    currentYear,
    gamesData,
    filesConfig,
    photosConfig,
    playerAnnualStats,
    totalGames,
    getPlayerHistory,
    playerChemistry,
    playerRapmRatings,
    getGamePhotos,
    loadYearData,
    leagueStats,
    playerEloRatings,
  };
});
