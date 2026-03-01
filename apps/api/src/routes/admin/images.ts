import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../../worker";
import type { AuthVariables } from "../../middleware/authMiddleware";
import { authMiddleware, adminMiddleware } from "../../middleware/authMiddleware";
import {
  handleUploadImage,
  handleAssociateProductImage,
} from "../../application/product/commands/ImageCommandHandlers";
import { D1EventStore } from "../../infrastructure/event-store/D1EventStore";
import { ProductProjection } from "../../infrastructure/projection/ProductProjection";
import { R2ImageRepository } from "../../infrastructure/image/R2ImageRepository";
import { toValidationErrorResponse } from "../utils";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

export const adminImagesRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const AssociateImageSchema = z.object({
  imageUrl: z.string(),
});

// ---------------------------------------------------------------------------
// POST /admin/images  (multipart image upload)
// ---------------------------------------------------------------------------

adminImagesRouter.post("/images", authMiddleware, adminMiddleware, async (c) => {
  const formData = await c.req.raw.formData();
  const file = formData.get("file");

  if (!((file as unknown) instanceof File)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR", fields: ["file"] } }, 400);
  }

  const ctx = {
    imageRepository: new R2ImageRepository(c.env.IMAGE_BUCKET, c.env.R2_PUBLIC_URL),
  };

  const typedFile = file as unknown as File;
  const fileBuffer = await typedFile.arrayBuffer();
  const { imageUrl } = await handleUploadImage(
    { file: fileBuffer, contentType: typedFile.type },
    ctx,
  );

  return c.json({ imageUrl }, 201);
});

// ---------------------------------------------------------------------------
// POST /admin/products/:id/images  (associate image URL with product)
// ---------------------------------------------------------------------------

adminImagesRouter.post("/products/:id/images", authMiddleware, adminMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = AssociateImageSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const productId = c.req.param("id");
  const ctx = {
    eventStore: new D1EventStore(c.env.EVENTS_DB),
    projection: new ProductProjection(c.env.EVENTS_DB),
  };
  await handleAssociateProductImage({ productId, imageUrl: result.data.imageUrl }, ctx);
  return c.json({ success: true }, 201);
});
