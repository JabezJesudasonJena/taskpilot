import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
  IsISO8601,
  IsArray,
  IsUUID,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority } from '@prisma/client';

export class CreateTaskDto {
  @ApiProperty({ example: 'Implement auth refresh rotation', minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({ example: 'Detailed requirements and acceptance criteria', maxLength: 50000 })
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  description?: string;

  @ApiPropertyOptional({ description: 'Status ID. Defaults to list default OPEN status', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.NONE })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority = TaskPriority.NONE;

  @ApiPropertyOptional({ example: '2026-11-15T09:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-11-20T18:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ isArray: true, type: String, example: ['123e4567-e89b-12d3-a456-426614174001'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  assigneeIds?: string[];

  @ApiPropertyOptional({ isArray: true, type: String, example: ['123e4567-e89b-12d3-a456-426614174002'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  tagIds?: string[];
}
