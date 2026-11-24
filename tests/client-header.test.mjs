import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';

test('remote header begins with its title and retains only the requested right-side controls',()=>{
  const source=readFileSync(new URL('../src/client/index.js',import.meta.url),'utf8');
  parse(source,{ecmaVersion:'latest',sourceType:'module'});
  assert.match(source,/h\('header', \{ className: 'rssh-conversation-header', 'data-window-drag': '' \},\s*h\('span', \{ className: 'rssh-conversation-title' \}/);
  assert.doesNotMatch(source,/toggleNavigation|IconSidebarOutlineRegular|acp\.navigation/);
  assert.match(source,/h\(NewRemoteSession/);
  assert.match(source,/renderFactorySlot\('contextMenu.button'/);
  assert.match(source,/onClick: props.toggleFiles/);
  assert.match(source,/beginNavigation: \(\) => ctx.layout.beginNavigation\(\)/);
});
