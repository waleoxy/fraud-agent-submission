import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { DemoModule } from './demo.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(DemoModule);
  app.useStaticAssets(join(__dirname, '..', 'public'));
  await app.listen(process.env.PORT ?? 8080);
}
bootstrap();
