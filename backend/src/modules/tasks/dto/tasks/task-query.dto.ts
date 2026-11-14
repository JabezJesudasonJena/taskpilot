import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority } from '@prisma/client';

export type TaskSortField =
  | 'createdAt'
  | 'updatedAt'
  | 'dueDate'
  | 'priority'
  | 'position';

export type SortOrder = 'asc' | 'desc';

function toArray(val: unknown): string[] {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) {
    return val.map((item) =>
      typeof item === 'string' ? item : JSON.stringify(item),
    );
  }
  return [typeof val === 'string' ? val : JSON.stringify(val)];
}

export class TaskQueryDto {
  @ApiPropertyOptional({
    description: 'List ID or multiple list IDs (repeatable, max 50)',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => toArray(value))
  listId?: string[];

  @ApiPropertyOptional({
    description: 'Status ID or multiple status IDs (repeatable)',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => toArray(value))
  statusId?: string[];

  @ApiPropertyOptional({
    description: 'Assignee user ID, multiple IDs, or "me" (repeatable, max 20)',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => toArray(value))
  assigneeId?: string[];

  @ApiPropertyOptional({
    description: 'Filter unassigned tasks only',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unassigned?: boolean;

  @ApiPropertyOptional({
    description: 'Creator user ID or "me"',
    example: 'me',
  })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({
    description: 'Tag ID or multiple tag IDs (repeatable)',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => toArray(value))
  tagId?: string[];

  @ApiPropertyOptional({
    description: 'Tag match mode: "any" or "all"',
    enum: ['any', 'all'],
    default: 'any',
  })
  @IsOptional()
  @IsIn(['any', 'all'])
  tagMode?: 'any' | 'all' = 'any';

  @ApiPropertyOptional({
    description: 'Priority or multiple priorities (repeatable)',
    enum: TaskPriority,
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }) => toArray(value) as TaskPriority[])
  priority?: TaskPriority[];

  @ApiPropertyOptional({
    description: 'Filter by completed status',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional({
    description: 'Filter overdue tasks (dueDate < now and completedAt is null)',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({
    description: 'Filter tasks with dueDate <= dueBefore',
    example: '2026-11-20T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  dueBefore?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks with dueDate >= dueAfter',
    example: '2026-11-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  dueAfter?: string;

  @ApiPropertyOptional({
    description: 'Filter subtasks of a specific parent task ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({
    description:
      'Include subtasks in results (default false: top-level tasks only)',
    default: false,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeSubtasks?: boolean = false;

  @ApiPropertyOptional({
    description: 'Show soft-deleted tasks only (requires ADMIN or above)',
    default: false,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  deleted?: boolean = false;

  @ApiPropertyOptional({
    description:
      'Full-text search query (websearch_to_tsquery, max 200 chars, max 2000 matches cap)',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['createdAt', 'updatedAt', 'dueDate', 'priority', 'position'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'dueDate', 'priority', 'position'])
  sort?: TaskSortField = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: SortOrder = 'desc';

  @ApiPropertyOptional({
    description: 'Page limit (1-100)',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Opaque keyset cursor for pagination',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
