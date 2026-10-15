import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import type { SessionDescriptor } from './model.ts';

interface Destinations {
  update(available: readonly SessionDescriptor[]): void;
  choose(id: string): void;
  clear(): void;
  current(): SessionDescriptor | undefined;
  all(): readonly SessionDescriptor[];
}
const first: SessionDescriptor = {
  id: '00000000-0000-0000-0000-000000000001',
  revision: '00000000-0000-0000-0000-000000000002',
  name: 'First',
  project: '/first',
  environment: 'linux',
};
const second: SessionDescriptor = {
  ...first,
  id: '00000000-0000-0000-0000-000000000003',
  name: 'Second',
};
function loadDestinations(): Destinations {
  const factory: () => Destinations = runInNewContext(
    readFileSync(
      new URL(
        '../../assets/visual-context/browser/destinations.js',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  return factory();
}

test('automatically chooses only a sole destination, withdrawing that choice when ambiguity appears', () => {
  const destinations = loadDestinations();
  assert.equal(destinations.current(), undefined);
  destinations.update([first]);
  assert.equal(destinations.current(), first);
  destinations.update([first, second]);
  assert.equal(destinations.current(), undefined);
  destinations.update([second]);
  assert.equal(destinations.current(), second);
});

test('keeps an explicit preference through disconnect and revision changes without selecting another session', () => {
  const destinations = loadDestinations();
  destinations.update([first, second]);
  destinations.choose(second.id);
  assert.equal(destinations.current(), second);
  const changed = {
    ...second,
    revision: '00000000-0000-0000-0000-000000000004',
  };
  destinations.update([changed, first]);
  assert.equal(destinations.current(), changed);
  destinations.update([first]);
  assert.equal(destinations.current(), undefined);
  destinations.update([first, second]);
  assert.equal(destinations.current(), second);
  assert.throws(() => destinations.choose('missing'), /no longer available/u);
  assert.equal(destinations.current(), second);
});

test('clearing destinations removes the preference and resumes sole-session selection', () => {
  const destinations = loadDestinations();
  destinations.update([first, second]);
  destinations.choose(second.id);
  destinations.clear();
  assert.equal(destinations.current(), undefined);
  assert.equal(destinations.all().length, 0);
  destinations.update([first]);
  assert.equal(destinations.current(), first);
});

test('owns its list without changing incoming lists or sharing state across instances', () => {
  const available = [first];
  const destinations = loadDestinations();
  destinations.update(available);
  available.push(second);
  assert.equal(destinations.all().length, 1);
  const exposed = destinations.all();
  Reflect.set(exposed, 'length', 0);
  assert.equal(destinations.all().length, 1);
  assert.equal(loadDestinations().current(), undefined);
});
