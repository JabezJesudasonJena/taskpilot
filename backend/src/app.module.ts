import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppConfigModule } from './config/config.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { UsersModule } from './modules/users/index.js';
import { AuthModule } from './modules/auth/index.js';
import { MailModule } from './modules/mail/index.js';
import {
  WorkspacesModule,
  WorkspaceAccessGuard,
} from './modules/workspaces/index.js';
import { HierarchyModule } from './modules/hierarchy/index.js';
import { JwtAuthGuard, HttpExceptionFilter } from './common/index.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    EventEmitterModule.forRoot(),
    HealthModule,
    UsersModule,
    AuthModule,
    MailModule,
    WorkspacesModule,
    HierarchyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: WorkspaceAccessGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
