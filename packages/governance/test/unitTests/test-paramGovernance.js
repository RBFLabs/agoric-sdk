// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import '@agoric/zoe/exported.js';

import { makeZoeKit } from '@agoric/zoe';
import bundleSource from '@endo/bundle-source';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { makeFakeVatAdmin } from '@agoric/zoe/tools/fakeVatAdmin.js';
import { E } from '@endo/eventual-send';
import { makeLoopback } from '@endo/captp';

import { resolve as importMetaResolve } from 'import-meta-resolve';
import { MALLEABLE_NUMBER } from '../swingsetTests/contractGovernor/governedContract.js';
import { CONTRACT_ELECTORATE, ParamTypes } from '../../src/index.js';

const voteCounterRoot = '../../src/binaryVoteCounter.js';
const governedRoot = '../swingsetTests/contractGovernor/governedContract.js';
const contractGovernorRoot = '../../src/contractGovernor.js';
const committeeRoot = '../../src/committee.js';

const makeBundle = async sourceRoot => {
  const url = await importMetaResolve(sourceRoot, import.meta.url);
  const path = new URL(url).pathname;
  const contractBundle = await bundleSource(path);
  return contractBundle;
};

// makeBundle is a slow step, so we do it once for all the tests.
const contractGovernorBundleP = makeBundle(contractGovernorRoot);
const committeeBundleP = makeBundle(committeeRoot);
const voteCounterBundleP = makeBundle(voteCounterRoot);
const governedBundleP = makeBundle(governedRoot);

const setUpZoeForTest = async setJig => {
  const { makeFar } = makeLoopback('zoeTest');

  /**
   * These properties will be assigned by `setJig` in the contract.
   *
   * @typedef {object} TestContext
   * @property {ZCF} zcf
   * @property {IssuerRecord} runIssuerRecord
   * @property {IssuerRecord} govIssuerRecord
   */

  const { zoeService, feeMintAccess: nonFarFeeMintAccess } = makeZoeKit(
    makeFakeVatAdmin(setJig, o => makeFar(o)).admin,
  );
  /** @type {ERef<ZoeService>} */
  const zoe = makeFar(zoeService);
  const feeMintAccess = await makeFar(nonFarFeeMintAccess);
  return {
    zoe,
    feeMintAccess,
  };
};

const installBundle = (zoe, contractBundle) => E(zoe).install(contractBundle);

const setUpGovernedContract = async (zoe, electorateTerms, timer) => {
  const [
    contractGovernorBundle,
    committeeBundle,
    voteCounterBundle,
    governedBundle,
  ] = await Promise.all([
    contractGovernorBundleP,
    committeeBundleP,
    voteCounterBundleP,
    governedBundleP,
  ]);

  const [governor, electorate, counter, governed] = await Promise.all([
    installBundle(zoe, contractGovernorBundle),
    installBundle(zoe, committeeBundle),
    installBundle(zoe, voteCounterBundle),
    installBundle(zoe, governedBundle),
  ]);
  const installs = { governor, electorate, counter, governed };

  const { creatorFacet: committeeCreator, instance: electorateInstance } =
    await E(zoe).startInstance(electorate, harden({}), electorateTerms);

  const poserInvitation = await E(committeeCreator).getPoserInvitation();
  const invitationAmount = await E(E(zoe).getInvitationIssuer()).getAmountOf(
    poserInvitation,
  );

  const governedTerms = {
    governedParams: {
      [MALLEABLE_NUMBER]: {
        type: ParamTypes.NAT,
        value: 602214090000000000000000n,
      },
      [CONTRACT_ELECTORATE]: {
        type: ParamTypes.INVITATION,
        value: invitationAmount,
      },
    },
    governedApis: ['governanceApi'],
  };
  const governorTerms = {
    timer,
    electorateInstance,
    governedContractInstallation: governed,
    governed: {
      terms: governedTerms,
      issuerKeywordRecord: {},
      privateArgs: { initialPoserInvitation: poserInvitation },
    },
  };

  const governorFacets = await E(zoe).startInstance(
    governor,
    {},
    governorTerms,
  );

  return { governorFacets, installs, invitationAmount, committeeCreator };
};

const setUpVoterAndVote = async (committeeCreator, zoe, qHandle, choice) => {
  const invitations = await E(committeeCreator).getVoterInvitations();

  const seat = E(zoe).offer(invitations[0]);
  const voteFacet = E(seat).getOfferResult();
  return E(voteFacet).castBallotFor(qHandle, [choice]);
};

test('governParam no votes', async t => {
  const { zoe } = await setUpZoeForTest(() => {});
  const timer = buildManualTimer(t.log);
  const { governorFacets, installs, invitationAmount } =
    await setUpGovernedContract(
      zoe,
      { committeeName: 'Demos', committeeSize: 1 },
      timer,
    );

  const paramChangeSpec = harden({
    paramPath: { key: 'governedParams' },
    changes: { [MALLEABLE_NUMBER]: 25n },
  });

  const { outcomeOfUpdate } = await E(
    governorFacets.creatorFacet,
  ).voteOnParamChanges(installs.counter, 2n, paramChangeSpec);

  await E(timer).tick();
  await E(timer).tick();

  await E.when(outcomeOfUpdate, outcome => t.fail(`${outcome}`)).catch(e =>
    t.is(e, 'No quorum'),
  );

  t.deepEqual(
    await E(
      E(governorFacets.creatorFacet).getPublicFacet(),
    ).getGovernedParams(),
    {
      Electorate: {
        type: 'invitation',
        value: invitationAmount,
      },
      MalleableNumber: {
        type: 'nat',
        value: 602214090000000000000000n,
      },
    },
  );
});

test('multiple params bad change', async t => {
  const { zoe } = await setUpZoeForTest(() => {});
  const timer = buildManualTimer(t.log);
  const { governorFacets, installs } = await setUpGovernedContract(
    zoe,
    { committeeName: 'Demos', committeeSize: 1 },
    timer,
  );

  const paramChangesSpec = harden({
    paramPath: { key: 'governedParams' },
    changes: {
      [CONTRACT_ELECTORATE]: 13n,
      [MALLEABLE_NUMBER]: 42n,
    },
  });

  await t.throwsAsync(
    () =>
      E(governorFacets.creatorFacet).voteOnParamChanges(
        installs.counter,
        2n,
        paramChangesSpec,
      ),
    { message: /".13n." was not a live payment for brand/ },
  );
});

test('change multiple params', async t => {
  const { zoe } = await setUpZoeForTest(() => {});
  const timer = buildManualTimer(t.log);
  const { governorFacets, installs, invitationAmount, committeeCreator } =
    await setUpGovernedContract(
      zoe,
      { committeeName: 'Demos', committeeSize: 1 },
      timer,
    );

  // This is the wrong kind of invitation, but governance can't tell
  const wrongInvitation = await E(committeeCreator).getPoserInvitation();

  const paramChangesSpec = harden({
    paramPath: { key: 'governedParams' },
    changes: {
      [CONTRACT_ELECTORATE]: wrongInvitation,
      [MALLEABLE_NUMBER]: 42n,
    },
  });

  const { outcomeOfUpdate, details: detailsP } = await E(
    governorFacets.creatorFacet,
  ).voteOnParamChanges(installs.counter, 2n, paramChangesSpec);

  const details = await detailsP;
  const positive = details.positions[0];
  await setUpVoterAndVote(
    committeeCreator,
    zoe,
    details.questionHandle,
    positive,
  );

  await E(timer).tick();
  await E(timer).tick();

  await E.when(outcomeOfUpdate, async outcomes => {
    t.deepEqual(outcomes, {
      changes: {
        [CONTRACT_ELECTORATE]: invitationAmount,
        [MALLEABLE_NUMBER]: 42n,
      },
    });
  }).catch(e => {
    t.fail(`expected success, got ${e}`);
  });

  const paramsAfter = await E(
    E(governorFacets.creatorFacet).getPublicFacet(),
  ).getGovernedParams();
  t.deepEqual(paramsAfter.Electorate.value, invitationAmount);
  t.is(paramsAfter.MalleableNumber.value, 42n);
});

test('change multiple params used invitation', async t => {
  const { zoe } = await setUpZoeForTest(() => {});
  const timer = buildManualTimer(t.log);
  const { governorFacets, installs, invitationAmount, committeeCreator } =
    await setUpGovernedContract(
      zoe,
      { committeeName: 'Demos', committeeSize: 1 },
      timer,
    );

  // This is the wrong kind of invitation, but governance can't tell
  const wrongInvitation = await E(committeeCreator).getPoserInvitation();

  const paramChangesSpec = harden({
    paramPath: { key: 'governedParams' },
    changes: {
      [CONTRACT_ELECTORATE]: wrongInvitation,
      [MALLEABLE_NUMBER]: 42n,
    },
  });

  const { outcomeOfUpdate, details: detailsP } = await E(
    governorFacets.creatorFacet,
  ).voteOnParamChanges(installs.counter, 2n, paramChangesSpec);

  outcomeOfUpdate
    .then(o => t.fail(`update should break, ${o}`))
    .catch(e =>
      t.regex(
        e.message,
        /was not a live payment for brand/,
        'Invitatation was burned and should not be usable',
      ),
    );

  const details = await detailsP;
  const positive = details.positions[0];
  await setUpVoterAndVote(
    committeeCreator,
    zoe,
    details.questionHandle,
    positive,
  );

  await E(E(zoe).getInvitationIssuer()).burn(wrongInvitation);

  await E(timer).tick();
  await E(timer).tick();

  const paramsAfter = await E(
    E(governorFacets.creatorFacet).getPublicFacet(),
  ).getGovernedParams();
  t.deepEqual(paramsAfter.Electorate.value, invitationAmount);
  // original value
  t.is(paramsAfter.MalleableNumber.value, 602214090000000000000000n);
});
