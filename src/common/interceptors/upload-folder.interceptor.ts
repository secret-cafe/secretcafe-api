import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class UploadFolderInterceptor implements NestInterceptor {
  constructor(private readonly folder: string) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    req.uploadFolder = this.folder;
    return next.handle();
  }
}