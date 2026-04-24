import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

/**
 * Upload a File/Blob (from a server action FormData) to Cloudinary.
 *
 * Streams the bytes directly — no temp file on disk. Resolves with the
 * raw Cloudinary response (we care about `secure_url` and `public_id`).
 */
export async function uploadToCloudinary(file, subfolder = '') {
  const buffer = Buffer.from(await file.arrayBuffer());
  const baseFolder = process.env.CLOUDINARY_UPLOAD_FOLDER || '';
  const folder = [baseFolder, subfolder].filter(Boolean).join('/');

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

export async function deleteFromCloudinary(publicId) {
  if (!publicId) return null;
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    // Deletion failures shouldn't block the DB update — log and move on.
    console.error('[cloudinary] destroy failed for', publicId, err);
    return null;
  }
}
