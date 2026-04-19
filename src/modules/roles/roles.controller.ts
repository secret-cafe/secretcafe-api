import { Controller, Get } from '@nestjs/common';
import { RoleService } from './roles.service';
import { Role } from '../common/constants/constants';
import { Auth } from '../common/decorators/auth.decorator';

@Controller('roles')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class RoleController {
    constructor(private readonly roleService: RoleService) {}

    @Get()
    getAllRoles() {
        return this.roleService.findAll();
    }
}