import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Query,
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
import { TasksService } from '../services/tasks.service.js';
import { CreateTaskDto } from '../dto/tasks/create-task.dto.js';
import { UpdateTaskDto } from '../dto/tasks/update-task.dto.js';
import { AssigneesDto } from '../dto/tasks/assignees.dto.js';
import { TaskTagsDto } from '../dto/tasks/task-tags.dto.js';
import { MoveTaskDto } from '../dto/tasks/move-task.dto.js';
import { TaskQueryDto } from '../dto/tasks/task-query.dto.js';
import { TaskResponseDto } from '../dto/tasks/task-response.dto.js';
import { PaginatedTasksResponseDto } from '../dto/tasks/paginated-tasks-response.dto.js';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('lists/:listId/tasks')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Create a top-level task in a list' })
  @ApiResponse({ status: 201, type: TaskResponseDto })
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @CurrentMember() currentMember: RequestWorkspaceMember,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.create(workspaceId, currentMember, listId, dto);
  }

  @Post('tasks/:taskId/subtasks')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Create a subtask under a top-level task' })
  @ApiResponse({ status: 201, type: TaskResponseDto })
  async createSubtask(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentMember() currentMember: RequestWorkspaceMember,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.createSubtask(
      workspaceId,
      currentMember,
      taskId,
      dto,
    );
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Get a task by id with description' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  async findOne(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<TaskResponseDto> {
    return this.tasksService.findOne(workspaceId, taskId);
  }

  @Patch('tasks/:taskId')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  async update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentMember() currentMember: RequestWorkspaceMember,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.update(workspaceId, currentMember, taskId, dto);
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Soft delete a task and its subtasks' })
  @ApiResponse({ status: 204, description: 'Task deleted successfully' })
  async softDelete(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentMember() currentMember: RequestWorkspaceMember,
  ): Promise<void> {
    return this.tasksService.softDelete(workspaceId, currentMember, taskId);
  }

  @Post('tasks/:taskId/restore')
  @HttpCode(HttpStatus.OK)
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Restore a soft-deleted task' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  async restore(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentMember() currentMember: RequestWorkspaceMember,
  ): Promise<TaskResponseDto> {
    return this.tasksService.restore(workspaceId, currentMember, taskId);
  }

  @Put('tasks/:taskId/assignees')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Replace assignees on a task (max 20, non-GUEST)' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  async replaceAssignees(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentMember() currentMember: RequestWorkspaceMember,
    @Body() dto: AssigneesDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.replaceAssignees(
      workspaceId,
      currentMember,
      taskId,
      dto.userIds,
    );
  }

  @Put('tasks/:taskId/tags')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Replace tags on a task (max 20, tenant tags)' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  async replaceTags(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentMember() currentMember: RequestWorkspaceMember,
    @Body() dto: TaskTagsDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.replaceTags(
      workspaceId,
      currentMember,
      taskId,
      dto.tagIds,
    );
  }

  @Post('tasks/:taskId/move')
  @HttpCode(HttpStatus.OK)
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Move or reorder a task within/across lists' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  async move(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentMember() currentMember: RequestWorkspaceMember,
    @Body() dto: MoveTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.move(workspaceId, currentMember, taskId, dto);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'Query tasks with filters, search, and pagination' })
  @ApiResponse({ status: 200, type: PaginatedTasksResponseDto })
  async findAll(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentMember() currentMember: RequestWorkspaceMember,
    @Query() query: TaskQueryDto,
  ): Promise<PaginatedTasksResponseDto> {
    return this.tasksService.findAll(workspaceId, currentMember, query);
  }
}
