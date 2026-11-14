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
import { FoldersService } from '../services/folders.service.js';
import { CreateFolderDto } from '../dto/folders/create-folder.dto.js';
import { UpdateFolderDto } from '../dto/folders/update-folder.dto.js';
import { ReorderDto } from '../dto/common/reorder.dto.js';
import { IncludeArchivedQueryDto } from '../dto/common/include-archived-query.dto.js';

@ApiTags('folders')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId')
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Post('spaces/:spaceId/folders')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create folder in space (minRole: MEMBER)' })
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Body() dto: CreateFolderDto,
  ) {
    return this.foldersService.create(workspaceId, spaceId, dto);
  }

  @Get('spaces/:spaceId/folders')
  @WorkspaceRoles(WorkspaceRole.GUEST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List folders in space (minRole: GUEST)' })
  async findBySpace(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Query() query: IncludeArchivedQueryDto,
  ) {
    return this.foldersService.findBySpace(
      workspaceId,
      spaceId,
      query.includeArchived,
    );
  }

  @Get('folders/:folderId')
  @WorkspaceRoles(WorkspaceRole.GUEST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get folder by ID (minRole: GUEST)' })
  async findOne(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
  ) {
    return this.foldersService.findOne(workspaceId, folderId);
  }

  @Patch('folders/:folderId')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update folder (minRole: MEMBER)' })
  async update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Body() dto: UpdateFolderDto,
  ) {
    return this.foldersService.update(workspaceId, folderId, dto);
  }

  @Post('folders/:folderId/reorder')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder folder (minRole: MEMBER)' })
  async reorder(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.foldersService.reorder(workspaceId, folderId, dto);
  }

  @Post('folders/:folderId/archive')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive folder (minRole: MEMBER)' })
  async archive(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
  ) {
    return this.foldersService.archive(workspaceId, folderId);
  }

  @Post('folders/:folderId/unarchive')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unarchive folder (minRole: MEMBER)' })
  async unarchive(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
  ) {
    return this.foldersService.unarchive(workspaceId, folderId);
  }

  @Delete('folders/:folderId')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Permanently delete an archived folder and descendants (minRole: ADMIN)',
  })
  async delete(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
  ) {
    return this.foldersService.delete(workspaceId, folderId);
  }
}
