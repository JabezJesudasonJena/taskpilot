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
import { ListsService } from '../services/lists.service.js';
import { CreateListDto } from '../dto/lists/create-list.dto.js';
import { UpdateListDto } from '../dto/lists/update-list.dto.js';
import { MoveListDto } from '../dto/lists/move-list.dto.js';
import { ReorderDto } from '../dto/common/reorder.dto.js';
import { ListQueryDto } from '../dto/lists/list-query.dto.js';

@ApiTags('lists')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId')
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Post('spaces/:spaceId/lists')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create list with default statuses appended to sibling group (minRole: MEMBER)',
  })
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Body() dto: CreateListDto,
  ) {
    return this.listsService.create(workspaceId, spaceId, dto);
  }

  @Get('spaces/:spaceId/lists')
  @WorkspaceRoles(WorkspaceRole.GUEST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all lists in space with optional folder filter (minRole: GUEST)',
  })
  async findBySpace(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Query() query: ListQueryDto,
  ) {
    return this.listsService.findBySpace(workspaceId, spaceId, query);
  }

  @Get('lists/:listId')
  @WorkspaceRoles(WorkspaceRole.GUEST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get list by ID (minRole: GUEST)' })
  async findOne(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
  ) {
    return this.listsService.findOne(workspaceId, listId);
  }

  @Patch('lists/:listId')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update list (minRole: MEMBER)' })
  async update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: UpdateListDto,
  ) {
    return this.listsService.update(workspaceId, listId, dto);
  }

  @Post('lists/:listId/move')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move list across folders/spaces to end of destination (minRole: MEMBER)',
  })
  async move(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: MoveListDto,
  ) {
    return this.listsService.move(workspaceId, listId, dto);
  }

  @Post('lists/:listId/reorder')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder list (minRole: MEMBER)' })
  async reorder(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.listsService.reorder(workspaceId, listId, dto);
  }

  @Post('lists/:listId/archive')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive list (minRole: MEMBER)' })
  async archive(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
  ) {
    return this.listsService.archive(workspaceId, listId);
  }

  @Post('lists/:listId/unarchive')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unarchive list (minRole: MEMBER)' })
  async unarchive(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
  ) {
    return this.listsService.unarchive(workspaceId, listId);
  }

  @Delete('lists/:listId')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Permanently delete an archived list and descendants (minRole: ADMIN)',
  })
  async delete(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
  ) {
    return this.listsService.delete(workspaceId, listId);
  }
}
