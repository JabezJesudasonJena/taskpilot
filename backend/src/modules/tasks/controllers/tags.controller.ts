import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WorkspaceRole } from '@prisma/client';
import {
  WorkspaceAccessGuard,
  WorkspaceRoles,
  CurrentMember,
  type RequestWorkspaceMember,
} from '../../workspaces/index.js';
import { TagsService } from '../services/tags.service.js';
import { CreateTagDto } from '../dto/tags/create-tag.dto.js';
import { UpdateTagDto } from '../dto/tags/update-tag.dto.js';
import { TagResponseDto } from '../dto/tags/tag-response.dto.js';

@ApiTags('Tags')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Create a new tag in workspace (max 500)' })
  @ApiResponse({ status: 201, type: TagResponseDto })
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentMember() currentMember: RequestWorkspaceMember,
    @Body() dto: CreateTagDto,
  ): Promise<TagResponseDto> {
    return this.tagsService.create(workspaceId, currentMember.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all tags in workspace ordered by name' })
  @ApiResponse({ status: 200, type: [TagResponseDto] })
  async findAll(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<TagResponseDto[]> {
    return this.tagsService.findAll(workspaceId);
  }

  @Patch(':tagId')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Update a tag' })
  @ApiResponse({ status: 200, type: TagResponseDto })
  async update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentMember() currentMember: RequestWorkspaceMember,
    @Body() dto: UpdateTagDto,
  ): Promise<TagResponseDto> {
    return this.tagsService.update(
      workspaceId,
      tagId,
      currentMember.userId,
      dto,
    );
  }

  @Delete(':tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Delete a tag (ADMIN or above)' })
  @ApiResponse({ status: 204, description: 'Tag deleted successfully' })
  async delete(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentMember() currentMember: RequestWorkspaceMember,
  ): Promise<void> {
    return this.tagsService.delete(workspaceId, tagId, currentMember.userId);
  }
}
