import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority } from '@prisma/client';

export class TaskTagItemDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'backend' })
  name!: string;

  @ApiPropertyOptional({ example: '#3B82F6', nullable: true })
  color!: string | null;
}

export class TaskResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  workspaceId!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174002' })
  listId!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174003' })
  statusId!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  parentId!: string | null;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174004', nullable: true })
  creatorId!: string | null;

  @ApiProperty({ example: 'Implement auth refresh rotation' })
  title!: string;

  @ApiPropertyOptional({ example: 'Detailed requirements...', nullable: true })
  description?: string | null;

  @ApiProperty({ enum: TaskPriority, example: TaskPriority.NONE })
  priority!: TaskPriority;

  @ApiPropertyOptional({ example: '2026-11-15T09:00:00.000Z', nullable: true })
  startDate!: Date | null;

  @ApiPropertyOptional({ example: '2026-11-20T18:00:00.000Z', nullable: true })
  dueDate!: Date | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ example: 'a0' })
  position!: string;

  @ApiProperty({ example: '2026-11-14T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-14T10:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt!: Date | null;

  @ApiProperty({ type: [String], example: ['123e4567-e89b-12d3-a456-426614174005'] })
  assigneeIds!: string[];

  @ApiProperty({ type: [TaskTagItemDto] })
  tags!: TaskTagItemDto[];

  @ApiProperty({ example: 2 })
  subtaskCount!: number;

  @ApiProperty({ example: 1 })
  completedSubtaskCount!: number;
}
