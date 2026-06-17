import { Global, Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { configureCloudinary } from './cloudinary.config';

@Global()
@Module({
  providers: [
    {
      provide: 'CLOUDINARY',
      useFactory: () => configureCloudinary(),
    },
    CloudinaryService,
  ],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}