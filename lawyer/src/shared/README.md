# shared/
Source of the code shared by the four projects (mpc-common.ts, hmac.ts, types.ts, share-crypto.ts, constants.ts).
A CLI deploy from a sub-folder does not upload files outside it, so this folder is COPIED into each project:
`npm run sync-shared` -> lib/shared, lawyer/src/shared, sq-mock/src/shared, exit/shared.
Never edit the copies. `npm run check-shared` fails if a copy differs from the source.
Owner: Aaron.
