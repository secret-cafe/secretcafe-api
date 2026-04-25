import { Controller, Get } from '@nestjs/common';
import { RoleService } from './roles.service';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';

@Controller('roles')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class RoleController {
    constructor(private readonly roleService: RoleService) {}

    @Get()
    getAllRoles() {
        return this.roleService.findAll();
    }
}