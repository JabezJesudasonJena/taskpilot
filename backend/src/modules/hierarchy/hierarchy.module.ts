import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { SpacesRepository } from './repositories/spaces.repository.js';
import { FoldersRepository } from './repositories/folders.repository.js';
import { ListsRepository } from './repositories/lists.repository.js';
import { StatusesRepository } from './repositories/statuses.repository.js';
import { SpacesService } from './services/spaces.service.js';
import { FoldersService } from './services/folders.service.js';
import { ListsService } from './services/lists.service.js';
import { StatusesService } from './services/statuses.service.js';
import { TreeService } from './services/tree.service.js';
import { HierarchyService } from './hierarchy.service.js';
import { SpacesController } from './controllers/spaces.controller.js';
import { FoldersController } from './controllers/folders.controller.js';
import { ListsController } from './controllers/lists.controller.js';
import { StatusesController } from './controllers/statuses.controller.js';
import { TreeController } from './controllers/tree.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    SpacesController,
    FoldersController,
    ListsController,
    StatusesController,
    TreeController,
  ],
  providers: [
    SpacesRepository,
    FoldersRepository,
    ListsRepository,
    StatusesRepository,
    SpacesService,
    FoldersService,
    ListsService,
    StatusesService,
    TreeService,
    HierarchyService,
  ],
  exports: [HierarchyService],
})
export class HierarchyModule {}
