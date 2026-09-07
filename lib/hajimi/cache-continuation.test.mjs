import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAssistantMessageEventStream, InMemoryCredentialStore, InMemoryModelsStore } from '@earendil-works/pi-ai';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { createHajimiCoreFactory } from './core-extension.ts';
import { convertResponsesMessages } from '../../node_modules/@earendil-works/pi-ai/dist/api/openai-responses-shared.js';

test('real Pi loop persists workflow updates in order and preserves consecutive wire prefixes', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'hajimi-pi-cache-'));
  let session;
  try {
    const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsStore: new InMemoryModelsStore(),
      modelsPath: null, refreshOnCreate: false });
    runtime.registerProvider('cache-test', { api: 'openai-responses', baseUrl: 'http://127.0.0.1:1', apiKey: 'synthetic-unused',
      models: [{ id: 'synthetic', name: 'synthetic', reasoning: false, input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 1024 }] });
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false, keepRecentTokens: 20, reserveTokens: 1024 } });
    const loader = new DefaultResourceLoader({ cwd, agentDir: cwd, settingsManager,
      noExtensions: true, noSkills: true, noContextFiles: true,
      extensionFactories: [{ name: 'hajimi-cache-test', factory(pi) {
        createHajimiCoreFactory({ cwd, productRoot: process.cwd() })({ ...pi,
          // This test uses no shell or managed runtime. All other production hooks run.
          on(name, handler) { if (name !== 'session_start') pi.on(name, handler); },
        });
      } }],
    });
    await loader.reload();
    const manager = SessionManager.create(cwd, join(cwd, 'sessions'));
    const model = runtime.getModel('cache-test', 'synthetic');
    ({ session } = await createAgentSession({ cwd, agentDir: cwd, modelRuntime: runtime, model,
      resourceLoader: loader, sessionManager: manager, settingsManager }));
    const errors = [];
    await session.bindExtensions({ onError: error => errors.push(error) });
    const requests = [];
    let extraToolRequest = -1;
    session.agent.streamFunction = (_model, context) => {
      requests.push(JSON.parse(JSON.stringify(context)));
      const index = requests.length;
      const toolUse = index <= 2 || index === extraToolRequest;
      const content = toolUse ? [{ type: 'toolCall', id: `call-${index}`, name: 'hajimi_update_plan',
        arguments: { expectedRevision: index === extraToolRequest ? 2 : index - 1, currentObjective: `objective-${index}`, nextAction: 'continue',
          plan: [{ id: 'step', title: 'step', status: 'active' }] } }]
        : [{ type: 'text', text: 'Done' }];
      const message = { role: 'assistant', content, api: model.api, provider: model.provider, model: model.id,
        usage: { input: index === extraToolRequest ? 10000 : 100, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: index === extraToolRequest ? 10010 : 110,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: toolUse ? 'toolUse' : 'stop', timestamp: Date.now() };
      const stream = createAssistantMessageEventStream();
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: message.stopReason, message });
      return stream;
    };
    await session.prompt('Synthetic task');
    assert.deepEqual(errors, []);
    assert.equal(requests.length, 3, JSON.stringify(session.messages.filter(message => message.role === 'assistant')));
    const wire = context => convertResponsesMessages(model, context, new Set([model.provider]), { includeSystemPrompt: false });
    for (let i = 1; i < requests.length; i++) {
      const prior = wire(requests[i - 1]);
      assert.deepEqual(wire(requests[i]).slice(0, prior.length), prior);
      assert.equal(requests[i].systemPrompt, requests[0].systemPrompt);
      assert.deepEqual(requests[i].tools, requests[0].tools);
    }
    const stored = manager.getEntries().filter(entry => entry.type === 'custom_message' && entry.customType === 'hajimi-live-context');
    assert.equal(stored.length, 3);
    assert.match(stored[0].content, /阶段 0：材料就绪/);
    assert.doesNotMatch(stored[1].content, /阶段 0：材料就绪/);
    assert.match(stored[1].content, /guidance is unchanged/);
    assert.match(stored.at(-1).content, /objective=objective-2/);
    await session.prompt('Continue');
    assert.equal(manager.getEntries().filter(entry => entry.type === 'custom_message' && entry.customType === 'hajimi-live-context').length, 3,
      'unchanged state must not be appended again');
    await session.compact();
    assert.equal(manager.getEntries().filter(entry => entry.type === 'compaction').length, 1);
    await session.prompt('After compaction');
    const refreshed = manager.getEntries().filter(entry => entry.type === 'custom_message' && entry.customType === 'hajimi-live-context').at(-1);
    assert.match(refreshed.content, /阶段 0：材料就绪/, 'compaction must restore the full stage guidance');
    assert.match(JSON.stringify(requests.at(-1).messages), /objective=objective-2/);
    assert.deepEqual(errors, []);
    const restored = SessionManager.open(manager.getSessionFile()).buildSessionContext();
    assert.ok(restored.messages.some(message => message.customType === 'hajimi-live-context'
      && message.content.includes('objective=objective-2')), 'fresh workflow state must survive disk reload after compaction');
    extraToolRequest = requests.length + 1;
    settingsManager.setCompactionEnabled(true);
    session.agent.state.model = { ...model, contextWindow: 8000 };
    await session.prompt('Force a synthetic threshold compaction between tool turns');
    assert.ok(manager.getEntries().filter(entry => entry.type === 'compaction').length >= 2);
    assert.match(JSON.stringify(requests.at(-1).messages), new RegExp(`objective=objective-${extraToolRequest}`));
    assert.deepEqual(errors, []);
  } finally {
    session?.dispose();
    rmSync(cwd, { recursive: true, force: true });
  }
});
