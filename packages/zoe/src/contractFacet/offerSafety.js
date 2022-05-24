// @ts-check

import { AmountMath } from '@agoric/ertp';

const { entries } = Object;

/**
 * Helper to perform satisfiesWant and satisfiesGive. How many times
 * does the `allocation` satisfy the `giveOrWant`?
 *
 * @param {AmountKeywordRecord} giveOrWant
 * @param {AmountKeywordRecord} allocation
 * @returns {bigint}
 */
const satisfiesInternal = (giveOrWant = {}, allocation) => {
  /** @type {bigint | undefined} */
  let multiples; // undefined represents infinity
  for (const [keyword, requiredAmount] of entries(giveOrWant)) {
    if (allocation[keyword] === undefined) {
      return 0n;
    }
    const allocationAmount = allocation[keyword];
    if (!AmountMath.isGTE(allocationAmount, requiredAmount)) {
      return 0n;
    }
    if (typeof requiredAmount.value !== 'bigint') {
      multiples = 1n;
    } else if (requiredAmount.value > 0n) {
      assert.typeof(allocationAmount.value, 'bigint');
      const howMany = allocationAmount.value / requiredAmount.value;
      if (multiples === undefined || multiples > howMany) {
        multiples = howMany;
      }
    }
  }
  if (multiples === undefined) {
    return 1n;
  }
  return multiples;
};

/**
 * For this allocation to satisfy what the user wanted, their
 * allocated amounts must be greater than or equal to proposal.want.
 *
 * @param {ProposalRecord} proposal - the rules that accompanied the
 * escrow of payments that dictate what the user expected to get back
 * from Zoe. A proposal is a record with keys `give`, `want`, and
 * `exit`. `give` and `want` are records with keywords as keys and
 * amounts as values. The proposal is a user's understanding of the
 * contract that they are entering when they make an offer.
 * @param {AmountKeywordRecord} allocation - a record with keywords
 * as keys and amounts as values. These amounts are the reallocation
 * to be given to a user.
 */
const satisfiesWant = (proposal, allocation) =>
  satisfiesInternal(proposal.want, allocation) >= 1n;

/**
 * For this allocation to count as a full refund, the allocated
 * amounts must be greater than or equal to what was originally
 * offered (proposal.give).
 *
 * @param  {ProposalRecord} proposal - the rules that accompanied the
 * escrow of payments that dictate what the user expected to get back
 * from Zoe. A proposal is a record with keys `give`, `want`, and
 * `exit`. `give` and `want` are records with keywords as keys and
 * amounts as values. The proposal is a user's understanding of the
 * contract that they are entering when they make an offer.
 * @param  {AmountKeywordRecord} allocation - a record with keywords
 * as keys and amounts as values. These amounts are the reallocation
 * to be given to a user.
 */
// Commented out because not currently used
// const satisfiesGive = (proposal, allocation) =>
//   satisfiesInternal(proposal.give, allocation) >= 1n;

/**
 * `isOfferSafe` checks offer safety for a single offer.
 *
 * Note: This implementation checks whether we fully satisfy
 * `proposal.give` (giving a refund) or whether we fully satisfy
 * `proposal.want`. Both can be fully satisfied.
 *
 * @param  {ProposalRecord} proposal - the rules that accompanied the
 * escrow of payments that dictate what the user expected to get back
 * from Zoe. A proposal is a record with keys `give`, `want`, and
 * `exit`. `give` and `want` are records with keywords as keys and
 * amounts as values. The proposal is a user's understanding of the
 * contract that they are entering when they make an offer.
 * @param  {AmountKeywordRecord} allocation - a record with keywords
 * as keys and amounts as values. These amounts are the reallocation
 * to be given to a user.
 */
function isOfferSafe(proposal, allocation) {
  const { give, want, multiples } = proposal;
  const howMany =
    satisfiesInternal(give, allocation) + satisfiesInternal(want, allocation);
  return howMany >= multiples;
}

export { isOfferSafe, satisfiesWant };
