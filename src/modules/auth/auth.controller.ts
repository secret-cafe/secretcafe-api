import { Controller, Get } from '@nestjs/common';

@Controller('auth')
export class AuthController {
    @Get('/login')
    async login(): Promise<any> {
        return [{"status": true, "message": "Login Successfully."}];
    }
}
