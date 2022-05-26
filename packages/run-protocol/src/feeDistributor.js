// @ts-check

import { observeNotifier } from '@agoric/notifier';
import { E, Far } from '@endo/far';

const { details: X } = assert;

/**
 * @typedef {object} FeeCollector
 *
 * @property {() => ERef<Payment>} collectFees
 */

/**
 * @typedef {object} DistributorParams
 *
 * @property {bigint} [epochInterval=1n] - parameter to the epochTimer
 *  controlling the interval at which rewards should be sent to the bank.
 */

/**
 * @callback BuildFeeDistributor
 *
 * @param {ERef<FeeCollector>[]} collectors - an array of objects with
 *   collectFees() methods, each of which will return a payment. Can
 *   be populated with the results of makeFeeCollector(zoe, creatorFacet)
 * @param {EOnly<DepositFacet>} feeDepositFacet - object with receive()
 * @param {ERef<TimerService>} epochTimer - timer that notifies at the end of
 *  each Epoch. The epochInterval parameter controls the interval.
 * @param {DistributorParams} params
 * @returns {Promise<void>}
 */

/**
 * wrapper to take the vaultFactory or AMM's creatorFacet, and make a function that
 * will request an invitation and return a promise for a payment.
 *
 * @param {ERef<ZoeService>} zoe
 * @param {{ makeCollectFeesInvitation: () => Promise<Invitation> }} creatorFacet
 */
export function makeFeeCollector(zoe, creatorFacet) {
  /** @type {FeeCollector} */
  return Far('feeCollector', {
    collectFees: () => {
      const invitation = E(creatorFacet).makeCollectFeesInvitation();
      const collectFeesSeat = E(zoe).offer(invitation, undefined, undefined);
      return E(collectFeesSeat).getPayout('RUN');
    },
  });
}

/**
 * A distributor of fees from Inter Protocol sources to deposit facets. Each
 * time the epochTimer signals the end of an Epoch, it will ask the contracts
 * for fees that have been collected to date and send that payment to the
 * depositFacet.
 *
 * @param {() => Promise<any>} schedulePayments - distribute to the destinations
 * @param {ERef<TimerService>} timerService - timer that is used to schedule collections
 * @param {RelativeTime} [collectionInterval] - how often to collect fees
 */
export function startDistributing(
  schedulePayments,
  timerService,
  collectionInterval = 1n,
) {
  const timeObserver = {
    updateState: _ =>
      schedulePayments().catch(e => {
        console.error('failed with', e);
        throw e;
      }),
    fail: reason => {
      throw Error(`fee distributor timer failed: ${reason}`);
    },
    finish: done => {
      throw Error(`fee distributor timer died: ${done}`);
    },
  };

  const collectionNotifier = E(timerService).makeNotifier(
    0n,
    collectionInterval,
  );
  observeNotifier(collectionNotifier, timeObserver).catch(e => {
    console.error('fee distributor failed with', e);
  });
}

/**
 * @type {BuildFeeDistributor}
 */
export const buildDistributor = async (
  contracts,
  depositFacet,
  timerService,
  { epochInterval = 1n },
) => {
  startDistributing(
    () =>
      Promise.all(
        contracts.map(fc =>
          E(fc)
            .collectFees()
            .then(pmt => E(depositFacet).receive(pmt)),
        ),
      ),
    timerService,
    epochInterval,
  );
};

/** @type {ContractStartFn} */
export const start = async (zcf, privateArgs) => {
  const { destinations } = privateArgs;
  const { timerService, collectionInterval, ...rest } = zcf.getTerms();

  let totalShares = 0n;
  const shares = Object.entries(destinations)
    .filter(([_, dst]) => dst)
    .map(([kw, destination]) => {
      const share = rest[`${kw}Share`];
      assert.typeof(
        share,
        'bigint',
        `${kw}Share must be a bigint; got ${share}`,
      );
      totalShares += share;
      return {
        share,
        destination,
      };
    });
  assert(shares.length, X`Need at least one destination; got ${destinations}`);

  const sources = new Set();
  const feeIssuer = await E(E(zcf).getZoeService()).getFeeIssuer();

  // This design of distributeFees tries to be tolerant of single points of
  // failure.
  const distributeFees = async payment => {
    // Divide the payment into shares.
    /** @type {Amount<'nat'>} */
    const { value: totalValue, brand } = await E(feeIssuer).getAmountOf(
      payment,
    );
    let remainder = totalValue;
    const sharedAmounts = shares.map(({ share }, i) => {
      const value =
        i === shares.length - 1
          ? remainder
          : (totalValue * share) / totalShares;
      remainder -= value;
      return { value, brand };
    });

    // Split the payment and assert we have a conservation of the total.
    const sharedPayment = await E(feeIssuer).splitMany(payment, sharedAmounts);

    // Send the payment to each destination.
    return Promise.all(
      shares.map(({ destination }, i) =>
        E(destination).receive(sharedPayment[i]),
      ),
    );
  };

  const schedulePayments = () =>
    Promise.all(
      [...sources.keys()].map(source =>
        E(source).collectFees().then(distributeFees),
      ),
    );

  const publicFacet = Far('feeDistributor publicFacet', {
    distributeFees,
  });
  const creatorFacet = Far('feeDistributor creatorFacet', {
    addFeeSource: source => {
      sources.add(source);
    },
    deleteFeeSource: source => {
      sources.delete(source);
    },
  });

  // Start processing collections.
  startDistributing(schedulePayments, timerService, collectionInterval);

  return harden({
    creatorFacet,
    publicFacet,
  });
};

/** @typedef {ReturnType<typeof start>['creatorFacet']} FeeDistributorCreatorFacet */
/** @typedef {ReturnType<typeof start>['publicFacet']} FeeDistributorPublicFacet */
