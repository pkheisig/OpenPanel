/**
 * Vendored OpenSuite UI foundation release used by the OpenPanel module.
 *
 * The CSS is scoped to the module root because OpenPanel can be mounted into
 * an already styled host document. Keep this release pinned to the artifact
 * digest; do not resolve it from a mutable OpenSuite checkout at runtime.
 */
export const OPEN_SUITE_UI_FOUNDATION_MANIFEST = {
  schemaVersion: 1,
  packageName: '@pkheisig/opensuite-ui-foundation',
  version: '1.0.0',
  uiContractVersion: '1.0.0',
  sourceDigest: '6f723015c258a1b30bee5824a8735fbc01ec53c4feee006fcaa7f165b8d6b05c',
  artifacts: {
    tokens: '0ab326ce5e34a55be7c63e350bfb92501b91b49719a6f2a11682ebcc4f47a65b',
    primitives: 'fcd123a8ceb46ddccd626a150a8b7f6082cac72088846c7fc543175f8119ebfe',
    contract: 'b8ef5ae3bafed785299d3319805f0638a39bbfdb069d3c726e2af3240db25f41',
  },
} as const

