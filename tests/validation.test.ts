import test from 'node:test';
import assert from 'node:assert/strict';
import { isAck, isEventConfig, isMindSnapshot, isPersonalResult } from '../src/validation.ts';
import { computeMind } from '../src/domain.ts';
const ack = { participationId: 'b910b1a1-0437-4a40-af52-b27dfd9d6ff7', requestId: 'c44fab30-a89c-485b-b163-e6b704c4e3c8', revision: 1, cardIds: [1,2,3], updatedAt: '2026-10-06T20:00:00.000Z' };
const mind = computeMind([{id:'a',cardIds:[1,2,3]},{id:'b',cardIds:[1,2,3]}],2,'2026-10-06T20:00:00.000Z');
test('only validated acknowledgements can clear an uncertain pending mutation', () => {
  assert.ok(isAck(ack));
  for (const value of [null,{}, {...ack,revision:0},{...ack,cardIds:[1,1,2]},{...ack,cardIds:[3,2,1]},{...ack,updatedAt:'yesterday'},{...ack,requestId:''}]) assert.equal(isAck(value),false);
});
test('community snapshots preserve the three-card and three-pair invariants', () => {
  assert.ok(isMindSnapshot(mind));
  assert.ok(isMindSnapshot(computeMind([],0,'2026-10-06T20:00:00.000Z')));
  for (const value of [{...mind,total:4},{...mind,cardCounts:{'1':99}},{...mind,pairCounts:{'1-1':6}},{...mind,pairCounts:{'2-1':6}},{...mind,asOf:'invalid'}]) assert.equal(isMindSnapshot(value),false);
});
test('a personal result cannot count the owner or claim matches without a participation', () => {
  assert.ok(isPersonalResult({participation:ack,matches:{exact:1,close:0},mind}));
  assert.ok(isPersonalResult({participation:null,matches:null,mind}));
  assert.equal(isPersonalResult({participation:null,matches:{exact:0,close:0},mind}),false);
  assert.equal(isPersonalResult({participation:ack,matches:{exact:1,close:1},mind}),false);
  assert.equal(isPersonalResult({participation:ack,matches:{exact:-1,close:0},mind}),false);
});
test('event configuration validates active IDs and collection controls', () => {
  const config = {slug:'big-2026',title:'BIG MATCH',question:'Future of design?',deckVersion:'impersonae-v1',status:'draft',activeCardIds:[1,2,3],contactEnabled:false,privacyVersion:'',privacyNotice:'',controllerName:'',controllerEmail:'',retentionDays:30};
  assert.ok(isEventConfig(config));
  assert.equal(isEventConfig({...config,activeCardIds:[1,1,2]}),false);
  assert.equal(isEventConfig({...config,contactEnabled:'false'}),false);
  assert.equal(isEventConfig({...config,controllerEmail:undefined}),false);
});
