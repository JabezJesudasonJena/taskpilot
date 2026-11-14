import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceRoles } from '../../workspaces/index.js';
import { SpacesService } from '../services/spaces.service.js';
import { CreateSpaceDto } from '../dto/spaces/create-space.dto.js';
import { UpdateSpaceDto } from '../dto/spaces/update-space.dto.js';
import { ReorderDto } from '../dto/common/reorder.dto.js';
import { IncludeArchivedQueryDto } from '../dto/common/include-archived-query.dto.js';

@ApiTags('spaces')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/spaces')
export class SpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  @Post()
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a space (minRole: ADMIN)' })
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateSpaceDto,
  ) {
    return this.spacesService.create(workspaceId, dto);
  }

  @Get()
  @WorkspaceRoles(WorkspaceRole.GUEST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List spaces in workspace (minRole: GUEST)' })
  async findAll(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: IncludeArchivedQueryDto,
  ) {
    return this.spacesService.findAll(workspaceId, query.includeArchived);
  }

  @Get(':spaceId')
  @WorkspaceRoles(WorkspaceRole.GUEST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get space by ID (minRole: GUEST)' })
  async findOne(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
  ) {
    return this.spacesService.findOne(workspaceId, spaceId);
  }

  @Patch(':spaceId')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update space (minRole: ADMIN)' })
  async update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Body() dto: UpdateSpaceDto,
  ) {
    return this.spacesService.update(workspaceId, spaceId, dto);
  }

  @Post(':spaceId/reorder')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder space (minRole: ADMIN)' })
  async reorder(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.spacesService.reorder(workspaceId, spaceId, dto);
  }

  @Post(':spaceId/archive')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive space and descendants (minRole: ADMIN)' })
  async archive(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
  ) {
    return this.spacesService.archive(workspaceId, spaceId);
  }

  @Post(':spaceId/unarchive')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unarchive space (minRole: ADMIN)' })
  async unarchive(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
  ) {
    return this.spacesService.unarchive(workspaceId, spaceId);
  }

  @Delete(':spaceId')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Permanently delete an archived space and descendants (minRole: ADMIN)',
  })
  async delete(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
  ) {
    return this.spacesService.delete(workspaceId, spaceId);
  }
}
