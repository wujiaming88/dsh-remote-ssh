import test from 'node:test';
import assert from 'node:assert/strict';
import {AGENT_ICON_NAMES,agentMask} from '../src/client/agent-icon.js';

test('each remote agent has a named monochrome mask', () => {
  assert.deepEqual(AGENT_ICON_NAMES, {claude: 'Claude Code', codex: 'Codex', pi: 'Pi'});
  for (const agent of ['claude', 'codex', 'pi']) {
    const mask = agentMask(agent);
    assert.match(mask, /^url\("data:image\/svg\+xml,/);
    assert.match(decodeURIComponent(mask), /viewBox=/);
    assert.match(decodeURIComponent(mask), /fill="#000"/);
  }
  assert.equal(agentMask('unknown'), '');
});
