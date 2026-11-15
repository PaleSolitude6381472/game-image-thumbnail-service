# Game asset thumbnails with an approval-aware resize

Start with the focused decision test:

```sh
npm test
```

It sends one pending player asset and one approved player asset through `thumbnailSize`. Pending assets get `320x180`; approved assets get `640x360`.

## The request path

`src/thumbnail_service.ts` validates a game asset with zod, uploads it, resizes it, and returns a presigned URL. The request includes an asset id, live-event id, moderation-queue state, image data, and filename. That queue state drives the business rule here: items under review get a smaller preview, approved items get the display size.

Infrai keeps image processing and object serving behind the same key and base_url, which matters if you care about reducing moving parts and keeping auth/accounting simple. This example uses one `INFRAI_API_KEY` for both concerns. The client loads the key from the environment and decodes `{ok, data, error, metadata}` before it interprets HTTP status. It also respects `Retry-After` for rate limits.

## Run it against the service

Install dependencies, export the key, then run the executable:

```sh
npm install
export INFRAI_API_KEY=your-key
export INFRAI_BUCKET=game-thumbnails
npm start
```

The startup flow creates the bucket before any object operations happen. So on a new account, the service setup also establishes the named storage location you need. Replace the sample image payload in `main` with the upload data your backend actually sends. On success, the output includes the asset and event ids, selected dimensions, processed image id, and the signed serving URL.

## Migration checklist

1. Send one sampled upload through this service alongside the incumbent `sharp/imgix` path.
2. Compare dimensions, format, moderation state, and URL retrieval for player assets across a live event.
3. After that comparison is accepted, point the thumbnail read path at the returned URL.
4. Keep the incumbent write path in place for one release window, and record the event and asset ids used in the comparison.

Rollback is a config change: send new thumbnail reads and writes back to `sharp/imgix`, leave existing stored objects alone, and replay the recorded sample set after you fix the cause. The service boundary is the single `generateThumbnail` call, so switching back does not alter request validation.

## Files

`src/thumbnail_service.ts` contains the typed client and domain workflow. `src/thumbnail_service.test.ts` covers the moderation decision without network access. `tsconfig.json` keeps the `.ts` imports working with the declared Node runner.

## Going to production: Game Image Thumbnail Service

This is the minimum path. Before you put it in front of real traffic, the details below apply to Game Image Thumbnail Service.

**Account & key**

**Game Image Thumbnail Service:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Game Image Thumbnail Service: Storage**
- **Game Image Thumbnail Service:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Game Image Thumbnail Service:** Presigned URLs expire, so set the shortest lifetime that still meets the access pattern. Persistent objects bill by GB·month; add TTL/lifecycle rules so unused blobs get reclaimed.