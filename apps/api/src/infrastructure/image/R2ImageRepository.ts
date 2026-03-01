const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface ImageRepository {
  // Returns the public URL of the uploaded image.
  upload(file: ArrayBuffer, contentType: string, key: string): Promise<string>;
}

export class R2ImageRepository implements ImageRepository {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly publicBaseUrl: string, // e.g. "https://pub-xxx.r2.dev"
  ) {}

  async upload(
    file: ArrayBuffer,
    contentType: string,
    key: string,
  ): Promise<string> {
    if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      throw { code: "UNSUPPORTED_IMAGE_FORMAT" as const };
    }
    if (file.byteLength > MAX_FILE_SIZE_BYTES) {
      throw { code: "FILE_TOO_LARGE" as const };
    }

    await this.bucket.put(key, file, { httpMetadata: { contentType } });

    return `${this.publicBaseUrl}/${key}`;
  }
}
