// @ts-check
import { E } from '@endo/eventual-send';
import { Far, makeMarshal } from '@endo/marshal';
import { observeIteration } from './asyncIterableAdaptor.js';

/** @template T @typedef {import('@endo/marshal').CapData<T>} CapData */
/** @template T @typedef {import('@endo/eventual-send').EOnly<T>} EOnly */

/**
 * @typedef {{
 *   [index: string]: any,
 *   unserializer: ERef<{
 *     unserialize: import('@endo/marshal').Unserialize<unknown>
 *   }>
 * }} SubscriberDetails information and capabilities needed to follow a
 * publisher out-of-band
 */

/**
 * @template T
 * @typedef {object} Publisher
 * @property {(obj: ERef<T>) => void} publish publishes a jsonable value
 * @property {() => Record<string, any>} getPublisherDetails returns any
 * information needed by subscribers to follow the publisher out-of-band
 */

/**
 * @template T
 * @typedef {{
 *  [Symbol.asyncIterator]: () => Promise<AsyncIterator<T>> } &
 *  { getSubscriberDetails: () => SubscriberDetails }} Subscriber
 */

/**
 * Begin iterating the source, publishing serialized iteration values.  If the
 * publish operation rejects, the iteration will be terminated.
 *
 * Returns a Subscriber that can be used by a client to directly follow the
 * iteration themselves, or obtain information to subscribe to the publisher
 * out-of-band.
 *
 * @template T
 * @param {ERef<AsyncIterable<T>>} source
 * @param {ERef<Publisher<CapData<unknown>>>} [publisher]
 * @param {ERef<ReturnType<typeof makeMarshal>>} [marshaller]
 * @returns {Promise<Subscriber<T>>}
 */
export const makeMarshalSubscriber = async (
  source,
  publisher,
  marshaller = makeMarshal(),
) => {
  const unserializer = Far('unserializer', {
    unserialize: E(marshaller).unserialize,
  });
  if (!publisher) {
    // No publisher details, just return the unserializer and the iterable.
    /** @type {SubscriberDetails} */
    const subscriberDetails = harden({ unserializer });
    return Far('subscriber', {
      getSubscriberDetails: () => subscriberDetails,
      [Symbol.asyncIterator]: E(source)[Symbol.asyncIterator],
    });
  }

  const publisherDetails = await E(publisher).getPublisherDetails();
  /** @type {SubscriberDetails} */
  const subscriberDetails = harden({ ...publisherDetails, unserializer });

  // Abort the iteration on the next observation if the publisher ever fails.
  let publishFailed = false;
  let publishException;

  // Must *not* be an async function, because it sometimes must throw to abort
  // the iteration.
  const publishValue = obj => {
    if (publishFailed) {
      // To properly abort the iteration, this must be a synchronous exception.
      throw publishException;
    }
    // Serialize the value.
    const serializedP = E(marshaller).serialize(obj);
    // Publish the value, capturing any error.
    E(publisher)
      .publish(serializedP)
      .catch(e => {
        publishFailed = true;
        publishException = e;
      });
  };

  // Start publishing the source.
  observeIteration(source, {
    updateState: publishValue,
    finish: publishValue,
  });

  // Augment the source with subscriber metadata.
  return Far('subscriber', {
    getSubscriberDetails: () => subscriberDetails,
    [Symbol.asyncIterator]: E(source)[Symbol.asyncIterator],
  });
};
harden(makeMarshalSubscriber);
