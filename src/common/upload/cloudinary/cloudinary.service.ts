import { Inject, Injectable } from '@nestjs/common';
import { v2 as CloudinaryType, UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
    constructor(
        @Inject('CLOUDINARY')
        private readonly cloudinary: typeof CloudinaryType,
    ) { }

    async uploadBase64Image(
        file: string,
        folder: string,
    ): Promise<UploadApiResponse> {
        return await this.cloudinary.uploader.upload(file, {
            folder,
        });
    }

    uploadFile(file: Express.Multer.File, folder: string) {
        return new Promise((resolve, reject) => {
            const stream = this.cloudinary.uploader.upload_stream(
                {
                    folder,
                    public_id: file.filename,
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                },
            );

            stream.end(file.buffer);
        });
    }

    async deleteFile(publicId: string): Promise<void> {
        await this.cloudinary.uploader.destroy(publicId);
    }
}