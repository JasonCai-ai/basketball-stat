const sides = ['红队', '黑队'];
const isSubstitution = event => event.type === 'sub-in' || event.type === 'sub-out';
const playerKey = player => JSON.stringify([player.team, String(player.number ?? ''), player.name ?? player.player ?? '']);
const comparePlayers = (a, b) => String(a.number).localeCompare(String(b.number), 'zh-CN', { numeric: true }) || a.name.localeCompare(b.name, 'zh-CN');

// Replay the recorded events instead of using the match's final on-court flags at every point.
export function buildScoreTimeline(details = [], players = [], gameStartTime = 0) {
  const events = details.filter(event => Number.isFinite(event.timestamp)).slice().sort((a, b) => a.timestamp - b.timestamp);
  const roster = new Map();
  for (const player of players) {
    if (sides.includes(player.team)) roster.set(playerKey(player), { name: player.name, number: player.number ?? '', team: player.team, active: player.isPlaying === true });
  }
  const seen = new Set();
  for (const event of events) {
    if (!sides.includes(event.team) || !event.player) continue;
    const key = playerKey(event);
    if (!roster.has(key)) roster.set(key, { name: event.player, number: event.number ?? '', team: event.team, active: false });
    // A first recorded exit means this player was already on court before the log began.
    if (isSubstitution(event) && !seen.has(key)) {
      roster.get(key).active = event.type === 'sub-out';
      seen.add(key);
    }
  }
  const lineup = () => Object.fromEntries(sides.map(side => [side, [...roster.values()]
    .filter(player => player.team === side && player.active)
    .map(({ name, number, team }) => ({ name, number, team }))
    .sort(comparePlayers)]));
  const relevant = events.filter(event => event.type === 'score' || event.type === 'game-pause' || event.type === 'game-start' || isSubstitution(event));
  const times = relevant.map(event => event.timestamp);
  if (Number.isFinite(gameStartTime) && gameStartTime > 0) times.push(gameStartTime);
  const minTime = times.length ? Math.min(...times) : 0;
  const endTime = times.length ? Math.max(...times) : 0;
  const scores = [];
  const pauses = [];
  const substitutions = [];
  let home = 0;
  let away = 0;
  let maxDifference = 0;
  let maxPoint = null;
  if (times.length) scores.push({ timestamp: minTime, home, away, event: null, lineup: lineup() });
  for (const event of events) {
    const key = playerKey(event);
    if (isSubstitution(event) && roster.has(key)) roster.get(key).active = event.type === 'sub-in';
    if (event.type === 'player-remove' && roster.has(key)) roster.get(key).active = false;
    if (event.type === 'score' && sides.includes(event.team) && Number.isFinite(Number(event.value))) {
      if (event.team === '红队') home += Number(event.value);
      else away += Number(event.value);
      const point = { timestamp: event.timestamp, home, away, event, lineup: lineup() };
      scores.push(point);
      if (Math.abs(home - away) > maxDifference) {
        maxDifference = Math.abs(home - away);
        maxPoint = point;
      }
    }
    if (event.type === 'game-pause' || isSubstitution(event)) {
      const marker = { timestamp: event.timestamp, event, lineup: lineup() };
      (event.type === 'game-pause' ? pauses : substitutions).push(marker);
    }
  }
  if (scores.length && endTime > scores.at(-1).timestamp) scores.push({ timestamp: endTime, home, away, event: null, lineup: lineup() });
  return { scores, pauses, substitutions, minTime, maxTime: Math.max(endTime, minTime + 1000), maxDifference, maxPoint };
}

// Group only visually colliding markers; the anchor stays at the last recorded event's exact time.
export function groupTimelineMarkers(markers, minTime, maxTime, width) {
  const interval = (maxTime - minTime) * 22 / Math.max(width, 1);
  const groups = [];
  // Work backwards so every last-event anchor is at least one symbol width apart.
  for (let index = markers.length - 1; index >= 0; index--) {
    const marker = markers[index];
    let group = groups[0];
    if (!group || group.timestamp - marker.timestamp > interval) {
      group = { startTime: marker.timestamp, timestamp: marker.timestamp, events: [], lineup: marker.lineup };
      groups.unshift(group);
    }
    group.events.unshift(marker.event);
    group.startTime = marker.timestamp;
  }
  return groups;
}
