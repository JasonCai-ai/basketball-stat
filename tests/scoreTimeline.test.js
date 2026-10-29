import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildScoreTimeline, groupTimelineMarkers } from '../src/utils/scoreTimeline.js';

const event = (timestamp, type, team = '', player = '', number = '', value = null) => ({ timestamp, type, team, player, number, value, period: 1 });
const names = lineup => Object.fromEntries(Object.entries(lineup).map(([team, players]) => [team, players.map(player => player.name)]));

test('replays substitutions at their event time instead of reusing the final lineup', () => {
  const events = [
    event(100, 'sub-in', '红队', '甲', '10'), event(101, 'sub-in', '红队', '乙', '2'),
    event(102, 'sub-in', '黑队', '丙', '2'), event(110, 'score', '红队', '甲', '10', 3),
    event(120, 'sub-out', '红队', '甲', '10'), event(120, 'sub-in', '红队', '丁', '0'),
    event(130, 'game-pause'), event(140, 'score', '黑队', '丙', '2', 2),
    event(150, 'score', '红队', '乙', '2', -1)
  ];
  const before = JSON.stringify(events);
  const timeline = buildScoreTimeline(events);
  assert.deepEqual(names(timeline.scores[1].lineup), { '红队': ['乙', '甲'], '黑队': ['丙'] });
  assert.deepEqual(names(timeline.pauses[0].lineup), { '红队': ['丁', '乙'], '黑队': ['丙'] });
  assert.deepEqual([timeline.pauses[0].home, timeline.pauses[0].away], [3, 0]);
  assert.equal(timeline.substitutions[3].lineup['红队'].some(player => player.name === '甲'), false);
  assert.equal(timeline.substitutions[4].lineup['红队'][0].name, '丁');
  assert.deepEqual([timeline.scores.at(-1).home, timeline.scores.at(-1).away], [2, 2]);
  assert.equal(timeline.maxDifference, 3);
  assert.deepEqual([timeline.substitutions.at(-1).home, timeline.substitutions.at(-1).away], [3, 0]);
  assert.equal(JSON.stringify(events), before);
});

test('handles opening exits, unchanged players, and player removal with incomplete older logs', () => {
  const players = [
    { name: '甲', number: '0', team: '红队', isPlaying: false },
    { name: '乙', number: '99', team: '黑队', isPlaying: true }
  ];
  const timeline = buildScoreTimeline([
    event(100, 'score', '黑队', '乙', '99', 2),
    event(110, 'sub-out', '红队', '甲', '0'),
    event(120, 'player-remove', '黑队', '乙', '99'), event(130, 'game-pause')
  ], players);
  assert.deepEqual(names(timeline.scores[1].lineup), { '红队': ['甲'], '黑队': ['乙'] });
  assert.deepEqual(names(timeline.pauses[0].lineup), { '红队': [], '黑队': [] });
});

test('groups colliding markers without losing records, original times, or the last lineup', () => {
  const timeline = buildScoreTimeline([
    event(1000, 'sub-in', '红队', '甲', '2'), event(1005, 'sub-out', '红队', '甲', '2'),
    event(1010, 'sub-in', '红队', '乙', '10'), event(1500, 'score', '红队', '乙', '10', 2), event(1900, 'sub-out', '红队', '乙', '10')
  ]);
  const groups = groupTimelineMarkers(timeline.substitutions, 1000, 2000, 100);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].events.map(event => event.timestamp), [1000, 1005, 1010]);
  assert.equal(groups[0].timestamp, 1010);
  assert.deepEqual(names(groups[0].lineup), { '红队': ['乙'], '黑队': [] });
  assert.deepEqual([groups[0].home, groups[0].away, groups[1].home, groups[1].away], [0, 0, 2, 0]);
  assert.equal(groupTimelineMarkers(timeline.substitutions, 1000, 2000, 10000).length, 4);
  const adjacent = [1000, 1020, 1021, 1040].map(timestamp => ({ timestamp, event: event(timestamp, 'game-pause'), lineup: {} }));
  const separated = groupTimelineMarkers(adjacent, 1000, 1100, 100);
  for (let index = 1; index < separated.length; index++) assert.ok(separated[index].timestamp - separated[index - 1].timestamp > 22);
});

test('empty and invalid timestamps do not create invented events or carry a previous maximum', () => {
  const timeline = buildScoreTimeline([event(NaN, 'sub-in', '红队', '甲', '2'), event(undefined, 'score', '红队', '甲', '2', 3)]);
  assert.equal(timeline.maxDifference, 0);
  assert.deepEqual(timeline.scores, []);
  assert.deepEqual(timeline.substitutions, []);
  assert.equal(timeline.maxPoint, null);
});

test('all published company matches retain their scores and replay every recorded lineup', async () => {
  const directory = new URL('../public/data/company/2026/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('matches.json', directory), 'utf8'));
  for (const filename of manifest.files) {
    const data = JSON.parse(await readFile(new URL(filename, directory), 'utf8'));
    const timeline = buildScoreTimeline(data.details, data.game[0].players, data.game[0].gameStartTime);
    assert.equal(timeline.scores.at(-1).home, data.game[0].teamScores['红队'], filename);
    assert.equal(timeline.scores.at(-1).away, data.game[0].teamScores['黑队'], filename);
    const active = { '红队': new Map(), '黑队': new Map() };
    for (const record of timeline.substitutions) {
      const e = record.event;
      if (e.type === 'sub-in') active[e.team].set(`${e.number}:${e.player}`, e.player);
      else active[e.team].delete(`${e.number}:${e.player}`);
      for (const side of ['红队', '黑队']) assert.deepEqual(
        record.lineup[side].map(player => player.name).sort(), [...active[side].values()].sort(), filename
      );
    }
    assert.equal(timeline.pauses.length, data.details.filter(e => e.type === 'game-pause').length);
    assert.equal(timeline.substitutions.length, data.details.filter(e => e.type === 'sub-in' || e.type === 'sub-out').length);
  }
});
