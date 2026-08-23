import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, Query } from '@nestjs/common';
import { UserService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('users')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class UserController {
    constructor(private readonly userService: UserService) { }

    @Post()
    createUser(
        @Body() createUserDto: CreateUserDto,
        @CurrentUser('userId') userId?: number,
    ) {
        return this.userService.create(createUserDto, userId);
    }

    @Get()
    getAllUsers(@Query() query: QueryUserDto) {
        return this.userService.findAll(query);
    }

    @Get('profile')
    @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF, Role.WAITER)
    getProfile(@Req() req: any) {
        return this.userService.findOne(req.user.currentUserId);
    }

    @Get(':userId')
    getUserById(@Param('userId', ParseUUIDPipe) userId: string) {
        return this.userService.findOne(userId);
    }

    @Patch(':userId')
    updateUser(
        @Param('userId', ParseUUIDPipe) userId: string,
        @Body() updateUserDto: UpdateUserDto,
        @CurrentUser('userId') updatedById?: number,
    ) {
        return this.userService.update(userId, updateUserDto, updatedById);
    }

    @Delete(':userId')
    deleteUser(
        @Param('userId', ParseUUIDPipe) userId: string,
        @CurrentUser('userId') updatedById?: number,
    ) {
        return this.userService.delete(userId, updatedById);
    }
}