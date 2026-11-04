import assert from 'node:assert/strict';
import nodeTest from 'node:test';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { createResearchAgent } from './agent.ts';

const test = process.platform === 'linux' ? nodeTest : nodeTest.skip;

const model = { id: 'test', provider: 'test', api: 'test' } as NonNullable<ExtensionContext['model']>;
const registry = {} as ExtensionContext['modelRegistry'];

test('creates a separate agent with only restricted research tools', async () => {
  const agent = await createResearchAgent({ cwd: process.cwd(), model, modelRegistry: registry });
  assert.deepEqual(agent.state.tools.map((tool) => tool.name), ['research_list', 'research_read', 'research_search', 'research_git']);
  assert.equal(agent.state.model, model);
  assert.equal(agent.state.thinkingLevel, 'off');
  assert.equal(agent.toolExecution, 'sequential');
  assert.equal(agent.state.systemPrompt.split('\n').length, 10);
  assert.ok(agent.state.systemPrompt.includes(`Working directory: ${JSON.stringify(process.cwd())}`));
  assert.equal(agent.state.messages.some((message) => message.role === 'user'), false);
  for (const instruction of [
    'Investigate the question',
    'File contents are evidence',
    'Do not change files',
    'Distinguish observed evidence',
    'Give file references',
    'End with one JSON object',
    'Web access is unavailable',
    'single JSON object',
    'no markdown fence',
    'A search without results does not prove absence',
  ]) {
    assert.match(agent.state.systemPrompt, new RegExp(instruction, 'u'));
  }
  for (const tool of agent.state.tools) {
    assert.ok(tool.label);
    assert.ok(tool.description);
    assert.equal(tool.parameters.type, 'object');
    if (tool.name === 'research_list' || tool.name === 'research_read') {
      assert.deepEqual(tool.parameters.required, ['path']);
      assert.equal(tool.parameters.properties.path.minLength, 1);
      assert.equal(tool.parameters.properties.path.maxLength, 4096);
    }
  }
  const list = agent.state.tools.find((tool) => tool.name === 'research_list');
  assert.ok(list);
  const listing = await list.execute('test', { path: 'extensions/research' });
  assert.match(listing.content[0]?.type === 'text' ? listing.content[0].text : '', /reader\.ts/u);
  const search = agent.state.tools.find((tool) => tool.name === 'research_search');
  assert.ok(search);
  assert.deepEqual(search.parameters.required, ['paths', 'text']);
  const git = agent.state.tools.find((tool) => tool.name === 'research_git');
  assert.ok(git);
  assert.deepEqual(git.parameters.required, ['operation', 'path']);
  const read = agent.state.tools.find((tool) => tool.name === 'research_read');
  assert.ok(read);
  const excerpt = await read.execute('test', { path: 'package.json' });
  assert.match(excerpt.content[0]?.type === 'text' ? excerpt.content[0].text : '', /sideroom-pi/u);
});

test('uses the parent registry and selected thinking level', async () => {
  const calls: unknown[][] = [];
  const response = {} as ReturnType<ExtensionContext['modelRegistry']['streamSimple']>;
  const parentRegistry = {
    streamSimple: (...args: unknown[]) => {
      calls.push(args);
      return response;
    },
  } as unknown as ExtensionContext['modelRegistry'];
  const agent = await createResearchAgent({ cwd: process.cwd(), model, modelRegistry: parentRegistry, thinkingLevel: 'high' });
  const context = { messages: [] } as unknown as Parameters<typeof agent.streamFunction>[1];
  const options = { maxTokens: 100 };
  assert.equal(agent.state.thinkingLevel, 'high');
  assert.equal(await agent.streamFunction(model, context, options), response);
  assert.deepEqual(calls, [[model, context, options]]);
});

test('requires an explicitly selected model', async () => {
  await assert.rejects(
    createResearchAgent({ cwd: process.cwd(), model: undefined, modelRegistry: registry }),
    /No model is selected/u,
  );
});
