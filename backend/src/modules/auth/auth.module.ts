import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthRepository } from './auth.repository.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { MailService } from './mail/mail.service.js';
import { ConsoleMailService } from './mail/console-mail.service.js';
import { UsersModule } from '../users/index.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    JwtStrategy,
    {
      provide: MailService,
      useClass: ConsoleMailService,
    },
  ],
  exports: [AuthService, PassportModule, JwtModule],
})
export class AuthModule {}
