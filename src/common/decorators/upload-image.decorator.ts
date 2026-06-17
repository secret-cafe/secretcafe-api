import {
  applyDecorators,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createStorage } from '../upload/storage/cloudinary.storage';
import { UploadFolderInterceptor } from '../interceptors/upload-folder.interceptor';

interface UploadOptions {
  fieldName?: string;
}

export function UploadImage(folder: string, options?: UploadOptions) {
  const fieldName = options?.fieldName ?? 'imageFile';

  const storage = createStorage();

  return applyDecorators(
    UseInterceptors(
      new UploadFolderInterceptor(folder),
      FileInterceptor(fieldName, { storage }),
    ),
  );
}