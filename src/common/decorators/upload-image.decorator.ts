import { applyDecorators, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function UploadImage(fieldName: string, path: string) {
  ensureDir(path);

  return applyDecorators(
    UseInterceptors(
      FileInterceptor(fieldName, {
        storage: diskStorage({
          destination: path,
          filename: (req, file, cb) => {
            const uniqueName = `${Date.now()}_${file.originalname.replace(/\s/g, '')}`;
            cb(null, uniqueName);
          },
        }),

        fileFilter: (req, file, cb) => {
          if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
            return cb(
              new BadRequestException(
                'Only image files (jpg, jpeg, png) are allowed',
              ),
              false,
            );
          }
          cb(null, true);
        },

        limits: {
          fileSize: 2 * 1024 * 1024,
        },
      }),
    ),
  );
}