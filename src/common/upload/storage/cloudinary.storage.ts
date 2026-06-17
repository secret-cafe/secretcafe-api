import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'crypto';

export const createStorage = () =>
  new CloudinaryStorage({
    cloudinary,
    params: async (req: any, file: Express.Multer.File) => ({
      folder: req.uploadFolder || 'default',
      allowed_formats: ['jpg', 'jpeg', 'png'],
      public_id: `${Date.now()}-${randomUUID()}`,
    }),
  });