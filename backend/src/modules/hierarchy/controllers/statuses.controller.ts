import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceRoles } from '../../workspaces/index.js';
import { StatusesService } from '../services/statuses.service.js';
import { CreateStatusDto } from '../dto/statuses/create-status.dto.js';
import { UpdateStatusDto } from '../dto/statuses/update-status.dto.js';
import { ReorderStatusDto } from '../dto/statuses/reorder-status.dto.js';

@ApiTags('statuses')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/lists/:listId/statuses')
export class StatusesController {
  constructor(private readonly statusesService: StatusesService) {}

  @Get()
  @WorkspaceRoles(WorkspaceRole.GUEST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all statuses for a list (minRole: GUEST)' })
  async findByList(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
  ) {
    return this.statusesService.findByList(workspaceId, listId);
  }

  @Post()
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Append a new status to the list (minRole: ADMIN)',
  })
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: CreateStatusDto,
  ) {
    return this.statusesService.create(workspaceId, listId, dto);
  }

  @Patch(':statusId')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update status (minRole: ADMIN)' })
  async update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Param('statusId', ParseUUIDPipe) statusId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.statusesService.update(workspaceId, listId, statusId, dto);
  }

  @Patch(':statusId/reorder')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reorder status to contiguous 0-based index (minRole: ADMIN)',
  })
  async reorder(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Param('statusId', ParseUUIDPipe) statusId: string,
    @Body() dto: ReorderStatusDto,
  ) {
    return this.statusesService.reorder(workspaceId, listId, statusId, dto);
  }

  @Delete(':statusId')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete status (minRole: ADMIN)' })
  async delete(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Param('statusId', ParseUUIDPipe) statusId: string,
  ) {
    return this.statusesService.delete(workspaceId, listId, statusId);
  }
}
