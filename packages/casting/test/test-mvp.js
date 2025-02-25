// @ts-nocheck
// eslint-disable-next-line import/order
import { test } from './prepare-test-env-ava.js';

import {
  iterateLatest,
  makeFollower,
  makeLeader,
  makeCastingSpec,
} from '../src/main.js';

import { delay } from '../src/defaults.js';
import { startFakeServer } from './fake-rpc-server.js';

// TODO: Replace with test.macro({title, exec}).
const testHappyPath = (label, ...input) => {
  // eslint-disable-next-line no-shadow
  const title = label => `happy path ${label}`;
  const makeExec =
    ({ fakeValues, options }) =>
    async t => {
      const expected = fakeValues;
      t.plan(expected.length);
      const PORT = await t.context.startFakeServer(t, [...expected], options);
      /** @type {import('../src/types.js').LeaderOptions} */
      const lo = {
        retryCallback: null, // fail fast, no retries
        keepPolling: () => delay(200).then(() => true), // poll really quickly
        jitter: null, // no jitter
      };
      /** @type {import('../src/types.js').FollowerOptions} */
      const so = {
        proof: 'none',
      };

      // The rest of this test is taken almost verbatim from the README.md, with
      // some minor modifications (testLeaderOptions and deepEqual).
      const leader = makeLeader(`http://localhost:${PORT}/network-config`, lo);
      const castingSpec = makeCastingSpec(':mailbox.agoric1foobarbaz');
      const follower = await makeFollower(castingSpec, leader, so);
      for await (const { value } of iterateLatest(follower)) {
        t.log(`here's a mailbox value`, value);

        // The rest here is to drive the test.
        t.deepEqual(value, expected.shift());
        if (expected.length === 0) {
          break;
        }
      }
    };
  test(title(label), makeExec(...input));
};

testHappyPath('naked values', {
  fakeValues: ['latest', 'later', 'done'],
  options: {},
});
testHappyPath('batchSize=1', {
  fakeValues: ['latest', 'later', 'done'],
  options: { batchSize: 1 },
});
testHappyPath('batchSize=2', {
  fakeValues: ['latest', 'later', 'done'],
  options: { batchSize: 2 },
});

test('bad network config', async t => {
  const PORT = await t.context.startFakeServer(t, []);
  await t.throwsAsync(
    () =>
      makeLeader(`http://localhost:${PORT}/bad-network-config`, {
        retryCallback: null,
        jitter: null,
      }),
    {
      message: /rpcAddrs .* must be an array/,
    },
  );
});

test('missing rpc server', async t => {
  const PORT = await t.context.startFakeServer(t, []);
  await t.throwsAsync(
    () =>
      makeLeader(`http://localhost:${PORT}/missing-network-config`, {
        retryCallback: null,
        jitter: null,
      }),
    {
      message: /^invalid json response body/,
    },
  );
});

test('unrecognized proof', async t => {
  await t.throwsAsync(
    () =>
      makeFollower(makeCastingSpec(':activityhash'), {}, { proof: 'bother' }),
    {
      message: /unrecognized follower proof mode.*/,
    },
  );
});

test.before(t => {
  t.context.cleanups = [];
  t.context.startFakeServer = startFakeServer;
});

test.after(t => {
  t.context.cleanups.map(cleanup => cleanup());
});
