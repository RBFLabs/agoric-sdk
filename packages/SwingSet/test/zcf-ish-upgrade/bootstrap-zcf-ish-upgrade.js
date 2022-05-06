import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { assert } from '@agoric/assert';
import { makePromiseKit } from '@endo/promise-kit';

export const buildRootObject = () => {
  let vatAdmin;
  let zcfRoot;
  let zcfAdmin;

  return Far('root', {
    bootstrap: async (vats, devices) => {
      vatAdmin = await E(vats.vatAdmin).createVatAdminService(devices.vatAdmin);
    },

    buildV1: async () => {
      // build the contract vat from ZCF and the contract bundlecap
      const zcfbcap = await E(vatAdmin).getNamedBundleCap('zcf');
      const v1bcap = await E(vatAdmin).getNamedBundleCap('contractV1');
      const vatParameters = { contractBundleCap: v1bcap };
      const options = { vatParameters };
      const res = await E(vatAdmin).createVat(zcfbcap, options);
      zcfRoot = res.root;
      zcfAdmin = res.adminNode;

      const zoeThing = Far('zoeThing', {});
      const { publicFacet, privateFacet } = await E(zcfRoot).start(zoeThing);
      return true;
    },

    upgradeV2: async () => {
      const zcfbcap = await E(vatAdmin).getNamedBundleCap('zcf');
      const v2bcap = await E(vatAdmin).getNamedBundleCap('contractV2');
      const vatParameters = { contractBundleCap: v2bcap };
      await E(zcfAdmin).upgrade(zcfbcap, vatParameters);
      return true;
    },
  });
};
