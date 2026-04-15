import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards, Request } from '@nestjs/common';
import { UserService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../jwt/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
    constructor(private readonly userService: UserService) { }

    @Post()
    createUser(@Body() createUserDto: CreateUserDto) {
        return this.userService.create(createUserDto);
    }

    @Get('profile')
    getProfile(@Request() req: any) {
        return req.user; // user info from JWT validate()
    }

    @Get()
    getAllUsers() {
        return this.userService.findAll();
    }

    @Get(':id')
    getUserById(@Param('id', ParseIntPipe) userId: number) {
        return this.userService.findOne(userId);
    }

    @Patch(':id')
    updateUser(
        @Param('id', ParseIntPipe) userId: number,
        @Body() updateUserDto: UpdateUserDto,
    ) {
        return this.userService.update(userId, updateUserDto);
    }

    @Delete(':id')
    deleteUser(@Param('id', ParseIntPipe) userId: number) {
        return this.userService.delete(userId);
    }
}