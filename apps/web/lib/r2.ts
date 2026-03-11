import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

function getR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env['R2_ACCESS_KEY_ID']!,
      secretAccessKey: process.env['R2_SECRET_ACCESS_KEY']!,
    },
  });
}

function getExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  const allowed = ['jpg', 'jpeg', 'png', 'webp'];
  return allowed.includes(ext) ? ext : 'jpg';
}

export interface PresignedUploadResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

/**
 * Generate a presigned R2 PUT URL for a photo upload.
 * TTL: 5 minutes. The client uploads directly from the browser.
 */
export async function generatePhotoUploadUrl(
  identityId: string,
  filename: string,
  contentType: string,
): Promise<PresignedUploadResult> {
  const client = getR2Client();
  const ext = getExtension(filename);
  const key = `photos/${identityId}/${nanoid()}.${ext}`;
  const bucket = process.env['R2_BUCKET_NAME']!;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  const publicUrl = `${process.env['R2_PUBLIC_URL']}/${key}`;

  return { uploadUrl, key, publicUrl };
}
