import { Controller, Post } from '@nestjs/common';
import { SeedService } from './seed.service';
import { Auth } from 'src/common/decorators/auth.decorator';
import { Role } from 'src/common/constants/constants';

@Controller('seed')
// @Auth(Role.SUPER_ADMIN)
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post()
  public async seed() {
    return this.seedService.seed(false);
  }

  @Post('users')
  public async seedUsers() {
    return this.seedService.seed(true);
  }
}
