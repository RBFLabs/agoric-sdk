// @ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { M } from '@agoric/store';

import { cleanProposal } from '../../src/cleanProposal.js';
import { setup } from './setupBasicMints.js';
import buildManualTimer from '../../tools/manualTimer.js';

const proposeGood = (t, proposal, assetKind, expected) =>
  t.deepEqual(
    cleanProposal(harden(proposal), () => assetKind),
    expected,
  );

const proposeBad = (t, proposal, assetKind, message) =>
  t.throws(() => cleanProposal(harden(proposal), () => assetKind), {
    message,
  });

test('cleanProposal test', t => {
  const { moola, simoleans } = setup();

  proposeGood(
    t,
    {
      give: { Asset: simoleans(1n) },
      want: { Price: moola(3n) },
    },
    'nat',
    {
      give: { Asset: simoleans(1n) },
      want: { Price: moola(3n) },
      exit: { onDemand: null },
    },
  );
});

test('cleanProposal - all empty', t => {
  proposeGood(t, {}, 'nat', {
    give: harden({}),
    want: harden({}),
    exit: { onDemand: null },
  });

  proposeGood(
    t,
    {
      give: harden({}),
      want: harden({}),
      exit: { waived: null },
    },
    'nat',
    {
      give: harden({}),
      want: harden({}),
      exit: { waived: null },
    },
  );
});

test('cleanProposal - repeated brands', t => {
  const { moola, simoleans } = setup();
  const timer = buildManualTimer(t.log);

  proposeGood(
    t,
    {
      want: { Asset2: simoleans(1n) },
      give: { Price2: moola(3n) },
      exit: { afterDeadline: { timer, deadline: 100n } },
    },
    'nat',
    {
      want: { Asset2: simoleans(1n) },
      give: { Price2: moola(3n) },
      exit: { afterDeadline: { timer, deadline: 100n } },
    },
  );
});

test('cleanProposal - wrong assetKind', t => {
  const { moola, simoleans } = setup();
  const timer = buildManualTimer(t.log);

  proposeBad(
    t,
    {
      want: { Asset2: simoleans(1n) },
      give: { Price2: moola(3n) },
      exit: { afterDeadline: { timer, deadline: 100n } },
    },
    'set',
    /The amount .* did not have the assetKind of the brand .*/,
  );
});

test('cleanProposal - want patterns', t => {
  const { moola, simoleans } = setup();
  const timer = buildManualTimer(t.log);

  proposeGood(
    t,
    {
      want: { Asset2: M.any() },
      give: { Price2: moola(3n) },
      exit: { afterDeadline: { timer, deadline: 100n } },
    },
    'nat',
    {
      want: { Asset2: M.any() },
      give: { Price2: moola(3n) },
      exit: { afterDeadline: { timer, deadline: 100n } },
    },
  );

  proposeBad(
    t,
    {
      want: M.any(),
      give: { Price2: moola(3n) },
      exit: { afterDeadline: { timer, deadline: 100n } },
    },
    'nat',
    /"keywordRecord" "\[match:any\]" must be a pass-by-copy record, not "tagged"/,
  );

  proposeBad(
    t,
    {
      want: { Asset2: simoleans(1n) },
      give: { Price2: M.any() },
      exit: { afterDeadline: { timer, deadline: 100n } },
    },
    'nat',
    /A passable tagged "match:any" is not a key: "\[match:any\]"/,
  );

  proposeBad(
    t,
    {
      want: { Asset2: simoleans(1n) },
      give: { Price2: M.any() },
      exit: { afterDeadline: { timer, deadline: M.any() } },
    },
    'nat',
    /A passable tagged "match:any" is not a key: "\[match:any\]"/,
  );
});

test('cleanProposal - other wrong stuff', t => {
  const { moola, simoleans } = setup();
  const timer = buildManualTimer(t.log);

  proposeBad(
    t,
    'foo',
    'nat',
    /"proposal" "foo" must be a pass-by-copy record, not "string"/,
  );
  proposeBad(
    t,
    { want: 'foo' },
    'nat',
    /"keywordRecord" "foo" must be a pass-by-copy record, not "string"/,
  );
  proposeBad(
    t,
    { give: 'foo' },
    'nat',
    /"keywordRecord" "foo" must be a pass-by-copy record, not "string"/,
  );
  proposeBad(
    t,
    { want: { lowercase: simoleans(1n) } },
    'nat',
    /keyword "lowercase" must be an ascii identifier starting with upper case./,
  );
  proposeBad(
    t,
    { give: { lowercase: simoleans(1n) } },
    'nat',
    /keyword "lowercase" must be an ascii identifier starting with upper case./,
  );
  proposeBad(
    t,
    { want: { 'Not Ident': simoleans(1n) } },
    'nat',
    /keyword "Not Ident" must be an ascii identifier starting with upper case./,
  );
  proposeBad(
    t,
    { what: { A: simoleans(1n) } },
    'nat',
    /.* - Must only have want:, give:, exit: properties: {"what":.*}/,
  );
  proposeBad(
    t,
    { [Symbol.for('what')]: { 'Not Ident': simoleans(1n) } },
    'nat',
    /cannot serialize Remotables with non-methods like "Symbol\(what\)" in {}/,
  );
  proposeBad(
    t,
    { want: { [Symbol.for('S')]: simoleans(1n) } },
    'nat',
    /cannot serialize Remotables with non-methods like "Symbol\(S\)" in {}/,
  );
  proposeBad(
    t,
    { exit: 'foo' },
    'nat',
    /"foo" - Must have shape of base: "copyRecord"/,
  );
  proposeBad(
    t,
    { exit: { onDemand: 'foo' } },
    'nat',
    /{"onDemand":"foo"} - Must be equivalent to: {"onDemand":null}/,
  );
  proposeBad(
    t,
    { exit: { afterDeadline: 'foo' } },
    'nat',
    /"foo" - Must be a copyRecord to match a copyRecord pattern: {"timer":.*/,
  );
  proposeBad(
    t,
    { exit: { afterDeadline: { timer: 'foo', deadline: 3n } } },
    'nat',
    /"foo" - Must have passStyle or tag "remotable"/,
  );
  proposeBad(
    t,
    { exit: { afterDeadline: { timer, deadline: 'foo' } } },
    'nat',
    /"foo" - Must be >= "\[0n\]"/,
  );
  proposeBad(
    t,
    { exit: { afterDeadline: { timer, deadline: 3n, extra: 'foo' } } },
    'nat',
    /.* - Must have same property names as record pattern:.*/,
  );
  proposeBad(
    t,
    { exit: { afterDeadline: { timer } } },
    'nat',
    /.* - Must have same property names as record pattern:.*/,
  );
  proposeBad(
    t,
    { exit: { afterDeadline: { deadline: 3n } } },
    'nat',
    /.* - Must have same property names as record pattern:.*/,
  );
  proposeBad(
    t,
    { exit: { afterDeadline: { timer, deadline: 3 } } },
    'nat',
    /3 - Must be >= "\[0n\]"/,
  );
  proposeBad(
    t,
    { exit: { afterDeadline: { timer, deadline: -3n } } },
    'nat',
    /"\[-3n\]" - Must be >= "\[0n\]"/,
  );
  proposeBad(t, { exit: {} }, 'nat', /exit {} should only have one key/);
  proposeBad(
    t,
    { exit: { onDemand: null, waived: null } },
    'nat',
    /exit {"onDemand":null,"waived":null} should only have one key/,
  );
  proposeBad(
    t,
    {
      want: { Asset: simoleans(1n) },
      give: { Asset: moola(3n) },
    },
    'nat',
    /a keyword cannot be in both 'want' and 'give'/,
  );
});
