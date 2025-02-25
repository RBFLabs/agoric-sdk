// @ts-check

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { fit, keyEQ } from '@agoric/store';
import { M } from '@agoric/vat-data';

import {
  ChoiceMethod,
  QuorumRule,
  ElectionType,
  coerceQuestionSpec,
} from '../question.js';

/**
 * Make a pair of positions for a question about whether to update the offer
 * filter. If the vote passes, the list of blocked invitation strings will be
 * updated.
 *
 * @param {string[]} strings
 */
const makeOfferFilterPositions = strings => {
  const positive = harden({ strings });
  const negative = harden({ dontUpdate: strings });
  return { positive, negative };
};

/**
 * Setup to allow governance to block some invitations.
 *
 * @param {ERef<ZoeService>} zoe
 * @param {Instance} governedInstance
 * @param {ERef<TimerService>} timer
 * @param {() => Promise<PoserFacet>} getUpdatedPoserFacet
 * @param {GovernorFacet<{}>} governorFacet
 * @returns {Promise<FilterGovernor>}
 */
const setupFilterGovernance = async (
  zoe,
  governedInstance,
  timer,
  getUpdatedPoserFacet,
  governorFacet,
) => {
  /** @type {WeakSet<Instance>} */
  const voteCounters = new WeakSet();

  /** @type {VoteOnOfferFilter} */
  const voteOnFilter = async (voteCounterInstallation, deadline, strings) => {
    fit(strings, M.arrayOf(M.string()));
    const { positive, negative } = makeOfferFilterPositions(strings);

    /** @type {OfferFilterIssue} */
    const issue = harden({ strings });
    const questionSpec = coerceQuestionSpec({
      method: ChoiceMethod.UNRANKED,
      issue,
      positions: [positive, negative],
      electionType: ElectionType.OFFER_FILTER,
      maxChoices: 1,
      closingRule: { timer, deadline },
      quorumRule: QuorumRule.MAJORITY,
      tieOutcome: negative,
    });

    const { publicFacet: counterPublicFacet, instance: voteCounter } = await E(
      getUpdatedPoserFacet(),
    ).addQuestion(voteCounterInstallation, questionSpec);

    voteCounters.add(voteCounter);

    // CRUCIAL: Here we wait for the voteCounter to declare an outcome, and then
    // attempt to invoke the API if that's what the vote called for. We need to
    // make sure that outcomeOfUpdateP is updated whatever happens.
    //
    // * If the vote passed, invoke the API, and return the positive position
    // * If the vote was negative, return the negative position
    // * If we can't do either, (the vote failed or the API invocation failed)
    //   return a broken promise.
    const outcomeOfUpdate = E(counterPublicFacet)
      .getOutcome()
      .then(
        /** @type {(outcome: Position) => ERef<Position>} */
        outcome => {
          if (keyEQ(outcome, positive)) {
            return E(governorFacet)
              .setOfferFilter(strings)
              .then(() => {
                return positive;
              });
          } else if (keyEQ(outcome, negative)) {
            return negative;
          } else {
            assert.fail('unrecognized outcome');
          }
        },
      );

    return {
      outcomeOfUpdate,
      instance: voteCounter,
      details: E(counterPublicFacet).getDetails(),
    };
  };

  return Far('filterGovernor', {
    voteOnFilter,
    createdFilterQuestion: b => voteCounters.has(b),
  });
};

harden(setupFilterGovernance);
harden(makeOfferFilterPositions);
export { setupFilterGovernance, makeOfferFilterPositions };
