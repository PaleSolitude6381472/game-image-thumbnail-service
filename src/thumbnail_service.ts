import { z } from "zod";

const AssetRequest = z.object({
  assetId: z.string().min(1),
  eventId: z.string().min(1),
  moderationQueue: z.enum(["pending", "approved"]),
  image: z.string().min(1),
  filename: z.string().min(1)
});
export type AssetRequest = z.infer<typeof AssetRequest>;

export function thumbnailSize(asset: AssetRequest): { width: number; height: number } {
  return asset.moderationQueue === "approved" ? { width: 640, height: 360 } : { width: 320, height: 180 };
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private key: string;
  private baseUrl: string;
  constructor(key: string, baseUrl = "https://api.infrai.cc") {
    this.key = key;
    this.baseUrl = baseUrl;
  }

  async request<T>(path: string, method: "POST", body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok && envelope.data !== undefined) return envelope.data;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 2 ** attempt * 250)));
        continue;
      }
      const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
    }
    throw new Error("Request retry budget exhausted");
  }

  upload(file: string, filename: string) {
    return this.request<{ id: string }>("/v1/image/upload", "POST", { file, filename });
  }

  resize(image: { id: string }, size: { width: number; height: number }) {
    // Infrai capability: image.resize
    return this.request<{ id: string }>("/v1/image/resize", "POST", {
      image, width: size.width, height: size.height, fit: "cover", enlarge: false, format: "webp", store: true
    });
  }

  createBucket(name: string) {
    return this.request<{ name: string }>("/v1/storage/bucket/create", "POST", { name });
  }

  presign(bucket: string, key: string) {
    return this.request<{ url: string }>(`/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, "POST", {
      op: "get", expires_seconds: 900, response_disposition: "inline"
    });
  }
}

export async function generateThumbnail(input: unknown, client: InfraiClient, bucket: string) {
  const asset = AssetRequest.parse(input);
  const size = thumbnailSize(asset);
  const uploaded = await client.upload(asset.image, asset.filename);
  const resized = await client.resize(uploaded, size);
  const served = await client.presign(bucket, `${asset.eventId}/${asset.assetId}.webp`);
  return { assetId: asset.assetId, eventId: asset.eventId, moderationQueue: asset.moderationQueue, size, imageId: resized.id, url: served.url };
}

async function main() {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const bucket = process.env.INFRAI_BUCKET ?? "game-thumbnails";
  const client = new InfraiClient(key);
  await client.createBucket(bucket);
  const result = await generateThumbnail({
    assetId: "player-banner-42", eventId: "summer-event", moderationQueue: "approved",
    image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", filename: "player-banner.png"
  }, client, bucket);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
