// @ts-check

import { AmountShape } from '@agoric/ertp';
import { M } from '@agoric/store';
import { TimestampValueShape } from '@agoric/swingset-vat/src/vats/timer/typeGuards.js';

export const InvitationHandleShape = M.remotable('InvitationHandle');
export const InvitationShape = M.remotable('Invitation');
export const InstanceHandleShape = M.remotable('InstanceHandle');
export const InstallationShape = M.remotable('Installation');
export const SeatShape = M.remotable('Seat');

export const AmountKeywordRecordShape = M.recordOf(M.string(), AmountShape);
export const AmountPatternKeywordRecordShape = M.recordOf(
  M.string(),
  M.pattern(),
);

/**
 * After defaults are filled in
 */
export const ProposalShape = harden({
  want: AmountPatternKeywordRecordShape,
  give: AmountKeywordRecordShape,
  // To accept only one, we could use M.or rather than M.partial,
  // but the error messages would have been worse. Rather,
  // cleanProposal's assertExit checks that there's exactly one.
  exit: M.partial(
    {
      onDemand: null,
      waived: null,
      afterDeadline: {
        timer: M.remotable(),
        deadline: TimestampValueShape,
      },
    },
    {},
  ),
});

export const isOnDemandExitRule = exit => {
  const [exitKey] = Object.getOwnPropertyNames(exit);
  return exitKey === 'onDemand';
};

/**
 * @param {ExitRule} exit
 * @returns {exit is WaivedExitRule}
 */
export const isWaivedExitRule = exit => {
  const [exitKey] = Object.getOwnPropertyNames(exit);
  return exitKey === 'waived';
};

/**
 * @param {ExitRule} exit
 * @returns {exit is AfterDeadlineExitRule}
 */
export const isAfterDeadlineExitRule = exit => {
  const [exitKey] = Object.getOwnPropertyNames(exit);
  return exitKey === 'afterDeadline';
};

export const InvitationElementShape = M.split({
  description: M.string(),
  handle: InvitationHandleShape,
  instance: InstanceHandleShape,
  installation: InstallationShape,
});

export const OfferHandlerI = M.interface('OfferHandler', {
  handle: M.call(SeatShape).optional(M.any()).returns(M.string()),
});
