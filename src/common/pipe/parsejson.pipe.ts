import {
  PipeTransform,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

@Injectable()
export class ParseJsonPipe implements PipeTransform {
  constructor(private readonly dto: any) {}

  async transform(value: any) {
    if (!value) {
      throw new BadRequestException('Missing data field');
    }

    let parsed: any;

    try {
      parsed = JSON.parse(value);
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
    } catch {
      throw new BadRequestException('Invalid JSON format');
    }

    const object = plainToInstance(this.dto, parsed, {
      enableImplicitConversion: true,
    });

    const errors = await validate(object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException(this.formatErrors(errors));
    }

    return object;
  }

  private formatErrors(errors: ValidationError[]) {
    const result: Record<string, string[]> = {};

    const extract = (errs: ValidationError[], parent = '') => {
      for (const err of errs) {
        const field = parent
          ? `${parent}.${err.property}`
          : err.property;

        if (err.constraints) {
          result[field] = Object.values(err.constraints);
        }

        if (err.children && err.children.length > 0) {
          extract(err.children, field);
        }
      }
    };

    extract(errors);

    return {
      message: 'Validation failed',
      errors: result,
    };
  }
}