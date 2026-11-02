# Dependency compatibility patches

`decode-uri-component@0.5.1.patch` changes only the package format and export
to CommonJS. Minio 8 uses query-string 7, which expects `require()` to return
the decoder function directly. The unmodified 0.5.1 package exports an ESM
namespace instead, and Jest's CommonJS runtime cannot parse it.

The patched decoder retains the upstream 0.5.1 security fix and decoding
algorithm. Keep the override at 0.5.1 or a later secure release; remove this
patch when the Minio dependency chain supports the upstream module format.

`scripts/test/dependency-compatibility.test.mts` checks the real dependency
chain without mocking storage modules.
