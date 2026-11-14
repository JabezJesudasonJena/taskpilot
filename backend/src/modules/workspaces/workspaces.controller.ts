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
import { WorkspacesService } from './workspaces.service.js';
import {
  CurrentUser,
  type CurrentUserData,
  CursorPaginationDto,
} from '../../common/index.js';
import {
  CurrentMember,
  type RequestWorkspaceMember,
} from './decorators/current-member.decorator.js';
import { WorkspaceRoles } from './decorators/workspace-roles.decorator.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto.js';
import { ChangeMemberRoleDto } from './dto/change-member-role.dto.js';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto.js';
import { CreateInviteDto } from './dto/create-invite.dto.js';

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new workspace' })
  async createWorkspace(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.createWorkspace(user.id, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List workspaces for current user' })
  async listUserWorkspaces(
    @CurrentUser() user: CurrentUserData,
    @Query() pagination: CursorPaginationDto,
  ) {
    return this.workspacesService.listUserWorkspaces(user.id, pagination);
  }

  @Get(':workspaceId')
  @WorkspaceRoles(WorkspaceRole.GUEST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get workspace details' })
  async getWorkspace(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentMember() member: RequestWorkspaceMember,
  ) {
    return this.workspacesService.getWorkspace(workspaceId, member.role);
  }

  @Patch(':workspaceId')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update workspace' })
  async updateWorkspace(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.updateWorkspace(workspaceId, dto);
  }

  @Get(':workspaceId/members')
  @WorkspaceRoles(WorkspaceRole.GUEST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List workspace members' })
  async listMembers(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() pagination: CursorPaginationDto,
  ) {
    return this.workspacesService.listMembers(workspaceId, pagination);
  }

  @Patch(':workspaceId/members/:userId')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change member role' })
  async changeMemberRole(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentMember() actor: RequestWorkspaceMember,
    @Body() dto: ChangeMemberRoleDto,
  ) {
    return this.workspacesService.changeMemberRole(
      workspaceId,
      userId,
      dto.role,
      actor,
    );
  }

  @Delete(':workspaceId/members/:userId')
  @WorkspaceRoles(WorkspaceRole.GUEST)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove member or leave workspace' })
  async removeMember(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentMember() actor: RequestWorkspaceMember,
  ) {
    return this.workspacesService.removeMember(workspaceId, userId, actor);
  }

  @Post(':workspaceId/transfer-ownership')
  @WorkspaceRoles(WorkspaceRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer workspace ownership' })
  async transferOwnership(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentMember() actor: RequestWorkspaceMember,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.workspacesService.transferOwnership(
      workspaceId,
      dto.userId,
      actor,
    );
  }

  @Post(':workspaceId/invites')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite a member to the workspace' })
  async createInvite(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentMember() actor: RequestWorkspaceMember,
    @Body() dto: CreateInviteDto,
  ) {
    return this.workspacesService.createInvite(workspaceId, dto, actor);
  }

  @Get(':workspaceId/invites')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List active workspace invites' })
  async listActiveInvites(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() pagination: CursorPaginationDto,
  ) {
    return this.workspacesService.listActiveInvites(workspaceId, pagination);
  }

  @Delete(':workspaceId/invites/:inviteId')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke workspace invite' })
  async revokeInvite(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.workspacesService.revokeInvite(workspaceId, inviteId);
  }
}
