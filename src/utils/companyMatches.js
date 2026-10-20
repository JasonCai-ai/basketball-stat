export function companyDataUrl(year, filename = 'matches.json') {
  return `${import.meta.env.BASE_URL}data/company/${year}/${filename}`;
}

export function matchSummary(record) {
  const game = record.data?.game?.[0];
  if (!game || game.workspace !== 'company') throw new Error('不是公司比赛记录');
  if (!game.matchId || !game.teamNames?.['红队'] || !game.teamNames?.['黑队']) throw new Error('公司比赛记录缺少 ID 或队名');
  const time = game.gameStartTime || record.savedAt;
  if (!Number.isFinite(time) || time <= 0) throw new Error('公司比赛记录缺少比赛时间');
  return {
    ...record,
    matchId: game.matchId,
    isTest: game.isTest === true,
    date: new Date(time).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
    home: game.teamNames?.['红队'] || '主队',
    away: game.teamNames?.['黑队'] || '客队',
    homeScore: game.teamScores?.['红队'] || 0,
    awayScore: game.teamScores?.['黑队'] || 0,
    players: game.players || []
  };
}

export function downloadCompanyMatch(data) {
  const game = data.game[0];
  const date = new Date(game.gameStartTime || Date.now()).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `company_basketball_${date}_${game.matchId}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
