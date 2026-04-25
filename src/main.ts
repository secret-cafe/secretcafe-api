import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const PORT = process.env.PORT || 3000;

  app.useStaticAssets('uploads');
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://pos-system-gamma-wine.vercel.app',
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');

  app.listen(PORT, () => console.log(`Server Port: ${PORT}`));
}

main();